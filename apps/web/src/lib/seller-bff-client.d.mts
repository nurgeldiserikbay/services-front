import type {SellerRequestSummary,SellerRequestState} from './seller-requests';
export class SellerClientUnavailable extends Error{}
export class SellerClientAuthenticationRequired extends Error{}
export function parseSellerBffInbox(raw:unknown):{
  items:SellerRequestSummary[];nextCursor:string|null;csrf:string;
};
export function loadSellerInbox(input?:{
  limit?:number;state?:SellerRequestState|null;cursor?:string|null;
  transport?:typeof fetch;
}):Promise<{items:SellerRequestSummary[];nextCursor:string|null;csrf:string}>;
export function sendSellerDecision(input:{
  requestId:string;version:number;decision:'accept'|'decline';
  csrf:string;idempotencyKey:string;transport?:typeof fetch;
}):Promise<'ok'|'conflict'|'forbidden'|'unauthorized'|'unavailable'>;
