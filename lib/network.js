import { fetch as networkFetch } from 'undici';

const PROXIES = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
export function validateEndpoint(value, allowHttp = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid endpoint URL'); }
  if (url.username || url.password || url.hash) throw new Error('Endpoint credentials/fragments are not supported');
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || allowHttp))) {
    throw new Error('Use HTTPS, loopback HTTP, or explicitly allow trusted HTTP');
  }
  return url;
}

export function createSafeFetch({ endpoint, issuer, allowHttp = false, env = process.env, headers = {}, timeoutMs = 30000, maxBytes = 8 * 1024 * 1024, maxEventBytes = 1024 * 1024, fetchImpl = networkFetch }) {
  if (PROXIES.some(k => typeof env[k] === 'string' && env[k].trim())) {
    throw new Error('Configured environment proxies are not supported by this adapter; no direct fallback was attempted');
  }
  const target = validateEndpoint(endpoint, allowHttp);
  const origins = new Set([target.origin]);
  if (issuer) origins.add(validateEndpoint(issuer, allowHttp).origin);
  let configuredHeaders;
  try { configuredHeaders = new Headers(headers); } catch { throw new Error('Invalid request header configuration'); }
  return async (input, init = {}) => {
    const url = validateEndpoint(input instanceof Request ? input.url : String(input), allowHttp);
    if (!origins.has(url.origin)) throw new Error('Untrusted OAuth or transport origin; configure the trusted issuer explicitly');
    if (input instanceof Request) throw new Error('Request objects are not supported by the bounded fetch adapter');
    const body = init.body;
    if (body != null && typeof body !== 'string' && !(body instanceof URLSearchParams)) throw new Error('Unsupported request body type');
    if (body != null && Buffer.byteLength(String(body)) > maxBytes) throw new Error('Request body exceeds adapter limit');
    let requestHeaders;
    try { requestHeaders = new Headers(init.headers); } catch { throw new Error('Invalid request headers'); }
    if (url.origin !== target.origin) {
      for (const [name, value] of configuredHeaders) if (requestHeaders.get(name) === value) requestHeaders.delete(name);
    }
    const controller = new AbortController();
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try { response = await fetchImpl(url, { ...init, headers: requestHeaders, redirect: 'manual', signal }); }
    finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('Redirect refused; no request credentials or body were replayed');
    }
    if (!response.body) return response;
    const streaming = (response.headers.get('content-type') || '').toLowerCase().startsWith('text/event-stream');
    const declared = response.headers.get('content-length');
    if (!streaming && declared && Number(declared) > maxBytes) {
      await response.body.cancel();
      throw new Error('Response body exceeds adapter limit');
    }
    const reader = response.body.getReader();
    let bytes = 0, eventBytes = 0, lineContent = false, previousCR = false;
    const stream = new ReadableStream({
      async pull(output) {
        const idle = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const { done, value } = await reader.read();
          if (done) { output.close(); return; }
          if (streaming) {
            for (const byte of value) {
              if (++eventBytes > maxEventBytes) throw new Error('SSE event exceeds adapter limit');
              if (byte === 13) { if (!lineContent) eventBytes = 0; lineContent = false; previousCR = true; }
              else if (byte === 10) { if (!previousCR) { if (!lineContent) eventBytes = 0; lineContent = false; } previousCR = false; }
              else { previousCR = false; lineContent = true; }
            }
          } else if ((bytes += value.byteLength) > maxBytes) throw new Error('Response body exceeds adapter limit');
          output.enqueue(value);
        } catch (error) {
          controller.abort();
          await reader.cancel().catch(() => {});
          output.error(error);
        } finally { clearTimeout(idle); }
      },
      async cancel(reason) { await reader.cancel(reason).catch(() => {}); controller.abort(); },
    });
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
