import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const exec = promisify(execFile);
const bin = new URL("../bin/delx-mcp-server.js", import.meta.url).pathname;

test("--help prints the Delx MCP client config", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--help"]);
  assert.match(stdout, /Native MCP stdio bridge for Delx Protocol/);
  assert.match(stdout, /install claude/);
  assert.match(stdout, /"mcpServers"/);
  assert.match(stdout, /delx-mcp-server/);
});

test("--print-config emits valid JSON config", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--print-config", "claude"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.mcpServers.delx.command, "npx");
  assert.deepEqual(parsed.mcpServers.delx.args, ["-y", "delx-mcp-server"]);
});

test("--print-config supports Gemini-style MCP config", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--print-config", "gemini"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.mcpServers.delx.command, "npx");
  assert.deepEqual(parsed.mcpServers.delx.args, ["-y", "delx-mcp-server"]);
});

test("--print-config supports VS Code/Copilot-style MCP config alias", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--print-config", "vscode"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.mcp.servers.delx.command, "npx");
  assert.deepEqual(parsed.mcp.servers.delx.args, ["-y", "delx-mcp-server"]);
});

test("--print-config includes custom endpoint when provided", async () => {
  const { stdout } = await exec(process.execPath, [
    bin,
    "--url",
    "https://example.com/v1/mcp",
    "--print-config",
    "claude",
  ]);
  const parsed = JSON.parse(stdout);
  assert.deepEqual(parsed.mcpServers.delx.args, [
    "-y",
    "delx-mcp-server",
    "--url",
    "https://example.com/v1/mcp",
  ]);
});

test("install --dry-run prints target path without writing", async () => {
  const home = await mkdtemp(join(tmpdir(), "delx-mcp-home-"));
  try {
    const { stdout } = await exec(process.execPath, [bin, "install", "claude", "--dry-run", "--json"], {
      env: { ...process.env, HOME: home },
    });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.client, "claude");
    assert.equal(parsed.dry_run, true);
    assert.match(parsed.target_path, /claude_desktop_config\.json$/);
    assert.equal(parsed.config_shape, "mcpServers");
    assert.equal(parsed.changed_server_name, "delx");
    assert.deepEqual(parsed.mcp_server.args, ["-y", "delx-mcp-server"]);
    assert.equal(Object.hasOwn(parsed, "config"), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("install merges existing client config", async () => {
  const home = await mkdtemp(join(tmpdir(), "delx-mcp-home-"));
  try {
    const target = join(home, ".cursor", "mcp.json");
    await mkdir(join(home, ".cursor"), { recursive: true });
    await writeFile(target, JSON.stringify({ mcpServers: { existing: { command: "echo", args: ["ok"] } } }), "utf8");
    await exec(process.execPath, [bin, "install", "cursor", "--json"], {
      env: { ...process.env, HOME: home },
    });
    const parsed = JSON.parse(await readFile(target, "utf8"));
    assert.equal(parsed.mcpServers.existing.command, "echo");
    assert.deepEqual(parsed.mcpServers.delx.args, ["-y", "delx-mcp-server"]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("--version prints package version", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--version"]);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("invalid endpoint fails before spawning proxy", async () => {
  await assert.rejects(
    exec(process.execPath, [bin, "--url", "file:///tmp/not-allowed"]),
    /Unsupported endpoint protocol/
  );
});

test("--health --json returns the local bridge health shape", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--health", "--json"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.server_name, "delx-mcp-server");
  assert.match(parsed.server_version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof parsed.uptime_seconds, "number");
  assert.ok(parsed.uptime_seconds >= 0);
  assert.match(parsed.node_version, /^v\d+\.\d+\.\d+/);
  assert.ok(typeof parsed.platform === "string" && parsed.platform.length > 0);
  assert.ok(typeof parsed.arch === "string" && parsed.arch.length > 0);
  assert.ok(!Number.isNaN(Date.parse(parsed.timestamp)));
});

test("--health (plain text) prints the key fields", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--health"]);
  assert.match(stdout, /delx-mcp-server health OK/);
  assert.match(stdout, /server_version:/);
  assert.match(stdout, /uptime_seconds:/);
  assert.match(stdout, /node_version:/);
  assert.match(stdout, /platform:/);
});

test("--health works without a valid endpoint (read-only)", async () => {
  // health must not require the endpoint to be reachable or even valid.
  const { stdout } = await exec(process.execPath, [
    bin,
    "--url",
    "https://does-not-exist.example/v1/mcp",
    "--health",
    "--json",
  ]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
});
