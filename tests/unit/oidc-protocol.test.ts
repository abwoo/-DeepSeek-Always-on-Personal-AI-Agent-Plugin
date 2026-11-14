import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as oidc from 'openid-client';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {oidcIdentity} from '../../src/control/identity.js';

test('OIDC library validates signed issuer/audience/nonce/state and S256 PKCE (local signed protocol fixture, not live Auth0)',async()=>{
  const issuer='https://oidc-fixture.test/',clientId='always-on-fixture',redirect='https://service.test/account/v1/callback';
  const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';
  let nonce='expected-nonce',audience=clientId,seenVerifier='';
  const config=new oidc.Configuration({issuer,authorization_endpoint:issuer+'authorize',token_endpoint:issuer+'token',jwks_uri:issuer+'jwks',userinfo_endpoint:issuer+'userinfo',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256']},clientId,'server-only-client-secret');
  config[oidc.customFetch]=async(input,init)=>{
    const url=String(input);if(url===issuer+'jwks')return Response.json({keys:[jwk]});
    if(url===issuer+'token'){
      seenVerifier=new URLSearchParams(String(init?.body)).get('code_verifier')??'';
      const jwt=await new SignJWT({nonce}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience(audience).setSubject('fixture-subject').setIssuedAt().setExpirationTime('5m').sign(privateKey);
      return Response.json({access_token:'fixture-access',token_type:'Bearer',expires_in:300,id_token:jwt,refresh_token:'fixture-rotation'});
    }
    throw Error('Unexpected fixture endpoint');
  };
  const provider=oidcIdentity(config,issuer),input={state:'expected-state',nonce,verifier:'v'.repeat(43),redirectUri:redirect};
  const auth=new URL(await provider.authorize(input));assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.notEqual(auth.searchParams.get('code_challenge'),input.verifier);
  const callback=new URL(redirect+'?code=fixture-code&state='+input.state);
  assert.equal((await provider.exchange({...input,callback})).subject,'fixture-subject');assert.equal(seenVerifier,input.verifier);
  await assert.rejects(()=>provider.exchange({...input,callback:new URL(redirect+'?code=x&state=foreign')}));
  nonce='foreign-nonce';await assert.rejects(()=>provider.exchange({...input,callback}));
  nonce=input.nonce;audience='another-client';await assert.rejects(()=>provider.exchange({...input,callback}));
});
