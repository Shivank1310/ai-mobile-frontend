const CACHE_NAME = 'sih-cache-v1';
const OFFLINE_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Simple fetch handler (network first for API calls)
self.addEventListener('fetch', (evt) => {
  if (evt.request.url.includes('/api/')) {
    evt.respondWith(fetch(evt.request).catch(()=>caches.match(OFFLINE_URL)));
    return;
  }
  evt.respondWith(
    fetch(evt.request).catch(()=>caches.match(evt.request).then(r=>r || caches.match(OFFLINE_URL)))
  );
});

// Background sync: process queued submissions saved in IndexedDB by the app
self.addEventListener('sync', function(event) {
  if (event.tag === 'sih-sync') {
    event.waitUntil(syncQueuedSubmissions());
  }
});

async function syncQueuedSubmissions(){
  // open idb and find queued items and POST them
  try{
    const db = await openDB();
    const tx = db.transaction('queue','readwrite');
    const store = tx.objectStore('queue');
    const all = await store.getAll();
    for(const it of all){
      try{
        const form = new FormData();
        form.append('email', it.email);
        form.append('test', it.test);
        form.append('analysis', JSON.stringify(it.analysis));
        // Note: video binary not stored in this demo queue; production should use chunked uploads or store blobs in IDB
        await fetch(self.origin + '/api/submissions/upload', { method:'POST', body: form });
        await store.delete(it.id);
      }catch(e){ console.error('sync item failed', e); }
    }
    await tx.done;
  }catch(e){ console.error('background sync error', e); }
}

// minimal idb open (compatible with inline use)
function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open('sih-db', 1);
    req.onupgradeneeded = (e)=> {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      resolve(db);
    };
    req.onsuccess = (e)=> resolve(e.target.result);
    req.onerror = (e)=> reject(e.target.error);
  });
}
