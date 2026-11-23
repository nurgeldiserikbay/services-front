import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';

const AAD=Buffer.from('services-web-account-otp-challenge:v1','utf8');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const ACCOUNT_OTP_CHALLENGE_MAX_TTL_SECONDS=300;
const MAX_COOKIE_BYTES=1024;

function requireKey(key){
 if(!Buffer.isBuffer(key)||key.length!==32)
  throw new Error('account_otp_challenge_unavailable');
}
function constantTimeSame(left,right){
 if(typeof left!=='string'||typeof right!=='string'||
  !TOKEN.test(left)||!TOKEN.test(right))return false;
 const l=Buffer.from(left,'utf8'),r=Buffer.from(right,'utf8');
 return l.length===r.length&&timingSafeEqual(l,r);
}

/** Only server-side accepted OTP dispatch may call this. The contact and
 * delivery provider must not be placed in the sealed session or browser UI.
 */
export function sealAccountOtpChallenge(
 key,challengeId,channel,ttlSeconds=300,now=Date.now(),
){
 requireKey(key);
 if(typeof challengeId!=='string'||!UUID.test(challengeId)||
    (channel!=='EMAIL'&&channel!=='SMS')||
    !Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||
    ttlSeconds>ACCOUNT_OTP_CHALLENGE_MAX_TTL_SECONDS||
    !Number.isSafeInteger(now)||now<0)
  throw new Error('account_otp_challenge_unavailable');
 const payload={
  purpose:'account:otp_challenge',
  challengeId:challengeId.toLowerCase(),channel,
  csrf:randomBytes(32).toString('base64url'),
  expiresAt:now+ttlSeconds*1000,
 };
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(AAD);
 const ciphertext=Buffer.concat([
  cipher.update(JSON.stringify(payload),'utf8'),cipher.final(),
 ]);
 return {
  cookie:['v1',iv.toString('base64url'),ciphertext.toString('base64url'),
   cipher.getAuthTag().toString('base64url')].join('.'),
  csrf:payload.csrf,expiresAt:payload.expiresAt,
 };
}
export function openAccountOtpChallenge(key,cookie,now=Date.now()){
 requireKey(key);
 if(typeof cookie!=='string'||cookie.length>MAX_COOKIE_BYTES||
    !Number.isSafeInteger(now)||now<0)return null;
 const parts=cookie.split('.');
 if(parts.length!==4||parts[0]!=='v1'||
    !/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
    !/^[A-Za-z0-9_-]{1,850}$/.test(parts[2])||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
 try{
  const iv=Buffer.from(parts[1],'base64url');
  const ciphertext=Buffer.from(parts[2],'base64url');
  const tag=Buffer.from(parts[3],'base64url');
  if(iv.length!==12||tag.length!==16||ciphertext.length>600)return null;
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(AAD);decipher.setAuthTag(tag);
  const payload=JSON.parse(Buffer.concat([
   decipher.update(ciphertext),decipher.final(),
  ]).toString('utf8'));
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     Object.keys(payload).sort().join(',')!==
     'challengeId,channel,csrf,expiresAt,purpose'||
     payload.purpose!=='account:otp_challenge'||
     typeof payload.challengeId!=='string'||
     !UUID.test(payload.challengeId)||
     payload.challengeId!==payload.challengeId.toLowerCase()||
     !['EMAIL','SMS'].includes(payload.channel)||
     typeof payload.csrf!=='string'||!TOKEN.test(payload.csrf)||
     !Number.isSafeInteger(payload.expiresAt)||
     payload.expiresAt<=now||
     payload.expiresAt>now+ACCOUNT_OTP_CHALLENGE_MAX_TTL_SECONDS*1000)
   return null;
  return {challengeId:payload.challengeId,channel:payload.channel,
   csrf:payload.csrf,expiresAt:payload.expiresAt};
 }catch{return null;}
}
/** Requires the exact challenge and selected channel, not just a CSRF token.
 * This prevents cross-challenge swaps between concurrent browser sessions.
 */
export function verifyAccountOtpChallenge(session,challengeId,channel,csrf){
 if(!session||typeof challengeId!=='string'||!UUID.test(challengeId)||
    challengeId.toLowerCase()!==session.challengeId||
    channel!==session.channel)return false;
 return constantTimeSame(session.csrf,csrf);
}
