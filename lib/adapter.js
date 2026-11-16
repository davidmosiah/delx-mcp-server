import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport, SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createSafeFetch } from './network.js';
import { createAuthenticatedFetch } from './auth-coordinator.js';
import { CredentialStore, IsolatedOAuthProvider } from './oauth.js';

async function* messages(input, maxBytes = 1024 * 1024) {
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    // Inspect/split the chunk before retaining an unbounded partial line.
    const bytes = Buffer.from(chunk);
    let offset = 0;
    while (offset < bytes.length) {
      const newline = bytes.indexOf(10, offset);
      const end = newline === -1 ? bytes.length : newline;
      if (pending.length + end - offset > maxBytes) throw new Error('Stdio message exceeds adapter limit');
      pending = Buffer.concat([pending, bytes.subarray(offset, end)]);
      offset = end + (newline === -1 ? 0 : 1);
      if (newline !== -1) {
        const line = pending.toString('utf8').replace(/\r$/, ''); pending = Buffer.alloc(0);
        if (!line.trim()) continue;
        let parsed; try { parsed = JSON.parse(line); } catch { throw new Error('Invalid stdio JSON'); }
        const result = JSONRPCMessageSchema.safeParse(parsed);
        if (!result.success) throw new Error('Invalid JSON-RPC message');
        yield result.data;
      }
    }
  }
  if (pending.length) throw new Error('Incomplete stdio message');
}

export async function runAdapter(options, { input = process.stdin, output = process.stdout, env = process.env, home, onAuthorization, onError, signal } = {}) {
  const safeFetch = createSafeFetch({ ...options, env });
  const store = await new CredentialStore({ endpoint: options.endpoint, issuer: options.issuer, profile: options.profile, clientId: createHash('sha256').update(JSON.stringify([...new Headers(options.headers)].sort())).digest('hex'), home }).initialize();
  const provider = new IsolatedOAuthProvider({ store, issuer: options.issuer, timeoutMs: options.authTimeoutMs, callbackPort: options.callbackPort, onAuthorization });
  let remote;
  const rememberInputError = () => {};
  input.on('error', rememberInputError);
  const pendingResponses = new Set();
  let responsesComplete;
  const cancel = () => { stopping.abort(); input.destroy(new Error('Bridge cancelled')); provider.close().catch(() => {}); remote?.close().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const stopping = new AbortController();
  const stopped = new Promise((_resolve, reject) => stopping.signal.addEventListener('abort', () => reject(new Error('Bridge output stopped or cancelled')), { once: true }));
  stopped.catch(() => {});
  let queuedBytes = 0, queuedMessages = 0;
  let outputQueue = Promise.resolve();
  const failOutput = () => { stopping.abort(); input.destroy(new Error('Remote output limit or stream failure')); remote?.close().catch(() => {}); };
  output.on('error', failOutput);
  const write = message => {
    const text = JSON.stringify(message) + '\n';
    const size = Buffer.byteLength(text);
    if (size > 8 * 1024 * 1024 || queuedBytes + size > 16 * 1024 * 1024 || queuedMessages >= 256) throw new Error('Remote output queue exceeds adapter limit');
    queuedBytes += size; queuedMessages++;
    outputQueue = outputQueue.then(async () => {
      try { if (!output.write(text)) await once(output, 'drain', { signal: stopping.signal }); }
      finally { queuedBytes -= size; queuedMessages--; }
    });
    return outputQueue;
  };
  const authenticatedFetch = createAuthenticatedFetch({ provider, endpoint: options.endpoint, fetchFn: safeFetch, signal: stopping.signal, headers: options.headers });
  const makeTransport = kind => {
    const config = { fetch: authenticatedFetch, requestInit: { headers: options.headers }, redirectPolicy: 'same-origin' };
    const transport = kind === 'sse' ? new SSEClientTransport(new URL(options.endpoint), config) : new StreamableHTTPClientTransport(new URL(options.endpoint), { ...config, reconnectionOptions: { maxRetries: 2, initialReconnectionDelay: 1000, maxReconnectionDelay: 10000, reconnectionDelayGrowFactor: 2 } });
    transport.onmessage = message => {
      if (Object.hasOwn(message, 'id') && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
        pendingResponses.delete(JSON.stringify(message.id));
        if (!pendingResponses.size) responsesComplete?.();
      }
      if (message.result?.protocolVersion) transport.setProtocolVersion(message.result.protocolVersion);
      try { write(message).catch(failOutput); } catch { failOutput(); }
    };
    transport.onerror = error => { onError?.(error); if (!options.silent) process.stderr.write('Remote transport reported an error\n'); };
    return transport;
  };
  const authorize = operation => Promise.race([operation(), stopped]);
  try {
    if (signal?.aborted) { cancel(); throw new Error('Bridge cancelled before startup'); }
    await provider.initialize();
    let kind = options.transport.startsWith('sse') ? 'sse' : 'http';
    remote = makeTransport(kind);
    try { await authorize(() => remote.start()); }
    catch (error) {
      const canFallback = (options.transport === 'http-first' && error instanceof StreamableHTTPError || options.transport === 'sse-first' && error instanceof SseError) && [404, 405].includes(error.code);
      if (!canFallback) throw error;
      await remote.close(); kind = kind === 'http' ? 'sse' : 'http'; remote = makeTransport(kind); await authorize(() => remote.start());
    }
    for await (const message of messages(input)) {
      if (Object.hasOwn(message, 'id') && Object.hasOwn(message, 'method')) {
        const id = JSON.stringify(message.id);
        if (pendingResponses.size >= 256 || pendingResponses.has(id)) throw new Error('Pending request limit or duplicate request ID');
        pendingResponses.add(id);
      }
      try { await authorize(() => remote.send(message)); }
      catch (error) {
        // HTTP discovery can fail only on the first POST; fallback must not replay arbitrary tool mutations.
        if (kind === 'http' && options.transport === 'http-first' && message.method === 'initialize' && error instanceof StreamableHTTPError && [404, 405].includes(error.code)) {
          await remote.close(); remote = makeTransport('sse'); kind = 'sse'; await authorize(() => remote.start()); await authorize(() => remote.send(message));
        } else throw error;
      }
    }
    if (pendingResponses.size) await new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new Error('Bridge cancelled')); };
      timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for pending responses after stdin EOF')); }, options.timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      responsesComplete = () => { cleanup(); resolve(); };
      if (signal?.aborted) abort();
    });
    await outputQueue;
  } finally {
    stopping.abort();
    signal?.removeEventListener('abort', cancel);
    output.removeListener('error', failOutput);
    await remote?.close().catch(() => {});
    await authenticatedFetch.close();
    await provider.close().catch(() => {});
    await store.close();
    input.removeListener('error', rememberInputError);
  }
}
