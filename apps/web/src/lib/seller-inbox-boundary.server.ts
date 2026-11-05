import 'server-only';
import {fetchSellerInbox} from './seller-server-transport.mjs';
import {assertSellerInboxScope,type SellerIdentity} from './seller-inbox-scope.mjs';
import {parseSellerInboxPage,type SellerInboxViewPage} from './seller-request-api-contract';
import type {SellerRequestState} from './seller-requests';

/**
 * The verified account session and authorized active workspace must be resolved
 * by the caller before this function is invoked. No public route is registered.
 * Never accept a client-supplied bearer or seller ID without server-side ACL.
 */
export async function readAuthorizedSellerInbox(input:{
  baseUrl:string;
  accountBearer:string;
  identity:SellerIdentity;
  limit?:number;
  state?:SellerRequestState|null;
  cursor?:string|null;
}):Promise<SellerInboxViewPage>{
  const raw=await fetchSellerInbox({
    baseUrl:input.baseUrl,accountBearer:input.accountBearer,
    production:process.env.NODE_ENV==='production',
    limit:input.limit,state:input.state,cursor:input.cursor,
  });
  const scoped=assertSellerInboxScope(raw,input.identity);
  const parsed=parseSellerInboxPage(scoped);
  if(!parsed)throw new Error('Seller inbox response unavailable');
  return parsed;
}
