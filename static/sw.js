// One shell/cache per explicit device base. API responses are never cached.
const BASE=new URL('./',self.location.href);
const NAMESPACE='panel-v2:'+BASE.pathname+':';
const CACHE=NAMESPACE+'shell';
const SHELL=[BASE.href,new URL('static/icons/icon-192.png',BASE).href];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(NAMESPACE)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  const path=url.pathname.slice(BASE.pathname.length);
  if(BASE.pathname==='/'&&path.startsWith('speaker/'))return; // Child scopes own their caches.
  if(path.startsWith('api/')||path==='model.stl'||path==='ca.crt')return;
  const key=request.mode==='navigate'?BASE.href:request;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(key,copy));}
    return response;
  }).catch(()=>caches.match(key).then(response=>response||Response.error())));
});
