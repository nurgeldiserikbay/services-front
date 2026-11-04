import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';

const SCOPE='guest:create_request';
const AAD=Buffer.from('services-web-guest-session:v1','utf8');
const MAX_TTL_SECONDS=900;
const CAPABILITY=/^[A-Za-z0-9_-]{43}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;

function requireKey(key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('guest_session_key_unavailable');
}
function assertPayload(input,now){
  if(!input||typeof input!=='object'||Array.isArray(input)||
    input.scope!==SCOPE || !CAPABILITY.test(input.capability) ||
    !TOKEN.test(input.csrf) ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt<=now||input.expiresAt>now+MAX_TTL_SECONDS*1000)
    throw new Error('invalid_guest_session');
}

/** An opaque, authenticated cookie payload. Raw capability never leaves server. */
export function sealGuestSession(key,capability,ttlSeconds=900,now=Date.now()){
  requireKey(key);
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(ttlSeconds)||
    ttlSeconds<1||ttlSeconds>MAX_TTL_SECONDS ||
    typeof capability!=='string'||!CAPABILITY.test(capability))
    throw new Error('invalid_guest_session');
  const payload={scope:SCOPE,capability,
    csrf:randomBytes(32).toString('base64url'),
    expiresAt:now+ttlSeconds*1000};
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  const cookie=['v1',iv.toString('base64url'),
    encrypted.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
  return {cookie,csrf:payload.csrf,expiresAt:payload.expiresAt};
}

/** Fail closed: invalid, expired or tampered cookies return null, not capability. */
export function openGuestSession(key,cookie,now=Date.now()){
  requireKey(key);
  if(typeof cookie!=='string'||cookie.length>2048||!Number.isSafeInteger(now))return null;
  const parts=cookie.split('.');
  if(parts.length!==4||parts[0]!=='v1'||
    !/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
    !/^[A-Za-z0-9_-]{1,1900}$/.test(parts[2])||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
  try{
    const iv=Buffer.from(parts[1],'base64url'),body=Buffer.from(parts[2],'base64url'),
      tag=Buffer.from(parts[3],'base64url');
    if(iv.length!==12||tag.length!==16||body.length>1400)return null;
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(AAD);decipher.setAuthTag(tag);
    const plain=Buffer.concat([decipher.update(body),decipher.final()]);
    const payload=JSON.parse(plain.toString('utf8'));
    assertPayload(payload,now);
    return {capability:payload.capability,csrf:payload.csrf,
      expiresAt:payload.expiresAt,scope:SCOPE};
  }catch{return null;}
}

/** Server compares a per-session synchronizer token, never browser cookies. */
export function verifyGuestCsrf(session,submitted){
  if(!session||typeof submitted!=='string'||!TOKEN.test(submitted))return false;
  const a=Buffer.from(session.csrf,'utf8'),b=Buffer.from(submitted,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}

/** Exact canonical origin is mandatory for browser mutations. */
export function verifyMutationOrigin(origin,expectedOrigin,fetchSite){
  if(typeof origin!=='string'||typeof expectedOrigin!=='string')return false;
  if(fetchSite&&fetchSite!=='same-origin'&&fetchSite!=='none')return false;
  try{
    const expected=new URL(expectedOrigin),actual=new URL(origin);
    return ['https:','http:'].includes(expected.protocol)&&
      expected.pathname==='/'&&!expected.search&&!expected.hash&&
      actual.pathname==='/'&&!actual.search&&!actual.hash&&
      actual.origin===expected.origin&&origin===actual.origin&&
      expectedOrigin===expected.origin;
  }catch{return false;}
}
