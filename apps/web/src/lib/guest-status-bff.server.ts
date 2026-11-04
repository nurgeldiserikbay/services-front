import 'server-only';
import {openGuestRequestAccess} from './guest-request-access-core.mjs';
import {readGuestRequestStatus,GuestStatusUnavailable}
  from './guest-status-backend.mjs';

function requestSessionKey():Buffer{
  const encoded=process.env.SERVICES_WEB_GUEST_SESSION_KEY;
  if(!encoded||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new GuestStatusUnavailable();
  const key=Buffer.from(encoded,'base64');
  if(key.length!==32||key.toString('base64')!==encoded)
    throw new GuestStatusUnavailable();
  return key;
}

/**
 * Read-only BFF internal use case: no frontend route exposed yet.
 * A valid, request-bound HttpOnly cookie is required. Never accept a
 * capability from query strings, body or browser-side JavaScript.
 *
 * Do not cache the result on SSR/CDN or return seller PII/guest contact.
 */
export async function getPrivateGuestStatus(input:{
  requestId:string;
  cookieValue:string|undefined;
  fetchSite:string|null;
}){
  if(input.fetchSite!==null&&input.fetchSite!=='same-origin'&&
    input.fetchSite!=='none')throw new GuestStatusUnavailable();
  let session;
  try{session=openGuestRequestAccess(requestSessionKey(),input.cookieValue);}
  catch{throw new GuestStatusUnavailable();}
  if(!session||session.requestId!==input.requestId.toLowerCase())
    throw new GuestStatusUnavailable();
  return readGuestRequestStatus({
    baseUrl:process.env.SERVICES_API_BASE_URL,
    production:process.env.NODE_ENV==='production',
    requestId:input.requestId,
    requestCapability:session.capability,
  });
}
