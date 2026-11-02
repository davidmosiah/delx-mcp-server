import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, lstat, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { createSafeFetch, validateEndpoint } from '../lib/network.js';
import { CredentialStore, IsolatedOAuthProvider } from '../lib/oauth.js';

const target='https://resource.invalid/mcp', issuer='https://issuer.invalid/';
const fixtureHeaders={'x-resource-token':'synthetic-resource-token'};

function callback(url, method='GET') {
  return new Promise((resolve,reject)=>{
    const req=request(url,{method,agent:false},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));
    });
    req.setTimeout(2000,()=>req.destroy(new Error('fixture callback timeout')));req.on('error',reject);req.end();
  });
}

async function temporaryHome(fn) {
  const home=await mkdtemp(join(tmpdir(),'bridge-review-home-'));
  try{return await fn(home);}finally{await rm(home,{recursive:true,force:true});}
}

test('endpoint policy rejects unsupported/userinfo URLs but permits explicitly trusted HTTP',()=>{
  for(const value of ['file:///tmp/fixture','https://user:fake@resource.invalid/mcp','https://resource.invalid/mcp#fragment','http://remote.invalid/mcp'])assert.throws(()=>validateEndpoint(value));
  assert.equal(validateEndpoint('http://127.0.0.1:3000/mcp').protocol,'http:');
  assert.equal(validateEndpoint('http://remote.invalid/mcp',true).protocol,'http:');
});

test('every nonempty proxy spelling fails closed without printing proxy credentials',()=>{
  for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']){
    assert.throws(()=>createSafeFetch({endpoint:target,issuer,env:{[key]:'http://user:fake-secret@proxy.invalid',NO_PROXY:'*'}}),error=>!error.message.includes('fake-secret')&&/proxies/.test(error.message));
  }
  assert.equal(typeof createSafeFetch({endpoint:target,issuer,env:{HTTPS_PROXY:' ',NO_PROXY:'*'}}),'function');
});

test('redirect refusal never replays credential-bearing request; arbitrary origin rejected before fetch',async()=>{
  const calls=[];
  const safe=createSafeFetch({endpoint:target,issuer,env:{},headers:fixtureHeaders,fetchImpl:async(url,init)=>{calls.push({url:String(url),init});return new Response('',{status:307,headers:{location:'https://untrusted.invalid/capture'}});}});
  await assert.rejects(safe(target,{method:'POST',headers:fixtureHeaders,body:'synthetic-client-secret'}),/Redirect refused/);
  assert.equal(calls.length,1);assert.equal(calls[0].init.redirect,'manual');
  await assert.rejects(safe('https://untrusted.invalid/capture',{method:'POST',body:'synthetic-client-secret'}),/Untrusted/);
  assert.equal(calls.length,1);
});

test('resource custom header is removed at explicit issuer while issuer OAuth body survives',async()=>{
  const calls=[];
  const safe=createSafeFetch({endpoint:target,issuer,env:{},headers:fixtureHeaders,fetchImpl:async(url,init)=>{calls.push({url:String(url),init});return new Response('{}',{headers:{'content-type':'application/json'}});}});
  await (await safe(target,{headers:fixtureHeaders})).text();
  await (await safe(issuer+'token',{method:'POST',headers:fixtureHeaders,body:new URLSearchParams({grant_type:'refresh_token',refresh_token:'synthetic-refresh'})})).text();
  assert.equal(calls[0].init.headers.get('x-resource-token'),'synthetic-resource-token');
  assert.equal(calls[1].init.headers.has('x-resource-token'),false);
  assert.equal(calls[1].init.body.get('refresh_token'),'synthetic-refresh');
});

test('bounded fetch rejects oversized body and SSE event; separate events remain accepted',async()=>{
  const plain=createSafeFetch({endpoint:target,env:{},maxBytes:8,fetchImpl:async()=>new Response('123456789')});
  await assert.rejects((await plain(target)).text(),/exceeds/);
  const sse=createSafeFetch({endpoint:target,env:{},maxEventBytes:16,fetchImpl:async()=>new Response('data: '+ 'x'.repeat(30)+'\n\n',{headers:{'content-type':'text/event-stream'}})});
  await assert.rejects((await sse(target)).text(),/SSE event exceeds/);
  const events='data: x\n\ndata: y\n\n';
  const good=createSafeFetch({endpoint:target,env:{},maxEventBytes:12,fetchImpl:async()=>new Response(events,{headers:{'content-type':'text/event-stream'}})});
  assert.equal(await (await good(target)).text(),events);
  await assert.rejects(good(target,{body:Buffer.from('fixture')}),/Unsupported request body/);
});

