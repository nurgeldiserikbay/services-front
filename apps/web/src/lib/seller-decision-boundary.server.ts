import 'server-only';
import {decideSellerRequest} from './seller-server-transport.mjs';
import {mapSellerDecisionOutcome,type SellerUiDecisionResult}
  from './seller-decision-result.mjs';

/**
 * Trusted server-side adapter for SellerRequestList.onDecision.
 *
 * The caller MUST resolve the account bearer from a verified secure session,
 * verify the active seller workspace, enforce Origin/CSRF for browser writes,
 * and issue one stable idempotency key per action (including retries).
 * No public browser route or session issuer is installed here.
 */
export async function performAuthorizedSellerDecision(input:{
  baseUrl:string;
  accountBearer:string;
  requestId:string;
  expectedVersion:number;
  action:'accept'|'decline';
  idempotencyKey:string;
}):Promise<SellerUiDecisionResult>{
  try{
    const reply=await decideSellerRequest({
      baseUrl:input.baseUrl,
      production:process.env.NODE_ENV==='production',
      accountBearer:input.accountBearer,
      requestId:input.requestId,
      version:input.expectedVersion,
      decision:input.action,
      idempotencyKey:input.idempotencyKey,
    });
    return mapSellerDecisionOutcome(reply);
  }catch{
    // Never include upstream payload, token, HTTP trace or private metadata.
    return 'unavailable';
  }
}
