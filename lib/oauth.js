import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

async function privateDirectory(path) {
  await mkdir(path, { mode: 0o700 });
}
async function ensurePrivate(path) {
  try { await privateDirectory(path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('OAuth storage must be an owner-only directory, not a symlink');
  }
}

export class CredentialStore {
  constructor({ endpoint, issuer = '', profile = 'default', clientId = '', home = homedir() }) {
    this.root = join(home, '.delx-mcp-bridge-v1');
    this.identity = createHash('sha256').update(JSON.stringify([endpoint, issuer, profile, clientId])).digest('hex');
    this.directory = join(this.root, this.identity);
    this.value = {};
    this.queue = Promise.resolve();
  }
  async initialize() {
    await ensurePrivate(this.root);
    await ensurePrivate(this.directory);
    try { this.lock = await open(join(this.directory, 'active.lock'), 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('This OAuth profile is already active or has a stale lock; use a separate profile or inspect the lock after the prior process exits'); throw error; }
    try { await this.lock.writeFile(String(process.pid)); }
    catch (error) { await this.close(); throw error; }
    try {
      const file = await open(join(this.directory, 'credentials.json'), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 65536 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('Invalid OAuth credential file permissions or size');
        const bytes = Buffer.alloc(65537);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 65536) throw new Error('OAuth state exceeds limit');
        this.value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
        if (!this.value || Array.isArray(this.value) || typeof this.value !== 'object') throw new Error('Invalid OAuth credential state');
      } finally { await file.close(); }
    } catch (error) { if (error.code !== 'ENOENT') { await this.close(); throw new Error('Unable to load isolated OAuth state'); } }
    return this;
  }
  async save() {
    const snapshot = JSON.stringify(this.value);
    if (Buffer.byteLength(snapshot) > 65536) throw new Error('OAuth credential state exceeds limit');
    this.queue = this.queue.then(async () => {
      const temporary = join(this.directory, `.credentials-${randomBytes(12).toString('hex')}`);
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(snapshot); await file.sync(); }
      catch (error) { await file.close(); await unlink(temporary).catch(() => {}); throw error; }
      await file.close();
      try { await rename(temporary, join(this.directory, 'credentials.json')); }
      catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    });
    return this.queue;
  }
  async close() {
    await this.queue.catch(() => {});
    if (this.lock) { await this.lock.close(); this.lock = null; await unlink(join(this.directory, 'active.lock')).catch(() => {}); }
  }
}

