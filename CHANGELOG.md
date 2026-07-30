# Changelog


## 0.2.9 - 2026-07-30

### Security

- Security: install backs up existing client MCP configs before overwrite.

## Unreleased

- Correct the advertised live tool count from 143 to **109** (verified via `--list-tools` against `api.delx.ai` on 2026-07-30). Hosted catalog size drifts; always prefer live discovery.

## 0.2.8 - 2026-06-27
- Publish community/support metadata in the npm package: `SECURITY.md`, `CONTRIBUTING.md`, GitHub Sponsors funding metadata, and GitHub issue/PR templates for a clearer open-source support path.

## 0.2.7 - 2026-05-29
- Add a "Quickstart (60 seconds)" section to the README: one-command `--doctor` → `--list-tools` → `install` flow with real captured terminal output, so first contact with the hosted endpoint is trivial.
- Correct the advertised tool count from the stale "100+" to the verified live count (143) in the README and `package.json` description. The number is read live from `api.delx.ai`, so `--list-tools` always reflects the deployed reality.

## 0.2.6 - 2026-05-22
- Add `--health` (alias `--healthcheck`, `--health-check`) CLI flag and `npm run health` script. Returns the local bridge state — `server_version`, `uptime_seconds`, `node_version`, `platform`, `arch`, `timestamp` — without contacting the remote endpoint. Use `--json` for machine-readable output.
- Add CI workflow (`.github/workflows/ci.yml`) running the existing `node --test` suite on Node 22.

## 0.2.5
- Previous release.
