const CACHE_NAME = 'resp-quiz-cache-v7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './data/questions.json',
  './data/questions.csv',
  './assets/past_pages/past_page_01.jpg',
  './assets/past_pages/past_page_02.jpg',
  './assets/past_pages/past_page_03.jpg',
  './assets/past_pages/past_page_04.jpg',
  './assets/past_pages/past_page_05.jpg',
  './assets/past_pages/past_page_06.jpg',
  './assets/past_pages/past_page_07.jpg',
  './assets/past_pages/past_page_08.jpg',
  './assets/past_pages/past_page_09.jpg',
  './assets/past_pages/past_page_10.jpg',
  './assets/past_pages/past_page_11.jpg'
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
