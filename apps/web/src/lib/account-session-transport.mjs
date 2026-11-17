const BEARER=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES=16384;
export class AccountSessionTransportUnavailable extends Error {
 constructor(){super('Account session transport unavailable');}
}
function endpoint(baseUrl,production,path){
 if(typeof baseUrl!=='string'||baseUrl.length>500)throw new AccountSessionTransportUnavailable();
 try{
  const u=new URL(baseUrl);
  if(!['https:','http:'].includes(u.protocol)||(production&&u.protocol!=='https:')||
   u.username||u.password||u.search||u.hash||
   !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?\/?$/.test(u.pathname)||
   baseUrl.includes('\\')||baseUrl.includes('%')||
   /\/\.{1,2}(?:\/|$)/.test(baseUrl))throw new Error('invalid_url');
  u.pathname=u.pathname.replace(/\/$/,'')+path;
  return u.toString();
 }catch{throw new AccountSessionTransportUnavailable();}
}
function headers(token){
 if(typeof token!=='string'||!BEARER.test(token))throw new AccountSessionTransportUnavailable();
 return {Authorization:'Bearer '+token,Accept:'application/json'};
}
async function readBoundedJson(response){
 if(!response.body)throw new AccountSessionTransportUnavailable();
 const reader=response.body.getReader();
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0;
 let text='';
 let complete=false;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done){complete=true;break;}
   if(!(value instanceof Uint8Array))throw new AccountSessionTransportUnavailable();
   bytes+=value.byteLength;
   if(bytes>MAX_BYTES)throw new AccountSessionTransportUnavailable();
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  return JSON.parse(text);
 }finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
function validUtcDate(value){
 return typeof value==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}
function validateList(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
  Object.keys(payload).sort().join(',')!=='items'||!Array.isArray(payload.items)||
  payload.items.length>50)throw new AccountSessionTransportUnavailable();
 const seen=new Set();
 return {items:payload.items.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).sort().join(',')!=='current,deviceLabel,expiresAt,id,lastUsedAt'||
    typeof row.id!=='string'||!UUID.test(row.id)||seen.has(row.id.toLowerCase())||
    !(row.deviceLabel===null||(typeof row.deviceLabel==='string'&&row.deviceLabel.length<=120))||
    !(row.lastUsedAt===null||validUtcDate(row.lastUsedAt))||
    !validUtcDate(row.expiresAt)||
    typeof row.current!=='boolean')throw new AccountSessionTransportUnavailable();
  seen.add(row.id.toLowerCase());
  return {id:row.id,deviceLabel:row.deviceLabel,lastUsedAt:row.lastUsedAt,
    expiresAt:row.expiresAt,current:row.current};
 })};
}
/** Never return Authorization or raw backend body to a browser. */
export async function listBackendAccountSessions({
 baseUrl,production=true,accountBearer,transport=fetch,
}){
 try{
  const response=await transport(endpoint(baseUrl,production,'/auth/sessions'),{
   method:'GET',headers:headers(accountBearer),cache:'no-store',
   credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status!==200||
    !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
   throw new AccountSessionTransportUnavailable();
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))
   throw new AccountSessionTransportUnavailable();
  return validateList(await readBoundedJson(response));
 }catch{throw new AccountSessionTransportUnavailable();}
}
export async function revokeBackendAccountSession({
 baseUrl,production=true,accountBearer,transport=fetch,
}){
 try{
  const response=await transport(endpoint(baseUrl,production,'/auth/logout'),{
   method:'POST',headers:headers(accountBearer),cache:'no-store',
   credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status!==204)throw new AccountSessionTransportUnavailable();
  return true;
 }catch{throw new AccountSessionTransportUnavailable();}
}

/**
 * Server-only authenticated remote logout. Never send a browser-supplied
 * bearer or user ID. Accept only 204, reject all redirects and response bodies.
 */
export async function revokeBackendAccountSessionById({
 baseUrl,production=true,accountBearer,sessionId,transport=fetch,
}){
 if(typeof sessionId!=='string'||!UUID.test(sessionId))
  throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,
   '/auth/sessions/'+sessionId.toLowerCase()),{
   method:'DELETE',headers:headers(accountBearer),cache:'no-store',
   credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status!==204)throw new AccountSessionTransportUnavailable();
  return true;
 }catch{throw new AccountSessionTransportUnavailable();}
}
