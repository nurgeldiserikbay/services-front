const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BEARER=/^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY=/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const MAX_RESPONSE_BYTES=512;
export const MAX_REQUEST_BYTES=1200;

export class CustomerCreateTransportUnavailable extends Error{
 constructor(){super('Customer request creation unavailable');}
}
export function validateCustomerCreateBody(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).sort().join(',')!=='consent_to_contact,note,service_offer_id'||
  typeof raw.service_offer_id!=='string'||!UUID.test(raw.service_offer_id)||
  raw.consent_to_contact!==true||
  !(raw.note===null||(typeof raw.note==='string'&&
    raw.note.length<=1000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw.note))))
  throw new CustomerCreateTransportUnavailable();
 return {service_offer_id:raw.service_offer_id.toLowerCase(),
  note:raw.note,consent_to_contact:true};
}
export function parseCustomerCreateBytes(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||
  bytes.byteLength>MAX_REQUEST_BYTES)
  throw new CustomerCreateTransportUnavailable();
 try{
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return validateCustomerCreateBody(value);
 }catch{throw new CustomerCreateTransportUnavailable();}
}
export async function readCustomerCreateBody(stream,signal){
 if(!stream)throw new CustomerCreateTransportUnavailable();
 const reader=stream.getReader();
 let count=0,done=false;
 const chunks=[];
 try{
  while(true){
   if(signal?.aborted)throw new CustomerCreateTransportUnavailable();
   const item=await reader.read();
   if(item.done){done=true;break;}
   if(!(item.value instanceof Uint8Array))throw new CustomerCreateTransportUnavailable();
   count+=item.value.byteLength;
   if(count>MAX_REQUEST_BYTES)throw new CustomerCreateTransportUnavailable();
   chunks.push(item.value);
  }
  const all=new Uint8Array(count);
  let pos=0;
  for(const chunk of chunks){all.set(chunk,pos);pos+=chunk.length;}
  return all;
 }catch{throw new CustomerCreateTransportUnavailable();}
 finally{
  if(!done)void reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
function endpoint(baseUrl,production){
 try{
  if(typeof baseUrl!=='string'||baseUrl.length>500||baseUrl.includes('\\')||
   baseUrl.includes('%'))throw Error();
  const url=new URL(baseUrl);
  if(!['https:','http:'].includes(url.protocol)||
   (production&&url.protocol!=='https:')||url.username||url.password||
   url.search||url.hash||!/^(?:\/(?:[A-Za-z0-9_-]+)*)?\/?$/.test(url.pathname))
   throw Error();
  url.pathname=url.pathname.replace(/\/$/,'')+'/account/requests';
  return url.toString();
 }catch{throw new CustomerCreateTransportUnavailable();}
}
async function boundedJson(response){
 if(!response.body)throw new CustomerCreateTransportUnavailable();
 const reader=response.body.getReader();
 let count=0,complete=false;
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let text='';
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done){complete=true;break;}
   if(!(value instanceof Uint8Array))throw new CustomerCreateTransportUnavailable();
   count+=value.byteLength;
   if(count>MAX_RESPONSE_BYTES)throw new CustomerCreateTransportUnavailable();
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  return JSON.parse(text);
 }finally{
  if(!complete)void reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
/** Called only on the BFF server, with a token recovered from a sealed cookie. */
export async function createBackendCustomerRequest({
 baseUrl,production=true,accountBearer,idempotencyKey,body,transport=fetch,
}){
 if(typeof accountBearer!=='string'||!BEARER.test(accountBearer)||
  typeof idempotencyKey!=='string'||!IDEMPOTENCY.test(idempotencyKey))
  throw new CustomerCreateTransportUnavailable();
 const normalized=validateCustomerCreateBody(body);
 try{
  const response=await transport(endpoint(baseUrl,production),{
   method:'POST',headers:{Authorization:'Bearer '+accountBearer,
    'Idempotency-Key':idempotencyKey,'Content-Type':'application/json',
    Accept:'application/json'},
   body:JSON.stringify(normalized),credentials:'omit',cache:'no-store',
   redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status===429){
   if(response.body)void response.body.cancel().catch(()=>{});
   return {kind:'rate_limited'};
  }
  if(response.status===409){
   if(response.body)void response.body.cancel().catch(()=>{});
   return {kind:'conflict'};
  }
  if(response.status===404){
   if(response.body)void response.body.cancel().catch(()=>{});
   return {kind:'not_found'};
  }
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==201||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
    response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||
   /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
    Number(length)>MAX_RESPONSE_BYTES)))
   throw new CustomerCreateTransportUnavailable();
  const receipt=await boundedJson(response);
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
   Object.keys(receipt).sort().join(',')!=='id,state,version'||
   typeof receipt.id!=='string'||!UUID.test(receipt.id)||
   receipt.state!=='pending'||receipt.version!==1)
   throw new CustomerCreateTransportUnavailable();
  return {kind:'created',id:receipt.id.toLowerCase(),version:1};
 }catch{throw new CustomerCreateTransportUnavailable();}
}
