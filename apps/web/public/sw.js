/* Offline shell only: never cache API responses, authenticated pages or user data. */
const CACHE='services-offline-shell-v1';
const FALLBACK='/offline.html';
self.addEventListener('install',event=>{
  // Activate only after the generic fallback is safely cached.
  event.waitUntil(caches.open(CACHE)
    .then(cache=>cache.add(FALLBACK))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('services-offline-shell-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
function publicNavigation(url){
  if(url.origin!==self.location.origin)return false;
  const parts=url.pathname.split('/').filter(Boolean);
  if(!['kk','ru'].includes(parts[0]))return false;
  if(parts.length===1)return true;
  return parts.length===3&&(
    (parts[1]==='professionals'||parts[1]==='organizations'||parts[1]==='services')
  );
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.mode!=='navigate'||!publicNavigation(new URL(request.url)))return;
  event.respondWith(fetch(request).catch(async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(FALLBACK))||Response.error();
  }));
});
