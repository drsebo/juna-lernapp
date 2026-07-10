const CACHE_VERSION = 'juna-lernapp-v1';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './public/manifest.json',
  './public/icons/icon-192.png',
  './public/icons/icon-512.png',
  './public/icons/icon-512-maskable.png',
  './public/vendor/tesseract/tesseract.esm.min.js',
  './public/vendor/tesseract/worker.min.js',
  './public/vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  './public/vendor/tessdata/eng.traineddata.gz',
  './src/app.js',
  './src/router.js',
  './src/data/contentStore.js',
  './src/data/irregularVerbs.json',
  './src/data/units/unit5.json',
  './src/data/units/unit6.json',
  './src/engine/conversationEngine.js',
  './src/engine/examPrep.js',
  './src/engine/grammarExercises.js',
  './src/engine/leitner.js',
  './src/engine/progress.js',
  './src/engine/session.js',
  './src/engine/vocabExercises.js',
  './src/ocr/ocrService.js',
  './src/storage/db.js',
  './src/ui/sessionContext.js',
  './src/ui/screens/ConversationSession.js',
  './src/ui/screens/ConversationsSetup.js',
  './src/ui/screens/ExamPrep.js',
  './src/ui/screens/GrammarSession.js',
  './src/ui/screens/GrammarSetup.js',
  './src/ui/screens/Home.js',
  './src/ui/screens/SessionResults.js',
  './src/ui/screens/VocabularySession.js',
  './src/ui/screens/VocabularySetup.js',
  './src/ui/screens/WeakPoints.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first so the app (and OCR engine) works with zero network — the whole
// point of a locally-bundled, offline-capable PWA. Anything not precached
// (e.g. a future manually-uploaded unit file) is cached the first time it's
// fetched, so it's available offline from then on too.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
