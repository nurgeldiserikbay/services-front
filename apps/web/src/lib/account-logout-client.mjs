import {loadAccountDevices} from './account-device-client.mjs';

/**
 * A local cookie may be cleared even if backend revocation cannot be
 * confirmed. Never present that case as a fully completed sign-out.
 */
export async function logoutCurrentAccount({
 transport=fetch,loadDevices=loadAccountDevices,
}={}){
 let csrf;
 try{
  const inventory=await loadDevices({transport});
  csrf=inventory.csrf;
  if(typeof csrf!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(csrf))
   return 'unavailable';
 }catch{return 'unavailable';}
 try{
  const response=await transport('/api/account/logout',{
   method:'POST',cache:'no-store',credentials:'same-origin',redirect:'error',
   headers:{'x-services-csrf':csrf,Accept:'application/json'},
   signal:AbortSignal.timeout(8000),
  });
  if(response.status===204)return 'confirmed';
  if(response.status===503)return 'local_only';
  return 'unavailable';
 }catch{return 'unavailable';}
}
