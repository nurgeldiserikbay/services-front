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

export type SellerDecisionAttempt=Readonly<{
  requestId:string;
  version:number;
  action:SellerDecisionAction;
  key:string;
}>;
export function nextSellerDecisionAttempt(
  previous:SellerDecisionAttempt|null,
  requestId:string,version:number,action:SellerDecisionAction,newKey:string,
):SellerDecisionAttempt;

export function isCurrentSellerDecisionResponse(
  attemptGeneration:number,currentGeneration:number,
  attemptedRequestId:string,currentRequestId:string,
  attemptedVersion:number,currentVersion:number,
):boolean;
