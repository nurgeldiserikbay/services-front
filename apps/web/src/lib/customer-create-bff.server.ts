import 'server-only';
import {authenticateAccountWebMutation}
 from './account-web-session.server';
import {createBackendCustomerRequest,type CustomerCreateBody}
 from './customer-create-transport.mjs';

/** No browser-provided Authorization header or account ID is forwarded. */
export async function submitOwnCustomerRequest(input:{
 cookieValue:string|undefined;csrfToken:string|undefined;
 origin:string|null;fetchSite:string|null;
 idempotencyKey:string;body:CustomerCreateBody;
}){
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 return createBackendCustomerRequest({
  baseUrl:process.env.SERVICES_API_BASE_URL??'',
  production:process.env.NODE_ENV==='production',
  accountBearer:auth.accountBearer,
  idempotencyKey:input.idempotencyKey,
  body:input.body,
 });
}
