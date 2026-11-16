import { validateEndpoint } from './network.js';

export function parseAdapterOptions(endpoint, args, env = process.env) {
  const options = { endpoint, transport: 'http-first', headers: {}, profile: 'default', allowHttp: false, timeoutMs: 30000, authTimeoutMs: 120000, callbackPort: 0 };
  const next = (i, name) => { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${name} requires a value`); return args[i + 1]; };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (/^\d+$/.test(arg) && i === 0) options.callbackPort = Number(arg);
    else if (arg === '--allow-http') options.allowHttp = true;
    else if (arg === '--silent') options.silent = true;
    else if (arg === '--transport') { options.transport = next(i, arg); i++; }
    else if (arg === '--profile') { options.profile = next(i, arg); i++; }
    else if (arg === '--issuer') { options.issuer = next(i, arg); i++; }
    else if (arg === '--timeout') { options.timeoutMs = Number(next(i, arg)) * 1000; i++; }
    else if (arg === '--auth-timeout') { options.authTimeoutMs = Number(next(i, arg)) * 1000; i++; }
    else if (arg === '--header') {
      const value = next(i, arg); i++;
      const match = value.match(/^([!#$%&'*+.^_`|~0-9A-Za-z-]+):\s*([^\r\n]*)$/);
      if (!match) throw new Error('Invalid custom header syntax');
      if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(match[1].toLowerCase())) throw new Error('Transport framing headers may not be overridden');
      const expanded = match[2].replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_placeholder, name) => {
        if (typeof env[name] !== 'string') throw new Error('A requested header environment variable is unset');
        return env[name];
      });
      if (/\$\{|[\r\n]/.test(expanded)) throw new Error('Invalid header environment substitution');
      options.headers[match[1]] = expanded;
    } else throw new Error('Unsupported adapter option; consult the supported-option list');
  }
  try { new Headers(options.headers); } catch { throw new Error('Invalid custom header value'); }
  if (!['http-first', 'sse-first', 'http-only', 'sse-only'].includes(options.transport)) throw new Error('Unsupported transport strategy');
  for (const n of [options.timeoutMs, options.authTimeoutMs]) if (!Number.isFinite(n) || n < 1000 || n > 600000) throw new Error('Timeout must be between 1 and 600 seconds');
  if (!Number.isInteger(options.callbackPort) || options.callbackPort < 0 || options.callbackPort > 65535) throw new Error('Invalid callback port');
  options.endpoint = validateEndpoint(endpoint, options.allowHttp).toString();
  options.issuer = validateEndpoint(options.issuer || new URL(options.endpoint).origin, options.allowHttp).toString();
  return options;
}
