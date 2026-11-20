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

/** Read only the authenticated identity summary. No client-selected IDs. */
export async function readBackendAccountMe({
 baseUrl,production=true,accountBearer,transport=fetch,
}){
 try{
  const response=await transport(endpoint(baseUrl,production,'/me'),{
   method:'GET',headers:headers(accountBearer),cache:'no-store',
   credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==200||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||
   /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||Number(length)>512))){
   if(response.body)void response.body.cancel().catch(()=>{});
   throw new AccountSessionTransportUnavailable();
  }
  const payload=await readBoundedJson(response);
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   Object.keys(payload).sort().join(',')!=='person_id,user_id'||
   typeof payload.user_id!=='string'||!UUID.test(payload.user_id)||
   typeof payload.person_id!=='string'||!UUID.test(payload.person_id))
   throw new AccountSessionTransportUnavailable();
  return {user_id:payload.user_id,person_id:payload.person_id};
 }catch{throw new AccountSessionTransportUnavailable();}
}

/** Read-only owner inventory; never forward a browser-selected bearer. */
export async function listBackendProfessionalProfiles({baseUrl,production=true,accountBearer,transport=fetch}){
 try{
  const response=await transport(endpoint(baseUrl,production,'/me/professional-profiles'),{
   method:'GET',headers:headers(accountBearer),cache:'no-store',credentials:'omit',
   redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==200||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||/(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))){
   if(response.body)void response.body.cancel().catch(()=>{});
   throw new AccountSessionTransportUnavailable();
  }
  const rows=await readBoundedJson(response);
  if(!Array.isArray(rows)||rows.length>100)throw new AccountSessionTransportUnavailable();
  const seen=new Set();
  return rows.map(row=>{
   if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).sort().join(',')!=='about,id,lifecycle_status,offers,profession_id,slug,title,version'||
    typeof row.id!=='string'||!UUID.test(row.id)||seen.has(row.id.toLowerCase())||
    typeof row.profession_id!=='string'||!UUID.test(row.profession_id)||
    !['draft','published','paused','archived'].includes(row.lifecycle_status)||
    typeof row.slug!=='string'||! /^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/.test(row.slug)||
    !(row.title===null||(typeof row.title==='string'&&Array.from(row.title).length<=180))||
    !(row.about===null||(typeof row.about==='string'&&Array.from(row.about).length<=3000))||
    !Number.isSafeInteger(row.version)||row.version<1||row.version>2147483647||
    !Array.isArray(row.offers)||row.offers.length>100)
    throw new AccountSessionTransportUnavailable();
   seen.add(row.id.toLowerCase());
   const offers=row.offers.map(o=>{
    if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!=='delivery_mode,id,price_label,title'||
     typeof o.id!=='string'||!UUID.test(o.id)||typeof o.title!=='string'||Array.from(o.title).length>200||
     !['at_location','at_customer','online','hybrid'].includes(o.delivery_mode)||
     !(o.price_label===null||(typeof o.price_label==='string'&&Array.from(o.price_label).length<=160)))
     throw new AccountSessionTransportUnavailable();
    return {id:o.id,title:o.title,delivery_mode:o.delivery_mode,price_label:o.price_label};
   });
   return {id:row.id,profession_id:row.profession_id,lifecycle_status:row.lifecycle_status,slug:row.slug,title:row.title,about:row.about,version:row.version,offers};
  });
 }catch{throw new AccountSessionTransportUnavailable();}
}

