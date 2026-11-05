import 'server-only';
import {readAccountWebSession,authenticateAccountWebMutation}
 from './account-web-session.server';
import {fetchSellerInbox} from './seller-server-transport.mjs';
import {parseSellerInboxPage} from './seller-request-api-contract';
import {performAuthorizedSellerDecision} from './seller-decision-boundary.server';
import type {SellerDecisionPayload,SellerInboxQuery} from './seller-bff-route-core.mjs';

/**
 * The backend performs account membership and per-request seller ACL.
 * Multiple seller workspaces may be represented; no client-provided seller
 * identity is trusted or used for authorization.
 */
export async function getOwnSellerInbox(
 cookieValue:string|undefined,query:SellerInboxQuery,
){
 const session=readAccountWebSession(cookieValue);
 if(!session)throw new Error('unauthorized');
 const raw=await fetchSellerInbox({
   baseUrl:process.env.SERVICES_API_BASE_URL,
   production:process.env.NODE_ENV==='production',
   accountBearer:session.token,...query,
 });
 const page=parseSellerInboxPage(raw);
 if(!page)throw new Error('invalid_inbox');
 // CSRF token is issued only to this private authenticated no-store endpoint.
 return {items:page.requests,next_cursor:page.nextCursor,csrf_token:session.csrf};
}
export async function decideOwnSellerRequest(input:{
 cookieValue:string|undefined;origin:string|null;fetchSite:string|null;
 requestId:string;action:'accept'|'decline';payload:SellerDecisionPayload;
}){
 const auth=authenticateAccountWebMutation({
   cookieValue:input.cookieValue,csrfToken:input.payload.csrfToken,
   origin:input.origin,fetchSite:input.fetchSite,
 });
 if(!auth)throw new Error('unauthorized');
 return performAuthorizedSellerDecision({
   baseUrl:process.env.SERVICES_API_BASE_URL??'',
   accountBearer:auth.accountBearer,
   requestId:input.requestId,action:input.action,
   expectedVersion:input.payload.version,
   idempotencyKey:input.payload.idempotencyKey,
 });
}
