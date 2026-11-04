import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';

const AAD=Buffer.from('services-web-guest-challenge:v1','utf8');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const MAX_TTL=600000;

function keyValid(key){
  if(!Buffer.isBuffer(key)||key.length!==32)
    throw new Error('challenge_session_unavailable');
}

export function sealGuestChallenge(key,challengeId,ttlSeconds=600,now=Date.now()){
  keyValid(key);
  if(typeof challengeId!=='string'||!UUID.test(challengeId)||
     !Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>600||
     !Number.isSafeInteger(now))throw new Error('invalid_challenge_session');
  const payload={
    purpose:'guest:otp_challenge',challengeId:challengeId.toLowerCase(),
    csrf:randomBytes(32).toString('base64url'),
    expiresAt:now+ttlSeconds*1000,
  };
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const body=Buffer.concat([
    cipher.update(JSON.stringify(payload),'utf8'),cipher.final(),
  ]);
  return {
    cookie:['v1',iv.toString('base64url'),body.toString('base64url'),
      cipher.getAuthTag().toString('base64url')].join('.'),
    csrf:payload.csrf,expiresAt:payload.expiresAt,
  };
}

export function openGuestChallenge(key,cookie,now=Date.now()){
  keyValid(key);
  if(typeof cookie!=='string'||cookie.length>1024||
     !Number.isSafeInteger(now))return null;
  const parts=cookie.split('.');
  if(parts.length!==4||parts[0]!=='v1'||
     !/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
     !/^[A-Za-z0-9_-]{1,850}$/.test(parts[2])||
     !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
  try{
    const iv=Buffer.from(parts[1],'base64url');
    const body=Buffer.from(parts[2],'base64url');
    const tag=Buffer.from(parts[3],'base64url');
    if(iv.length!==12||body.length>600||tag.length!==16)return null;
    const cipher=createDecipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(AAD);
    cipher.setAuthTag(tag);
    const payload=JSON.parse(Buffer.concat([
      cipher.update(body),cipher.final(),
    ]).toString('utf8'));
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
       payload.purpose!=='guest:otp_challenge'||
       typeof payload.challengeId!=='string'||!UUID.test(payload.challengeId)||
       typeof payload.csrf!=='string'||!TOKEN.test(payload.csrf)||
       !Number.isSafeInteger(payload.expiresAt)||
       payload.expiresAt<=now||payload.expiresAt>now+MAX_TTL)return null;
    return {
      challengeId:payload.challengeId,csrf:payload.csrf,
      expiresAt:payload.expiresAt,
    };
  }catch{return null;}
}

export function verifyGuestChallengeSession(session,challengeId,csrfToken){
  if(!session||typeof challengeId!=='string'||!UUID.test(challengeId)||
     session.challengeId!==challengeId.toLowerCase()||
     typeof csrfToken!=='string'||!TOKEN.test(csrfToken))return false;
  const expected=Buffer.from(session.csrf,'utf8');
  const supplied=Buffer.from(csrfToken,'utf8');
  return expected.length===supplied.length&&timingSafeEqual(expected,supplied);
}
