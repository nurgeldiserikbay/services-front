import 'server-only';
import {verifyBackendAccountOtp} from './account-login-private-transport.mjs';
import {issueAccountWebSession} from './account-web-session.server';

function serviceKey():string{
 const key=process.env.SERVICES_WEB_ACCOUNT_LOGIN_BFF_KEY;
 if(!key||!/^[A-Za-z0-9+/]{43}=$/.test(key)||
  Buffer.from(key,'base64').length!==32||
  Buffer.from(key,'base64').toString('base64')!==key)
  throw new Error('Account login BFF unavailable');
 return key;
}

/**
 * This method is server-only and NOT mounted on a public route.
 * A future pre-auth challenge flow must authorize origin, CSRF, nonce,
 * trusted ingress proof and per-client budgets BEFORE calling it.
 * Never return the private backend bearer; only HttpOnly cookie instructions.
 */
export async function exchangeVerifiedAccountOtpForCookie(input:{
 challengeId:string;channel:'EMAIL'|'SMS';code:string;
}){
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF!=='enabled')
  throw new Error('Account login BFF unavailable');
 const key=serviceKey();
 const result=await verifyBackendAccountOtp({
  baseUrl:process.env.SERVICES_API_BASE_URL??'',
  production:process.env.NODE_ENV==='production',
  serviceKey:key,challengeId:input.challengeId,
  channel:input.channel,code:input.code,
 });
 const cookie=issueAccountWebSession(result.sessionToken,result.expiresInSeconds);
 return {setCookie:{name:cookie.name,value:cookie.value,options:cookie.options},
  csrf:cookie.csrf,expiresAt:cookie.expiresAt};
}
