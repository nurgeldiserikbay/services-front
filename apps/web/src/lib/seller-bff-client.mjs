const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF=/^[A-Za-z0-9_-]{43}$/;
const CURSOR=/^[A-Za-z0-9_-]{1,256}$/;
const STATES=new Set(['pending','accepted','declined','cancelled_by_customer',
  'cancelled_by_provider','cancelled_mutual','completed','expired']);
const MAX_RESPONSE=65536;

export class SellerClientUnavailable extends Error{
  constructor(){super('Seller inbox unavailable');}
}
function validItem(item){
  return item&&typeof item==='object'&&!Array.isArray(item)&&
    Object.keys(item).sort().join(',')===
      'createdAt,desiredStartAt,id,sellerKind,serviceOfferId,state,title,version'&&
    UUID.test(item.id)&&UUID.test(item.serviceOfferId)&&
    typeof item.title==='string'&&item.title.length<=180&&
    STATES.has(item.state)&&Number.isSafeInteger(item.version)&&item.version>=1&&
    (item.sellerKind==='professional'||item.sellerKind==='organization')&&
    typeof item.createdAt==='string'&&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.createdAt)&&
    Number.isFinite(Date.parse(item.createdAt))&&
    item.desiredStartAt===null;
}
async function limitedJson(response,expectedStatus){
  if(response.status!==expectedStatus||
    !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
    throw new SellerClientUnavailable();
  const size=response.headers.get('content-length');
  if(size!==null&&(!/^\d+$/.test(size)||Number(size)>MAX_RESPONSE))
    throw new SellerClientUnavailable();
  const text=await response.text();
  if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE)
    throw new SellerClientUnavailable();
  try{return JSON.parse(text);}catch{throw new SellerClientUnavailable();}
}
export function parseSellerBffInbox(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).sort().join(',')!=='csrf_token,items,next_cursor'||
    !Array.isArray(raw.items)||raw.items.length>50||
    typeof raw.csrf_token!=='string'||!CSRF.test(raw.csrf_token)||
    !(raw.next_cursor===null||
      typeof raw.next_cursor==='string'&&CURSOR.test(raw.next_cursor))||
    !raw.items.every(validItem))throw new SellerClientUnavailable();
  return {items:raw.items,nextCursor:raw.next_cursor,csrf:raw.csrf_token};
}
/** Browser talks only to same-origin BFF; it never receives a backend bearer. */
export async function loadSellerInbox({limit=20,state=null,cursor=null,transport=fetch}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>50||
    (state!==null&&!STATES.has(state))||
    (cursor!==null&&(typeof cursor!=='string'||!CURSOR.test(cursor))))
    throw new SellerClientUnavailable();
  const params=new URLSearchParams({limit:String(limit)});
  if(state!==null)params.set('state',state);
  if(cursor!==null)params.set('cursor',cursor);
  try{
    const response=await transport('/api/seller/requests?'+params.toString(),{
      method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),
    });
    return parseSellerBffInbox(await limitedJson(response,200));
  }catch{throw new SellerClientUnavailable();}
}
/**
 * Caller owns stable idempotencyKey for retries. Never synthesize a new key
 * on request timeout. The backend, not a client-side optimistic state, decides.
 */
export async function sendSellerDecision({
  requestId,version,decision,csrf,idempotencyKey,transport=fetch,
}){
  if(typeof requestId!=='string'||!UUID.test(requestId)||
    !Number.isSafeInteger(version)||version<1||version>9999999999||
    (decision!=='accept'&&decision!=='decline')||
    typeof csrf!=='string'||!CSRF.test(csrf)||
    typeof idempotencyKey!=='string'||!UUID.test(idempotencyKey))
    throw new SellerClientUnavailable();
  try{
    const response=await transport('/api/seller/requests/'+requestId.toLowerCase()+'/'+decision,{
      method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
      headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({version,csrf_token:csrf,idempotency_key:idempotencyKey}),
      signal:AbortSignal.timeout(8000),
    });
    if(response.status===409)return 'conflict';
    if(response.status===403)return 'forbidden';
    if(response.status!==200)return 'unavailable';
    const reply=await limitedJson(response,200);
    return reply&&typeof reply==='object'&&!Array.isArray(reply)&&
      Object.keys(reply).length===1&&reply.outcome==='ok'?'ok':'unavailable';
  }catch{return 'unavailable';}
}
