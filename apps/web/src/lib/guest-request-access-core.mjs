import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';

const AAD=Buffer.from('services-web-guest-read-cancel:v1','utf8');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY=/^[A-Za-z0-9_-]{43}$/;
const MAX_TTL_MS=24*60*60*1000;

function requireKey(key){
  if(!Buffer.isBuffer(key)||key.length!==32)
    throw new Error('guest_request_session_key_unavailable');
}

export function sealGuestRequestAccess(key,requestId,capability,expiresAt,now=Date.now()){
  requireKey(key);
  if(typeof requestId!=='string'||!UUID.test(requestId)||
    typeof capability!=='string'||!CAPABILITY.test(capability)||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(expiresAt)||
    expiresAt<=now||expiresAt>now+MAX_TTL_MS)
    throw new Error('invalid_guest_request_access');

  const payload={requestId:requestId.toLowerCase(),capability,
    scope:'guest:read_cancel',expiresAt,
    csrf:randomBytes(32).toString('base64url')};
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {cookie:['v1',iv.toString('base64url'),
    encrypted.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.'),
    csrf:payload.csrf,expiresAt};
}

export function openGuestRequestAccess(key,cookie,now=Date.now()){
  requireKey(key);
  if(typeof cookie!=='string'||cookie.length>2048||!Number.isSafeInteger(now))return null;
  const parts=cookie.split('.');
  if(parts.length!==4||parts[0]!=='v1'||
    !/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
    !/^[A-Za-z0-9_-]{1,1900}$/.test(parts[2])||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
  try{
    const iv=Buffer.from(parts[1],'base64url'),
      body=Buffer.from(parts[2],'base64url'),
      tag=Buffer.from(parts[3],'base64url');
    if(iv.length!==12||body.length>1400||tag.length!==16)return null;
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(AAD);decipher.setAuthTag(tag);
    const data=JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
    if(!data||typeof data!=='object'||Array.isArray(data)||
      data.scope!=='guest:read_cancel'||typeof data.requestId!=='string'||
      !UUID.test(data.requestId)||typeof data.capability!=='string'||
      !CAPABILITY.test(data.capability)||typeof data.csrf!=='string'||
      !CAPABILITY.test(data.csrf)||!Number.isSafeInteger(data.expiresAt)||
      data.expiresAt<=now||data.expiresAt>now+MAX_TTL_MS)return null;
    return {requestId:data.requestId,capability:data.capability,
      csrf:data.csrf,expiresAt:data.expiresAt,scope:'guest:read_cancel'};
  }catch{return null;}
}

export function verifyGuestRequestAccess(session,requestId,csrf){
  if(!session||typeof requestId!=='string'||!UUID.test(requestId)||
    session.requestId!==requestId.toLowerCase()||
    typeof csrf!=='string'||!CAPABILITY.test(csrf))return false;
  const expected=Buffer.from(session.csrf,'utf8'),given=Buffer.from(csrf,'utf8');
  return expected.length===given.length&&timingSafeEqual(expected,given);
}
