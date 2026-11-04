import 'server-only';
import {authenticateGuestMutation,clearGuestCreateSession} from './guest-session.server';
import {issueGuestRequestAccess} from './guest-request-access.server';
import {sendVerifiedGuestCreate,GuestCreateUnavailable}
  from './guest-create-backend.mjs';

/**
 * Internal BFF use case. No route is mounted until provider, network budgets,
 * secure OTP verification and backend POST /guest-requests are operational.
 *
 * The returned response never exposes the READ_CANCEL capability; route
 * implementation must set both cookies and return only the safe receipt.
 */
export async function submitVerifiedGuestRequest(input:{
  cookieValue:string|undefined;
  csrfToken:string|undefined;
  origin:string|null;
  fetchSite:string|null;
  idempotencyKey:string;
  body:unknown;
}){
  const verified=authenticateGuestMutation(input);
  if(!verified)throw new GuestCreateUnavailable();
  const created=await sendVerifiedGuestCreate({
    baseUrl:process.env.SERVICES_API_BASE_URL,
    production:process.env.NODE_ENV==='production',
    createCapability:verified.createCapability,
    idempotencyKey:input.idempotencyKey,
    body:input.body,
  });
  // If cookie issuance fails after the remote commit, the original CREATE
  // proof stays available for a same-key replay until its short expiry.
  const access=issueGuestRequestAccess({
    requestId:created.id,
    requestCapability:created.requestCapability,
    expiresAt:created.expiresAt,
  });
  return {
    receipt:{id:created.id,state:created.state},
    setCookie:access,
    clearCookie:clearGuestCreateSession(),
  };
}
