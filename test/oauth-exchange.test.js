import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { runAdapter } from '../lib/adapter.js';
import { parseAdapterOptions } from '../lib/options.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { CredentialStore, IsolatedOAuthProvider } from '../lib/oauth.js';
import { createSafeFetch } from '../lib/network.js';

test('real SDK OAuth discovery, dynamic registration, PKCE exchange and refresh use only local fixtures',async()=>{
  let origin,challenge,foreign=false;const grants=[];
  const server=createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/.well-known/oauth-protected-resource')) return res.end(JSON.stringify({resource:origin+'/mcp',authorization_servers:[foreign?'https://untrusted.invalid':origin]}));
    if(url.pathname.startsWith('/.well-known/oauth-authorization-server'))return res.end(JSON.stringify({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}));
    let body='';for await(const chunk of req)body+=chunk;
    if(url.pathname==='/mcp') {
      if(req.headers.authorization!=='Bearer fixture-access') {res.writeHead(401,{'www-authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`});return res.end('{}');}
      const m=JSON.parse(body);return res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:[]}}));
    }
    if(url.pathname==='/register') {const data=JSON.parse(body);return res.end(JSON.stringify({...data,client_id:'fixture-client'}));}
    if(url.pathname==='/token') {
      const params=new URLSearchParams(body);grants.push(params.get('grant_type'));
      assert.equal(params.get('client_id'),'fixture-client');
      if(params.get('grant_type')==='authorization_code')assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'),challenge);
      else assert.equal(params.get('refresh_token'),'fixture-refresh');
      return res.end(JSON.stringify({access_token:'fixture-access',token_type:'Bearer',refresh_token:'fixture-refresh',expires_in:60}));
    }
    res.writeHead(404);res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  const home=await mkdtemp(join(tmpdir(),'oauth-exchange-'));
  const store=await new CredentialStore({endpoint:origin+'/mcp',issuer:origin,home}).initialize();
  const provider=await new IsolatedOAuthProvider({store,issuer:origin,onAuthorization:async value=>{
    const url=new URL(value);challenge=url.searchParams.get('code_challenge');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    // Simulate concurrent transport/reconnect authorization while the first PKCE flow is pending.
    const verifier=await provider.codeVerifier(), flow=provider.authorizationFlow();
    await Promise.all([1,2].map(()=>assert.rejects(auth(provider,{serverUrl:origin+'/mcp',fetchFn}),/OAuth authorization already active/)));
    assert.equal(provider.authorizationFlow(),flow);assert.equal(await provider.codeVerifier(),verifier);
    const callback=new URL(provider.redirectUrl);callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','fixture-code');
    assert.equal((await fetch(callback)).status,200);
  }}).initialize();
  const fetchFn=createSafeFetch({endpoint:origin+'/mcp',issuer:origin,env:{}});
  try {
    assert.equal(await auth(provider,{serverUrl:origin+'/mcp',fetchFn}),'REDIRECT');
    const flow=provider.authorizationFlow();
    assert.equal(await auth(provider,{serverUrl:origin+'/mcp',authorizationCode:await provider.waitForCode(),fetchFn}),'AUTHORIZED');
    provider.completeAuthorization(flow);
    assert.equal((await provider.tokens()).issuer,origin);
    assert.equal((await provider.clientInformation()).issuer,origin);
    assert.equal(await auth(provider,{serverUrl:origin+'/mcp',fetchFn}),'AUTHORIZED');
    assert.deepEqual(grants,['authorization_code','refresh_token']);
    const saved=JSON.parse(await readFile(join(store.directory,'credentials.json'),'utf8'));assert.equal(saved.tokens.issuer,origin);
    foreign=true;
    await assert.rejects(auth(provider,{serverUrl:origin+'/mcp',fetchFn}));
    assert.deepEqual(grants,['authorization_code','refresh_token']);
    foreign=false;
    const input=new PassThrough(),output=new PassThrough();
    const running=runAdapter(parseAdapterOptions(origin+'/mcp',['--transport','http-only']),{input,output,env:{},home,onAuthorization:async value=>{
      const url=new URL(value);challenge=url.searchParams.get('code_challenge');
      const callback=new URL(url.searchParams.get('redirect_uri'));callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','fixture-code');
      assert.equal((await fetch(callback)).status,200);
    }});running.catch(()=>{});
    try {
      const response=once(output,'data');input.write('{"jsonrpc":"2.0","id":9,"method":"tools/list"}\n');
      const [bytes]=await response;assert.equal(JSON.parse(bytes).id,9);input.end();await running;
      assert.deepEqual(grants,['authorization_code','refresh_token','authorization_code']);
    } finally {input.destroy();await running.catch(()=>{});}
  } finally {await provider.close();await store.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(home,{recursive:true,force:true});}
});

test('concurrent SDK dynamic registrations cannot swap the client identity before state is acquired',async()=>{
  let origin, authorization, issued=0; const waiting=[];
  const server=createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url.startsWith('/.well-known/oauth-protected-resource'))return res.end(JSON.stringify({resource:origin+'/mcp',authorization_servers:[origin]}));
    if(req.url.startsWith('/.well-known/oauth-authorization-server'))return res.end(JSON.stringify({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}));
    let body='';for await(const chunk of req)body+=chunk;
    if(req.url==='/register'){
      waiting.push({res,metadata:JSON.parse(body)});
      if(waiting.length===2)for(const item of waiting)item.res.end(JSON.stringify({...item.metadata,client_id:'fixture-client-'+(++issued)}));
      return;
    }
    if(req.url==='/token'){
      const params=new URLSearchParams(body);
      assert.equal(params.get('client_id'),authorization.searchParams.get('client_id'));
      assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'));
      return res.end(JSON.stringify({access_token:'fixture-access',token_type:'Bearer'}));
    }
    res.writeHead(404);res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  const home=await mkdtemp(join(tmpdir(),'oauth-register-race-'));
  const store=await new CredentialStore({endpoint:origin+'/mcp',issuer:origin,home}).initialize();
  const provider=await new IsolatedOAuthProvider({store,issuer:origin,onAuthorization:async value=>{assert.equal(authorization,undefined);authorization=new URL(value);}}).initialize();
  const fetchFn=createSafeFetch({endpoint:origin+'/mcp',issuer:origin,env:{}});
  try{
    const outcomes=await Promise.allSettled([1,2].map(()=>auth(provider,{serverUrl:origin+'/mcp',fetchFn})));
    assert.equal(issued,2);
    assert.deepEqual(outcomes.filter(x=>x.status==='fulfilled').map(x=>x.value),['REDIRECT']);
    const failed=outcomes.filter(x=>x.status==='rejected');assert.equal(failed.length,1);
    assert.match(failed[0].reason.message,/OAuth client (identity replacement requires invalidation|registration cannot change during authorization)/);
    assert.equal((await provider.clientInformation()).client_id,authorization.searchParams.get('client_id'));
    const flow=provider.authorizationFlow(),callback=new URL(provider.redirectUrl);
    callback.searchParams.set('state',authorization.searchParams.get('state'));callback.searchParams.set('code','fixture-code');
    assert.equal((await fetch(callback)).status,200);
    assert.equal(await auth(provider,{serverUrl:origin+'/mcp',authorizationCode:await provider.waitForCode(),fetchFn}),'AUTHORIZED');
    provider.completeAuthorization(flow);
  }finally{await provider.close();await store.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(home,{recursive:true,force:true});}
});
