import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CredentialStore, IsolatedOAuthProvider } from '../lib/oauth.js';
import { createSafeFetch } from '../lib/network.js';
import { createAuthenticatedFetch } from '../lib/auth-coordinator.js';

async function rotatingFixture(coordinated) {
  let origin, refreshes=0, invalidGrants=0, interactive=0, sseOpened=false, late;
  const stale=[], messages=[], errors=[];
  const reject401=res=>{res.writeHead(401,{'www-authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`});res.end('{}');};
  const server=createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url.startsWith('/.well-known/oauth-protected-resource'))return res.end(JSON.stringify({resource:origin+'/mcp',authorization_servers:[origin]}));
    if(req.url.startsWith('/.well-known/oauth-authorization-server'))return res.end(JSON.stringify({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',response_types_supported:['code'],code_challenge_methods_supported:['S256']}));
    let body='';for await(const chunk of req)body+=chunk;
    if(req.url==='/token'){
      refreshes++;const order=refreshes;const params=new URLSearchParams(body);
      assert.equal(params.get('grant_type'),'refresh_token');
      assert.equal(params.get('refresh_token'),'rotating-original');
      setTimeout(()=>{
        if(order>1){invalidGrants++;res.writeHead(400);res.end(JSON.stringify({error:'invalid_grant'}));}
        else {res.end(JSON.stringify({access_token:'access-new',refresh_token:'rotating-new',token_type:'Bearer'}));if(late)setTimeout(()=>reject401(late),30);}
      },30);return;
    }
    const message=body?JSON.parse(body):null;
    if(message?.method==='notifications/initialized'){res.writeHead(202);return res.end();}
    if(req.headers.authorization!=='Bearer access-new'){
      stale.push(res);if(message?.id===8)late=res;
      if(stale.length===3)for(const item of stale)if(item!==late)reject401(item);
      return;
    }
    if(req.method==='GET'){sseOpened=true;res.writeHead(200,{'content-type':'text/event-stream'});res.write(': fixture heartbeat\n\n');return;}
    res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{tools:[]}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  const home=await mkdtemp(join(tmpdir(),'refresh-race-'));const stop=new AbortController();
  const store=await new CredentialStore({endpoint:origin+'/mcp',issuer:origin,home}).initialize();
  const provider=await new IsolatedOAuthProvider({store,issuer:origin,timeoutMs:1000,onAuthorization:async()=>{interactive++;}}).initialize();
  await provider.saveClientInformation({client_id:'fixture-client',issuer:origin,token_endpoint_auth_method:'none'});
  await provider.saveTokens({access_token:'access-old',refresh_token:'rotating-original',token_type:'Bearer',issuer:origin});
  const raw=createSafeFetch({endpoint:origin+'/mcp',issuer:origin,env:{},timeoutMs:1000});
  const fetchFn=coordinated?createAuthenticatedFetch({provider,endpoint:origin+'/mcp',fetchFn:raw,signal:stop.signal}):raw;
  const transport=new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:fetchFn,...(coordinated?{}:{authProvider:provider})});
  transport.onmessage=message=>messages.push(message);transport.onerror=error=>errors.push(error);
  try{
    await transport.start();await transport.send({jsonrpc:'2.0',method:'notifications/initialized'});
    const outcomes=await Promise.allSettled([7,8].map(id=>transport.send({jsonrpc:'2.0',id,method:'tools/list'})));
    // GET runs independently of send(); allow its error/open handler to settle.
    await new Promise(resolve=>setTimeout(resolve,40));
    return {refreshes,invalidGrants,interactive,sseOpened,messages,outcomes,tokens:await provider.tokens(),errors:[...errors]};
  }finally{stop.abort();await transport.close();await fetchFn.close?.();await provider.close();await store.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(home,{recursive:true,force:true});}
}

test('negative control: raw SDK background GET plus POST duplicates rotating refresh and invalidates credentials', {timeout:5000},async()=>{
  const result=await rotatingFixture(false);
  assert.ok(result.refreshes>=2);assert.ok(result.invalidGrants>=1);
  assert.ok(result.interactive>=1 || result.outcomes.some(x=>x.status==='rejected'));
});

test('coordinated actual SDK GET/POST and delayed old-token 401 share one refresh without losing rotated credentials', {timeout:5000},async()=>{
  const result=await rotatingFixture(true);
  assert.equal(result.refreshes,1);assert.equal(result.invalidGrants,0);assert.equal(result.interactive,0);
  assert.equal(result.sseOpened,true);assert.deepEqual(result.outcomes.map(x=>x.status),['fulfilled','fulfilled']);
  assert.deepEqual(result.messages.map(x=>x.id).sort(),[7,8]);
  assert.equal(result.tokens.refresh_token,'rotating-new');assert.equal(result.errors.length,0);
});
