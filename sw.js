/* Service worker: מאפשר לאפליקציה לעבוד גם בלי קליטה במכון.
   קוד האפליקציה: קודם רשת (כדי לקבל עדכונים), ואם אין קליטה אז מהמטמון.
   תמונות: קודם מהמטמון, כי הן לא משתנות. */
const VERSION = 'v1';
const SHELL = 'gym-shell-' + VERSION;
const IMAGES = 'gym-img-' + VERSION;

const SHELL_FILES = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
const IMAGE_KEYS = [
  'Machine_Bench_Press', 'Seated_Cable_Rows', 'Seated_Dumbbell_Press', 'Machine_Shoulder_Military_Press',
  'Wide-Grip_Lat_Pulldown', 'Side_Lateral_Raise', 'Triceps_Pushdown', 'Dumbbell_Bicep_Curl',
  'Standing_Biceps_Cable_Curl', 'Crunches', 'Barbell_Squat', 'Flat_Bench_Lying_Leg_Raise', 'Leg_Extensions',
  'Hyperextensions_Back_Extensions', 'Seated_Leg_Curl', 'Plank', 'Barbell_Hip_Thrust', 'Seated_Calf_Raise',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES);
    const img = await caches.open(IMAGES);
    // תמונה שנכשלת לא מפילה את ההתקנה
    await Promise.all(IMAGE_KEYS.flatMap((k) => [0, 1].map((i) => img.add(`img/${k}_${i}.jpg`).catch(() => {}))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gym-') && k !== SHELL && k !== IMAGES).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(url.pathname);
  const sameOrigin = url.origin === self.location.origin;
  const remoteImage = url.hostname === 'raw.githubusercontent.com' && isImage;

  if (isImage && (sameOrigin || remoteImage)) {
    e.respondWith((async () => {
      const cache = await caches.open(IMAGES);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (sameOrigin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await withTimeout(fetch(req), 3000);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
        if (hit) return hit;
        if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return idx; }
        throw err;
      }
    })());
  }
});
