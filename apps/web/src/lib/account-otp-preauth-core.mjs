import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';

const AAD=Buffer.from('services-web-account-otp-preauth:v1','utf8');
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const ACCOUNT_OTP_PREAUTH_TTL_SECONDS=300;

function keyValid(key){
 if(!Buffer.isBuffer(key)||key.length!==32)
  throw new Error('account_otp_preauth_unavailable');
}
export function sealAccountOtpPreauth(key,now=Date.now()){
 keyValid(key);
 if(!Number.isSafeInteger(now)||now<0)
  throw new Error('account_otp_preauth_unavailable');
 const payload={purpose:'account:otp_preauth',
  csrf:randomBytes(32).toString('base64url'),
  expiresAt:now+ACCOUNT_OTP_PREAUTH_TTL_SECONDS*1000};
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
export function openAccountOtpPreauth(key,cookie,now=Date.now()){
 keyValid(key);
 if(typeof cookie!=='string'||cookie.length>600||
    !Number.isSafeInteger(now)||now<0)return null;
 const parts=cookie.split('.');
 if(parts.length!==4||parts[0]!=='v1'||
    !/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
    !/^[A-Za-z0-9_-]{1,480}$/.test(parts[2])||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
 try{
  const iv=Buffer.from(parts[1],'base64url');
  const encrypted=Buffer.from(parts[2],'base64url');
  const tag=Buffer.from(parts[3],'base64url');
  if(iv.length!==12||tag.length!==16||encrypted.length>350)return null;
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(AAD);decipher.setAuthTag(tag);
  const value=JSON.parse(Buffer.concat([
   decipher.update(encrypted),decipher.final(),
  ]).toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).sort().join(',')!=='csrf,expiresAt,purpose'||
     value.purpose!=='account:otp_preauth'||
     typeof value.csrf!=='string'||!TOKEN.test(value.csrf)||
     !Number.isSafeInteger(value.expiresAt)||
     value.expiresAt<=now||
     value.expiresAt>now+ACCOUNT_OTP_PREAUTH_TTL_SECONDS*1000)return null;
  return {csrf:value.csrf,expiresAt:value.expiresAt};
 }catch{return null;}
}
export function verifyAccountOtpPreauth(session,submitted){
 if(!session||typeof session.csrf!=='string'||!TOKEN.test(session.csrf)||
    typeof submitted!=='string'||!TOKEN.test(submitted))return false;
 const a=Buffer.from(session.csrf,'utf8'),b=Buffer.from(submitted,'utf8');
 return a.length===b.length&&timingSafeEqual(a,b);
}
/** GET bootstrap may have no Origin; Fetch Metadata must then explicitly
 * confirm a same-origin browser fetch. Never allow an absent fetch-site.
 */
export function allowAccountOtpBootstrapOrigin(origin,fetchSite,expected,production){
 if(fetchSite!=='same-origin'||typeof expected!=='string')return false;
 try{
  const url=new URL(expected);
  if(url.origin!==expected||!['http:','https:'].includes(url.protocol)||
     (production&&url.protocol!=='https:')||url.username||url.password||
     url.search||url.hash)return false;
  if(origin===null)return true;
  if(typeof origin!=='string')return false;
  const supplied=new URL(origin);
  return supplied.origin===expected&&origin===supplied.origin;
 }catch{return false;}
}
