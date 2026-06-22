const CACHE_NAME = 'resp-quiz-cache-v23-sections-by-chapter';
const CORE_ASSETS = [
  './','./index.html','./style.css','./app.js','./manifest.json','./icon.svg',
  './reference-viewer.html','./reference-viewer.css','./reference-viewer.js',
  './data/questions.json','./data/questions.csv',
  './assets/past_figures/q04_fig4abcd.jpg','./assets/past_figures/q06_fig6ab.jpg','./assets/past_figures/q08_fig8.jpg',
  './assets/past_figures/q09_fig9.jpg','./assets/past_figures/q15_fig15ab.jpg','./assets/past_figures/q16_fig16.jpg',
  './assets/past_figures/q20_fig20.jpg','./assets/past_figures/q24_fig24ab.jpg','./assets/past_figures/q27_fig27ab.jpg','./assets/past_figures/q28_fig28abc.jpg'
];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.pathname.includes('/assets/reference_pages/')){
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      if(cached) return cached;
      const response = await fetch(event.request);
      if(response.ok) cache.put(event.request, response.clone());
      return response;
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
