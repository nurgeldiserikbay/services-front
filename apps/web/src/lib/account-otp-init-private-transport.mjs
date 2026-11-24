const KEY=/^[A-Za-z0-9+/]{43}=$/;
const PROOF=/^v1\.[0-9a-f]{64}\.[0-9]{10,13}\.[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RESPONSE_BYTES=512;
const MAX_REQUEST_CONTACT_LENGTH=254;
const EMAIL=/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/;
const PHONE=/^\+[1-9][0-9]{7,14}$/;

export class AccountOtpInitiationUnavailable extends Error{
 constructor(){super('Account verification temporarily unavailable');}
}
const unavailable=()=>new AccountOtpInitiationUnavailable();
function endpoint(baseUrl,production){
 try{
  if(typeof baseUrl!=='string'||baseUrl.length>500||
     baseUrl.includes('\\')||baseUrl.includes('%'))throw Error();
  const url=new URL(baseUrl);
  if(!['http:','https:'].includes(url.protocol)||
     (production&&url.protocol!=='https:')||
     url.username||url.password||url.search||url.hash||
     !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?\/?$/.test(url.pathname))
   throw Error();
  url.pathname=url.pathname.replace(/\/$/,'')+'/auth/private/account/challenges';
  return url.toString();
 }catch{throw unavailable();}
}
function validateKey(key){
 if(typeof key!=='string'||!KEY.test(key))throw unavailable();
 const decoded=Buffer.from(key,'base64');
 if(decoded.length!==32||decoded.toString('base64')!==key)throw unavailable();
}
function validateInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='channel,contact,locale,purpose'||
    !['EMAIL','SMS'].includes(value.channel)||
    !['SIGN_IN','SIGN_UP'].includes(value.purpose)||
    !['kk','ru'].includes(value.locale)||
    typeof value.contact!=='string'||value.contact.length===0||
    value.contact.length>MAX_REQUEST_CONTACT_LENGTH||
    (value.channel==='EMAIL'&&!EMAIL.test(value.contact))||
    (value.channel==='SMS'&&!PHONE.test(value.contact)))
   throw unavailable();
 return {channel:value.channel,purpose:value.purpose,
  locale:value.locale,contact:value.contact};
}
async function strictReceipt(response){
 if(response.status!==201||response.headers.has('content-range')||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
     response.headers.get('content-type')??'')||
    !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(
     response.headers.get('cache-control')??'')||
    !response.body)throw unavailable();
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
    Number(length)>MAX_RESPONSE_BYTES))throw unavailable();
 const reader=response.body.getReader();
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let received=0,complete=false;
 let raw='';
 try{
  for(;;){
   const part=await reader.read();
   if(part.done){complete=true;break;}
   if(!(part.value instanceof Uint8Array))throw unavailable();
   received+=part.value.byteLength;
   if(received>MAX_RESPONSE_BYTES)throw unavailable();
   raw+=decoder.decode(part.value,{stream:true});
  }
  raw+=decoder.decode();
  const result=JSON.parse(raw);
  if(!result||typeof result!=='object'||Array.isArray(result)||
     Object.keys(result).sort().join(',')!=='challenge_id,expires_in_seconds'||
     typeof result.challenge_id!=='string'||!UUID.test(result.challenge_id)||
     result.expires_in_seconds!==300)throw unavailable();
  return {challengeId:result.challenge_id.toLowerCase(),expiresInSeconds:300};
 }finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
/**
 * Server-only caller must obtain the proof from a trusted, approved edge.
 * It must never relay an untrusted browser X-Services-Network-Proof header.
 * No public Next route invokes this transport until the ingress contract,
 * authentication bootstrap, anti-enumeration and vendor approval are ready.
 */
export async function initiateBackendAccountOtp({
 baseUrl,production=true,serviceKey,networkProof,channel,contact,
 purpose,locale,transport=fetch,
}){
 validateKey(serviceKey);
 if(typeof networkProof!=='string'||networkProof.length>160||
    !PROOF.test(networkProof))throw unavailable();
 const body=validateInput({channel,contact,purpose,locale});
 const url=endpoint(baseUrl,production);
 try{
  const response=await transport(url,{
   method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
   headers:{'Content-Type':'application/json',Accept:'application/json',
    'X-Services-Account-Login-Key':serviceKey,
    'X-Services-Network-Proof':networkProof},
   body:JSON.stringify(body),
   signal:AbortSignal.timeout(5000),
  });
  return await strictReceipt(response);
 }catch{
  // Provider failure or an uncertain response must never leak a contact,
  // challenge, code, vendor reference or the private backend body.
  throw unavailable();
 }
}
