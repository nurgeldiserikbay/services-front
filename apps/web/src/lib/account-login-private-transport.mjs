const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9+/]{43}=$/;
const MAX_BYTES=2048;
const MAX_SESSION_TTL=43200;

export class AccountLoginTransportUnavailable extends Error {
 constructor(){super('Account verification unavailable');}
}
export class AccountLoginTransportDenied extends Error {
 constructor(){super('Invalid or expired verification');}
}

/** A private transport: never called with a browser-provided backend URL or key. */
export async function verifyBackendAccountOtp({
 baseUrl,production=true,serviceKey,challengeId,channel,code,transport=fetch,
}){
 if(typeof serviceKey!=='string'||!KEY.test(serviceKey)||
  Buffer.from(serviceKey,'base64').length!==32||
  Buffer.from(serviceKey,'base64').toString('base64')!==serviceKey||
  typeof challengeId!=='string'||!UUID.test(challengeId)||
  (channel!=='EMAIL'&&channel!=='SMS')||
  typeof code!=='string'||!/^[0-9]{6}$/.test(code))
  throw new AccountLoginTransportUnavailable();
 let url;
 try{
  const parsed=new URL(baseUrl);
  if(typeof baseUrl!=='string'||baseUrl.length>500||
   (parsed.protocol!=='https:'&&parsed.protocol!=='http:')||
   (production&&parsed.protocol!=='https:')||
   parsed.username||parsed.password||parsed.search||parsed.hash||
   !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?\/?$/.test(parsed.pathname)||
   baseUrl.includes('\\')||baseUrl.includes('%'))
   throw new Error('unsafe_base');
  parsed.pathname=parsed.pathname.replace(/\/$/,'')+'/auth/private/account/verify';
  url=parsed.toString();
 }catch{throw new AccountLoginTransportUnavailable();}
 try{
  const response=await transport(url,{
   method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
   headers:{'Content-Type':'application/json',Accept:'application/json',
    'X-Services-Account-Login-Key':serviceKey},
   body:JSON.stringify({challenge_id:challengeId.toLowerCase(),channel,code}),
   signal:AbortSignal.timeout(5000),
  });
  if(response.status===401)throw new AccountLoginTransportDenied();
  if(response.status!==200||
   !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
   throw new AccountLoginTransportUnavailable();
  const len=response.headers.get('content-length');
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_BYTES))
   throw new AccountLoginTransportUnavailable();
  if(!response.body)throw new AccountLoginTransportUnavailable();
  const reader=response.body.getReader();
  const parts=[];let size=0,done=false;
  try{
   for(;;){
    const chunk=await reader.read();
    if(chunk.done){done=true;break;}
    size+=chunk.value.byteLength;
    if(size>MAX_BYTES)throw new AccountLoginTransportUnavailable();
    parts.push(chunk.value);
   }
  }finally{
   if(!done)await reader.cancel().catch(()=>{});
   reader.releaseLock();
  }
  const bytes=new Uint8Array(size);let off=0;
  for(const part of parts){bytes.set(part,off);off+=part.byteLength;}
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!data||typeof data!=='object'||Array.isArray(data)||
   Object.keys(data).sort().join(',')!=='expires_in_seconds,session_token'||
   typeof data.session_token!=='string'||!TOKEN.test(data.session_token)||
   !Number.isSafeInteger(data.expires_in_seconds)||
   data.expires_in_seconds<1||data.expires_in_seconds>MAX_SESSION_TTL)
   throw new AccountLoginTransportUnavailable();
  return {sessionToken:data.session_token,expiresInSeconds:data.expires_in_seconds};
 }catch(error){
  if(error instanceof AccountLoginTransportDenied)throw error;
  // Never propagate contact, provider, token or HTTP response body in errors.
  throw new AccountLoginTransportUnavailable();
 }
}
