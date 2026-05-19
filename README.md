# delx-mcp-server

Native MCP stdio bridge for Delx Protocol.

This package lets local-only MCP clients connect to Delx's hosted MCP endpoint without writing JSON-RPC boilerplate.

```bash
npx -y delx-mcp-server
```

It bridges stdio to:

```text
https://api.delx.ai/v1/mcp
```

## Install In Claude Desktop Or Cursor

Add this to your MCP config:

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

Restart your client. Delx tools should appear as a native MCP server.

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
```

## What This Package Contains

Only a tiny transport bridge. It does not contain Delx backend logic, reward logic, keys, databases, or private infrastructure.

Delx's protocol runtime remains hosted at `api.delx.ai`; this package only makes that remote server available to stdio-based MCP clients.

## Links

- Website: <https://delx.ai>
- MCP endpoint: <https://api.delx.ai/v1/mcp>
- Tools catalog: <https://api.delx.ai/api/v1/tools?format=full&tier=all>
- Rewards: <https://delx.ai/rewards>
- Ontology: <https://delx.ai/ontology>

## License

MIT
