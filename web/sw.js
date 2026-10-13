const CACHE='auvryn-1.11.2-layout-1';
const ASSETS=['./','./index.html?v=1.11.2','./css/styles.css?v=1.11.2','./js/features-20.js?v=1.11.2','./js/ai-provider.js?v=1.11.2','./js/app.js?v=1.11.2','./config/firebase-config.js?v=1.11.2','./manifest.json?v=1.11.2','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match('./index.html?v=1.11.2')))));
