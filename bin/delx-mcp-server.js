#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_ENDPOINT = "https://api.delx.ai/v1/mcp";
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function usage() {
  return `delx-mcp-server ${packageJson.version}

Native MCP stdio bridge for Delx Protocol.

Usage:
  npx -y delx-mcp-server
  npx -y delx-mcp-server --url https://api.delx.ai/v1/mcp
  DELX_MCP_URL=https://api.delx.ai/v1/mcp npx -y delx-mcp-server

Options:
  --url <url>              Remote Delx MCP endpoint. Default: ${DEFAULT_ENDPOINT}
  --endpoint <url>         Alias for --url.
  --print-config [client]  Print MCP client config. client: claude | cursor | generic.
  --version                Print package version.
  --help                   Show this help.

Claude Desktop / Cursor config:
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

function clientConfig(client = "generic") {
  const config = {
    mcpServers: {
      delx: {
        command: "npx",
        args: ["-y", "delx-mcp-server"],
      },
    },
  };
  if (client === "claude" || client === "cursor" || client === "generic") {
    return JSON.stringify(config, null, 2);
  }
  throw new Error(`Unknown client "${client}". Use claude, cursor, or generic.`);
}

function parseArgs(argv) {
  let endpoint = process.env.DELX_MCP_URL || DEFAULT_ENDPOINT;
  const passthrough = [];
  let printConfig = null;

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
      printConfig = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : "generic";
      if (printConfig !== "generic") {
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--print-config=")) {
      printConfig = arg.slice("--print-config=".length) || "generic";
      continue;
    }
    passthrough.push(arg);
  }

  return { endpoint, passthrough, printConfig };
}

function validateEndpoint(endpoint) {
  const parsed = new URL(endpoint);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported endpoint protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

async function main() {
  const { endpoint, passthrough, printConfig } = parseArgs(process.argv.slice(2));
  if (printConfig) {
    console.log(clientConfig(printConfig));
    return;
  }

  const remoteEndpoint = validateEndpoint(endpoint);
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
