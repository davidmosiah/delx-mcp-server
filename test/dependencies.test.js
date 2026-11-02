import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
test('dependencies are external and lock-visible, with fixed version floors', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  assert.equal(pkg.dependencies['@modelcontextprotocol/sdk'], '1.32.2');
  assert.equal(pkg.dependencies.zod, '4.6.7');
  assert.equal(require('undici/package.json').version, '7.30.1');
  assert.equal(pkg.dependencies['mcp-remote'], undefined);
  assert.equal(lock.packages['node_modules/mcp-remote'], undefined);
  assert.equal(pkg.engines.node, '>=20.18.1');
});
