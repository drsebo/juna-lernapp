// Offline OCR, fully client-side via a locally-vendored Tesseract.js (no CDN, no
// network calls) — spec section 2 requires this to work with no internet dependency.
// Paths are absolute-from-root because worker.min.js resolves corePath/langPath
// relative to the *worker's* own script location, not the calling page's URL.
const TESSERACT_MODULE_URL = '/public/vendor/tesseract/tesseract.esm.min.js';
const WORKER_PATH = '/public/vendor/tesseract/worker.min.js';
const CORE_PATH = '/public/vendor/tesseract/tesseract-core-simd-lstm.wasm.js';
const LANG_PATH = '/public/vendor/tessdata/';

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { default: Tesseract } = await import(TESSERACT_MODULE_URL);
      const { createWorker } = Tesseract;
      return createWorker('eng', 1, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH,
        cacheMethod: 'none'
      });
    })();
  }
  return workerPromise;
}

// image: File/Blob/HTMLCanvasElement/data URL — anything Tesseract.recognize accepts.
export async function recognizeText(image) {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return data.text;
}

export async function terminateOcr() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
