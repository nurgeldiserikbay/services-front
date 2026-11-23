import {verifyAccountMutationOrigin} from './account-web-session-core.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF=/^[A-Za-z0-9_-]{43}$/;
export const MAX_ACCOUNT_OTP_VERIFY_BODY_BYTES=512;
export function verifyAccountOtpMutationOrigin(origin,expected,fetchSite){
 // Pre-auth OTP verification is not a top-level navigation or same-site
 // mutation: require a true same-origin script POST with explicit Origin.
 return fetchSite==='same-origin' &&
  verifyAccountMutationOrigin(origin,expected,fetchSite);
}
export function validateAccountOtpVerifyPayload(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!==
    'challenge_id,channel,code,csrf_token'||
    typeof value.challenge_id!=='string'||!UUID.test(value.challenge_id)||
    !['EMAIL','SMS'].includes(value.channel)||
    typeof value.code!=='string'||!/^[0-9]{6}$/.test(value.code)||
    typeof value.csrf_token!=='string'||!CSRF.test(value.csrf_token))
  return null;
 return {challengeId:value.challenge_id.toLowerCase(),
  channel:value.channel,code:value.code,csrfToken:value.csrf_token};
}
export async function readAccountOtpVerifyPayload(stream){
 if(!stream||typeof stream.getReader!=='function')
  throw new Error('invalid_account_otp_verify_payload');
 const reader=stream.getReader();
 const chunks=[];let bytes=0,complete=false;
 try{
  for(;;){
   const part=await reader.read();
   if(part.done){complete=true;break;}
   if(!(part.value instanceof Uint8Array)||
      bytes+part.value.byteLength>MAX_ACCOUNT_OTP_VERIFY_BODY_BYTES)
    throw new Error('invalid_account_otp_verify_payload');
   bytes+=part.value.byteLength;
   chunks.push(part.value);
  }
 }finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
 const joined=new Uint8Array(bytes);
 let at=0;
 for(const chunk of chunks){joined.set(chunk,at);at+=chunk.byteLength;}
 try{
  return validateAccountOtpVerifyPayload(JSON.parse(
   new TextDecoder('utf-8',{fatal:true}).decode(joined)));
 }catch{return null;}
}
