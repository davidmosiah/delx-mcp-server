# Changelog

## 0.2.6 - 2026-05-22
- Add `--health` (alias `--healthcheck`, `--health-check`) CLI flag and `npm run health` script. Returns the local bridge state — `server_version`, `uptime_seconds`, `node_version`, `platform`, `arch`, `timestamp` — without contacting the remote endpoint. Use `--json` for machine-readable output.
- Add CI workflow (`.github/workflows/ci.yml`) running the existing `node --test` suite on Node 22.

## 0.2.5
- Previous release.
