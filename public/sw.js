// KOSPI LAB PWA 서비스워커 — 설치 가능 + 오프라인 실행.
//
// ⚠ 전략이 전부다: 온라인이면 항상 네트워크(최신), 오프라인이면 캐시 폴백.
//   HTML/JS 를 cache-first 로 잡으면 배포해도 구버전에 갇힌다 — 그래서 network-first.
//   내부 API 와 외부(시세) 요청은 캐시하지 않는다(낡은 데이터로 판단을 흐리면 안 된다).
const CACHE = 'kl-v1';
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // 쓰기 요청은 절대 건드리지 않는다
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // 외부(시세 API 등)는 그대로 네트워크
  if (url.pathname.startsWith('/api/')) return;        // 내부 API 도 항상 네트워크(캐시하면 낡은 데이터)

  // 네트워크 우선 → 온라인이면 항상 최신. 실패(오프라인)하면 마지막 캐시, 그것도 없으면 홈.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match('/'))),
  );
});
