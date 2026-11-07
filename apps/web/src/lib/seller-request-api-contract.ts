import type {SellerRequestSummary,SellerRequestState} from './seller-requests';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES=new Set<SellerRequestState>([
  'pending','accepted','declined','cancelled_by_customer',
  'cancelled_by_provider','cancelled_mutual','completed','expired',
]);
const DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const opaque=(value:unknown):value is string=>
  typeof value==='string'&&UUID.test(value);
const validDate=(value:unknown):value is string=>
  typeof value==='string'&&DATE.test(value)&&Number.isFinite(Date.parse(value))&&
  new Date(value).toISOString()===value;

export type SellerInboxViewPage=Readonly<{
  requests:SellerRequestSummary[];
  nextCursor:string|null;
}>;

/**
 * Wire adapter for GET /v1/me/seller-requests. Never trust arbitrary backend
 * JSON shape or pass private client metadata through UI props. This is NOT
 * an authentication or network layer.
 */
export function parseSellerInboxPage(raw:unknown):SellerInboxViewPage|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const p=raw as Record<string,unknown>;
  if(Object.keys(p).length!==2||
     Object.keys(p).some(k=>k!=='items'&&k!=='next_cursor')||
     !Array.isArray(p.items)||p.items.length>50||
     !(p.next_cursor===null||
       typeof p.next_cursor==='string'&&
       p.next_cursor.length<=256&&/^[A-Za-z0-9_-]+$/.test(p.next_cursor)))
    return null;
  const requests:SellerRequestSummary[]=[];
  for(const item of p.items){
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    const r=item as Record<string,unknown>;
    if(Object.keys(r).length!==9||
       Object.keys(r).some(k=>!['id','service_offer_id','title','state',
         'version','seller_kind','seller_id','created_at','scheduled_start_at'].includes(k))||
       !opaque(r.id)||!opaque(r.service_offer_id)||!opaque(r.seller_id)||
       typeof r.title!=='string'||r.title.length>500||
       (r.seller_kind!=='professional'&&r.seller_kind!=='organization')||
       typeof r.state!=='string'||!STATES.has(r.state as SellerRequestState)||
       typeof r.version!=='number'||!Number.isSafeInteger(r.version)||r.version<1||
       !validDate(r.created_at)||
       !(r.scheduled_start_at===null||validDate(r.scheduled_start_at)))
      return null;
    requests.push({
      id:r.id,serviceOfferId:r.service_offer_id,title:r.title,
      state:r.state as SellerRequestState,version:r.version,
      createdAt:r.created_at,sellerKind:r.seller_kind,
      // Backend scheduled_start_at is NOT a desired time. The historical
      // view-model field must not be populated with a confirmed slot.
      desiredStartAt:null,
    });
  }
  if(new Set(requests.map(request=>request.id)).size!==requests.length)return null;
  return {requests,nextCursor:p.next_cursor};
}

export type SellerDecisionReply=Readonly<{
  id:string;state:'accepted'|'declined';version:number;replayed:boolean;
}>;

/** Typed server decision result after a protected mutation. */
export function parseSellerDecisionReply(raw:unknown):SellerDecisionReply|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const r=raw as Record<string,unknown>;
  if(Object.keys(r).length!==4||
     Object.keys(r).some(k=>!['id','state','version','replayed'].includes(k))||
     !opaque(r.id)||(r.state!=='accepted'&&r.state!=='declined')||
     typeof r.version!=='number'||!Number.isSafeInteger(r.version)||r.version<1||
     typeof r.replayed!=='boolean')return null;
  return {id:r.id,state:r.state,version:r.version,replayed:r.replayed};
}

/**
 * Merge cursor pages in arrival order without returning stale versions.
 * This is only a presentational cache helper: it never authorizes access,
 * and the caller must reset the cache when switching sellers or sessions.
 */
export function mergeSellerInboxPages(
  previous:readonly SellerRequestSummary[],
  incoming:readonly SellerRequestSummary[],
  sellerKind:'professional'|'organization',
):SellerRequestSummary[]{
  const byId=new Map<string,SellerRequestSummary>();
  for(const item of [...previous,...incoming]){
    if(item.sellerKind!==sellerKind)continue;
    const prior=byId.get(item.id);
    if(!prior||item.version>prior.version){
      byId.set(item.id,item);
    }else if(item.version===prior.version&&item.createdAt===prior.createdAt){
      // Keep the original snapshot: equal versions are not new mutations.
    }
  }
  return [...byId.values()].sort((a,b)=>
    b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}

/** Never append a page unless its cursor actually advances. */
export function canAdvanceSellerCursor(
  requestedCursor:string|null,
  nextCursor:string|null,
  seenCursors:ReadonlySet<string>,
):boolean{
  return nextCursor===null||
    (nextCursor!==requestedCursor&&!seenCursors.has(nextCursor));
}
