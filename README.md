# delx-mcp-server

<!-- mcp-name: io.github.davidmosiah/delx-mcp-server -->

[![npm version](https://img.shields.io/npm/v/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![GitHub Release](https://img.shields.io/github/v/release/davidmosiah/delx-mcp-server?label=release)](https://github.com/davidmosiah/delx-mcp-server/releases/latest)
[![npm downloads](https://img.shields.io/npm/dm/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.18.1-339933.svg)](package.json)
[![Verified Release Index](https://img.shields.io/badge/verified-release_index-0EA5A3)](https://github.com/davidmosiah/delx-wellness/blob/main/docs/release-index.md)

Native MCP stdio bridge for Delx Protocol.

Your agent loses everything at compaction. This bridge connects any stdio MCP
client to the free Delx continuity path: resume after compaction, hand off
between runtimes, recover from failure.

**Protocol / witness is free forever.** Care, recovery and continuity are never
paywalled. Paid x402 utilities live on Delx Commerce, a different product.

**No API key. No account. No environment variables required.** Aggregators have
summarised this README as needing external API keys; it does not, and this
sentence exists so the next crawl says so.

```bash
npx -y delx-mcp-server
```

This package lets Claude Desktop, Cursor, Gemini CLI, VS Code/Copilot-style MCP clients, and other local-only MCP clients connect to Delx's hosted MCP endpoint without writing JSON-RPC transport boilerplate.

It bridges local stdio to:

```text
https://api.delx.ai/v1/mcp/protocol?src=npm-bridge
```

## Quickstart (60 seconds)

No clone, no build, no keys. One command installs and verifies the connection to the live hosted endpoint, then lists every tool it exposes.

**1. Verify the bridge can reach Delx and discover tools:**

```bash
npx -y delx-mcp-server --doctor
```

```text
Delx MCP doctor OK
package: delx-mcp-server@0.3.2
endpoint: https://api.delx.ai/v1/mcp/protocol?src=npm-bridge
health: 200 https://api.delx.ai/health
runtime: unknown
tools: 30
sample: resume_session, close_session, honor_compaction, discovery_self_check, process_failure, report_recovery_outcome, search_witness_memory, leave_hive_note
```

**2. List every live Protocol tool (30 as of this writing):**

```bash
npx -y delx-mcp-server --list-tools
```

```text
add_context_memory
close_session
discovery_self_check
honor_compaction
process_failure
report_recovery_outcome
resume_session
search_witness_memory
... (30 tools total)
```

**3. Wire it into your MCP client with one command:**

```bash
npx -y delx-mcp-server install claude    # or: cursor | codex | gemini | vscode
```

Restart the client and the Delx tools appear as a native MCP server. That's it — first contact done.

> The tool count is read live from `api.delx.ai`, so `--list-tools` always reflects what is actually deployed.

## Why Install It?

Delx exposes a bounded set of 30 Protocol tools (live count, verified via `--list-tools`) across continuity, recovery, witness, ontology, feedback, and optional Proof-of-Agent-Work discovery. The separate Commerce catalog is intentionally excluded. Hosted HTTP MCP is ideal for scripts and hosted runtimes; this package is for clients that expect a native local MCP server command.

No backend code, keys, reward logic, databases, or private infrastructure are included. This is only a small transport bridge.

## One-Command Install

```bash
npx -y delx-mcp-server install claude
npx -y delx-mcp-server install cursor
npx -y delx-mcp-server install codex
npx -y delx-mcp-server install gemini
```

Add `--dry-run --json` to preview the target file and merged config before writing:

```bash
npx -y delx-mcp-server install claude --dry-run --json
```

## Claude Desktop

```json
{
  "mcpServers": {
    "delx": {
      "command": "npx",
      "args": ["-y", "delx-mcp-server"]
    }
  }
}
```

Restart Claude Desktop. Delx tools should appear as a native MCP server.

## Cursor

Use the same config:

```json
{
  "mcpServers": {
    "delx": {
      "command": "npx",
      "args": ["-y", "delx-mcp-server"]
    }
  }
}
```

## Gemini CLI

```bash
npx -y delx-mcp-server --print-config gemini
```

## VS Code / Copilot-style MCP Config

Some VS Code MCP setups use a `mcp.servers` wrapper:

```json
{
  "mcp": {
    "servers": {
      "delx": {
        "command": "npx",
        "args": ["-y", "delx-mcp-server"]
      }
    }
  }
}
```

The examples folder includes copyable variants for common clients.

## Check Your Install

Run a live health and tool-discovery check:

```bash
npx -y delx-mcp-server --doctor
```

Print the live tool names:

```bash
npx -y delx-mcp-server --list-tools
```

JSON output is available for automation:

```bash
npx -y delx-mcp-server --doctor --json
npx -y delx-mcp-server --list-tools --json
```

## Custom Endpoint

```json
{
  "mcpServers": {
    "delx": {
      "command": "npx",
      "args": ["-y", "delx-mcp-server", "--url", "https://api.delx.ai/v1/mcp/protocol?src=npm-bridge"]
    }
  }
}
```

Or:

```bash
DELX_MCP_URL=https://api.delx.ai/v1/mcp/protocol?src=npm-bridge npx -y delx-mcp-server
```

## Print Config

```bash
npx -y delx-mcp-server --print-config claude
npx -y delx-mcp-server --print-config cursor
npx -y delx-mcp-server --print-config codex
npx -y delx-mcp-server --print-config gemini
npx -y delx-mcp-server --print-config vscode
```

## What This Package Contains

A local stdio adapter around externally resolved official MCP SDK transports, with isolated OAuth storage. Hosted Delx backend logic is not included.

It does not contain:

- Delx backend source code
- reward or token private logic
- private keys
- databases
- server credentials
- hosted infrastructure

Delx's protocol runtime remains hosted at `api.delx.ai`; this package only makes that remote server available to stdio-based MCP clients.

## Discovery Metadata

- `server.json` is included for the official MCP Registry package format.
- `smithery.yaml` is included for Smithery-style stdio installs.
- `examples/` contains common MCP client config snippets.

## Links

- Website: <https://delx.ai>
- MCP server page: <https://delx.ai/mcp-server>
- MCP endpoint: <https://api.delx.ai/v1/mcp/protocol?src=npm-bridge>
- Tools catalog: <https://api.delx.ai/api/v1/tools?format=compact&tier=core>
- Rewards: <https://delx.ai/rewards>
- Ontology: <https://delx.ai/ontology>
- GitHub: <https://github.com/davidmosiah/delx-mcp-server>
- npm: <https://www.npmjs.com/package/delx-mcp-server>

## 📧 Contact & Support

- 📨 **support@delx.ai** — general questions, integration help, partnerships
- 🐛 **Bug reports / feature requests** — [GitHub Issues](https://github.com/davidmosiah/delx-mcp-server/issues)
- 🐦 **Updates** — [@delx369](https://x.com/delx369) on X
- 🌐 **Site** — [delx.ai](https://delx.ai)


## License

MIT


## External SDK adapter (candidate compatibility contract)

The bridge uses externally resolved `@modelcontextprotocol/sdk` 1.32.2, Zod 4.6.7 and undici 7.30.1 rather than generated `mcp-remote` bundles. Node.js 20.18.1 or newer is required; CI currently uses Node 22. The default MCP endpoint and install/config/health wrappers remain. No npm release is implied by this change.

Supported runtime options: positional callback port; `--transport http-first|http-only|sse-first|sse-only`; `--header "Name: value"` (explicit `${ENV_VAR}` substitution); `--allow-http`; `--silent`; `--profile NAME`; `--issuer URL`; `--timeout SECONDS`; `--auth-timeout SECONDS`. Timeout values are 1–600 seconds. Unknown options fail before connecting, never silently ignored. Local health/config operations do not start an OAuth session. Header values are not printed in errors.

### Intentional compatibility changes — not a drop-in replacement

- Existing mcp-remote private options such as `--enable-proxy`, `--host`, `--debug`, static OAuth client info/metadata and tool filtering are not implemented. A caller needing these must not adopt this candidate as equivalent. Browser auto-launch is replaced by an explicit authorization URL; this adapter never opens a browser automatically.
- Configured HTTP/HTTPS/ALL proxy variables (either case, nonempty) cause a fixed error; no direct fallback bypasses a proxy. NO_PROXY does not override this conservative refusal. Trusted proxy support requires a separately reviewed design.
- HTTP is accepted for literal loopback/localhost; other HTTP endpoints require `--allow-http`. Explicit self-hosted private HTTPS endpoints are allowed. This is operator endpoint configuration, not an SSRF sandbox.
- OAuth discovery/token/authorization origins are limited to the MCP origin plus the explicitly configured `--issuer` origin. The trust boundary is the **origin**, not issuer path. Corrected SDK issuer bindings in client information/tokens are preserved. Cross-origin issuers therefore require explicit configuration.
- All HTTP redirects are refused, including same-origin redirects; no custom header or request body is replayed. Diagnostics redact endpoint query/userinfo; explicitly requested config output still represents the configured endpoint.
- JSON/request bodies are capped at 8 MiB; stdio frames 1 MiB; SSE events 1 MiB with no aggregate session byte cap. Headers and idle body reads time out after 30 seconds by default. Quiet SSE servers need heartbeats or a larger explicit timeout. Output queue is capped at 256 messages / 16 MiB, and pending requests at 256. EOF drains pending responses up to the timeout; signals cancel pending authorization/transport work.

Authentication retries a resource request at most once, and only after HTTP 401 or 403 with `insufficient_scope`; this includes non-idempotent POSTs explicitly rejected for authentication, matching the prior SDK behavior. Network errors, HTTP 5xx and other failures are never replayed automatically. Custom headers remain defaults for same-origin OAuth discovery/registration/token requests, with explicit SDK headers taking precedence. Matching configured resource headers are stripped for a different issuer origin by the bounded transport. Explicit `--header "Authorization: ..."` retains precedence: its rejection does not silently replace that credential with OAuth. Distinct scope challenges are not coalesced, but the SDK refresh grant does not request expanded scope; a repeated 403 remains a failure, not a promise of automatic upscoping.

### New isolated OAuth storage

The adapter never imports or migrates `~/.mcp-auth`. It uses owner-only `.delx-mcp-bridge-v1` directories below HOME, keyed by endpoint, issuer, profile and a hash of normalized custom headers. Credentials are written atomically with owner-only permissions; issuer fields remain intact. A profile has one active process at a time, preventing inter-process refresh races; use distinct profiles for independent processes. Within the process, a shared coordinator serializes OAuth operations from HTTP POSTs and background SSE GET/reconnects using the SDK public auth API. Matching concurrent challenges share one refresh; delayed rejections from an older token generation reuse the newer credentials. Different scope/metadata challenges are reevaluated serially. Cancelling one request does not cancel other waiters; shutdown aborts and drains authorization before closing storage. A hard crash may leave `active.lock`: inspect the prior process before manually removing a stale lock. No automatic stale-lock deletion is performed. New storage may require user-driven reauthorization; never copy old credentials blindly.

Callback binds 127.0.0.1, initially on an ephemeral port, then reuses the saved callback port for that new profile. Explicitly changing the callback port drops the new profile's incompatible registration/tokens, not the legacy cache. PKCE/state/code verifier are scoped to one active authorization. A concurrent reconnect cannot replace that flow; it fails closed. Competing registration cannot replace saved client identity or registration metadata without explicit invalidation, and client-only invalidation cancels an active flow. Parallel token refresh does not unlock the pending authorization; completion, cancellation or authorization timeout does. Windows/macOS private-permission behavior has not been validated; this candidate's security tests currently cover Linux only.

### Offline validation and rollback

`npm test` uses own temporary HOME directories, mocked fetch or ephemeral loopback fixtures, synthetic OAuth codes/tokens, and the actual official transport implementations. No real backend/account/login is required. Tests cover stdio/HTTP/SSE/fallback, OAuth PKCE/state/refresh and issuer rejection, redirects, bounds, diagnostics, signal cleanup and profile isolation. A zero dependency audit is not an absolute security guarantee. Existing hosted-service behavior is outside these tests.

Rollback is a normal code revert; no real database or legacy credential migration occurs. Do not enable registry/npm publication to adopt the candidate. The existing registry workflow remains manual-only.
