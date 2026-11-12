const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES=new Set(['pending','accepted','declined','completed','expired',
  'cancelled_by_customer','cancelled_by_provider','cancelled_mutual']);
export const MAX_STATUS_BYTES=2048;
const UTC_ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function validUtcInstant(value){
 if(typeof value!=='string'||!UTC_ISO.test(value))return false;
 const date=new Date(value);
 return Number.isFinite(date.getTime())&&date.toISOString()===value;
}

/**
 * The browser may display only a status for the exact committed receipt.
 * Reject unknown fields rather than accidentally displaying private data.
 */
export function parsePrivateGuestStatus(value,expectedRequestId,expectedOfferId){
  if(typeof expectedRequestId!=='string'||!UUID.test(expectedRequestId)||
     typeof expectedOfferId!=='string'||!UUID.test(expectedOfferId)||
     !value||typeof value!=='object'||Array.isArray(value))
    throw new Error('guest_status_unavailable');
  const keys=Object.keys(value);
  if(keys.length!==5||
     keys.some(key=>!['id','service_offer_id','state','version','created_at'].includes(key))||
     typeof value.id!=='string'||!UUID.test(value.id)||
     value.id.toLowerCase()!==expectedRequestId.toLowerCase()||
     typeof value.service_offer_id!=='string'||!UUID.test(value.service_offer_id)||
     value.service_offer_id.toLowerCase()!==expectedOfferId.toLowerCase()||
     typeof value.state!=='string'||!STATES.has(value.state)||
     !Number.isSafeInteger(value.version)||value.version<1||
     !validUtcInstant(value.created_at))
    throw new Error('guest_status_unavailable');
  return {id:value.id.toLowerCase(),state:value.state,
    version:value.version,createdAt:value.created_at};
}
export function privateGuestStatusUrl(id){
  if(typeof id!=='string'||!UUID.test(id))throw new Error('guest_status_unavailable');
  return '/api/guest-requests/'+id.toLowerCase()+'/status';
}
export async function readPrivateGuestStatusResponse(response,expectedId,expectedOfferId){
  if(!response||response.status!==200)
    throw new Error('guest_status_unavailable');
  let contentType,declared;
  try{
    contentType=response.headers.get('content-type');
    declared=response.headers.get('content-length');
  }catch{
    throw new Error('guest_status_unavailable');
  }
  if(typeof contentType!=='string'||
     !/^application\/json(?:\s*;|\s*$)/i.test(contentType))
    throw new Error('guest_status_unavailable');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_STATUS_BYTES))
    throw new Error('guest_status_unavailable');
  // Bound the actual stream before decoding: Content-Length is untrusted and
  // response.text() would buffer an arbitrarily large private backend reply.
  let data;
  let body;
  try{body=response.body;}catch{throw new Error('guest_status_unavailable');}
  if(body&&typeof body.getReader==='function'){
    let reader;
    try{reader=body.getReader();}
    catch{throw new Error('guest_status_unavailable');}
    const chunks=[];
    let total=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array))throw new Error('guest_status_unavailable');
        total+=value.byteLength;
        if(total>MAX_STATUS_BYTES)throw new Error('guest_status_unavailable');
        chunks.push(value);
      }
    }catch{
      // Cancellation is best-effort: a hostile or stalled upstream must not
      // keep an already-rejected response pending indefinitely.
      try{void reader.cancel().catch(()=>{});}catch{}
      throw new Error('guest_status_unavailable');
    }finally{
      // A malformed stream implementation may also throw while releasing its
      // lock. Never leak transport internals into the public guest-status UI.
      try{reader.releaseLock();}
      catch{throw new Error('guest_status_unavailable');}
    }
    const bytes=new Uint8Array(total);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{data=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
    catch{throw new Error('guest_status_unavailable')}
  }else{
    // Test doubles without a ReadableStream still receive post-read bounds.
    // Normalize transport failures to the same non-sensitive public error.
    try{
      data=await response.text();
      if(typeof data!=='string'||
         new TextEncoder().encode(data).byteLength>MAX_STATUS_BYTES)
        throw new Error('guest_status_unavailable');
    }catch{
      throw new Error('guest_status_unavailable');
    }
  }
  try{return parsePrivateGuestStatus(JSON.parse(data),expectedId,expectedOfferId);}
  catch{throw new Error('guest_status_unavailable');}
}

/** Only a strictly newer server version may replace a displayed status. */
export function shouldReplaceGuestStatus(currentVersion,nextVersion){
  return Number.isSafeInteger(nextVersion)&&nextVersion>=1&&
    (currentVersion===null||
      (Number.isSafeInteger(currentVersion)&&currentVersion>=1&&nextVersion>currentVersion));
}
