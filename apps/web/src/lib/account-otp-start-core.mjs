const CSRF=/^[A-Za-z0-9_-]{43}$/;
const CHALLENGE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROOF=/^v1\.[0-9a-f]{64}\.[0-9]{10,13}\.[0-9a-f]{64}$/;
const EMAIL=/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/;
const PHONE=/^\+[1-9][0-9]{7,14}$/;
export const MAX_ACCOUNT_OTP_START_BYTES=512;

export function parseAccountOtpStart(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!==
    'channel,contact,csrf_token,locale,purpose'||
    (value.channel!=='EMAIL'&&value.channel!=='SMS')||
    (value.purpose!=='SIGN_IN'&&value.purpose!=='SIGN_UP')||
    (value.locale!=='kk'&&value.locale!=='ru')||
    typeof value.contact!=='string'||value.contact.length>254||
    (value.channel==='EMAIL'&&!EMAIL.test(value.contact))||
    (value.channel==='SMS'&&!PHONE.test(value.contact))||
    typeof value.csrf_token!=='string'||!CSRF.test(value.csrf_token))
  return null;
 return {channel:value.channel,contact:value.contact,locale:value.locale,
  purpose:value.purpose,csrfToken:value.csrf_token};
}
export async function readAccountOtpStart(stream){
 if(!stream||typeof stream.getReader!=='function')
  throw new Error('invalid_account_otp_start');
 const reader=stream.getReader();
 let total=0,complete=false;
 const chunks=[];
 try{
  for(;;){
   const part=await reader.read();
   if(part.done){complete=true;break;}
   if(!(part.value instanceof Uint8Array)||
      total+part.value.byteLength>MAX_ACCOUNT_OTP_START_BYTES)
    throw new Error('invalid_account_otp_start');
   total+=part.value.byteLength;
   chunks.push(part.value);
  }
 }finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
 const bytes=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{
  return parseAccountOtpStart(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }catch{return null;}
}
/** A trusted-edge proof is a required server-to-server capability, never a
 * browser-provided request header, IP, forwarded-for or origin fallback.
 */
export function validateTrustedAccountOtpProof(proof){
 return typeof proof==='string'&&proof.length<=160&&PROOF.test(proof);
}
/**
 * Dependency-injected orchestration enables negative security tests without
 * a real OTP provider. ONLY a trusted server-side caller supplies proof.
 * Preauth, both encryption keys and active challenge absence are checked
 * before any backend dispatch, so a valid delivery cannot be orphaned by
 * local configuration failures.
 */
export async function startApprovedAccountOtp({
 body,preauthCookie,existingChallengeCookie,existingAccountCookie,
 trustedNetworkProof,authorizePreauth,requireChallengeKey,issueChallenge,
 dispatch,
}){
 const parsed=parseAccountOtpStart(body);
 if(!parsed||!validateTrustedAccountOtpProof(trustedNetworkProof)||
    typeof preauthCookie!=='string'||!preauthCookie||
    existingAccountCookie||existingChallengeCookie)
  throw new Error('account_otp_start_unavailable');
 // Each of these must fail closed BEFORE provider dispatch.
 authorizePreauth(preauthCookie,parsed.csrfToken);
 requireChallengeKey();
 const receipt=await dispatch({
  channel:parsed.channel,contact:parsed.contact,
  purpose:parsed.purpose,locale:parsed.locale,
  trustedNetworkProof,
 });
 if(!receipt||typeof receipt!=='object'||
    typeof receipt.challengeId!=='string'||
    !CHALLENGE_ID.test(receipt.challengeId)||
    receipt.expiresInSeconds!==300)
  throw new Error('account_otp_start_unavailable');
 const issued=issueChallenge({
  challengeId:receipt.challengeId,
  channel:parsed.channel,expiresInSeconds:receipt.expiresInSeconds,
 });
 if(!issued||typeof issued.csrf!=='string'||!CSRF.test(issued.csrf)||
    !issued.cookie||typeof issued.cookie!=='object'||
    typeof issued.cookie.value!=='string')
  throw new Error('account_otp_start_unavailable');
 // Only the challenge proof and new anti-CSRF token may cross to browser.
 return {challengeId:receipt.challengeId,csrf:issued.csrf,
  expiresInSeconds:300,setCookie:issued.cookie};
}
