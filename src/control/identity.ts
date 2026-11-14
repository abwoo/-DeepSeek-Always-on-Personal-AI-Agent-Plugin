import * as oidc from 'openid-client';
import { GatewayError } from '../managed/store.js';
export interface IdentityTokens { issuer: string; subject: string; refreshToken?: string; }
export interface IdentityProvider {
  issuer: string;
  authorize(input: { state: string; nonce: string; verifier: string; redirectUri: string }): Promise<string>;
  exchange(input: { callback: URL; state: string; nonce: string; verifier: string; redirectUri: string }): Promise<IdentityTokens>;
  refresh(token: string, subject: string): Promise<IdentityTokens>;
  revoke(token: string): Promise<void>;
}
/** One configured Auth0 OIDC tenant. No password handling or DeepSeek-account assumptions. */
export async function auth0Identity(issuer: string, clientId: string, clientSecret: string): Promise<IdentityProvider> {
  const u = new URL(issuer);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw Error('OIDC issuer must be a trusted HTTPS origin ending in /');
  const config = await oidc.discovery(u, clientId, clientSecret, oidc.ClientSecretPost(clientSecret), {timeout:10});
  if (!config.serverMetadata().code_challenge_methods_supported?.includes('S256')) throw Error('OIDC tenant must advertise S256 PKCE');
  return oidcIdentity(config,issuer);
}
export function oidcIdentity(config:oidc.Configuration,issuer:string):IdentityProvider {
  oidc.enableNonRepudiationChecks(config);
  const extract = (tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers, expected?: string) => {
    const claims = tokens.claims();
    if (!claims?.sub || claims.iss !== issuer || (expected && claims.sub !== expected)) throw new GatewayError(401,'identity_subject_changed');
    return {issuer,subject:claims.sub,refreshToken:tokens.refresh_token};
  };
  return {
    issuer,
    authorize: async input => oidc.buildAuthorizationUrl(config, {redirect_uri:input.redirectUri,response_type:'code',scope:'openid profile offline_access',state:input.state,nonce:input.nonce,code_challenge:await oidc.calculatePKCECodeChallenge(input.verifier),code_challenge_method:'S256'}).href,
    exchange: async input => extract(await oidc.authorizationCodeGrant(config,input.callback,{expectedState:input.state,expectedNonce:input.nonce,pkceCodeVerifier:input.verifier,idTokenExpected:true},{redirect_uri:input.redirectUri})),
    refresh: async (token,subject) => {
      const tokens = await oidc.refreshTokenGrant(config,token);
      // A refresh response may omit ID token. Verify subject via the actual OIDC UserInfo endpoint.
      if(tokens.id_token) return {...extract(tokens,subject),refreshToken:tokens.refresh_token??token};
      const profile=await oidc.fetchUserInfo(config,tokens.access_token,subject);
      if(profile.sub!==subject)throw new GatewayError(401,'identity_subject_changed');
      return {issuer,subject,refreshToken:tokens.refresh_token??token};
    },
    revoke: async token => { await oidc.tokenRevocation(config,token,{token_type_hint:'refresh_token'}); },
  };
}
