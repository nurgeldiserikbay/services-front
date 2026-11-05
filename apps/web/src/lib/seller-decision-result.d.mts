export type SellerUiDecisionResult='ok'|'conflict'|'forbidden'|'unavailable';
export function mapSellerDecisionOutcome(reply:unknown):SellerUiDecisionResult;
