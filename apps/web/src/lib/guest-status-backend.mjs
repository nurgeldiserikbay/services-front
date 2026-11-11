const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY=/^[A-Za-z0-9_-]{43}$/;
const STATES=new Set(['pending','accepted','declined','completed','expired',
  'cancelled_by_customer','cancelled_by_provider','cancelled_mutual']);
const RESPONSE_LIMIT=4096;

export class GuestStatusUnavailable extends Error{
  constructor(){super('Guest request status is unavailable');}
}

function endpoint(base,requestId,production){
  if(typeof base!=='string'||base.length>500)throw new GuestStatusUnavailable();
  try{
    const url=new URL(base);
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if((url.protocol!=='https:'&&!(local&&!production&&url.protocol==='http:'))||
      url.username||url.password||url.search||url.hash||
      url.pathname.includes('..')||url.pathname.endsWith('//')||
      // A trailing slash is fine, but an internal double slash or encoded
      // separator can make upstream routing differ from our intended path.
      /%2f|%5c/i.test(url.pathname)||url.pathname.includes('//')||
      !UUID.test(requestId))throw new GuestStatusUnavailable();
    url.pathname=url.pathname.replace(/\/$/,'')+
      '/requests/'+requestId.toLowerCase();
    return url.toString();
  }catch{throw new GuestStatusUnavailable();}
}

function parseStatus(raw,expectedId){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new GuestStatusUnavailable();
  const keys=Object.keys(raw);
  if(keys.length!==5||
    keys.some(k=>!['id','service_offer_id','state','version','created_at'].includes(k))||
    typeof raw.id!=='string'||!UUID.test(raw.id)||
    raw.id.toLowerCase()!==expectedId.toLowerCase()||
    typeof raw.service_offer_id!=='string'||!UUID.test(raw.service_offer_id)||
    typeof raw.state!=='string'||!STATES.has(raw.state)||
    !Number.isSafeInteger(raw.version)||raw.version<1||
    typeof raw.created_at!=='string')throw new GuestStatusUnavailable();
  // Match the browser DTO contract exactly. Date.parse alone normalizes
  // invalid calendar days and accepts ambiguous, non-UTC timestamps.
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.created_at))
    throw new GuestStatusUnavailable();
  const date=new Date(raw.created_at);
  if(!Number.isFinite(date.getTime())||date.toISOString()!==raw.created_at)
    throw new GuestStatusUnavailable();
  return {id:raw.id.toLowerCase(),
    serviceOfferId:raw.service_offer_id.toLowerCase(),
    state:raw.state,version:raw.version,createdAt:raw.created_at};
}

/**
 * Internal HTTPS BFF read only. The capability must be read from a validated
 * HttpOnly session, never from browser JS or a URL. Redirects and large or
 * unrecognized responses are rejected instead of being forwarded.
 */
export async function readGuestRequestStatus({
  baseUrl,production=false,requestId,requestCapability,
  transport=fetch,
}){
  if(typeof requestId!=='string'||!UUID.test(requestId)||
    typeof requestCapability!=='string'||!CAPABILITY.test(requestCapability))
    throw new GuestStatusUnavailable();
  const url=endpoint(baseUrl,requestId,production);
  try{
    const response=await transport(url,{
      method:'GET',cache:'no-store',redirect:'manual',
      credentials:'omit',
      headers:{Accept:'application/json','Guest-Capability':requestCapability},
      signal:AbortSignal.timeout(5000),
    });
    // Denied upstream responses may still carry a streaming body. Cancel it
    // without waiting for an uncooperative server to finish cancellation.
    const rejectResponse=()=>{
      if(response.body){
        try{void response.body.cancel().catch(()=>{});}catch{}
      }
      throw new GuestStatusUnavailable();
    };
    if(response.status!==200)rejectResponse();
    const contentType=response.headers.get('content-type')??'';
    if(!/^application\/json(?:\s*;|\s*$)/i.test(contentType))
      rejectResponse();
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||
      Number(length)>RESPONSE_LIMIT))rejectResponse();
    // Content-Length can be absent or forged. Limit bytes while streaming,
    // before buffering or decoding a private upstream response.
    let text;
    if(response.body&&typeof response.body.getReader==='function'){
      const reader=response.body.getReader();
      const chunks=[];
      let total=0;
      let complete=false;
      try{
        while(true){
          const {done,value}=await reader.read();
          if(done){complete=true;break;}
          if(!(value instanceof Uint8Array))throw new GuestStatusUnavailable();
          total+=value.byteLength;
          if(total>RESPONSE_LIMIT)throw new GuestStatusUnavailable();
          chunks.push(value);
        }
      }finally{
        if(!complete){
          try{void reader.cancel().catch(()=>{});}catch{}
        }
        reader.releaseLock();
      }
      const bytes=new Uint8Array(total);
      let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }else{
      // Compatibility with injected test transports without stream support.
      text=await response.text();
      if(Buffer.byteLength(text,'utf8')>RESPONSE_LIMIT)throw new GuestStatusUnavailable();
    }
    return parseStatus(JSON.parse(text),requestId);
  }catch{throw new GuestStatusUnavailable();}
}