/** Creation response is a minimal draft receipt; no raw backend error is forwarded. */
export async function createBackendProfessionalProfile({baseUrl,production=true,accountBearer,professionId,idempotencyKey,transport=fetch}){
 if(typeof professionId!=='string'||!UUID.test(professionId)||typeof idempotencyKey!=='string'||!UUID.test(idempotencyKey))
  throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,'/me/professional-profiles'),{
   method:'POST',headers:{...headers(accountBearer),'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
   body:JSON.stringify({profession_id:professionId.toLowerCase()}),cache:'no-store',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status===409){if(response.body)void response.body.cancel().catch(()=>{});return 'conflict';}
  const cache=response.headers.get('cache-control')??'';
  if(response.status!==201||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||/(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)){
   if(response.body)void response.body.cancel().catch(()=>{});
   throw new AccountSessionTransportUnavailable();
  }
  const row=await readBoundedJson(response);
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='id,lifecycle_status,offers,profession_id,slug,title'||
   typeof row.id!=='string'||!UUID.test(row.id)||row.profession_id!==professionId.toLowerCase()||
   row.lifecycle_status!=='draft'||row.title!==null||row.slug!=='pro-'+row.id||
   !Array.isArray(row.offers)||row.offers.length!==0)throw new AccountSessionTransportUnavailable();
  return 'created';
 }catch{throw new AccountSessionTransportUnavailable();}
}

export function validProfessionalEdit(body){
 return !!body&&typeof body==='object'&&!Array.isArray(body)&&
 Object.keys(body).length>0&&Object.keys(body).every(k=>['title','about'].includes(k)&&typeof body[k]==='string'&&!body[k].includes('\0')&&Array.from(body[k]).length<=(k==='title'?180:3000));
}
export async function updateBackendProfessionalProfile({baseUrl,production=true,accountBearer,id,version,body,transport=fetch}){
 if(typeof id!=='string'||!UUID.test(id)||!Number.isSafeInteger(version)||version<1||version>=2147483647||!validProfessionalEdit(body))throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,'/me/professional-profiles/'+id.toLowerCase()),{
   method:'PATCH',headers:{...headers(accountBearer),'Content-Type':'application/json','If-Match':'"'+version+'"'},body:JSON.stringify(body),
   cache:'no-store',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status===409){if(response.body)void response.body.cancel().catch(()=>{});return 'conflict';}
  const cache=response.headers.get('cache-control')??'';
  if(response.status!==200||response.headers.has('content-range')||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||/(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)){
   if(response.body)void response.body.cancel().catch(()=>{});throw new AccountSessionTransportUnavailable();
  }
  const row=await readBoundedJson(response);
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='about,id,lifecycle_status,offers,profession_id,slug,title,version'||row.id!==id.toLowerCase()||row.version!==version+1||
   Object.keys(body).some(k=>row[k]!==body[k]))throw new AccountSessionTransportUnavailable();
  return 'updated';
 }catch{throw new AccountSessionTransportUnavailable();}
}


/** Private owner preview: reject redirects, public caching and arbitrary fields. */
export async function readBackendProfessionalProfilePreview({
 baseUrl,production=true,accountBearer,profileId,transport=fetch,
}){
 if(typeof profileId!=='string'||!UUID.test(profileId))throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,
   '/me/professional-profiles/'+profileId.toLowerCase()+'/preview'),{
   method:'GET',headers:headers(accountBearer),cache:'no-store',
   credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==200||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||
   /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^\d+$/.test(length)||Number(length)>4096))){
   if(response.body)void response.body.cancel().catch(()=>{});
   throw new AccountSessionTransportUnavailable();
  }
  const value=await readBoundedJson(response);
  const fields=['id','slug','profession_id','lifecycle_status','draft','published'];
  const validText=(value,max)=>value===null||(typeof value==='string'&&
   !value.includes('\0')&&Array.from(value).length<=max);
  const validRevision=(revision)=>revision&&typeof revision==='object'&&!Array.isArray(revision)&&
   Object.keys(revision).sort().join(',')==='about,title,version'&&
   validText(revision.title,180)&&validText(revision.about,3000)&&
   Number.isSafeInteger(revision.version)&&revision.version>=1&&revision.version<2147483647;
  if(!value||typeof value!=='object'||Array.isArray(value)||
   Object.keys(value).sort().join(',')!==fields.sort().join(',')||
   value.id!==profileId.toLowerCase()||
   typeof value.profession_id!=='string'||!UUID.test(value.profession_id)||
   typeof value.slug!=='string'||!/^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/.test(value.slug)||
   !['draft','published','paused','archived'].includes(value.lifecycle_status)||
   !validRevision(value.draft)||
   !(value.published===null||validRevision(value.published))||
   (value.published!==null&&value.published.version>value.draft.version))
   throw new AccountSessionTransportUnavailable();
  return {
   id:value.id,slug:value.slug,profession_id:value.profession_id,
   lifecycle_status:value.lifecycle_status,
   draft:{title:value.draft.title,about:value.draft.about,version:value.draft.version},
   published:value.published===null?null:{
    title:value.published.title,about:value.published.about,version:value.published.version,
   },
  };
 }catch{throw new AccountSessionTransportUnavailable();}
}

