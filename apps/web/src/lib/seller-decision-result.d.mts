export type SellerUiDecisionResult='ok'|'conflict'|'forbidden'|'unauthorized'|'unavailable';
export function mapSellerDecisionOutcome(reply:unknown):SellerUiDecisionResult;
