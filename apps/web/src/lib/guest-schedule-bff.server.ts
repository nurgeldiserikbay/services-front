import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {readBackendActiveSchedule,mutateBackendAccountSchedule,type ScheduleProposalBody} from './account-session-transport.mjs';
import {authorizeGuestRequestMutation} from './guest-request-access.server';
import {sealGuestScheduleSession,openGuestScheduleSession}
 from './guest-schedule-session-core.mjs';
import {requestGuestScheduleOtp,verifyGuestScheduleOtp,
 GuestScheduleTransportUnavailable}
 from './guest-schedule-backend.mjs';

export const SCHEDULE_CHALLENGE_COOKIE='__Host-services_guest_schedule_challenge';
export const SCHEDULE_PROOF_COOKIE='__Host-services_guest_schedule';
const PROOF=/^v1\.([0-9a-f]{64})\.([0-9]{10,13})\.([0-9a-f]{64})$/;

function key():Buffer{
 const value=process.env.SERVICES_WEB_GUEST_SESSION_KEY;
 if(!value||!/^[A-Za-z0-9+/]{43}=$/.test(value))
  throw new GuestScheduleTransportUnavailable();
 const decoded=Buffer.from(value,'base64');
 if(decoded.length!==32||decoded.toString('base64')!==value)
  throw new GuestScheduleTransportUnavailable();
 return decoded;
}
function requireEnabled(){
 if(process.env.SERVICES_WEB_ENABLE_GUEST_SCHEDULE_BFF!=='enabled')
  throw new GuestScheduleTransportUnavailable();
}
function requireNetworkProof(value:unknown):string{
 const match=typeof value==='string'&&value.length<=160?PROOF.exec(value):null;
 const raw=process.env.GUEST_NETWORK_ATTESTATION_KEY;
 if(!match||!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))
  throw new GuestScheduleTransportUnavailable();
 const keyBytes=Buffer.from(raw,'base64');
 const ts=Number(match[2]);
 if(keyBytes.length!==32||keyBytes.toString('base64')!==raw||
  !Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>30000)
  throw new GuestScheduleTransportUnavailable();
 const signed=createHmac('sha256',keyBytes)
  .update('services-otp-network:v1\n').update(match[1])
  .update('\n').update(match[2]).digest();
 const received=Buffer.from(match[3],'hex');
 if(received.length!==signed.length||!timingSafeEqual(received,signed))
  throw new GuestScheduleTransportUnavailable();
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
 catch{throw new GuestScheduleTransportUnavailable();}
 if(!actor)throw new GuestScheduleTransportUnavailable();
 return actor;
}
const backend=()=>({
 baseUrl:process.env.SERVICES_API_BASE_URL,
 production:process.env.NODE_ENV==='production',
});

export async function startGuestScheduleChallenge(input:{
 requestId:string;cookieValue:string|undefined;
 csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
 locale:'kk'|'ru';networkProof:string|null;
}){
 const actor=auth(input);
 const proof=requireNetworkProof(input.networkProof);
 const challenge=await requestGuestScheduleOtp({...backend(),
  requestId:input.requestId,readCapability:actor.requestCapability,
  networkProof:proof,locale:input.locale});
 const now=Date.now(),expiry=now+590000;
 const sealed=sealGuestScheduleSession(key(),'challenge',input.requestId,
  challenge.challengeId,expiry,now);
 return {challengeId:challenge.challengeId,
  setCookie:{name:SCHEDULE_CHALLENGE_COOKIE,value:sealed,
   options:cookieOptions(expiry-now)}};
}
export async function verifyGuestScheduleChallenge(input:{
 requestId:string;cookieValue:string|undefined;
 csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
 challengeCookieValue:string|undefined;challengeId:string;code:string;
}){
 auth(input);
 const opened=openGuestScheduleSession(key(),'challenge',
  input.challengeCookieValue);
 if(!opened||opened.requestId!==input.requestId.toLowerCase()||
  opened.value!==input.challengeId.toLowerCase())
  throw new GuestScheduleTransportUnavailable();
 const proof=await verifyGuestScheduleOtp({...backend(),
  requestId:input.requestId,challengeId:opened.value,code:input.code});
 const now=Date.now();
 const expiry=Math.min(proof.expiresAt,now+890000);
 const sealed=sealGuestScheduleSession(key(),'schedule',input.requestId,
  proof.capability,expiry,now);
 return {verified:true as const,
  setCookie:{name:SCHEDULE_PROOF_COOKIE,value:sealed,
   options:cookieOptions(expiry-now)},
  clearCookie:clear(SCHEDULE_CHALLENGE_COOKIE)};
}
type ScheduleAuth={requestId:string;cookieValue:string|undefined;csrfToken:string|undefined;origin:string|null;fetchSite:string|null;scheduleCookieValue:string|undefined};
function scheduleProof(input:ScheduleAuth){
 auth(input);
 const opened=openGuestScheduleSession(key(),'schedule',input.scheduleCookieValue);
 if(!opened||opened.requestId!==input.requestId.toLowerCase())
  throw new GuestScheduleTransportUnavailable();
 return opened.value;
}
export async function getGuestActiveSchedule(input:ScheduleAuth){
 const guestCapability=scheduleProof(input);
 return readBackendActiveSchedule({...backend(),requestId:input.requestId,guestCapability});
}
export async function mutateGuestSchedule(input:ScheduleAuth&{version:number;key:string}&
 ({action:'propose';body:ScheduleProposalBody;proposalId?:never}|{action:'confirm'|'decline';proposalId:string;body?:never})){
 const guestCapability=scheduleProof(input);
 const common={...backend(),requestId:input.requestId,guestCapability,version:input.version,key:input.key};
 return input.action==='propose'
  ?mutateBackendAccountSchedule({...common,action:input.action,body:input.body})
  :mutateBackendAccountSchedule({...common,action:input.action,proposalId:input.proposalId});
}
