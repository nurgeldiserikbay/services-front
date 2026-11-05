import 'server-only';
import {sealAccountWebSession,openAccountWebSession,verifyAccountCsrf,
  verifyAccountMutationOrigin} from './account-web-session-core.mjs';

export const ACCOUNT_WEB_COOKIE='__Host-services_account_web';
function sessionKey():Buffer{
  const raw=process.env.SERVICES_WEB_ACCOUNT_SESSION_KEY;
  if(!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))
    throw new Error('Account web session key unavailable');
  const key=Buffer.from(raw,'base64');
  if(key.length!==32||key.toString('base64')!==raw)
    throw new Error('Account web session key unavailable');
  return key;
}
/**
 * Trusted server login handler only. Do not expose an endpoint until a real
 * verified account login flow issues the backend account bearer and its TTL.
 * This cookie is distinct from guest OTP capabilities.
 */
export function issueAccountWebSession(verifiedAccountBearer:string,ttlSeconds:number){
  const issued=sealAccountWebSession(sessionKey(),verifiedAccountBearer,ttlSeconds);
  return {
    name:ACCOUNT_WEB_COOKIE,value:issued.cookie,
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:ttlSeconds},
    csrf:issued.csrf,expiresAt:issued.expiresAt,
  };
}
/** Read-only requests must also rely on backend session revocation and ACL. */
export function readAccountWebSession(cookieValue:string|undefined){
  return openAccountWebSession(sessionKey(),cookieValue);
}
export function authenticateAccountWebMutation(input:{
  cookieValue:string|undefined;csrfToken:string|undefined;
  origin:string|null;fetchSite:string|null;
}):{accountBearer:string}|null{
  const expected=process.env.SERVICES_WEB_ORIGIN;
  if(!expected||(process.env.NODE_ENV==='production'&&!expected.startsWith('https://'))||
     !verifyAccountMutationOrigin(input.origin,expected,input.fetchSite))return null;
  const session=openAccountWebSession(sessionKey(),input.cookieValue);
  if(!session||!verifyAccountCsrf(session,input.csrfToken))return null;
  return {accountBearer:session.token};
}
export function clearAccountWebSession(){
  return {name:ACCOUNT_WEB_COOKIE,value:'',
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}
