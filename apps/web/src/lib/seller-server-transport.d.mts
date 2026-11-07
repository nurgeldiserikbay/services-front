export class SellerTransportUnavailable extends Error{}
export class SellerTransportUnauthorized extends Error{}
export type SellerTransportOptions={
  baseUrl:string;production?:boolean;accountBearer:string;
  transport?:typeof fetch;
};
export function fetchSellerInbox(options:SellerTransportOptions&{
  limit?:number;state?:string|null;cursor?:string|null;
}):Promise<unknown>;
export type SellerDecisionTransportReply=
  | {outcome:'conflict'|'forbidden'|'not_found'|'unauthorized'}
  | {outcome:'ok';id:string;state:'accepted'|'declined';version:number;replayed:boolean};
export function decideSellerRequest(options:SellerTransportOptions&{
  requestId:string;version:number;decision:'accept'|'decline';idempotencyKey:string;
}):Promise<SellerDecisionTransportReply>;
