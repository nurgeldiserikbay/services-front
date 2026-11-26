import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const PURPOSES=Object.freeze({
 challenge:{aad:'services-guest-schedule-challenge:v1',ttl:600000},
 schedule:{aad:'services-guest-schedule-proof:v1',ttl:900000},
});
const requireKey=key=>{
 if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('invalid_schedule_key');
};
function valid(purpose,requestId,value){
 return !!PURPOSES[purpose]&&typeof requestId==='string'&&UUID.test(requestId)&&
  typeof value==='string'&&(purpose==='challenge'?UUID.test(value):TOKEN.test(value));
}
export function sealGuestScheduleSession(key,purpose,requestId,value,
 expiresAt=Date.now()+600000,now=Date.now()){
 requireKey(key);
 if(!valid(purpose,requestId,value)||!Number.isSafeInteger(now)||
  !Number.isSafeInteger(expiresAt)||expiresAt<=now||
  expiresAt>now+PURPOSES[purpose].ttl)throw new Error('invalid_schedule_session');
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(PURPOSES[purpose].aad,'utf8'));
 const payload=JSON.stringify({purpose,requestId:requestId.toLowerCase(),
  value:purpose==='challenge'?value.toLowerCase():value,expiresAt});
 const encrypted=Buffer.concat([cipher.update(payload,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),encrypted.toString('base64url'),
  cipher.getAuthTag().toString('base64url')].join('.');
}
export function openGuestScheduleSession(key,purpose,cookie,now=Date.now()){
 requireKey(key);
 if(!PURPOSES[purpose]||typeof cookie!=='string'||cookie.length>1024||
  !Number.isSafeInteger(now))return null;
 const parts=cookie.split('.');
 if(parts.length!==4||parts[0]!=='v1'||!/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
  !/^[A-Za-z0-9_-]{1,850}$/.test(parts[2])||
  !/^[A-Za-z0-9_-]{22}$/.test(parts[3]))return null;
 try{
  const iv=Buffer.from(parts[1],'base64url');
  const encrypted=Buffer.from(parts[2],'base64url');
  const tag=Buffer.from(parts[3],'base64url');
  if(iv.length!==12||encrypted.length>600||tag.length!==16||
   iv.toString('base64url')!==parts[1]||
   encrypted.toString('base64url')!==parts[2]||
   tag.toString('base64url')!==parts[3])return null;
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(Buffer.from(PURPOSES[purpose].aad,'utf8'));
  decipher.setAuthTag(tag);
  const payload=JSON.parse(Buffer.concat([decipher.update(encrypted),
   decipher.final()]).toString('utf8'));
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   Object.keys(payload).sort().join(',')!=='expiresAt,purpose,requestId,value'||
   payload.purpose!==purpose||!valid(purpose,payload.requestId,payload.value)||
   payload.requestId!==payload.requestId.toLowerCase()||
   !Number.isSafeInteger(payload.expiresAt)||payload.expiresAt<=now||
   payload.expiresAt>now+PURPOSES[purpose].ttl)return null;
  return {requestId:payload.requestId,value:payload.value,
   expiresAt:payload.expiresAt};
 }catch{return null;}
}
