import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const bin = new URL("../bin/delx-mcp-server.js", import.meta.url).pathname;

test("--help prints the Delx MCP client config", async () => {
  const { stdout } = await exec(process.execPath, [bin, "--help"]);
  assert.match(stdout, /Native MCP stdio bridge for Delx Protocol/);
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