test('cache key isolation, exclusive active profile, owner modes and atomic persistence',async()=>temporaryHome(async home=>{
  const first=await new CredentialStore({endpoint:target,issuer,profile:'a',home}).initialize();
  const second=await new CredentialStore({endpoint:target,issuer,profile:'b',home}).initialize();
  try{
    assert.notEqual(first.directory,second.directory);
    assert.notEqual(first.identity,new CredentialStore({endpoint:target,issuer:'https://other.invalid/',profile:'a',home}).identity);
    assert.notEqual(first.identity,new CredentialStore({endpoint:target,issuer,profile:'a',clientId:'other-client',home}).identity);
    await assert.rejects(new CredentialStore({endpoint:target,issuer,profile:'a',home}).initialize(),/already active/);
    first.value={tokens:{access_token:'synthetic',refresh_token:'synthetic-refresh',issuer}};await first.save();
    assert.equal((await lstat(first.directory)).mode&0o077,0);
    assert.equal((await lstat(join(first.directory,'credentials.json'))).mode&0o077,0);
    assert.deepEqual(JSON.parse(await readFile(join(first.directory,'credentials.json'),'utf8')),first.value);
    assert.deepEqual(second.value,{});
  }finally{await first.close();await second.close();}
  const reopened=await new CredentialStore({endpoint:target,issuer,profile:'a',home}).initialize();
  try{assert.equal(reopened.value.tokens.access_token,'synthetic');}finally{await reopened.close();}
}));

test('credential symlinks and broad permissions fail closed with lock released',async()=>temporaryHome(async home=>{
  let store=await new CredentialStore({endpoint:target,issuer,home}).initialize();const path=join(store.directory,'credentials.json');await store.close();
  const fixture=join(home,'synthetic-private');await writeFile(fixture,'{"tokens":{"access_token":"fake"}}',{mode:0o600});await symlink(fixture,path);
  await assert.rejects(new CredentialStore({endpoint:target,issuer,home}).initialize(),/Unable to load/);await rm(path);
  await writeFile(path,'{}',{mode:0o600});await chmod(path,0o644);
  await assert.rejects(new CredentialStore({endpoint:target,issuer,home}).initialize(),/Unable to load/);
  await chmod(path,0o600);store=await new CredentialStore({endpoint:target,issuer,home}).initialize();await store.close();
}));

test('loopback OAuth callback enforces state, path, method, single use and PKCE storage',async()=>temporaryHome(async home=>{
  const store=await new CredentialStore({endpoint:target,issuer,home}).initialize();
  const authorization=[];const provider=new IsolatedOAuthProvider({store,issuer,onAuthorization:async url=>authorization.push(url)});
  try{
    await provider.initialize();assert.equal(new URL(provider.redirectUrl).hostname,'127.0.0.1');
    await assert.rejects(provider.codeVerifier(),/No active/);const state=await provider.state();await provider.saveCodeVerifier('synthetic-pkce');assert.equal(await provider.codeVerifier(),'synthetic-pkce');
    await provider.redirectToAuthorization(new URL(issuer+'authorize?state='+state));
    assert.equal(authorization.length,1);
    assert.equal((await callback(provider.redirectUrl+'?state=wrong&code=synthetic')).status,400);
    assert.equal((await callback(provider.redirectUrl+'?state='+state+'&code=synthetic','POST')).status,400);
    assert.equal((await callback(provider.redirectUrl.replace('/oauth/callback','/other')+'?state='+state+'&code=synthetic')).status,400);
    const response=await callback(provider.redirectUrl+'?state='+state+'&code=synthetic-code');assert.equal(response.status,200);assert.equal(response.headers['cache-control'],'no-store');assert.equal(await provider.waitForCode(),'synthetic-code');
    assert.equal((await callback(provider.redirectUrl+'?state='+state+'&code=replay')).status,400);
    provider.completeAuthorization(provider.authorizationFlow());
    await provider.state();await provider.saveCodeVerifier('synthetic-new-flow');
    await assert.rejects(provider.redirectToAuthorization(new URL('https://untrusted.invalid/authorize')),/trusted issuer/);
    await assert.rejects(provider.saveTokens({access_token:'synthetic'}),/issuer binding/);
    await provider.saveTokens({access_token:'synthetic',refresh_token:'synthetic-refresh',issuer});assert.equal((await provider.tokens()).refresh_token,'synthetic-refresh');
    await provider.invalidateCredentials('tokens');assert.equal(await provider.tokens(),undefined);
  }finally{await provider.close();await store.close();}
}));


