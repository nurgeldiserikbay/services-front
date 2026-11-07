import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';

const AAD=Buffer.from('services-web-seller-session:v1');
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const MAX_TTL=86400;
function requireKey(key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('seller_session_key_unavailable');
}
/** Only trusted server-side login code may call this with a backend session token. */
export function sealSellerSession(key,bearer,ttlSeconds,now=Date.now()){
  requireKey(key);
  if(typeof bearer!=='string'||!TOKEN.test(bearer)||
    !Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>MAX_TTL||
    !Number.isSafeInteger(now))throw new Error('invalid_seller_session');
  const payload={scope:'seller:session',bearer,
    csrf:randomBytes(32).toString('base64url'),expiresAt:now+ttlSeconds*1000};
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);
  return {cookie:['v1',iv.toString('base64url'),encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url')].join('.'),
    csrf:payload.csrf,expiresAt:payload.expiresAt};
}
export function openSellerSession(key,cookie,now=Date.now()){
  requireKey(key);
  if(typeof cookie!=='string'||cookie.length>2048||!Number.isSafeInteger(now))return null;
  const parts=cookie.split('.');
  if(parts.length!==4||parts[0]!=='v1'||!/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
    !/^[A-Za-z0-9_-]{1,1900}$/.test(parts[2])||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
  try{
    const iv=Buffer.from(parts[1],'base64url');
    const body=Buffer.from(parts[2],'base64url');
    const tag=Buffer.from(parts[3],'base64url');
    if(iv.length!==12||tag.length!==16||body.length>1400)return null;
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(AAD);decipher.setAuthTag(tag);
    const payload=JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString());
    if(payload?.scope!=='seller:session'||!TOKEN.test(payload.bearer)||
      !TOKEN.test(payload.csrf)||!Number.isSafeInteger(payload.expiresAt)||
      payload.expiresAt<=now||payload.expiresAt>now+MAX_TTL*1000)return null;
    return {bearer:payload.bearer,csrf:payload.csrf,expiresAt:payload.expiresAt};
  }catch{return null;}
}
export function verifySellerCsrf(session,submitted){
  if(!session||typeof submitted!=='string'||!TOKEN.test(submitted))return false;
  const a=Buffer.from(session.csrf),b=Buffer.from(submitted);
  return a.length===b.length&&timingSafeEqual(a,b);
}
