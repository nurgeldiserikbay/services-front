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
  // Only canonical, exact public routes may receive the generic offline shell.
  // Reject encoded path components and dot-segments rather than guessing how
  // a server or reverse proxy will decode and normalize the requested path.
  if(url.pathname.includes('%')||url.pathname.includes('\\'))return false;
  if(parts.some(part=>part==='.'||part==='..'))return false;
  // Canonical paths only: repeated slashes and trailing slashes may be
  // normalized differently by a proxy and must bypass the worker.
  if('/'+parts.join('/')!==url.pathname)return false;
  if(parts.length===1)return true;
  return parts.length===3&&(
    (parts[1]==='professionals'||parts[1]==='organizations'||parts[1]==='services')
  );
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.mode!=='navigate'||!publicNavigation(new URL(request.url)))return;
  // A gateway can return 502/503/504 even while the device appears online.
  // Show the generic offline shell for those transient infrastructure errors,
  // but never mask application-level 4xx or other server responses.
  const offlineShell=async()=>{
    try{
      const cache=await caches.open(CACHE);
      return (await cache.match(FALLBACK))||Response.error();
    }catch{
      // Storage can be disabled or unavailable; never substitute private data.
      return Response.error();
    }
  };
  event.respondWith(fetch(request)
    .then(response=>[502,503,504].includes(response.status)
      ?offlineShell():response)
    .catch(offlineShell));
});
