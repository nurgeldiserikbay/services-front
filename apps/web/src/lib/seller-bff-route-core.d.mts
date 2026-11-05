export type SellerInboxQuery={limit:number;state:string|null;cursor:string|null};
export type SellerDecisionPayload={version:number;csrfToken:string;idempotencyKey:string};
export const MAX_SELLER_DECISION_BYTES:number;
export function parseSellerInboxQuery(url:string):SellerInboxQuery|null;
export function parseSellerDecisionPayload(value:unknown):SellerDecisionPayload|null;
export function readSellerDecisionBytes(stream:ReadableStream<Uint8Array>|null):Promise<Uint8Array>;
export function parseSellerDecisionBytes(bytes:Uint8Array):SellerDecisionPayload|null;
export function sellerBffSameOrigin(fetchSite:string|null):boolean;
