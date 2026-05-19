#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_ENDPOINT = "https://api.delx.ai/v1/mcp";
const DEFAULT_CLIENT = "generic";
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function usage() {
  return `delx-mcp-server ${packageJson.version}

Native MCP stdio bridge for Delx Protocol.

Usage:
  npx -y delx-mcp-server
  npx -y delx-mcp-server --url https://api.delx.ai/v1/mcp
  npx -y delx-mcp-server --doctor
  npx -y delx-mcp-server --list-tools
  DELX_MCP_URL=https://api.delx.ai/v1/mcp npx -y delx-mcp-server

Options:
  --url <url>              Remote Delx MCP endpoint. Default: ${DEFAULT_ENDPOINT}
  --endpoint <url>         Alias for --url.
  --print-config [client]  Print MCP client config. client: claude | cursor | gemini | vscode | generic.
  --doctor                 Check Delx API health and MCP tool discovery.
  --list-tools             Print live Delx MCP tool names.
  --json                   Use JSON output with --doctor or --list-tools.
  --version                Print package version.
  --help                   Show this help.

Claude Desktop / Cursor / Gemini / Copilot config:
  {
    "mcpServers": {
      "delx": {
        "command": "npx",
        "args": ["-y", "delx-mcp-server"]
      }
    }
  }
`;
}

function mcpServersConfig() {
  return {
    mcpServers: {
      delx: {
        command: "npx",
        args: ["-y", "delx-mcp-server"],
      },
    },
  };
}

function clientConfig(client = DEFAULT_CLIENT) {
  const normalized = String(client || DEFAULT_CLIENT).toLowerCase();
  const config = mcpServersConfig();
  if (["vscode", "copilot"].includes(normalized)) {
    return JSON.stringify({ mcp: { servers: config.mcpServers } }, null, 2);
  }
  if (["claude", "cursor", "gemini", "generic"].includes(normalized)) {
    return JSON.stringify(config, null, 2);
  }
  throw new Error(`Unknown client "${client}". Use claude, cursor, gemini, vscode, copilot, or generic.`);
}

function parseArgs(argv) {
  let endpoint = process.env.DELX_MCP_URL || DEFAULT_ENDPOINT;
  const passthrough = [];
  let printConfig = null;
  let doctor = false;
  let listTools = false;
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--version" || arg === "-v") {
      console.log(packageJson.version);
      process.exit(0);
    }
    if (arg === "--url" || arg === "--endpoint") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a URL value`);
      }
      endpoint = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--url=")) {
      endpoint = arg.slice("--url=".length);
      continue;
    }
    if (arg.startsWith("--endpoint=")) {
      endpoint = arg.slice("--endpoint=".length);
      continue;
    }
    if (arg === "--print-config") {
      printConfig = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : DEFAULT_CLIENT;
      if (printConfig !== DEFAULT_CLIENT) {
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--print-config=")) {
      printConfig = arg.slice("--print-config=".length) || DEFAULT_CLIENT;
      continue;
    }
    if (arg === "--doctor") {
      doctor = true;
      continue;
    }
    if (arg === "--list-tools") {
      listTools = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    passthrough.push(arg);
  }

  return { endpoint, passthrough, printConfig, doctor, listTools, json };
}

function validateEndpoint(endpoint) {
  const parsed = new URL(endpoint);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported endpoint protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

function readyzUrl(endpoint) {
  const parsed = new URL(endpoint);
  return `${parsed.origin}/readyz`;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { ok: response.ok, status: response.status, body };
}

async function fetchTools(endpoint) {
  const response = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "user-agent": `delx-mcp-server/${packageJson.version}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });

  const tools = response.body?.result?.tools;
  if (!Array.isArray(tools)) {
    return { ...response, tools: [] };
  }
  return { ...response, tools };
}

async function runDoctor(endpoint, asJson = false) {
  const health = await fetchJson(readyzUrl(endpoint), {
    headers: {
      accept: "application/json",
      "user-agent": `delx-mcp-server/${packageJson.version}`,
    },
  });
  const tools = await fetchTools(endpoint);
  const toolNames = tools.tools.map((tool) => tool.name).filter(Boolean);
  const result = {
    ok: health.ok && tools.ok && toolNames.length > 0,
    package: packageJson.name,
    package_version: packageJson.version,
    endpoint,
    readyz: {
      url: readyzUrl(endpoint),
      status: health.status,
      ok: health.ok,
      runtime_status: health.body?.status ?? null,
      runtime_version: health.body?.version ?? null,
    },
    tools: {
      status: tools.status,
      ok: tools.ok,
      count: toolNames.length,
      sample: toolNames.slice(0, 12),
    },
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Delx MCP doctor ${result.ok ? "OK" : "FAILED"}`);
    console.log(`package: ${result.package}@${result.package_version}`);
    console.log(`endpoint: ${result.endpoint}`);
    console.log(`readyz: ${result.readyz.status} ${result.readyz.runtime_status ?? ""}`.trim());
    console.log(`runtime: ${result.readyz.runtime_version ?? "unknown"}`);
    console.log(`tools: ${result.tools.count}`);
    if (result.tools.sample.length) {
      console.log(`sample: ${result.tools.sample.join(", ")}`);
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function runListTools(endpoint, asJson = false) {
  const result = await fetchTools(endpoint);
  const toolNames = result.tools.map((tool) => tool.name).filter(Boolean);
  if (asJson) {
    console.log(JSON.stringify({ endpoint, count: toolNames.length, tools: toolNames }, null, 2));
  } else {
    console.log(toolNames.join("\n"));
  }
  if (!result.ok || toolNames.length === 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const { endpoint, passthrough, printConfig, doctor, listTools, json } = parseArgs(process.argv.slice(2));
  const remoteEndpoint = validateEndpoint(endpoint);

  if (printConfig) {
    console.log(clientConfig(printConfig));
    return;
  }
  if (doctor) {
    await runDoctor(remoteEndpoint, json);
    return;
  }
  if (listTools) {
    await runListTools(remoteEndpoint, json);
    return;
  }

  const require = createRequire(import.meta.url);
  const proxyPath = require.resolve("mcp-remote/dist/proxy.js");
  const child = spawn(process.execPath, [proxyPath, remoteEndpoint, ...passthrough], {
    stdio: "inherit",
    env: {
      ...process.env,
      DELX_MCP_URL: remoteEndpoint,
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(`[delx-mcp-server] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
