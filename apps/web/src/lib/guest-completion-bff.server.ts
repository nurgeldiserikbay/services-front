import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {authorizeGuestRequestMutation} from './guest-request-access.server';
import {sealGuestCompletionSession,openGuestCompletionSession}
 from './guest-completion-session-core.mjs';
import {requestGuestCompletionOtp,verifyGuestCompletionOtp,
 confirmGuestCompletionBackend,GuestCompletionTransportUnavailable}
 from './guest-completion-backend.mjs';

export const COMPLETION_CHALLENGE_COOKIE='__Host-services_guest_completion_challenge';
export const COMPLETION_PROOF_COOKIE='__Host-services_guest_completion';
const PROOF=/^v1\.([0-9a-f]{64})\.([0-9]{10,13})\.([0-9a-f]{64})$/;

function key():Buffer{
 const value=process.env.SERVICES_WEB_GUEST_SESSION_KEY;
 if(!value||!/^[A-Za-z0-9+/]{43}=$/.test(value))
  throw new GuestCompletionTransportUnavailable();
 const decoded=Buffer.from(value,'base64');
 if(decoded.length!==32||decoded.toString('base64')!==value)
  throw new GuestCompletionTransportUnavailable();
 return decoded;
}
function requireEnabled(){
 if(process.env.SERVICES_WEB_ENABLE_GUEST_COMPLETION_BFF!=='enabled')
  throw new GuestCompletionTransportUnavailable();
}
function requireNetworkProof(value:unknown):string{
 const match=typeof value==='string'&&value.length<=160?PROOF.exec(value):null;
 const raw=process.env.GUEST_NETWORK_ATTESTATION_KEY;
 if(!match||!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))
  throw new GuestCompletionTransportUnavailable();
 const keyBytes=Buffer.from(raw,'base64');
 const ts=Number(match[2]);
 if(keyBytes.length!==32||keyBytes.toString('base64')!==raw||
  !Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>30000)
  throw new GuestCompletionTransportUnavailable();
 const signed=createHmac('sha256',keyBytes)
  .update('services-otp-network:v1\n').update(match[1])
  .update('\n').update(match[2]).digest();
 const received=Buffer.from(match[3],'hex');
 if(received.length!==signed.length||!timingSafeEqual(received,signed))
  throw new GuestCompletionTransportUnavailable();
 return value as string;
}
const cookieOptions=(ttl:number)=>({
 httpOnly:true as const,secure:true as const,sameSite:'strict' as const,
 path:'/' as const,maxAge:Math.max(1,Math.floor(ttl/1000)),
});
const clear=(name:string)=>({
 name,value:'',options:{...cookieOptions(1000),maxAge:0},
});
function auth(input:{
 requestId:string;cookieValue:string|undefined;
 csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
}):{requestCapability:string}{
 requireEnabled();
 let actor;
 try{actor=authorizeGuestRequestMutation(input);}
 catch{throw new GuestCompletionTransportUnavailable();}
 if(!actor)throw new GuestCompletionTransportUnavailable();
 return actor;
}
const backend=()=>({
 baseUrl:process.env.SERVICES_API_BASE_URL,
 production:process.env.NODE_ENV==='production',
});

export async function startGuestCompletionChallenge(input:{
 requestId:string;cookieValue:string|undefined;
 csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
 locale:'kk'|'ru';networkProof:string|null;
}){
 const actor=auth(input);
 const proof=requireNetworkProof(input.networkProof);
 const challenge=await requestGuestCompletionOtp({...backend(),
  requestId:input.requestId,readCapability:actor.requestCapability,
  networkProof:proof,locale:input.locale});
 const now=Date.now(),expiry=now+590000;
 const sealed=sealGuestCompletionSession(key(),'challenge',input.requestId,
  challenge.challengeId,expiry,now);
 return {challengeId:challenge.challengeId,
  setCookie:{name:COMPLETION_CHALLENGE_COOKIE,value:sealed,
   options:cookieOptions(expiry-now)}};
}
export async function verifyGuestCompletionChallenge(input:{
 requestId:string;cookieValue:string|undefined;
 csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
 challengeCookieValue:string|undefined;challengeId:string;code:string;
}){
 auth(input);
 const opened=openGuestCompletionSession(key(),'challenge',
  input.challengeCookieValue);
 if(!opened||opened.requestId!==input.requestId.toLowerCase()||
  opened.value!==input.challengeId.toLowerCase())
  throw new GuestCompletionTransportUnavailable();
 const proof=await verifyGuestCompletionOtp({...backend(),
  requestId:input.requestId,challengeId:opened.value,code:input.code});
 const now=Date.now();
 const expiry=Math.min(proof.expiresAt,now+890000);
 const sealed=sealGuestCompletionSession(key(),'completion',input.requestId,
  proof.capability,expiry,now);
 return {verified:true as const,
  setCookie:{name:COMPLETION_PROOF_COOKIE,value:sealed,
   options:cookieOptions(expiry-now)},
  clearCookie:clear(COMPLETION_CHALLENGE_COOKIE)};
}
export async function confirmGuestCompletion(input:{
 requestId:string;cookieValue:string|undefined;
 csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
 completionCookieValue:string|undefined;version:number;
}){
 auth(input);
 const opened=openGuestCompletionSession(key(),'completion',
  input.completionCookieValue);
 if(!opened||opened.requestId!==input.requestId.toLowerCase())
  throw new GuestCompletionTransportUnavailable();
 const result=await confirmGuestCompletionBackend({...backend(),
  requestId:input.requestId,completionCapability:opened.value,
  version:input.version});
 return {result,clearCookie:clear(COMPLETION_PROOF_COOKIE)};
}
