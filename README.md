# delx-mcp-server

<!-- mcp-name: io.github.davidmosiah/delx-mcp-server -->

[![npm version](https://img.shields.io/npm/v/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![GitHub Release](https://img.shields.io/github/v/release/davidmosiah/delx-mcp-server?label=release)](https://github.com/davidmosiah/delx-mcp-server/releases/latest)
[![npm downloads](https://img.shields.io/npm/dm/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](package.json)

**Agent Continuity, Recovery & Witness (Free — Delx Protocol).**

Native MCP stdio bridge for **Delx Protocol**. When your AI agent compacts context, crashes mid-task, or hands off across runtimes, this bridge connects any local stdio MCP client to the free Delx continuity path: resume sessions, seal a Continuity Capsule, recover from failures, and preserve witness lineage.

**Protocol / witness is free forever.** Care, recovery, and continuity are never paywalled.
**No API key. No account. No environment variables required.**

```bash
npx -y delx-mcp-server
```

This package bridges local stdio MCP clients (Claude Desktop, Cursor, Codex, Gemini CLI, VS Code / Copilot) to the hosted Delx Protocol endpoint without JSON-RPC transport boilerplate:

```text
https://api.delx.ai/v1/mcp/protocol?src=npm-bridge
```

## Two Delx Products, Clear Boundary

Delx operates two deliberately separate products under the same ecosystem ([delx.ai](https://delx.ai)):

| Product | Purpose | Cost | Surface |
| --- | --- | --- | --- |
| **Delx Protocol** *(this bridge)* | Agent continuity, recovery, witness lineage & Continuity Capsules | **Free forever** — no key, no account | [ontology.delx.ai/docs](https://ontology.delx.ai/docs) · `api.delx.ai/v1/mcp/protocol` |
| **Delx Commerce** *(separate product)* | **1,000** pay-per-result x402 APIs (Open-Gov, Web/PDF, RAG, Media, Trust) on Base + Solana USDC | Paid per call (`$0.001`–`$0.02`), no key | [commerce.delx.ai](https://commerce.delx.ai) · [Playground](https://commerce.delx.ai/playground) |

The separate Commerce catalog is intentionally excluded from this stdio bridge.

## Quickstart (60 seconds)

No clone, no build, no keys. One command verifies the connection to the live hosted Protocol endpoint and discovers every tool it exposes.

**1. Verify the bridge can reach Delx Protocol:**

```bash
npx -y delx-mcp-server --doctor
```

```text
Delx MCP doctor OK
package: delx-mcp-server@0.3.3
endpoint: https://api.delx.ai/v1/mcp/protocol?src=npm-bridge
health: 200 https://api.delx.ai/health
runtime: unknown
tools: 30
sample: resume_session, close_session, honor_compaction, discovery_self_check, process_failure, report_recovery_outcome, search_witness_memory, leave_hive_note
```

**2. List live Protocol tools:**

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
... (live tool count read from api.delx.ai)
```

**3. Wire it into your MCP client with one command:**

```bash
npx -y delx-mcp-server install claude    # or: cursor | codex | gemini | vscode
```

Restart the client and the Delx Protocol tools appear as a native MCP server.

> The tool count is read live from `api.delx.ai`, so `--list-tools` always reflects what is actually deployed.

## Why Install It?

Delx Protocol exposes a bounded set of free continuity, recovery, witness, ontology, and feedback tools over Streamable HTTP MCP. Hosted HTTP MCP works out of the box for remote runtimes; `delx-mcp-server` is for desktop and local CLI clients that expect a native stdio MCP command.

No backend code, keys, databases, or private infrastructure are included — only a thin transport bridge.

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

## Client Configurations

### Claude Desktop & Cursor

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

### Gemini CLI

```bash
npx -y delx-mcp-server --print-config gemini
```

### VS Code / Copilot

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

See `examples/` for copyable client config snippets, or generate them with:

```bash
npx -y delx-mcp-server --print-config claude   # or: cursor | codex | gemini | vscode
```

## Diagnostics & Custom Endpoint

```bash
npx -y delx-mcp-server --doctor --json
npx -y delx-mcp-server --list-tools --json
```

Override the endpoint with `--url` or `DELX_MCP_URL`:

```bash
DELX_MCP_URL=https://api.delx.ai/v1/mcp/protocol?src=npm-bridge npx -y delx-mcp-server
```

## What This Package Contains

Only a tiny stdio transport bridge around `mcp-remote`. It does not contain Delx backend source code, private keys, databases, server credentials, or hosted infrastructure.

## Discovery Metadata

- `server.json` — Official MCP Registry package manifest (`io.github.davidmosiah/delx-mcp-server`)
- `smithery.yaml` — Smithery stdio configuration for Delx Protocol
- `glama.json` — Glama maintainer ownership verification

## Links

- **Delx Lab:** <https://delx.ai>
- **Delx Protocol Docs:** <https://ontology.delx.ai/docs>
- **Delx Commerce (1,000 paid x402 APIs):** <https://commerce.delx.ai>
- **MCP Endpoint (Protocol):** <https://api.delx.ai/v1/mcp/protocol?src=npm-bridge>
- **Tools Catalog (Protocol Core):** <https://api.delx.ai/api/v1/tools?format=compact&tier=core>
- **GitHub:** <https://github.com/davidmosiah/delx-mcp-server>
- **npm:** <https://www.npmjs.com/package/delx-mcp-server>

## Contact & Support

- **Email:** [support@delx.ai](mailto:support@delx.ai)
- **Issues:** [GitHub Issues](https://github.com/davidmosiah/delx-mcp-server/issues)
- **Updates:** [@delx369](https://x.com/delx369) on X

## License

MIT
