const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const CAPABILITY=/^[A-Za-z0-9_-]{43}$/;
const LIMIT=8192;

export class GuestCreateUnavailable extends Error{
  constructor(){super('Guest request is temporarily unavailable');}
}

function normalizeBackendUrl(base,production){
  if(typeof base!=='string'||base.length>500)throw new GuestCreateUnavailable();
  try{
    const url=new URL(base);
    if(!['https:','http:'].includes(url.protocol) ||
      (production&&url.protocol!=='https:') ||
      url.username||url.password||url.search||url.hash||
      url.pathname.includes('..') ||
      url.pathname.endsWith('//'))throw new GuestCreateUnavailable();
    url.pathname=url.pathname.replace(/\/$/,'')+'/guest-requests';
    return url.toString();
  }catch{throw new GuestCreateUnavailable();}
}

function validateBody(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['service_offer_id','note','consent_to_contact'].includes(k))||
    typeof raw.service_offer_id!=='string'||!UUID.test(raw.service_offer_id)||
    raw.consent_to_contact!==true||
    (raw.note!==undefined&&(typeof raw.note!=='string'||
      raw.note.length>1000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw.note))))
    throw new GuestCreateUnavailable();
  return {service_offer_id:raw.service_offer_id.toLowerCase(),
    consent_to_contact:true,
    ...(raw.note===undefined?{}:{note:raw.note.trim()})};
}
function parseCommitted(raw,now){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new GuestCreateUnavailable();
  const keys=Object.keys(raw);
  if(keys.length!==4||keys.some(k=>!['id','state','request_capability','expires_at'].includes(k))||
    typeof raw.id!=='string'||!UUID.test(raw.id)||raw.state!=='pending'||
    typeof raw.request_capability!=='string'||!CAPABILITY.test(raw.request_capability)||
    typeof raw.expires_at!=='string')throw new GuestCreateUnavailable();
  const expiresAt=Date.parse(raw.expires_at);
  if(!Number.isFinite(expiresAt)||expiresAt<=now||
    expiresAt>now+24*60*60*1000+5000)throw new GuestCreateUnavailable();
  return {id:raw.id.toLowerCase(),state:'pending',
    requestCapability:raw.request_capability,expiresAt:raw.expires_at};
}

/**
 * Trusted BFF-to-backend transport only: never call this from client code.
 * The proof must originate from a verified server-side guest session.
 * The response holds a READ_CANCEL secret and must never be sent as JSON
 * to the browser; a caller must immediately seal it in a HttpOnly cookie.
 */
export async function sendVerifiedGuestCreate({
  baseUrl,production=false,createCapability,idempotencyKey,body,
  transport=fetch,now=Date.now(),
}){
  if(typeof createCapability!=='string'||!CAPABILITY.test(createCapability)||
    typeof idempotencyKey!=='string'||!KEY.test(idempotencyKey)||
    !Number.isSafeInteger(now))throw new GuestCreateUnavailable();
  const url=normalizeBackendUrl(baseUrl,production);
  const validated=validateBody(body);
  try{
    const response=await transport(url,{
      method:'POST',
      cache:'no-store',
      redirect:'manual',
      credentials:'omit',
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        'Guest-Capability':createCapability,
        'Idempotency-Key':idempotencyKey,
      },
      body:JSON.stringify(validated),
      signal:AbortSignal.timeout(5000),
    });
    if(response.status!==201)throw new GuestCreateUnavailable();
    const contentType=response.headers.get('content-type')??'';
    if(!/^application\/json(?:\s*;|\s*$)/i.test(contentType))
      throw new GuestCreateUnavailable();
    const contentLength=response.headers.get('content-length');
    if(contentLength!==null&&(!/^\d+$/.test(contentLength)||Number(contentLength)>LIMIT))
      throw new GuestCreateUnavailable();
    const text=await response.text();
    if(text.length>LIMIT)throw new GuestCreateUnavailable();
    return parseCommitted(JSON.parse(text),now);
  }catch{throw new GuestCreateUnavailable();}
}
