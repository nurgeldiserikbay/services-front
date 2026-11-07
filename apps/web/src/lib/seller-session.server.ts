import 'server-only';
import {openSellerSession,sealSellerSession,verifySellerCsrf}
  from './seller-session-core.mjs';
import {verifyMutationOrigin} from './guest-session-core.mjs';

export const SELLER_SESSION_COOKIE='__Host-services_seller_session';

function sellerKey():Buffer{
  const encoded=process.env.SERVICES_WEB_SELLER_SESSION_KEY;
  if(!encoded||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error('Seller session key unavailable');
  const key=Buffer.from(encoded,'base64');
  if(key.length!==32||key.toString('base64')!==encoded)
    throw new Error('Seller session key unavailable');
  return key;
}
/** Invoke only after the backend has authenticated and issued the bearer. */
export function issueSellerSession(bearer:string,ttlSeconds:number){
  const issued=sealSellerSession(sellerKey(),bearer,ttlSeconds);
  return {name:SELLER_SESSION_COOKIE,value:issued.cookie,
    options:{httpOnly:true as const,secure:true as const,sameSite:'strict' as const,
      path:'/' as const,maxAge:ttlSeconds},
    csrf:issued.csrf,expiresAt:issued.expiresAt};
}
export function authenticateSellerRead(cookieValue:string|undefined,
  fetchSite:string|null):{bearer:string}|null{
  if(fetchSite!==null&&fetchSite!=='same-origin'&&fetchSite!=='none')return null;
  const session=openSellerSession(sellerKey(),cookieValue);
  return session?{bearer:session.bearer}:null;
}
export function authenticateSellerMutation(input:{
  cookieValue:string|undefined;csrf:string|undefined;
  origin:string|null;fetchSite:string|null;
}):{bearer:string}|null{
  const origin=process.env.SERVICES_WEB_ORIGIN;
  if(!origin||(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))||
    !verifyMutationOrigin(input.origin,origin,input.fetchSite))return null;
  const session=openSellerSession(sellerKey(),input.cookieValue);
  return session&&verifySellerCsrf(session,input.csrf)?
    {bearer:session.bearer}:null;
}
export function clearSellerSession(){
  return {name:SELLER_SESSION_COOKIE,value:'',
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}
