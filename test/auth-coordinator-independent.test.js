import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticatedFetch } from '../lib/auth-coordinator.js';

const endpoint = 'https://fixture.invalid/mcp';
function fixture({ onRefresh, onResource } = {}) {
  let tokens = { access_token: 'old', refresh_token: 'refresh-0', token_type: 'Bearer', issuer: 'https://fixture.invalid' };
  let refreshes = 0;
  const requests = [];
  const provider = {
    redirectUrl: 'http://127.0.0.1:1/oauth/callback',
    clientMetadata: {},
    clientInformation: async () => ({ client_id: 'fixture-client', issuer: 'https://fixture.invalid' }),
    tokens: async () => tokens,
    saveTokens: async value => { tokens = value; },
    state: async () => { throw new Error('Fixture refuses interactive authorization'); },
    invalidateCredentials: async scope => { if (scope === 'tokens' || scope === 'all') tokens = undefined; },
  };
  const json = body => new Response(JSON.stringify(body), {headers:{'content-type':'application/json'}});
  const fetchFn = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.includes('oauth-protected-resource')) return json({resource:endpoint,authorization_servers:['https://fixture.invalid']});
    if (path.includes('oauth-authorization-server')) return json({issuer:'https://fixture.invalid',authorization_endpoint:'https://fixture.invalid/authorize',token_endpoint:'https://fixture.invalid/token',response_types_supported:['code']});
    if (path === '/token') {
      refreshes++;
      const number = refreshes;
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('grant_type'),'refresh_token');
      await onRefresh?.(number, body, init);
      return json({access_token:`new-${number}`,refresh_token:`refresh-${number}`,token_type:'Bearer'});
    }
    assert.equal(path,'/mcp');
    const authorization = new Headers(init.headers).get('authorization');
    requests.push({authorization, method:init.method});
    if (onResource) return onResource(authorization, init, requests.length);
    if (authorization === 'Bearer old') return new Response('',{status:401});
    return json({ok:true});
  };
  return {provider,fetchFn,requests,get refreshes(){return refreshes;},get tokens(){return tokens;}};
}
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('independent: cancelled waiter cannot cancel shared rotating refresh; late old rejection reuses new generation',async()=>{
  const started=gate(),release=gate(),late=gate();
  let oldRequests=0;
  const f=fixture({onRefresh:async(n,body)=>{assert.equal(body.get('refresh_token'),'refresh-0');started.resolve();await release.promise;},onResource:async authorization=>{
    if(authorization==='Bearer old') {if(++oldRequests===3) await late.promise;return new Response('',{status:401});}
    return new Response('{}');
  }});
  const fetch=createAuthenticatedFetch({...f,endpoint});
  const cancel=new AbortController();
  const first=fetch(endpoint,{signal:cancel.signal});
  const firstRejected=assert.rejects(first,/cancelled/);
  await started.promise;
  const second=fetch(endpoint);
  const third=fetch(endpoint);
  await new Promise(resolve=>setImmediate(resolve));
  cancel.abort();await firstRejected;
  release.resolve();assert.equal((await second).status,200);
  late.resolve();assert.equal((await third).status,200);
  await fetch.close();assert.equal(f.refreshes,1);assert.equal(f.tokens.refresh_token,'refresh-1');
});

test('independent: failed flight is cleared, later call can refresh without stale invalidation',async()=>{
  const f=fixture({onRefresh:async n=>{if(n===1)throw new Error('fixture network failure');}});
  const fetch=createAuthenticatedFetch({...f,endpoint});
  await assert.rejects(fetch(endpoint),/Fixture refuses interactive/);
  assert.equal((await fetch(endpoint)).status,200);
  assert.equal(f.refreshes,2);assert.equal(f.tokens.access_token,'new-2');await fetch.close();
});