test('concurrent authorization cannot overwrite active state/PKCE or be cleared by refresh saves',async()=>temporaryHome(async home=>{
  const store=await new CredentialStore({endpoint:target,issuer,home}).initialize();
  const provider=await new IsolatedOAuthProvider({store,issuer,onAuthorization:async()=>{}}).initialize();
  try{
    const state=await provider.state();const generation=provider.authorizationFlow();
    await provider.saveCodeVerifier('verifier-first');
    await assert.rejects(provider.state());
    await assert.rejects(provider.saveCodeVerifier('verifier-second'));
    assert.equal(await provider.codeVerifier(),'verifier-first');
    await provider.saveTokens({access_token:'synthetic-refreshed',issuer});
    await provider.invalidateCredentials('tokens');
    await assert.rejects(provider.state());
    assert.equal(provider.authorizationFlow(),generation);
    assert.equal(await provider.codeVerifier(),'verifier-first');
    await provider.redirectToAuthorization(new URL(issuer+'authorize?state='+state));
    assert.equal((await callback(provider.redirectUrl+'?state='+state+'&code=fixture-code')).status,200);
    assert.equal(await provider.waitForCode(),'fixture-code');
    assert.throws(()=>provider.completeAuthorization('wrong-generation'),/completion is invalid/);
    await assert.rejects(provider.state());
    await provider.completeAuthorization(generation);
    const next=await provider.state();assert.notEqual(next,state);
    assert.notEqual(provider.authorizationFlow(),generation);
    await provider.saveCodeVerifier('verifier-next');
    await provider.invalidateCredentials('verifier');
    await provider.state();
  }finally{await provider.close();await store.close();}
}));

test('authorization timeout cancels active flow without permitting stale completion to clear a new flow',async()=>temporaryHome(async home=>{
  const store=await new CredentialStore({endpoint:target,issuer,home}).initialize();
  const provider=await new IsolatedOAuthProvider({store,issuer,timeoutMs:25,onAuthorization:async()=>{}}).initialize();
  try{
    const state=await provider.state();const generation=provider.authorizationFlow();
    await provider.saveCodeVerifier('verifier-expiring');
    await provider.redirectToAuthorization(new URL(issuer+'authorize?state='+state));
    await assert.rejects(provider.waitForCode(),/timed out/);
    await assert.rejects(provider.codeVerifier());
    await provider.state();const next=provider.authorizationFlow();assert.notEqual(next,generation);
    assert.throws(()=>provider.completeAuthorization(generation),/completion is invalid/);
    assert.equal(provider.authorizationFlow(),next);
    await assert.rejects(provider.state());
  }finally{await provider.close();await store.close();}
}));

test('client registration binding cannot be overwritten before or during authorization',async()=>temporaryHome(async home=>{
  const store=await new CredentialStore({endpoint:target,issuer,home}).initialize();
  const provider=await new IsolatedOAuthProvider({store,issuer,onAuthorization:async()=>{}}).initialize();
  const clientA={client_id:'synthetic-client-a',issuer,redirect_uris:[provider.redirectUrl],token_endpoint_auth_method:'none'};
  const clientB={...clientA,client_id:'synthetic-client-b'};
  try{
    const results=await Promise.allSettled([provider.saveClientInformation(clientA),provider.saveClientInformation(clientB)]);
    assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);
    assert.equal((await provider.clientInformation()).client_id,clientA.client_id);
    await provider.saveClientInformation({...clientA});
    const state=await provider.state();const generation=provider.authorizationFlow();await provider.saveCodeVerifier('client-bound-verifier');
    await assert.rejects(provider.saveClientInformation(clientB));
    assert.equal((await provider.clientInformation()).client_id,clientA.client_id);
    await provider.redirectToAuthorization(new URL(issuer+'authorize?state='+state));
    const rejected=assert.rejects(provider.waitForCode(),/cancelled/);
    await provider.invalidateCredentials('client');
    await rejected;
    assert.equal(await provider.clientInformation(),undefined);
    assert.throws(()=>provider.completeAuthorization(generation));
    await provider.saveClientInformation(clientB);
    assert.equal((await provider.clientInformation()).client_id,clientB.client_id);
  }finally{await provider.close();await store.close();}
}));
