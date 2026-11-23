import 'server-only';
import {
 sealAccountOtpChallenge,openAccountOtpChallenge,verifyAccountOtpChallenge,
} from './account-otp-challenge-session-core.mjs';

export const ACCOUNT_OTP_CHALLENGE_COOKIE='__Host-services_account_otp_challenge';
function key():Buffer{
 const raw=process.env.SERVICES_WEB_ACCOUNT_OTP_CHALLENGE_KEY;
 if(!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))
  throw new Error('Account OTP challenge unavailable');
 const result=Buffer.from(raw,'base64');
 if(result.length!==32||result.toString('base64')!==raw)
  throw new Error('Account OTP challenge unavailable');
 return result;
}
export function requireAccountOtpChallengeKey():void{key();}

/** Server-only after an accepted challenge. Never expose the backend BFF key
 * or network attestation to the browser. This does NOT authenticate an account.
 */
export function issueAccountOtpChallenge(input:{
 challengeId:string;channel:'EMAIL'|'SMS';expiresInSeconds:number;
}){
 const sealed=sealAccountOtpChallenge(
  key(),input.challengeId,input.channel,input.expiresInSeconds);
 return {csrf:sealed.csrf,expiresAt:sealed.expiresAt,cookie:{
  name:ACCOUNT_OTP_CHALLENGE_COOKIE,value:sealed.cookie,
  options:{httpOnly:true as const,secure:true as const,
   sameSite:'strict' as const,path:'/' as const,
   maxAge:input.expiresInSeconds},
 }};
}
/** Verification must precede calling the one-use backend OTP verifier. */
export function authorizeAccountOtpChallenge(input:{
 cookieValue:unknown;challengeId:string;channel:'EMAIL'|'SMS';
 csrfToken:unknown;
}):void{
 const state=openAccountOtpChallenge(key(),input.cookieValue);
 if(!verifyAccountOtpChallenge(state,input.challengeId,input.channel,
   input.csrfToken))
  throw new Error('Account OTP challenge unavailable');
}
export function clearAccountOtpChallenge(){
 return {name:ACCOUNT_OTP_CHALLENGE_COOKIE,value:'',
  options:{httpOnly:true as const,secure:true as const,
   sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}