test('independent: distinct scope challenges serialize instead of coalescing rotating tokens',async()=>{
  const started=gate(),release=gate();let active=0,maxActive=0;
  const f=fixture({onRefresh:async(n,body)=>{active++;maxActive=Math.max(maxActive,active);assert.equal(body.get('refresh_token'),`refresh-${n-1}`);if(n===1){started.resolve();await release.promise;}active--;},onResource:(authorization,init)=>{
    if(authorization==='Bearer old')return new Response('',{status:403,headers:{'www-authenticate':`Bearer error="insufficient_scope", scope="${new Headers(init.headers).get('x-scope')}"`}});
    return new Response('{}');
  }});
  const fetch=createAuthenticatedFetch({...f,endpoint});
  const first=fetch(endpoint,{headers:{'x-scope':'read'}});await started.promise;
  const second=fetch(endpoint,{headers:{'x-scope':'write'}});
  await new Promise(resolve=>setImmediate(resolve));release.resolve();
  assert.deepEqual((await Promise.all([first,second])).map(r=>r.status),[200,200]);
  assert.equal(f.refreshes,2);assert.equal(maxActive,1);assert.equal(f.tokens.refresh_token,'refresh-2');await fetch.close();
});

test('independent: explicit authorization and ambiguous failures never trigger OAuth/replay',async()=>{
  for(const status of [401,403,500]){
    const f=fixture({onResource:()=>new Response('',{status})});
    const fetch=createAuthenticatedFetch({...f,endpoint});
    assert.equal((await fetch(endpoint,{headers:{authorization:'Bearer operator'}})).status,status);
    assert.equal(f.refreshes,0);assert.equal(f.requests.length,1);await fetch.close();
  }
  const f=fixture({onResource:()=>{throw new Error('fixture network error');}});
  const fetch=createAuthenticatedFetch({...f,endpoint});await assert.rejects(fetch(endpoint),/fixture network/);
  assert.equal(f.refreshes,0);assert.equal(f.requests.length,1);await fetch.close();
});

test('independent: adapter-wide abort settles active flight before close; credentials are not saved afterward',async()=>{
  const started=gate();
  const stop=new AbortController();
  const f=fixture({onRefresh:async(_n,_body,init)=>{
    started.resolve();
    await new Promise((_resolve,reject)=>{
      const cancel=()=>reject(new Error('fixture request aborted'));
      if(init.signal.aborted)cancel();else init.signal.addEventListener('abort',cancel,{once:true});
    });
  }});
  const fetch=createAuthenticatedFetch({...f,endpoint,signal:stop.signal});
  const pending=fetch(endpoint);const rejected=assert.rejects(pending,/cancelled|Fixture refuses interactive/);
  await started.promise;stop.abort();await rejected;await fetch.close();
  assert.equal(f.tokens.access_token,'old');assert.equal(f.refreshes,1);
  await assert.rejects(fetch(endpoint),/cancelled/);assert.equal(f.refreshes,1);
});

test('independent: generation snapshot cannot skip refresh when awaited tokens already belong to new generation',async()=>{
  const blocked=gate(),release=gate();
  const f=fixture({onResource:(authorization,init)=>{
    const first=new Headers(init.headers).get('x-request')==='first';
    if(authorization==='Bearer old' || first && authorization==='Bearer new-1')return new Response('',{status:401});
    return new Response('{}');
  }});
  const readTokens=f.provider.tokens;let calls=0;
  f.provider.tokens=async()=>{if(++calls===1){blocked.resolve();await release.promise;}return readTokens();};
  const fetch=createAuthenticatedFetch({...f,endpoint});
  const first=fetch(endpoint,{headers:{'x-request':'first'}});await blocked.promise;
  assert.equal((await fetch(endpoint,{headers:{'x-request':'second'}})).status,200);
  release.resolve();assert.equal((await first).status,200);
  assert.equal(f.refreshes,2);assert.equal(f.tokens.access_token,'new-2');await fetch.close();
});
