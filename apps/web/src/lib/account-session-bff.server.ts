import 'server-only';
import {readAccountWebSession,authenticateAccountWebMutation}
 from './account-web-session.server';
import {listBackendAccountSessions,revokeBackendAccountSession,
 revokeBackendAccountSessionById,readBackendAccountMe,listBackendProfessionalProfiles,createBackendProfessionalProfile,updateBackendProfessionalProfile,readBackendProfessionalProfilePreview,publishBackendProfessionalProfile,readBackendAppealableProfileRejection,requestBackendProfessionalProfileAppeal,completeBackendCustomerRequest,listBackendCustomerRequests,mutateBackendAccountSchedule,type ScheduleProposalBody,type ProfessionalEdit}
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

/** CSRF-authenticated owner mutation; no raw bearer is ever sent to the browser. */
export async function publishOwnProfessionalProfile(input:{cookieValue:string|undefined;csrfToken:string|undefined;origin:string|null;fetchSite:string|null;id:string;version:number}){
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 return publishBackendProfessionalProfile({...config(),accountBearer:auth.accountBearer,id:input.id,version:input.version});
}

export async function getOwnAppealableProfileRejection(cookieValue:string|undefined,id:string){
 const cookie=readAccountWebSession(cookieValue);
 if(!cookie)throw new Error('unauthorized');
 return readBackendAppealableProfileRejection({...config(),accountBearer:cookie.token,id});
}
export async function submitOwnProfessionalProfileAppeal(input:{
 cookieValue:string|undefined;csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
 id:string;version:number;decisionId:string;
}){
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 return requestBackendProfessionalProfileAppeal({...config(),accountBearer:auth.accountBearer,
  id:input.id,version:input.version,decisionId:input.decisionId});
}

/** CSRF-protected browser-to-backend completion, never exposes bearer. */
export async function completeOwnAccountRequest(input:{
 cookieValue:string|undefined;csrfToken:string|undefined;
 origin:string|null;fetchSite:string|null;
 requestId:string;version:number;
}){
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 return completeBackendCustomerRequest({...config(),
  accountBearer:auth.accountBearer,requestId:input.requestId,version:input.version});
}

/** Read-only backend-revalidated customer inventory with a sealed CSRF token. */
export async function getOwnCustomerRequestPage(
 cookieValue:string|undefined,cursor:string|null,
){
 const session=readAccountWebSession(cookieValue);
 if(!session)throw new Error('unauthorized');
 const page=await listBackendCustomerRequests({...config(),
  accountBearer:session.token,cursor});
 return {...page,csrf:session.csrf};
}

/** Both customer and seller accounts are authorized by the live backend. */
export async function mutateAccountSchedule(input:{
 cookieValue:string|undefined;csrfToken:string|undefined;origin:string|null;fetchSite:string|null;
 requestId:string;version:number;key:string;
}&({action:'propose';body:ScheduleProposalBody}|{action:'confirm'|'decline';proposalId:string})){
 const auth=authenticateAccountWebMutation(input);
 if(!auth)throw new Error('unauthorized');
 const common={...config(),accountBearer:auth.accountBearer,requestId:input.requestId,version:input.version,key:input.key};
 return input.action==='propose'
  ?mutateBackendAccountSchedule({...common,action:input.action,body:input.body})
  :mutateBackendAccountSchedule({...common,action:input.action,proposalId:input.proposalId});
}
