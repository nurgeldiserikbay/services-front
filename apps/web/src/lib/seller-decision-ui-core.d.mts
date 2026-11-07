export type SellerDecisionAction='accept'|'decline';
export type SellerDecisionReceipt=Readonly<{
  id:string;
  state:'accepted'|'declined';
  version:number;
  replayed:boolean;
}>;
export type SellerDecisionRequest=Readonly<{
  path:string;
  headers:Readonly<{
    'If-Match':string;
    'Idempotency-Key':string;
  }>;
}>;
export function buildSellerDecisionRequest(
  requestId:string,action:SellerDecisionAction,version:number,key:string,
):SellerDecisionRequest;
/** Returns only validated committed response fields, throws otherwise. */
export function parseSellerDecisionReceipt(
  value:unknown,requestId:string,action:SellerDecisionAction,expectedVersion:number,
):SellerDecisionReceipt;
