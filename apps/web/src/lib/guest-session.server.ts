import 'server-only';
import {sealGuestSession,openGuestSession,verifyGuestCsrf,verifyMutationOrigin}
  from './guest-session-core.mjs';

/** BFF-only: do not import from client components or public search. */
export const GUEST_CREATE_COOKIE='__Host-services_guest_create';

function sessionKey():Buffer {
  const raw=process.env.SERVICES_WEB_GUEST_SESSION_KEY;
  if(!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))throw new Error('Guest session key unavailable');
  const key=Buffer.from(raw,'base64');
  if(key.length!==32||key.toString('base64')!==raw)
    throw new Error('Guest session key unavailable');
  return key;
}

/** Caller MUST set this cookie through a secure, authorized BFF action. */
export function issueGuestCreateSession(createCapability:string,expiresInSeconds:number){
  const issued=sealGuestSession(sessionKey(),createCapability,expiresInSeconds);
  return {
    name:GUEST_CREATE_COOKIE,
    value:issued.cookie,
    options:{
      httpOnly:true as const,
      secure:true as const,
      sameSite:'strict' as const,
      path:'/' as const,
      maxAge:expiresInSeconds,
    },
    csrf:issued.csrf, // Render only into a private form; never serialize capability.
    expiresAt:issued.expiresAt,
  };
}

/** Caller obtains the cookie from a trusted Next.js request cookie store. */
export function authenticateGuestMutation(input:{
  cookieValue:string|undefined;
  csrfToken:string|undefined;
  origin:string|null;
  fetchSite:string|null;
}):{createCapability:string}|null{
  const canonical=process.env.SERVICES_WEB_ORIGIN;
  if(!canonical||!verifyMutationOrigin(input.origin,canonical,input.fetchSite))
    return null;
  const session=openGuestSession(sessionKey(),input.cookieValue);
  if(!session||!verifyGuestCsrf(session,input.csrfToken))return null;
  return {createCapability:session.capability};
}

/** Clearing the __Host- cookie is required after request creation/logout. */
export function clearGuestCreateSession(){
  return {name:GUEST_CREATE_COOKIE,value:'',
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}
