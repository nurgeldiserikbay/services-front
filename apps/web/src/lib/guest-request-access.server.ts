import 'server-only';
import {sealGuestRequestAccess,openGuestRequestAccess,verifyGuestRequestAccess}
  from './guest-request-access-core.mjs';
import {verifyMutationOrigin} from './guest-session-core.mjs';

export const GUEST_REQUEST_COOKIE='__Host-services_guest_request';

function accessKey():Buffer{
  const encoded=process.env.SERVICES_WEB_GUEST_SESSION_KEY;
  if(!encoded||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error('Guest request session key unavailable');
  const key=Buffer.from(encoded,'base64');
  if(key.length!==32||key.toString('base64')!==encoded)
    throw new Error('Guest request session key unavailable');
  // AAD differs from the CREATE_REQUEST session so tokens are not interchangeable.
  return key;
}

/**
 * Only call after a successful, committed guest request. Keep the capability
 * solely in a Secure, HttpOnly cookie. Never put it in a client-visible body.
 */
export function issueGuestRequestAccess(input:{
  requestId:string;requestCapability:string;expiresAt:string;
}){
  const expiry=Date.parse(input.expiresAt);
  if(!Number.isFinite(expiry))throw new Error('Invalid request proof expiry');
  const issued=sealGuestRequestAccess(accessKey(),input.requestId,
    input.requestCapability,expiry);
  return {
    name:GUEST_REQUEST_COOKIE,value:issued.cookie,
    options:{
      httpOnly:true as const,secure:true as const,sameSite:'strict' as const,
      path:'/' as const,
      maxAge:Math.max(1,Math.floor((issued.expiresAt-Date.now())/1000)),
    },
    csrf:issued.csrf,requestId:input.requestId,
  };
}

/** Strictly bound to one request and to the exact configured origin. */
export function authorizeGuestRequestMutation(input:{
  cookieValue:string|undefined;
  requestId:string;
  csrfToken:string|undefined;
  origin:string|null;
  fetchSite:string|null;
}):{requestCapability:string}|null{
  const origin=process.env.SERVICES_WEB_ORIGIN;
  if(!origin||(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))||
    !verifyMutationOrigin(input.origin,origin,input.fetchSite))return null;
  const session=openGuestRequestAccess(accessKey(),input.cookieValue);
  if(!verifyGuestRequestAccess(session,input.requestId,input.csrfToken))return null;
  return {requestCapability:session!.capability};
}

export function clearGuestRequestAccess(){
  return {name:GUEST_REQUEST_COOKIE,value:'',
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}
