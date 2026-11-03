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
