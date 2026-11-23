import 'server-only';
import {initiateBackendAccountOtp}
 from './account-otp-init-private-transport.mjs';

/**
 * PRIVATE unmounted integration seam. The pre-auth web bootstrap must
 * authorize origin, CSRF and network identity before invoking this method.
 * Merely setting the flags is not permission to expose a browser route.
 */
export async function initiateApprovedAccountOtp(input:{
 channel:'EMAIL'|'SMS';contact:string;purpose:'SIGN_IN'|'SIGN_UP';
 locale:'kk'|'ru';
 /** Trusted ingress-derived short-lived proof, not a browser header. */
 trustedNetworkProof:string;
}):Promise<{challengeId:string;expiresInSeconds:300}>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_OTP_INIT_BFF!=='enabled')
  throw new Error('Account OTP initiation unavailable');
 const key=process.env.SERVICES_WEB_ACCOUNT_LOGIN_BFF_KEY??'';
 return initiateBackendAccountOtp({
  baseUrl:process.env.SERVICES_API_BASE_URL??'',
  production:process.env.NODE_ENV==='production',serviceKey:key,
  networkProof:input.trustedNetworkProof,
  channel:input.channel,contact:input.contact,
  purpose:input.purpose,locale:input.locale,
 });
}
