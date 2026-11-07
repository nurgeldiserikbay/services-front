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
   u.username||u.password||u.search||u.hash||u.pathname.includes('..')||
   u.pathname.endsWith('//'))throw new Error('invalid_url');
  u.pathname=u.pathname.replace(/\/$/,'')+path;
  return u.toString();
 }catch{throw new AccountSessionTransportUnavailable();}
}
function headers(token){
 if(typeof token!=='string'||!BEARER.test(token))throw new AccountSessionTransportUnavailable();
 return {Authorization:'Bearer '+token,Accept:'application/json'};
}
function validateList(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
  Object.keys(payload).sort().join(',')!=='items'||!Array.isArray(payload.items)||
  payload.items.length>50)throw new AccountSessionTransportUnavailable();
 return {items:payload.items.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).sort().join(',')!=='current,deviceLabel,expiresAt,id,lastUsedAt'||
    typeof row.id!=='string'||!UUID.test(row.id)||
    !(row.deviceLabel===null||(typeof row.deviceLabel==='string'&&row.deviceLabel.length<=120))||
    !(row.lastUsedAt===null||(typeof row.lastUsedAt==='string'&&!Number.isNaN(Date.parse(row.lastUsedAt))))||
    typeof row.expiresAt!=='string'||Number.isNaN(Date.parse(row.expiresAt))||
    typeof row.current!=='boolean')throw new AccountSessionTransportUnavailable();
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
  const body=await response.text();
  if(Buffer.byteLength(body,'utf8')>MAX_BYTES)throw new AccountSessionTransportUnavailable();
  return validateList(JSON.parse(body));
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
