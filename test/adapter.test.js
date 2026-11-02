import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAdapter } from '../lib/adapter.js';
import { parseAdapterOptions } from '../lib/options.js';

async function fixture(mode) {
  const requests=[];let events;
  const server=createServer(async(req,res)=>{
    if(req.method==='GET' && mode!=='http') {
      events=res;res.writeHead(200,{'content-type':'text/event-stream'});res.write('event: endpoint\ndata: /messages\n\n');return;
    }
    if(req.method!=='POST'){res.writeHead(405);res.end();return;}
    if(mode==='fallback' && req.url==='/mcp'){res.writeHead(405);res.end();return;}
    let body='';for await (const c of req)body+=c;
    const message=JSON.parse(body);requests.push(message);
    if(!Object.hasOwn(message,'id')) {res.writeHead(202);res.end();return;}
    const response={jsonrpc:'2.0',id:message.id,...(message.method==='initialize'?{result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}}:message.method==='tools/list'?{result:{tools:[]}}:{error:{code:-32601,message:'fixture unknown method'}})};
    if(mode!=='http'){events.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);res.writeHead(202);res.end();}
    else {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(response));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}/mcp`,requests,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
function reader(stream) {
  let pending='',queue=[],waiters=[];
  stream.on('data',chunk=>{pending+=chunk;let i;while((i=pending.indexOf('\n'))!==-1){const message=JSON.parse(pending.slice(0,i));pending=pending.slice(i+1);if(waiters.length)waiters.shift()(message);else queue.push(message);}});
  return ()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture output timeout')),5000);waiters.push(m=>{clearTimeout(timer);resolve(m);});});
}
for(const mode of ['http','sse','fallback']) test(`actual SDK transport ${mode}: stdio IDs, notifications and errors`,async()=>{
  const remote=await fixture(mode);const home=await mkdtemp(join(tmpdir(),'adapter-test-'));const input=new PassThrough(),output=new PassThrough();const next=reader(output);
  const options=parseAdapterOptions(remote.url,['--transport',mode==='http'?'http-only':mode==='sse'?'sse-only':'http-first']);
  const running=runAdapter(options,{input,output,env:{},home});running.catch(()=>{});
  const send=m=>input.write(JSON.stringify(m)+'\n');
  try {
    send({jsonrpc:'2.0',id:'init',method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'fake',version:'1'}}});
    assert.equal((await next()).id,'init');
    send({jsonrpc:'2.0',method:'notifications/initialized'});
    send({jsonrpc:'2.0',id:2,method:'tools/list'});
    assert.deepEqual(await next(),{jsonrpc:'2.0',id:2,result:{tools:[]}});
    send({jsonrpc:'2.0',id:3,method:'unknown'});
    assert.equal((await next()).error.code,-32601);
    input.end();await running;
    assert.ok(remote.requests.some(m=>m.method==='notifications/initialized'));
  } finally {input.destroy();await running.catch(()=>{});await remote.close();await rm(home,{recursive:true,force:true});}
});

test('SSE response after stdin EOF is drained before shutdown',async()=>{
  const remote=await fixture('sse');const home=await mkdtemp(join(tmpdir(),'adapter-eof-'));const input=new PassThrough(),output=new PassThrough();const next=reader(output);
  const running=runAdapter(parseAdapterOptions(remote.url,['--transport','sse-only']),{input,output,env:{},home});running.catch(()=>{});
  input.end(JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/list'})+'\n');
  try {assert.equal((await next()).id,7);await running;}
  finally {input.destroy();await running.catch(()=>{});await remote.close();await rm(home,{recursive:true,force:true});}
});

test('stdio pending requests are bounded even when peer never answers',async()=>{
  const server=createServer(async(req,res)=>{for await(const _ of req){}res.writeHead(202);res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const home=await mkdtemp(join(tmpdir(),'adapter-pending-'));const input=new PassThrough(),output=new PassThrough();
  const running=runAdapter(parseAdapterOptions(`http://127.0.0.1:${server.address().port}`,['--transport','http-only']),{input,output,env:{},home});
  try {for(let i=0;i<257;i++)input.write(JSON.stringify({jsonrpc:'2.0',id:i,method:'ping'})+'\n');input.end();await assert.rejects(running,/Pending request limit/);}
  finally {input.destroy();await running.catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(home,{recursive:true,force:true});}
});

test('remote flood before SSE startup cannot grow output queue or cause uncaught input error',async()=>{
  const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});for(let i=0;i<300;i++)res.write(`data: ${JSON.stringify({jsonrpc:'2.0',method:'fixture_notice',params:{data:'x'.repeat(4096)}})}\n\n`);res.write('event: endpoint\ndata: /messages\n\n');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const home=await mkdtemp(join(tmpdir(),'adapter-flood-'));const input=new PassThrough(),output=new PassThrough({highWaterMark:1});const signal=new AbortController();
  const running=runAdapter(parseAdapterOptions(`http://127.0.0.1:${server.address().port}`,['--transport','sse-only']),{input,output,env:{},home,signal:signal.signal});
  const timer=setTimeout(()=>signal.abort(),2000);
  try{await assert.rejects(running,/output|stream|aborted|cancelled/i);assert.equal(signal.signal.aborted,false,'output cap must stop before external timeout');}
  finally{clearTimeout(timer);input.destroy();await running.catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));await rm(home,{recursive:true,force:true});}
});

test('already-aborted run does not start transport and releases profile lock',async()=>{
  const { readdir }=await import('node:fs/promises');const home=await mkdtemp(join(tmpdir(),'adapter-preabort-'));const signal=new AbortController();signal.abort();
  const input=new PassThrough(),output=new PassThrough();
  try{
    await assert.rejects(runAdapter(parseAdapterOptions('http://127.0.0.1:1/mcp',[]),{input,output,env:{},home,signal:signal.signal}),/cancelled/);
    const profiles=await readdir(join(home,'.delx-mcp-bridge-v1'));
    for(const profile of profiles)assert.ok(!(await readdir(join(home,'.delx-mcp-bridge-v1',profile))).includes('active.lock'));
  }finally{input.destroy();await rm(home,{recursive:true,force:true});}
});

test('SSE frame bounds accept CR, LF and split CRLF without a total-session cap',async()=>{
  const {createSafeFetch}=await import('../lib/network.js');
  for(const delimiter of ['\n\n','\r\r','\r\n\r\n']){
    const payload=('data:a'+delimiter).repeat(10);
    const fetch=createSafeFetch({endpoint:'https://fixture.invalid',env:{},maxEventBytes:12,maxBytes:12,fetchImpl:async()=>new Response(new ReadableStream({start(c){for(const char of payload)c.enqueue(new TextEncoder().encode(char));c.close();}}),{headers:{'content-type':'text/event-stream'}})});
    assert.equal(await(await fetch('https://fixture.invalid')).text(),payload);
  }
});

test('real HTTP idle body is aborted without waiting indefinitely',async()=>{
  const {createSafeFetch}=await import('../lib/network.js');
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write('{');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  try{const response=await createSafeFetch({endpoint:url,env:{},timeoutMs:50})(url);await assert.rejects(response.text());}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
