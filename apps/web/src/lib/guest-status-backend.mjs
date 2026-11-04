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
    if(!['https:','http:'].includes(url.protocol)||
      (production&&url.protocol!=='https:')||
      url.username||url.password||url.search||url.hash||
      url.pathname.includes('..')||url.pathname.endsWith('//')||
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
  const date=Date.parse(raw.created_at);
  if(!Number.isFinite(date)||raw.created_at.length>40)
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
    if(response.status!==200)throw new GuestStatusUnavailable();
    const contentType=response.headers.get('content-type')??'';
    if(!/^application\/json(?:\s*;|\s*$)/i.test(contentType))
      throw new GuestStatusUnavailable();
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||
      Number(length)>RESPONSE_LIMIT))throw new GuestStatusUnavailable();
    const text=await response.text();
    if(Buffer.byteLength(text,'utf8')>RESPONSE_LIMIT)throw new GuestStatusUnavailable();
    return parseStatus(JSON.parse(text),requestId);
  }catch{throw new GuestStatusUnavailable();}
}
