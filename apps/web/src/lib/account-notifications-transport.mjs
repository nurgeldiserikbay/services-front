const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_BYTES=32768;
export class NotificationTransportUnavailable extends Error{
 constructor(){super('Notifications unavailable');}
}
export class NotificationTransportUnauthorized extends Error{
 constructor(){super('Account authorization required');}
}
export function validateNotificationInbox(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).join(',')!=='items'||!Array.isArray(value.items)||
  value.items.length>50)throw new NotificationTransportUnavailable();
 return {items:value.items.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||
   Object.keys(item).sort().join(',')!=='created_at,id,subject_id,topic'||
   typeof item.id!=='string'||!UUID.test(item.id)||
   typeof item.subject_id!=='string'||!UUID.test(item.subject_id)||
   typeof item.topic!=='string'||!/^[-._a-z0-9]{1,100}$/.test(item.topic)||
   typeof item.created_at!=='string'||!ISO.test(item.created_at)||
   !Number.isFinite(Date.parse(item.created_at))||
   new Date(item.created_at).toISOString()!==item.created_at)
   throw new NotificationTransportUnavailable();
  return {id:item.id,topic:item.topic,subject_id:item.subject_id,
   created_at:item.created_at};
 })};
}
export async function fetchAccountNotifications({
 baseUrl,production=true,accountBearer,limit=20,transport=fetch,
}){
 if(typeof baseUrl!=='string'||baseUrl.length>500||
  typeof accountBearer!=='string'||!TOKEN.test(accountBearer)||
  !Number.isSafeInteger(limit)||limit<1||limit>50)
  throw new NotificationTransportUnavailable();
 let url;
 try{
  url=new URL(baseUrl);
  if(!['https:','http:'].includes(url.protocol)||
   (production&&url.protocol!=='https:')||
   url.username||url.password||url.search||url.hash||
   url.pathname.includes('..')||url.pathname.endsWith('//'))
   throw Error('unsafe_url');
  url.pathname=url.pathname.replace(/\/$/,'')+'/me/notifications';
  url.searchParams.set('limit',String(limit));
 }catch{throw new NotificationTransportUnavailable();}
 try{
  const response=await transport(url.toString(),{
   method:'GET',credentials:'omit',cache:'no-store',redirect:'manual',
   headers:{Authorization:'Bearer '+accountBearer,Accept:'application/json'},
   signal:AbortSignal.timeout(5000),
  });
  if(response.status===401)throw new NotificationTransportUnauthorized();
  if(response.status!==200||
   !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
   throw new NotificationTransportUnavailable();
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES))
   throw new NotificationTransportUnavailable();
  if(!response.body)throw new NotificationTransportUnavailable();
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>MAX_BYTES)throw new NotificationTransportUnavailable();
    chunks.push(value);
   }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  return validateNotificationInbox(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }catch(error){
  if(error instanceof NotificationTransportUnauthorized)throw error;
  throw new NotificationTransportUnavailable();
 }
}
