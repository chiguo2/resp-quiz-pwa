const CACHE_NAME = 'resp-quiz-cache-v8-cropped-images';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './data/questions.json',
  './data/questions.csv',
  './assets/past_figures/q04_fig4abcd.jpg',
  './assets/past_figures/q06_fig6ab.jpg',
  './assets/past_figures/q08_fig8.jpg',
  './assets/past_figures/q09_fig9.jpg',
  './assets/past_figures/q15_fig15ab.jpg',
  './assets/past_figures/q16_fig16.jpg',
  './assets/past_figures/q20_fig20.jpg',
  './assets/past_figures/q24_fig24ab.jpg',
  './assets/past_figures/q27_fig27ab.jpg',
  './assets/past_figures/q28_fig28abc.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
