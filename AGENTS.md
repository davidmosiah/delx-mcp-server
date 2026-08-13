# Agent Development Notes

## Scope

This repo is the native stdio bridge for the hosted Delx Protocol MCP endpoint. It does not contain Delx backend logic, credentials, reward accounting, databases, or private infrastructure.

## Commands

- Install: `npm ci`
- Health check: `npm run doctor`
- Tool list check: `npm run list-tools`
- Full gate: `npm test`
- Package preview: `npm pack --dry-run`

## Rules

- Keep the package a thin transport bridge from local stdio to the bounded Protocol endpoint `https://api.delx.ai/v1/mcp/protocol?src=npm-bridge`.
- Never commit credentials, local client config, private endpoint overrides, or generated MCP client files.
- Do not add backend-only Delx logic here. Hosted protocol behavior belongs behind the API.
- Keep install commands copyable for Claude Desktop, Cursor, Codex, Gemini, and other MCP clients.
- Mutating install helpers must preserve dry-run/JSON preview behavior.

## Agent-readiness checklist

Before publishing a new version:

1. `npm test`
2. `npm run doctor -- --json` against the default endpoint when network is available
3. `npm pack --dry-run` and confirm the package only includes bridge/runtime docs
4. Bump `package.json` and `server.json` together
5. Re-check README install snippets for stale package names or endpoints
