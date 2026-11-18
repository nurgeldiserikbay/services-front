import 'server-only';
import {readAccountWebSession,authenticateAccountWebMutation}
 from './account-web-session.server';
import {listBackendAccountSessions,revokeBackendAccountSession,
 revokeBackendAccountSessionById,readBackendAccountMe,listBackendProfessionalProfiles,createBackendProfessionalProfile,updateBackendProfessionalProfile,readBackendProfessionalProfilePreview,type ProfessionalEdit}
 from './account-session-transport.mjs';

function config(){
 return {baseUrl:process.env.SERVICES_API_BASE_URL??'',
  production:process.env.NODE_ENV==='production'};
}

/** Authenticated and backend-revalidated. Never trust cookie validity alone. */
export async function getAccountWebSessions(cookieValue:string|undefined){
 const cookie=readAccountWebSession(cookieValue);
 if(!cookie)throw new Error('unauthorized');
 const result=await listBackendAccountSessions({
  ...config(),accountBearer:cookie.token,
 });
 return {...result,csrf_token:cookie.csrf};
}

/**
 * CSRF-protected server logout. Even if backend is unavailable, route handler
 * MUST clear browser cookie locally, but must not claim backend revocation.
 */
export async function revokeAccountWebSession(input:{
 cookieValue:string|undefined;csrfToken:string|undefined;
 origin:string|null;fetchSite:string|null;
}):Promise<void>{
 const verified=authenticateAccountWebMutation(input);
 if(!verified)throw new Error('unauthorized');
 await revokeBackendAccountSession({
  ...config(),accountBearer:verified.accountBearer,
 });
}

/**
 * Account-device management: a CSRF-verified browser may revoke ONLY a
 * different, currently listed session. Current session logout uses the
 * existing /api/account/logout handler so its local cookie is cleared.
 */
export async function revokeOtherAccountWebSession(input:{
 cookieValue:string|undefined;csrfToken:string|undefined;
 origin:string|null;fetchSite:string|null;sessionId:string;
}):Promise<'ok'|'not_found'|'current'>{
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 const inventory=await listBackendAccountSessions({
  ...config(),accountBearer:auth.accountBearer,
 });
 const target=inventory.items.find(row=>row.id===input.sessionId);
 if(!target)return 'not_found';
 if(target.current)return 'current';
 await revokeBackendAccountSessionById({
  ...config(),accountBearer:auth.accountBearer,sessionId:input.sessionId,
 });
 return 'ok';
}

/** Resolve the account from its sealed cookie and live backend session. */
export async function getAccountWebIdentity(cookieValue:string|undefined){
 const cookie=readAccountWebSession(cookieValue);
 if(!cookie)throw new Error('unauthorized');
 return readBackendAccountMe({...config(),accountBearer:cookie.token});
}

export async function getOwnProfessionalProfiles(cookieValue:string|undefined){
 const cookie=readAccountWebSession(cookieValue);
 if(!cookie)throw new Error('unauthorized');
 return listBackendProfessionalProfiles({...config(),accountBearer:cookie.token});
}

export async function getProfessionalProfileCreationContext(cookieValue:string|undefined){
 const cookie=readAccountWebSession(cookieValue);
 if(!cookie)throw new Error('unauthorized');
 const profiles=await listBackendProfessionalProfiles({...config(),accountBearer:cookie.token});
 return {profiles,csrf:cookie.csrf};
}
export async function createOwnProfessionalProfile(input:{cookieValue:string|undefined;csrfToken:string|undefined;origin:string|null;fetchSite:string|null;professionId:string;idempotencyKey:string}){
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 return createBackendProfessionalProfile({...config(),accountBearer:auth.accountBearer,professionId:input.professionId,idempotencyKey:input.idempotencyKey});
}

export async function updateOwnProfessionalProfile(input:{cookieValue:string|undefined;csrfToken:string|undefined;origin:string|null;fetchSite:string|null;id:string;version:number;body:ProfessionalEdit}){
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 return updateBackendProfessionalProfile({...config(),accountBearer:auth.accountBearer,id:input.id,version:input.version,body:input.body});
}

export async function getOwnProfessionalProfilePreview(cookieValue:string|undefined,profileId:string){
 const cookie=readAccountWebSession(cookieValue);
 if(!cookie)throw new Error('unauthorized');
 return readBackendProfessionalProfilePreview({...config(),accountBearer:cookie.token,profileId});
}