/** Strict publication receipt; never pass backend error details to the browser. */
export async function publishBackendProfessionalProfile({baseUrl,production=true,accountBearer,id,version,transport=fetch}){
 if(typeof id!=='string'||!UUID.test(id)||!Number.isSafeInteger(version)||version<1||version>=2147483646)
  throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,'/me/professional-profiles/'+id.toLowerCase()+'/publish'),{
   method:'POST',headers:{...headers(accountBearer),'Content-Type':'application/json','If-Match':'"'+version+'"'},
   body:'{}',cache:'no-store',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status===409){if(response.body)void response.body.cancel().catch(()=>{});return 'conflict';}
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==201||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||/(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^\d+$/.test(length)||Number(length)>512))){
   if(response.body)void response.body.cancel().catch(()=>{});
   throw new AccountSessionTransportUnavailable();
  }
  const row=await readBoundedJson(response);
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='id,lifecycle_status,published_version,version'||
   row.id!==id.toLowerCase()||row.lifecycle_status!=='published'||row.version!==version+1||row.published_version!==row.version)
   throw new AccountSessionTransportUnavailable();
  return 'published';
 }catch{throw new AccountSessionTransportUnavailable();}
}


/** Owner-only rejected decision lookup; an advisory read, not authorization. */
export async function readBackendAppealableProfileRejection({baseUrl,production=true,accountBearer,id,transport=fetch}){
 if(typeof id!=='string'||!UUID.test(id))throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,'/me/professional-profiles/'+id.toLowerCase()+'/appealable-rejection'),{
   method:'GET',headers:headers(accountBearer),cache:'no-store',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==200||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||/(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^\d+$/.test(length)||Number(length)>512)))throw new AccountSessionTransportUnavailable();
  const row=await readBoundedJson(response);
  if(row===null)return null;
  if(!row||typeof row!=='object'||Array.isArray(row)||
   Object.keys(row).sort().join(',')!=='decision_id,profile_id,profile_version'||
   row.profile_id!==id.toLowerCase()||typeof row.decision_id!=='string'||!UUID.test(row.decision_id)||
   !Number.isSafeInteger(row.profile_version)||row.profile_version<1||row.profile_version>2147483646)
   throw new AccountSessionTransportUnavailable();
  return {decision_id:row.decision_id,profile_id:row.profile_id,profile_version:row.profile_version};
 }catch{throw new AccountSessionTransportUnavailable();}
}
/** The backend validates owner, exact REJECT evidence and version again. */
export async function requestBackendProfessionalProfileAppeal({baseUrl,production=true,accountBearer,id,version,decisionId,transport=fetch}){
 if(typeof id!=='string'||!UUID.test(id)||typeof decisionId!=='string'||!UUID.test(decisionId)||
  !Number.isSafeInteger(version)||version<1||version>2147483646)throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,'/me/professional-profiles/'+id.toLowerCase()+'/appeals'),{
   method:'POST',headers:{...headers(accountBearer),'Content-Type':'application/json','If-Match':'"'+version+'"'},
   body:JSON.stringify({decision_id:decisionId.toLowerCase()}),
   cache:'no-store',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  if(response.status===409){if(response.body)void response.body.cancel().catch(()=>{});return 'conflict';}
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==201||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||/(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^\d+$/.test(length)||Number(length)>512)))throw new AccountSessionTransportUnavailable();
  const row=await readBoundedJson(response);
  if(!row||typeof row!=='object'||Array.isArray(row)||
   Object.keys(row).sort().join(',')!=='case_id,profile_id,profile_version,state'||
   row.profile_id!==id.toLowerCase()||row.profile_version!==version||row.state!=='appeal'||
   typeof row.case_id!=='string'||!UUID.test(row.case_id))throw new AccountSessionTransportUnavailable();
  return 'submitted';
 }catch{throw new AccountSessionTransportUnavailable();}
}

