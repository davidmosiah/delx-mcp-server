import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { parseAdapterOptions } from '../lib/options.js';
const bin=fileURLToPath(new URL('../bin/delx-mcp-server.js',import.meta.url));
const exec=promisify(execFile);

test('header substitutions are explicit, missing/invalid values never echoed',()=>{
  assert.equal(parseAdapterOptions('https://fixture.invalid',['--header','Authorization: Bearer ${FIXTURE}'],{FIXTURE:'synthetic'}).headers.Authorization,'Bearer synthetic');
  for(const value of ['fake-secret\u0000','fake-secret\u2603','fake-secret\n'])assert.throws(()=>parseAdapterOptions('https://fixture.invalid',['--header','Authorization: ${FIXTURE}'],{FIXTURE:value}),error=>!error.message.includes('fake-secret'));
  assert.throws(()=>parseAdapterOptions('https://fixture.invalid',['--header','X-Key: ${MISSING}'],{}),/unset/);
  assert.throws(()=>parseAdapterOptions('https://fixture.invalid',['--unknown=fake-secret']),error=>!error.message.includes('fake-secret'));
});

test('diagnostics use bounded fetch and redact query, no redirect reaches foreign fixture',async()=>{
  let foreignHits=0;
  const foreign=createServer((req,res)=>{foreignHits++;res.end('{}');});await new Promise(resolve=>foreign.listen(0,'127.0.0.1',resolve));
  let redirect=false;
  const server=createServer(async(req,res)=>{
    if(redirect){res.writeHead(307,{location:`http://127.0.0.1:${foreign.address().port}/capture`});res.end();return;}
    res.setHeader('content-type','application/json');
    if(req.method==='GET')return res.end('{"status":"ok","version":"fixture"}');
    for await(const _ of req){}res.end('{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"fixture_tool"}]}}');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const home=await mkdtemp(join(tmpdir(),'adapter-diagnostic-'));const endpoint=`http://127.0.0.1:${server.address().port}/mcp?key=fake-secret`;
  const env={PATH:process.env.PATH,HOME:home};
  try{
    for(const flag of ['--doctor','--list-tools']){
      const r=await exec(process.execPath,[bin,flag,'--json','--url',endpoint],{env});assert.ok(JSON.parse(r.stdout));assert.ok(!r.stdout.includes('fake-secret'));assert.ok(!r.stderr.includes('fake-secret'));
    }
    redirect=true;
    await assert.rejects(exec(process.execPath,[bin,'--doctor','--url',endpoint],{env}),error=>!error.stderr.includes('fake-secret'));
    assert.equal(foreignHits,0);
  }finally{server.closeAllConnections();foreign.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>foreign.close(r))]);await rm(home,{recursive:true,force:true});}
});

test('SIGTERM exits active adapter and releases its new profile lock',async()=>{
  const server=createServer(async(req,res)=>{if(req.method!=='POST'){res.writeHead(405);res.end();return;}let body='';for await(const c of req)body+=c;const m=JSON.parse(body);res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:[]}}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const home=await mkdtemp(join(tmpdir(),'adapter-signal-'));
  const child=spawn(process.execPath,[bin,'--url',`http://127.0.0.1:${server.address().port}`,'--transport','http-only'],{env:{PATH:process.env.PATH,HOME:home},stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.on('data',c=>stderr+=c);const closed=once(child,'close');
  try{
    child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');await once(child.stdout,'data');child.kill('SIGTERM');
    const timeout=setTimeout(()=>child.kill('SIGKILL'),3000);await closed;clearTimeout(timeout);
    const profiles=await readdir(join(home,'.delx-mcp-bridge-v1'));
    for(const profile of profiles)assert.ok(!(await readdir(join(home,'.delx-mcp-bridge-v1',profile))).includes('active.lock'),stderr);
  }finally{child.kill('SIGKILL');server.closeAllConnections();await new Promise(r=>server.close(r));await rm(home,{recursive:true,force:true});}
});
