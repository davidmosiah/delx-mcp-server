import { auth, extractWWWAuthenticateParams } from '@modelcontextprotocol/sdk/client/auth.js';

function wait(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error('OAuth request cancelled'));
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new Error('OAuth request cancelled')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

// SDK transports intentionally receive no authProvider: all resource challenges,
// including background SSE reconnects, enter this one public-SDK auth boundary.
export function createAuthenticatedFetch({ provider, endpoint, fetchFn, signal, headers: configuredHeaders = {} }) {
  const resourceOrigin = new URL(endpoint).origin;
  let flight, generation = 0, lastChallenge;
  const oauthFetch = (url, init = {}) => {
    if (signal?.aborted) throw new Error('OAuth request cancelled');
    const headers = new Headers(configuredHeaders);
    for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
    return fetchFn(url, { ...init, headers, signal: init.signal && signal ? AbortSignal.any([init.signal, signal]) : signal || init.signal });
  };
  async function authenticate(challenge, observed, consumerSignal) {
    const key = JSON.stringify([challenge.scope || '', challenge.resourceMetadataUrl || '']);
    for (;;) {
      if (signal?.aborted || consumerSignal?.aborted) throw new Error('OAuth request cancelled');
      if (generation !== observed && lastChallenge === key) return;
      if (flight) { await wait(flight, consumerSignal); continue; }
      const operation = (async () => {
        try {
          const options = { serverUrl: endpoint, fetchFn: oauthFetch, scope: challenge.scope, resourceMetadataUrl: challenge.resourceMetadataUrl };
          const result = await auth(provider, options);
          if (result === 'REDIRECT') {
            const ownership = provider.authorizationFlow();
            const code = await wait(provider.waitForCode(), signal);
            if (await auth(provider, { ...options, authorizationCode: code }) !== 'AUTHORIZED') throw new Error('OAuth authorization failed');
            provider.completeAuthorization(ownership);
          } else if (result !== 'AUTHORIZED') throw new Error('OAuth authorization failed');
          generation++;
          lastChallenge = key;
        } catch (error) {
          // This coordinator is the sole OAuth owner. Discard only its ephemeral
          // failed PKCE flow, not persisted client information or valid tokens.
          provider.cancelAuthorization?.();
          throw error;
        }
      })();
      flight = operation;
      // Always release, including failed refresh/authorization, without caching errors.
      operation.then(() => { if (flight === operation) flight = null; }, () => { if (flight === operation) flight = null; });
      await wait(operation, consumerSignal);
      return;
    }
  }
  const requestCancellation = consumer => consumer && signal ? AbortSignal.any([consumer, signal]) : signal || consumer;
  const authenticatedFetch = async (url, init = {}) => {
    if (new URL(String(url)).origin !== resourceOrigin) throw new Error('Transport resource origin is not trusted');
    const headers = new Headers(init.headers);
    // Explicit operator Authorization retains precedence, and cannot be silently
    // replaced with OAuth credentials after failure.
    const explicitAuthorization = headers.has('authorization');
    let observed, tokens;
    do {
      observed = generation;
      tokens = await wait(provider.tokens(), requestCancellation(init.signal));
    } while (observed !== generation);
    if (!explicitAuthorization && tokens?.access_token) headers.set('authorization', `Bearer ${tokens.access_token}`);
    const requestSignal = requestCancellation(init.signal);
    const response = await fetchFn(url, { ...init, headers, signal: requestSignal });
    if (explicitAuthorization || ![401, 403].includes(response.status)) return response;
    const challenge = extractWWWAuthenticateParams(response);
    if (response.status === 403 && challenge.error !== 'insufficient_scope') return response;
    if ((challenge.scope?.length || 0) > 4096 || (challenge.resourceMetadataUrl?.length || 0) > 4096) {
      await response.body?.cancel(); throw new Error('OAuth challenge exceeds adapter limit');
    }
    await response.body?.cancel();
    await authenticate(challenge, observed, requestSignal);
    const refreshed = await provider.tokens();
    if (!refreshed?.access_token) throw new Error('OAuth authorization returned no access token');
    headers.set('authorization', `Bearer ${refreshed.access_token}`);
    // Exactly one retry after an explicit authentication/scope rejection, never
    // replay on ambiguous network failure or an arbitrary HTTP error.
    return fetchFn(url, { ...init, headers, signal: requestSignal });
  };
  authenticatedFetch.close = async () => { await flight?.catch(() => {}); };
  return authenticatedFetch;
}
