export const MAX_SELLER_UI_RESPONSE_BYTES:number;
export function readBoundedSellerUiJson(
 response:Response,options?:{maxBytes?:number},
):Promise<unknown>;
export function parseSellerDecisionUiAck(value:unknown):'ok';
