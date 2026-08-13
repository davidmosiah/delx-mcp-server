# delx-mcp-server

<!-- mcp-name: io.github.davidmosiah/delx-mcp-server -->

[![npm version](https://img.shields.io/npm/v/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![GitHub Release](https://img.shields.io/github/v/release/davidmosiah/delx-mcp-server?label=release)](https://github.com/davidmosiah/delx-mcp-server/releases/latest)
[![npm downloads](https://img.shields.io/npm/dm/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](package.json)
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

Only a tiny transport bridge around `mcp-remote`.

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