/**
 * Registered customer completion transport. The bearer comes exclusively from
 * the server-side sealed account session; no browser-supplied account ID.
 * A timed-out request has an unknown outcome: clients must refresh status,
 * never blindly assert completion or retry at a new version.
 */
export async function completeBackendCustomerRequest({
 baseUrl,production=true,accountBearer,requestId,version,transport=fetch,
}){
 if(typeof requestId!=='string'||!UUID.test(requestId)||
  !Number.isSafeInteger(version)||version<1||version>2147483646)
  throw new AccountSessionTransportUnavailable();
 const id=requestId.toLowerCase();
 try{
  const response=await transport(endpoint(baseUrl,production,
   '/account/requests/'+id+'/complete'),{
   method:'POST',
   headers:{...headers(accountBearer),'Content-Type':'application/json',
    'If-Match':'"'+version+'"'},
   body:'{}',cache:'no-store',credentials:'omit',redirect:'manual',
   signal:AbortSignal.timeout(5000),
  });
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
  if(response.status!==200||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
    response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||
   /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
    Number(length)>512))){
   if(response.body)void response.body.cancel().catch(()=>{});
   throw new AccountSessionTransportUnavailable();
  }
  const payload=await readBoundedJson(response);
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   Object.keys(payload).sort().join(',')!=='id,state,version'||
   payload.id!==id||payload.state!=='completed'||payload.version!==version+1)
   throw new AccountSessionTransportUnavailable();
  return {kind:'completed',id,version:payload.version};
 }catch{throw new AccountSessionTransportUnavailable();}
}

/** Registered customer request inventory: no seller/contact/private notes. */
export async function listBackendCustomerRequests({
 baseUrl,production=true,accountBearer,cursor=null,transport=fetch,
}){
 if(cursor!==null&&(typeof cursor!=='string'||cursor.length===0||
  cursor.length>180||!/^[A-Za-z0-9_-]+$/.test(cursor)))
  throw new AccountSessionTransportUnavailable();
 try{
  const response=await transport(endpoint(baseUrl,production,
    '/account/requests')+(cursor?'?cursor='+encodeURIComponent(cursor):''),{
   method:'GET',headers:headers(accountBearer),cache:'no-store',
   credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(5000),
  });
  const cache=response.headers.get('cache-control')??'';
  const length=response.headers.get('content-length');
  if(response.status!==200||response.headers.has('content-range')||
   !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
    response.headers.get('content-type')??'')||
   !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||
   /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache)||
   (length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
    Number(length)>MAX_BYTES))){
   if(response.body)void response.body.cancel().catch(()=>{});
   throw new AccountSessionTransportUnavailable();
  }
  const row=await readBoundedJson(response);
  if(!row||typeof row!=='object'||Array.isArray(row)||
   Object.keys(row).sort().join(',')!=='items,next_cursor'||
   !Array.isArray(row.items)||row.items.length>20||
   !(row.next_cursor===null||(typeof row.next_cursor==='string'&&
    /^[A-Za-z0-9_-]{1,180}$/.test(row.next_cursor))))
   throw new AccountSessionTransportUnavailable();
  const states=new Set(['pending','accepted','declined',
   'cancelled_by_customer','cancelled_by_provider','cancelled_mutual',
   'completed','expired']);
  const seen=new Set();
  const items=row.items.map(x=>{
   if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).sort().join(',')!=='created_at,id,state,version'||
    typeof x.id!=='string'||!UUID.test(x.id)||x.id!==x.id.toLowerCase()||
    seen.has(x.id)||!states.has(x.state)||
    !Number.isSafeInteger(x.version)||x.version<1||
    !validUtcDate(x.created_at))
    throw new AccountSessionTransportUnavailable();
   seen.add(x.id);
   return {id:x.id,state:x.state,version:x.version,created_at:x.created_at};
  });
  return {items,next_cursor:row.next_cursor};
 }catch{throw new AccountSessionTransportUnavailable();}
}
