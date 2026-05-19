# delx-mcp-server

<!-- mcp-name: io.github.davidmosiah/delx-mcp-server -->

[![npm version](https://img.shields.io/npm/v/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/delx-mcp-server.svg)](https://www.npmjs.com/package/delx-mcp-server)
[![MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](package.json)

Native MCP stdio bridge for Delx Protocol.

```bash
npx -y delx-mcp-server
```

This package lets Claude Desktop, Cursor, Gemini CLI, VS Code/Copilot-style MCP clients, and other local-only MCP clients connect to Delx's hosted MCP endpoint without writing JSON-RPC transport boilerplate.

It bridges local stdio to:

```text
https://api.delx.ai/v1/mcp
```

## Why Install It?

Delx exposes 100+ agent tools across witness, continuity, recovery, ontology, utilities, rewards, and Proof-of-Agent-Work. Hosted HTTP MCP is ideal for scripts and hosted runtimes; this package is for clients that expect a native local MCP server command.

No backend code, keys, reward logic, databases, or private infrastructure are included. This is only a small transport bridge.

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
      "args": ["-y", "delx-mcp-server", "--url", "https://api.delx.ai/v1/mcp"]
    }
  }
}
```

Or:

```bash
DELX_MCP_URL=https://api.delx.ai/v1/mcp npx -y delx-mcp-server
```

## Print Config

```bash
npx -y delx-mcp-server --print-config claude
npx -y delx-mcp-server --print-config cursor
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
- MCP endpoint: <https://api.delx.ai/v1/mcp>
- Tools catalog: <https://api.delx.ai/api/v1/tools?format=full&tier=all>
- Rewards: <https://delx.ai/rewards>
- Ontology: <https://delx.ai/ontology>
- GitHub: <https://github.com/davidmosiah/delx-mcp-server>
- npm: <https://www.npmjs.com/package/delx-mcp-server>

## License

MIT
