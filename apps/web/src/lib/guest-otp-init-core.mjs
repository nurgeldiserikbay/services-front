import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';

const AAD=Buffer.from('services-web-otp-init:v1','utf8');
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const OTP_INIT_TTL_SECONDS=300;

function requireKey(key){
  if(!Buffer.isBuffer(key)||key.length!==32)
    throw new Error('otp_init_unavailable');
}

/**
 * CSRF bootstrap is independent from OTP challenge, CREATE_REQUEST and
 * READ_CANCEL sessions. A client may read the synchronizer, but never
 * the session key. The cookie is Secure, HttpOnly, SameSite=Strict.
 */
export function sealOtpInitiation(key,now=Date.now()){
  requireKey(key);
  if(!Number.isSafeInteger(now)||now<0)throw new Error('otp_init_unavailable');
  const payload={purpose:'otp:init',csrf:randomBytes(32).toString('base64url'),
    expiresAt:now+OTP_INIT_TTL_SECONDS*1000};
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const encrypted=Buffer.concat([
    cipher.update(JSON.stringify(payload),'utf8'),cipher.final(),
  ]);
  return {
    cookie:['v1',iv.toString('base64url'),encrypted.toString('base64url'),
      cipher.getAuthTag().toString('base64url')].join('.'),
    csrf:payload.csrf,expiresAt:payload.expiresAt,
  };
}

export function openOtpInitiation(key,cookie,now=Date.now()){
  requireKey(key);
  if(typeof cookie!=='string'||cookie.length>600||!Number.isSafeInteger(now))
    return null;
  const parts=cookie.split('.');
  if(parts.length!==4||parts[0]!=='v1'||
     !/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
     !/^[A-Za-z0-9_-]{1,480}$/.test(parts[2])||
     !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
  try{
    const iv=Buffer.from(parts[1],'base64url');
    const body=Buffer.from(parts[2],'base64url');
    const tag=Buffer.from(parts[3],'base64url');
    if(iv.length!==12||tag.length!==16||body.length>350)return null;
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(AAD);decipher.setAuthTag(tag);
    const value=JSON.parse(Buffer.concat([
      decipher.update(body),decipher.final(),
    ]).toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value)||
       Object.keys(value).length!==3||
       value.purpose!=='otp:init'||
       typeof value.csrf!=='string'||!TOKEN.test(value.csrf)||
       !Number.isSafeInteger(value.expiresAt)||
       value.expiresAt<=now||value.expiresAt>now+OTP_INIT_TTL_SECONDS*1000)
      return null;
    return {csrf:value.csrf,expiresAt:value.expiresAt};
  }catch{return null;}
}

export function verifyOtpInitiation(session,submitted){
  if(!session||typeof submitted!=='string'||!TOKEN.test(submitted))
    return false;
  const a=Buffer.from(session.csrf,'utf8'),b=Buffer.from(submitted,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}
