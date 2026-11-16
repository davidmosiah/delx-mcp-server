import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticatedFetch } from '../lib/auth-coordinator.js';
import { createSafeFetch } from '../lib/network.js';

for(const foreign of [false,true])test(`OAuth header defaults preserve gateway compatibility and SDK precedence; foreign issuer=${foreign}`,async()=>{
  const endpoint='https://resource.invalid/mcp',issuer=foreign?'https://issuer.invalid':'https://resource.invalid';
  const configured={'x-api-key':'fixture-gateway','authorization':'Fixture configured','content-type':'application/fixture'};
  let tokens={access_token:'old',refresh_token:'fixture-refresh',token_type:'Bearer',issuer},tokenRequests=0,metadataRequests=0;
  const provider={
    redirectUrl:'http://127.0.0.1:1/callback',clientMetadata:{},
    clientInformation:async()=>({client_id:'fixture-client',issuer}),tokens:async()=>tokens,saveTokens:async value=>{tokens=value;},
    addClientAuthentication:async headers=>headers.set('authorization','Basic fixture-sdk'),
    state:async()=>{throw new Error('Unexpected interactive flow');},
  };
  const json=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  const raw=createSafeFetch({endpoint,issuer,headers:configured,env:{},fetchImpl:async(url,init)=>{
    const headers=new Headers(init.headers),path=url.pathname;
    if(path==='/mcp'){
      assert.notEqual(headers.get('authorization'),'Basic fixture-sdk');
      return headers.get('authorization')==='Bearer old'?new Response('',{status:401}):json({ok:true});
    }
    const isForeign=url.origin!==new URL(endpoint).origin;
    assert.equal(headers.get('x-api-key'),isForeign?null:'fixture-gateway');
    if(path==='/token'){
      tokenRequests++;assert.equal(headers.get('authorization'),'Basic fixture-sdk');
      assert.equal(headers.get('content-type'),'application/x-www-form-urlencoded');
      return json({access_token:'new',refresh_token:'rotated',token_type:'Bearer'});
    }
    metadataRequests++;assert.equal(headers.get('authorization'),isForeign?null:'Fixture configured');
    if(path.includes('oauth-protected-resource'))return json({resource:endpoint,authorization_servers:[issuer]});
    return json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',response_types_supported:['code']});
  }});
  const fetch=createAuthenticatedFetch({provider,endpoint,fetchFn:raw,headers:configured});
  const response=await fetch(endpoint);assert.equal(response.status,200);await response.body.cancel();await fetch.close();
  assert.equal(tokenRequests,1);assert.ok(metadataRequests>=2);
});
