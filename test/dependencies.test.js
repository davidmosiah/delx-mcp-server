import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { MockAgent, fetch } from 'undici';
const require = createRequire(import.meta.url);
const bodyParser = require('body-parser');
const proxyAddr = require('proxy-addr');
const qs = require('qs');

test('patched dependency versions and existing major constraints', () => {
  const expected = {'body-parser':'1.20.9','proxy-addr':'2.0.8',qs:'6.16.1',undici:'7.30.1'};
  for (const [name, version] of Object.entries(expected)) assert.equal(require(`${name}/package.json`).version,version);
  assert.equal(require('../package.json').engines.node, '>=20.18.1');
});

test('undici HTTP JSON contract uses MockAgent with real connections disabled', async () => {
  const dispatcher = new MockAgent();
  dispatcher.disableNetConnect();
  dispatcher.get('https://fixture.invalid').intercept({path:'/mcp',method:'POST'}).reply(200,{jsonrpc:'2.0',id:1,result:{tools:[]}},{headers:{'content-type':'application/json'}});
  try {
    const res=await fetch('https://fixture.invalid/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),headers:{'content-type':'application/json'},dispatcher});
    assert.equal(res.status,200);
    assert.deepEqual(await res.json(),{jsonrpc:'2.0',id:1,result:{tools:[]}});
    dispatcher.assertNoPendingInterceptors();
  } finally {await dispatcher.close();}
});

test('body-parser decodes a synthetic compressed request without listening', async () => {
  const bytes=gzipSync(Buffer.from('{"fixture":true}'));
  const req=Readable.from([bytes]);
  req.headers={'content-type':'application/json','content-encoding':'gzip','content-length':String(bytes.length)};
  await new Promise((resolve,reject)=>bodyParser.json()(req,{},err=>err?reject(err):resolve()));
  assert.deepEqual(req.body,{fixture:true});
});

test('proxy subnet and query-string behavior remains compatible', () => {
  const trust=proxyAddr.compile(['127.0.0.0/8']);
  assert.equal(trust('127.0.0.1'),true);
  assert.equal(trust('198.51.100.1'),false);
  assert.deepEqual(qs.parse('code=fixture&state=local'),{code:'fixture',state:'local'});
  assert.equal(qs.stringify({a:['one','two']},{arrayFormat:'comma'}),'a=one%2Ctwo');
});

test('bridge forwards endpoint and argv to an offline proxy fixture', async () => {
  const { mkdtemp, mkdir, copyFile, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const root = await mkdtemp(join(tmpdir(),'bridge-offline-'));
  try {
    await mkdir(join(root,'bin'));
    await mkdir(join(root,'node_modules/mcp-remote/dist'),{recursive:true});
    await copyFile(new URL('../bin/delx-mcp-server.js',import.meta.url),join(root,'bin/delx-mcp-server.js'));
    await writeFile(join(root,'package.json'),JSON.stringify({name:'bridge-fixture',version:'0.0.0',type:'module'}));
    await writeFile(join(root,'node_modules/mcp-remote/package.json'),JSON.stringify({name:'mcp-remote',version:'0.0.0',type:'module'}));
    await writeFile(join(root,'node_modules/mcp-remote/dist/proxy.js'),'console.log(JSON.stringify({args:process.argv.slice(2),endpoint:process.env.DELX_MCP_URL}));');
    const endpoint='https://fixture.invalid/mcp';
    const result=await promisify(execFile)(process.execPath,[join(root,'bin/delx-mcp-server.js'),'--url',endpoint,'--transport','http-only'],{env:{PATH:process.env.PATH,HOME:root},timeout:5000});
    assert.deepEqual(JSON.parse(result.stdout),{args:[endpoint,'--transport','http-only'],endpoint});
  } finally {await rm(root,{recursive:true,force:true});}
});
