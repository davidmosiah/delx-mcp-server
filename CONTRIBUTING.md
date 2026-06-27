# Contributing

This package should stay a small, auditable transport bridge from local stdio
MCP clients to the hosted Delx MCP endpoint.

## Good Areas

- Client config examples for Claude Desktop, Cursor, Codex, Gemini, VS Code and
  other MCP clients.
- Safer install and dry-run behavior.
- Better doctor, health and list-tools diagnostics.
- Metadata for MCP registries and AI crawlers.

## Boundaries

- Do not add backend logic, reward accounting, private infrastructure or server
  secrets.
- Do not commit local MCP client configs that contain user-specific values.
- Keep endpoint overrides explicit and visible.

## Development

```bash
npm install
npm test
npm run health
```

## Pull Request Checklist

- [ ] `npm test`
- [ ] README examples remain copy-pasteable
- [ ] `server.json` and `package.json` versions stay aligned
- [ ] No credentials or local config files are included