export class IsolatedOAuthProvider {
  constructor({ store, issuer, timeoutMs = 120000, callbackPort = 0, onAuthorization = url => process.stderr.write(`Authorize this isolated bridge profile in your browser: ${url}\n`) }) {
    this.store = store;
    this.issuer = issuer;
    this.timeoutMs = timeoutMs;
    this.callbackPort = callbackPort;
    this.onAuthorization = onAuthorization;
    this.verifier = null;
  }
  async initialize() {
    this.server = createServer((request, response) => this.handleCallback(request, response));
    this.server.requestTimeout = 10000;
    this.server.headersTimeout = 10000;
    this.server.maxHeadersCount = 32;
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      const previousPort = this.store.value.redirect ? Number(new URL(this.store.value.redirect).port) : 0;
      this.server.listen(this.callbackPort || previousPort, '127.0.0.1', resolve);
    });
    this.redirect = `http://127.0.0.1:${this.server.address().port}/oauth/callback`;
    if (this.store.value.redirect && this.store.value.redirect !== this.redirect) {
      delete this.store.value.client; delete this.store.value.tokens; await this.store.save();
    }
    return this;
  }
  get redirectUrl() { return this.redirect; }
  get clientMetadata() {
    return { client_name: 'Delx isolated stdio bridge', redirect_uris: [this.redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
  }
  async clientInformation() {
    const info = this.store.value.client;
    // Dynamic loopback port changes require fresh registration rather than reusing a wrong redirect URI.
    if (this.store.value.redirect !== this.redirect) return undefined;
    return info;
  }
  async saveClientInformation(info) {
    if (!info.issuer) throw new Error('OAuth client information has no issuer binding');
    const current = this.store.value.client;
    // Registration can race before SDK calls state(). Preserve the first identity,
    // not merely the first PKCE flow; replacement requires explicit invalidation.
    if (this.activeFlow && !isDeepStrictEqual(current, info)) throw new Error('OAuth client registration cannot change during authorization');
    if (current && !isDeepStrictEqual(current, info)) {
      throw new Error('OAuth client identity replacement requires invalidation');
    }
    if (current && this.store.value.redirect !== this.redirect) throw new Error('OAuth client redirect binding is invalid');
    this.store.value.client = info;
    this.store.value.redirect = this.redirect;
    await this.store.save();
  }
  async tokens() { return this.store.value.tokens; }
  async saveTokens(tokens) {
    if (!tokens.issuer) throw new Error('OAuth tokens have no issuer binding');
    this.store.value.tokens = tokens;
    await this.store.save();
  }
  async state() {
    if (this.activeFlow) throw new Error('OAuth authorization already active');
    this.activeFlow = Symbol('authorization');
    this.expectedState = randomBytes(24).toString('hex');
    this.authTimer = setTimeout(() => this.cancelAuthorization('OAuth authorization timed out'), this.timeoutMs);
    return this.expectedState;
  }
  authorizationFlow() {
    if (!this.activeFlow) throw new Error('No active OAuth authorization');
    return this.activeFlow;
  }
  cancelAuthorization(message = 'OAuth authorization cancelled') {
    clearTimeout(this.authTimer);
    this.rejectCode?.(new Error(message));
    this.activeFlow = null;
    this.expectedState = null;
    this.verifier = null;
    this.resolveCode = null;
    this.rejectCode = null;
    this.authorizationCode = null;
  }
  completeAuthorization(flow) {
    if (!flow || flow !== this.activeFlow || this.expectedState || this.resolveCode) throw new Error('OAuth authorization completion is invalid');
    this.cancelAuthorization();
  }
  async saveCodeVerifier(verifier) {
    if (!this.activeFlow || this.verifier) throw new Error('OAuth PKCE verifier cannot be replaced');
    this.verifier = verifier;
  }
  async codeVerifier() { if (!this.verifier) throw new Error('No active PKCE verifier'); return this.verifier; }
  async redirectToAuthorization(url) {
    if (!this.activeFlow || !this.verifier || this.authorizationCode) throw new Error('OAuth authorization phase is invalid');
    const authorization = new URL(url);
    if (authorization.username || authorization.password || authorization.hash) throw new Error('Invalid authorization URL');
    if (authorization.origin !== new URL(this.issuer).origin) throw new Error('Authorization URL is outside the trusted issuer');
    this.authorizationCode = new Promise((resolve, reject) => { this.resolveCode = resolve; this.rejectCode = reject; });
    // Avoid an unhandled rejection if the host is interrupted before waiting for the callback.
    this.authorizationCode.catch(() => {});
    await this.onAuthorization(url.toString());
  }
  handleCallback(request, response) {
    response.setHeader('cache-control', 'no-store');
    const reject = () => { response.writeHead(400); response.end('Invalid OAuth callback'); };
    if (request.method !== 'GET' || (request.url || '').length > 8192) return reject();
    let url;
    try { url = new URL(request.url, this.redirect); } catch { return reject(); }
    const state = url.searchParams.get('state') || '';
    if (url.pathname !== '/oauth/callback' || !this.expectedState || !this.resolveCode || Buffer.byteLength(state) !== Buffer.byteLength(this.expectedState) || !timingSafeEqual(Buffer.from(state), Buffer.from(this.expectedState))) return reject();
    const code = url.searchParams.get('code');
    if (!code || code.length > 4096 || url.searchParams.has('error')) return reject();
    const resolve = this.resolveCode;
    this.resolveCode = null;
    this.expectedState = null;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('Authorization received. You may close this window.');
    resolve(code);
  }
  async waitForCode() { if (!this.authorizationCode) throw new Error('No authorization callback pending'); return this.authorizationCode; }
  async invalidateCredentials(scope) {
    if (scope === 'client' && this.activeFlow) this.cancelAuthorization();
    if (scope === 'all' || scope === 'client') delete this.store.value.client;
    if (scope === 'all' || scope === 'tokens') delete this.store.value.tokens;
    if (scope === 'all' || scope === 'verifier') this.cancelAuthorization();
    await this.store.save();
  }
  async close() {
    this.cancelAuthorization();
    if (this.server) { this.server.closeAllConnections(); await new Promise(resolve => this.server.close(resolve)); }
  }
}
