export type SellerIdentity={sellerKind:'professional'|'organization';sellerId:string};
export function assertSellerInboxScope(raw:unknown,identity:SellerIdentity):unknown;
