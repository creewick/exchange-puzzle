'use strict';

const CACHE = 'exchange-puzzle-v4';

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'images/5.png',
  'images/10.png',
  'images/50.png',
  'images/100.png',
  'images/500.png',
  'images/1000.png',
  'images/5000.png',
  'images/10000.png',
  'sounds/click.wav',
  'sounds/coin.wav',
  'sounds/banknote.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function rangeResponse(request, response) {
  const match = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!match) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const start = match[1] === '' ? Math.max(size - Number(match[2]), 0) : Number(match[1]);
  const end = match[1] !== '' && match[2] !== '' ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function refresh(cache, request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) await cache.put(request, response.clone());
    return response;
  } catch {
    return null;
  }
}

async function handle(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const key = request.mode === 'navigate' ? 'index.html' : new Request(request.url);
  const cached = await cache.match(key, { ignoreSearch: true });

  if (cached) {
    if (request.headers.has('range')) return rangeResponse(request, cached);
    event.waitUntil(refresh(cache, key));
    return cached;
  }

  const fresh = await refresh(cache, new Request(request.url));
  if (fresh) return request.headers.has('range') ? rangeResponse(request, fresh.clone()) : fresh;
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/icons/') || url.pathname.endsWith('.webmanifest')) return;
  if (url.pathname.endsWith('/apple-touch-icon.png')) return;
  if (request.mode === 'navigate' && !/\/(index\.html)?$/.test(url.pathname)) return;
  event.respondWith(handle(event));
});
