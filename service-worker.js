const CACHE_NAME = 'resp-quiz-cache-v60';
const CORE_ASSETS = [
  './','./index.html','./style.css','./app.js','./manifest.json','./icon.svg',
  './reference-viewer.html','./reference-viewer.css','./reference-viewer.js',
  './data/questions.json','./data/questions.csv',
  './assets/past_figures/q04_fig4abcd.jpg','./assets/past_figures/q06_fig6ab.jpg','./assets/past_figures/q08_fig8.jpg',
  './assets/past_figures/q09_fig9.jpg','./assets/past_figures/q15_fig15ab.jpg','./assets/past_figures/q16_fig16.jpg',
  './assets/past_figures/q20_fig20.jpg','./assets/past_figures/q24_fig24ab.jpg','./assets/past_figures/q27_fig27ab.jpg','./assets/past_figures/q28_fig28abc.jpg'
];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS).catch(()=>{}))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('message', e => { if(e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // 教科書ページ画像：大容量・不変なのでキャッシュ優先
  if(url.pathname.includes('/assets/reference_pages/') || url.pathname.includes('/assets/past_figures/')){
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      if(cached) return cached;
      const response = await fetch(event.request);
      if(response.ok) cache.put(event.request, response.clone());
      return response;
    }));
    return;
  }
  // それ以外(HTML/JS/CSS/データ)：ネットワーク優先（オンライン時は常に最新を取得、失敗時のみキャッシュ）
  event.respondWith(
    fetch(event.request).then(response => {
      if(response && response.ok && (response.type === 'basic' || response.type === 'default')){
        const copy = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
  );
});
