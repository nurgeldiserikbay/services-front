const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF=/^[A-Za-z0-9_-]{43}$/;
const MAX_RESPONSE_BYTES=16384;
export class AccountDeviceUnavailable extends Error{
 constructor(){super('Account devices temporarily unavailable');}
}
export class AccountDeviceAuthenticationRequired extends Error{
 constructor(){super('Account sign-in required');}
}
function validDate(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
  Number.isFinite(Date.parse(value));
}
export function parseAccountDeviceInventory(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
    Object.keys(data).sort().join(',')!=='csrf_token,items'||
    typeof data.csrf_token!=='string'||!CSRF.test(data.csrf_token)||
    !Array.isArray(data.items)||data.items.length>50)
  throw new AccountDeviceUnavailable();
 const seen=new Set();
 const items=data.items.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||
     Object.keys(item).sort().join(',')!=='current,deviceLabel,expiresAt,id,lastUsedAt'||
     typeof item.id!=='string'||!UUID.test(item.id)||seen.has(item.id.toLowerCase())||
     !(item.deviceLabel===null||(typeof item.deviceLabel==='string'&&item.deviceLabel.length<=120))||
     !(item.lastUsedAt===null||validDate(item.lastUsedAt))||
     !validDate(item.expiresAt)||typeof item.current!=='boolean')
   throw new AccountDeviceUnavailable();
  seen.add(item.id.toLowerCase());
  return {id:item.id,deviceLabel:item.deviceLabel,lastUsedAt:item.lastUsedAt,
   expiresAt:item.expiresAt,current:item.current};
 });
 if(items.filter(i=>i.current).length!==1)throw new AccountDeviceUnavailable();
 return {items,csrf:data.csrf_token};
}
async function boundedResponse(response){
 if(response.status===401)throw new AccountDeviceAuthenticationRequired();
 if(response.status!==200||
    !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
  throw new AccountDeviceUnavailable();
 const len=response.headers.get('content-length');
 if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_RESPONSE_BYTES))
  throw new AccountDeviceUnavailable();
 const body=await response.text();
 if(new TextEncoder().encode(body).length>MAX_RESPONSE_BYTES)
  throw new AccountDeviceUnavailable();
 try{return parseAccountDeviceInventory(JSON.parse(body));}
 catch{throw new AccountDeviceUnavailable();}
}
/** Browser calls only the same-origin BFF, never the backend bearer API. */
export async function loadAccountDevices({transport=fetch}={}){
 try{
  return await boundedResponse(await transport('/api/account/sessions',{
   method:'GET',cache:'no-store',credentials:'same-origin',redirect:'error',
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),
  }));
 }catch(error){
  if(error instanceof AccountDeviceAuthenticationRequired)throw error;
  throw new AccountDeviceUnavailable();
 }
}
/** Caller must pass a previously listed non-current session and CSRF token. */
export async function revokeOtherAccountDevice({sessionId,csrf,transport=fetch}){
 if(typeof sessionId!=='string'||!UUID.test(sessionId)||
    typeof csrf!=='string'||!CSRF.test(csrf))
  throw new AccountDeviceUnavailable();
 try{
  const response=await transport('/api/account/sessions/'+sessionId.toLowerCase(),{
   method:'DELETE',cache:'no-store',credentials:'same-origin',redirect:'error',
   headers:{'x-services-csrf':csrf,Accept:'application/json'},
   signal:AbortSignal.timeout(8000),
  });
  if(response.status===204)return 'ok';
  if(response.status===401||response.status===404)return 'authentication_required';
  if(response.status===409)return 'current_session';
  return 'unavailable';
 }catch{return 'unavailable';}
}
