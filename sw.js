const CACHE_VERSION = 'juna-lernapp-v2';

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
  './src/engine/speech.js',
  './src/engine/vocabExercises.js',
  './src/ocr/ocrService.js',
  './src/storage/db.js',
  './src/ui/sessionContext.js',
  './src/ui/illustrations.js',
  './src/ui/screens/AiConversation.js',
  './src/ui/screens/ConversationSession.js',
  './src/ui/screens/ConversationsSetup.js',
  './src/ui/screens/ExamPrep.js',
  './src/ui/screens/GrammarSession.js',
  './src/ui/screens/GrammarSetup.js',
  './src/ui/screens/Home.js',
  './src/ui/screens/ManageContent.js',
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

// Network-first, falling back to cache when offline. This still gets the app
// (and OCR engine) working with zero network once cached, but — unlike a
// cache-first strategy — it doesn't silently keep serving stale app code
// forever while online just because sw.js itself didn't change byte-for-byte
// (which is what happened during development: edits to other files never
// triggered a fresh install, so the phone kept seeing old versions).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
