/**
 * Read-only types and client-side presentation rules for seller request UI.
 * Backend must verify actual owner/operator permissions on each request.
 */
export type SellerRequestState='pending'|'accepted'|'declined'|
  'cancelled_by_customer'|'cancelled_by_provider'|'cancelled_mutual'|'completed'|'expired';

export type SellerRequestSummary={
  id:string;
  serviceOfferId:string;
  title:string;
  state:SellerRequestState;
  version:number;
  createdAt:string;
  desiredStartAt:string|null;
  sellerKind:'professional'|'organization';
};

export function mayOfferSellerDecision(
  request:SellerRequestSummary,
  sellerContext:'professional'|'organization',
):boolean{
  return request.state==='pending' && request.sellerKind===sellerContext &&
    Number.isSafeInteger(request.version) && request.version>=1;
}

export function sortSellerRequests(items:readonly SellerRequestSummary[]):SellerRequestSummary[]{
  return [...items].sort((a,b)=>{
    const pendingA=a.state==='pending'?0:1;
    const pendingB=b.state==='pending'?0:1;
    if(pendingA!==pendingB)return pendingA-pendingB;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Inbox filters are presentation-only; server ACL and pagination remain authoritative. */
export type SellerInboxFilter='all'|'pending'|'accepted'|'closed';

export function filterSellerRequests(
  items:readonly SellerRequestSummary[],
  sellerContext:'professional'|'organization',
  filter:SellerInboxFilter,
):SellerRequestSummary[]{
  return sortSellerRequests(items.filter(request=>{
    if(request.sellerKind!==sellerContext)return false;
    if(filter==='all')return true;
    if(filter==='closed')return request.state!=='pending'&&request.state!=='accepted';
    return request.state===filter;
  }));
}

export function countSellerInbox(
  items:readonly SellerRequestSummary[],
  sellerContext:'professional'|'organization',
):Readonly<Record<SellerInboxFilter,number>>{
  const counts={all:0,pending:0,accepted:0,closed:0};
  for(const request of items){
    if(request.sellerKind!==sellerContext)continue;
    counts.all++;
    if(request.state==='pending')counts.pending++;
    else if(request.state==='accepted')counts.accepted++;
    else counts.closed++;
  }
  return counts;
}
