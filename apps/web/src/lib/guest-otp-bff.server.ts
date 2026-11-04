import 'server-only';
import {issueGuestOtpChallenge,verifyGuestOtpChallenge,GuestOtpUnavailable}
  from './guest-otp-backend.mjs';
import {sealGuestChallenge,openGuestChallenge,verifyGuestChallengeSession}
  from './guest-challenge-session-core.mjs';
import {verifyMutationOrigin} from './guest-session-core.mjs';
import {issueGuestCreateSession} from './guest-session.server';

export const GUEST_CHALLENGE_COOKIE='__Host-services_guest_challenge';

function sessionKey():Buffer{
  const encoded=process.env.SERVICES_WEB_GUEST_SESSION_KEY;
  if(!encoded||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new GuestOtpUnavailable();
  const key=Buffer.from(encoded,'base64');
  if(key.length!==32||key.toString('base64')!==encoded)
    throw new GuestOtpUnavailable();
  return key;
}

function requireTrustedOrigin(origin:string|null,fetchSite:string|null):void{
  const expected=process.env.SERVICES_WEB_ORIGIN;
  if(!expected||
     (process.env.NODE_ENV==='production'&&!expected.startsWith('https://'))||
     !verifyMutationOrigin(origin,expected,fetchSite))
    throw new GuestOtpUnavailable();
}

function requireInternalGate():void{
  if(process.env.SERVICES_WEB_ENABLE_GUEST_OTP_BFF!=='enabled')
    throw new GuestOtpUnavailable();
}

export function clearGuestChallengeSession(){
  return {name:GUEST_CHALLENGE_COOKIE,value:'',
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}

/**
 * Internal composition only. The future route MUST enforce trusted-edge
 * network limits before calling this method. No browser route is mounted.
 */
export async function startGuestChallenge(input:{
  channel:'sms'|'email';
  contact:string;
  locale:'kk'|'ru';
  origin:string|null;
  fetchSite:string|null;
}){
  requireInternalGate();
  requireTrustedOrigin(input.origin,input.fetchSite);
  const challenge=await issueGuestOtpChallenge({
    baseUrl:process.env.SERVICES_API_BASE_URL,
    production:process.env.NODE_ENV==='production',
    channel:input.channel,contact:input.contact,locale:input.locale,
  });
  const sealed=sealGuestChallenge(sessionKey(),challenge.challengeId);
  return {
    challengeId:challenge.challengeId,
    expiresInSeconds:Math.max(1,Math.floor((sealed.expiresAt-Date.now())/1000)),
    csrf:sealed.csrf,
    setCookie:{name:GUEST_CHALLENGE_COOKIE,value:sealed.cookie,
      options:{httpOnly:true as const,secure:true as const,
        sameSite:'strict' as const,path:'/' as const,maxAge:600}},
  };
}

/**
 * Verify only the exact challenge previously initiated by this session.
 * The CREATE_REQUEST capability remains server-only and is immediately
 * sealed into a second encrypted HttpOnly cookie. Never return the proof
 * from a public response or copy the whole object into NextResponse.json.
 */
export async function confirmGuestChallenge(input:{
  cookieValue:string|undefined;
  challengeId:string;
  code:string;
  csrfToken:string|undefined;
  origin:string|null;
  fetchSite:string|null;
}){
  requireInternalGate();
  requireTrustedOrigin(input.origin,input.fetchSite);
  let session;
  try{session=openGuestChallenge(sessionKey(),input.cookieValue);}
  catch{throw new GuestOtpUnavailable();}
  if(!verifyGuestChallengeSession(session,input.challengeId,input.csrfToken))
    throw new GuestOtpUnavailable();
  const proof=await verifyGuestOtpChallenge({
    baseUrl:process.env.SERVICES_API_BASE_URL,
    production:process.env.NODE_ENV==='production',
    challengeId:session!.challengeId,code:input.code,
  });
  // No 'verified' result is returned unless encrypted cookie issuance works.
  let create;
  try{create=issueGuestCreateSession(
    proof.createCapability,proof.expiresInSeconds,
  );}catch{throw new GuestOtpUnavailable();}
  return {
    verified:true as const,
    csrf:create.csrf,
    setCookie:{name:create.name,value:create.value,options:create.options},
    clearCookie:clearGuestChallengeSession(),
  };
}
