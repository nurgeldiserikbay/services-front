const BEARER=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR=/^[A-Za-z0-9_-]{1,256}$/;
const STATES=new Set(['pending','accepted','declined','cancelled_by_customer',
  'cancelled_by_provider','cancelled_mutual','completed','expired']);
const RESPONSE_LIMIT=65536;

export class SellerTransportUnavailable extends Error{
  constructor(){super('Seller transport unavailable');}
}
export class SellerTransportUnauthorized extends Error{
  constructor(){super('Account session expired');}
}
function endpoint(baseUrl,production,path){
  if(typeof baseUrl!=='string'||baseUrl.length>500)throw new SellerTransportUnavailable();
  try{
    const url=new URL(baseUrl);
    if((url.protocol!=='https:'&&url.protocol!=='http:')||
       (production&&url.protocol!=='https:')||
       url.username||url.password||url.search||url.hash||
       url.pathname.includes('..')||url.pathname.endsWith('//'))
      throw new Error('unsafe backend url');
    url.pathname=url.pathname.replace(/\/$/,'')+path;
    return url;
  }catch{throw new SellerTransportUnavailable();}
}
function credentials(token){
  if(typeof token!=='string'||!BEARER.test(token))throw new SellerTransportUnavailable();
  return {Authorization:'Bearer '+token,Accept:'application/json'};
}
async function jsonResponse(response){
  if(response.status!==200||
     !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
    throw new SellerTransportUnavailable();
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>RESPONSE_LIMIT))
    throw new SellerTransportUnavailable();
  const body=await response.text();
  if(Buffer.byteLength(body,'utf8')>RESPONSE_LIMIT)throw new SellerTransportUnavailable();
  return JSON.parse(body);
}
/**
 * Server-only transport. The bearer is issued by verified account auth and
 * injected by a protected server caller; it must never be read from browser JS.
 * Backend validates seller membership/ACL; no seller ID is accepted here.
 */
export async function fetchSellerInbox({
  baseUrl,production=true,accountBearer,limit=20,state=null,cursor=null,transport=fetch,
}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>50||
     (state!==null&&!STATES.has(state))||
     (cursor!==null&&(typeof cursor!=='string'||!CURSOR.test(cursor))))
    throw new SellerTransportUnavailable();
  const url=endpoint(baseUrl,production,'/me/seller-requests');
  url.searchParams.set('limit',String(limit));
  if(state!==null)url.searchParams.set('state',state);
  if(cursor!==null)url.searchParams.set('cursor',cursor);
  try{
    const response=await transport(url.toString(),{
      method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
      headers:credentials(accountBearer),signal:AbortSignal.timeout(5000),
    });
    if(response.status===401)throw new SellerTransportUnauthorized();
    return await jsonResponse(response);
  }catch(error){
    if(error instanceof SellerTransportUnauthorized)throw error;
    throw new SellerTransportUnavailable();
  }
}

/**
 * Server-only decision transport. Requires immutable key from trusted caller;
 * server enforces If-Match, session, seller ACL and idempotency atomically.
 * For conflict/not-found/forbidden return a narrow category, not backend PII.
 */
export async function decideSellerRequest({
  baseUrl,production=true,accountBearer,requestId,version,decision,
  idempotencyKey,transport=fetch,
}){
  if(typeof requestId!=='string'||!UUID.test(requestId)||
     !Number.isSafeInteger(version)||version<1||version>9999999999||
     !['accept','decline'].includes(decision)||
     typeof idempotencyKey!=='string'||!UUID.test(idempotencyKey))
    throw new SellerTransportUnavailable();
  const url=endpoint(baseUrl,production,
    '/requests/'+requestId.toLowerCase()+'/'+decision);
  try{
    const response=await transport(url.toString(),{
      method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
      headers:{...credentials(accountBearer),'If-Match':'"'+version+'"',
        'Idempotency-Key':idempotencyKey},
      signal:AbortSignal.timeout(5000),
    });
    if(response.status===401)return {outcome:'unauthorized'};
    if(response.status===409)return {outcome:'conflict'};
    if(response.status===403)return {outcome:'forbidden'};
    if(response.status===404)return {outcome:'not_found'};
    const reply=await jsonResponse(response);
    if(!reply||typeof reply!=='object'||Array.isArray(reply)||
       !UUID.test(reply.id)||reply.id.toLowerCase()!==requestId.toLowerCase()||
       reply.state!==(decision==='accept'?'accepted':'declined')||
       !Number.isSafeInteger(reply.version)||reply.version<version||
       typeof reply.replayed!=='boolean')
      throw new SellerTransportUnavailable();
    return {outcome:'ok',id:reply.id,state:reply.state,
      version:reply.version,replayed:reply.replayed};
  }catch{throw new SellerTransportUnavailable();}
}
