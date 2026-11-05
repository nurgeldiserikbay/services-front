import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
const AAD=Buffer.from('services-web-account-session:v1','utf8');
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const MAX_TTL=12*60*60;
function requireKey(key){
  if(!Buffer.isBuffer(key)||key.length!==32)
    throw new Error('account_web_key_unavailable');
}
function valid(input,now){
  return input&&typeof input==='object'&&!Array.isArray(input)&&
    Object.keys(input).sort().join(',')==='csrf,expiresAt,scope,token'&&
    input.scope==='account:web'&&TOKEN.test(input.token)&&TOKEN.test(input.csrf)&&
    Number.isSafeInteger(input.expiresAt)&&input.expiresAt>now&&
    input.expiresAt<=now+MAX_TTL*1000;
}
/** Must be called ONLY after verified account login/session issuance. */
export function sealAccountWebSession(key,accountToken,ttlSeconds,now=Date.now()){
  requireKey(key);
  if(typeof accountToken!=='string'||!TOKEN.test(accountToken)||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(ttlSeconds)||
    ttlSeconds<1||ttlSeconds>MAX_TTL)throw new Error('invalid_account_web_session');
  const payload={scope:'account:web',token:accountToken,
    csrf:randomBytes(32).toString('base64url'),expiresAt:now+ttlSeconds*1000};
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {cookie:['v1',iv.toString('base64url'),encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url')].join('.'),
    csrf:payload.csrf,expiresAt:payload.expiresAt};
}
export function openAccountWebSession(key,cookie,now=Date.now()){
  requireKey(key);
  if(typeof cookie!=='string'||cookie.length>2048||!Number.isSafeInteger(now))return null;
  const parts=cookie.split('.');
  if(parts.length!==4||parts[0]!=='v1'||
    !/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
    !/^[A-Za-z0-9_-]{1,1900}$/.test(parts[2])||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
  try{
    const iv=Buffer.from(parts[1],'base64url');
    const data=Buffer.from(parts[2],'base64url');
    const tag=Buffer.from(parts[3],'base64url');
    if(iv.length!==12||tag.length!==16||data.length>1400)return null;
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const payload=JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
    if(!valid(payload,now))return null;
    return {token:payload.token,csrf:payload.csrf,expiresAt:payload.expiresAt,
      scope:'account:web'};
  }catch{return null;}
}
export function verifyAccountCsrf(session,submitted){
  if(!session||typeof submitted!=='string'||!TOKEN.test(submitted)||
    typeof session.csrf!=='string'||!TOKEN.test(session.csrf))return false;
  const a=Buffer.from(session.csrf,'utf8'),b=Buffer.from(submitted,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}
export function verifyAccountMutationOrigin(origin,expectedOrigin,fetchSite){
  if(typeof origin!=='string'||typeof expectedOrigin!=='string'||
    (fetchSite!==null&&fetchSite!=='same-origin'&&fetchSite!=='none'))return false;
  try{
    const actual=new URL(origin),expected=new URL(expectedOrigin);
    return ['https:','http:'].includes(expected.protocol)&&
      actual.origin===expected.origin&&
      origin===actual.origin&&expectedOrigin===expected.origin&&
      actual.pathname==='/'&&expected.pathname==='/'&&
      !actual.search&&!actual.hash&&!expected.search&&!expected.hash;
  }catch{return false;}
}
