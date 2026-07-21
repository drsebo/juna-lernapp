import { db } from '../storage/db.js';
import { firestore } from '../firebase/init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const CONTENT_DOC_IDS = ['unit5', 'unit6', 'irregularVerbs'];

let cache = null;

async function fetchContentDoc(id) {
  const snap = await getDoc(doc(firestore, 'content', id));
  if (!snap.exists()) {
    throw new Error(`Missing content document "${id}" — run the content sync from Manage Content once.`);
  }
  return snap.data();
}

// Loads the bundled Unit 5/6 content plus any manually-uploaded custom units
// (spec section 2/9 — future units added without a rebuild), merges them into
// flat arrays the exercise engines can query directly. Content lives in
// Firestore (gated by login) rather than static JSON files, so it isn't
// publicly fetchable the way the app shell on GitHub Pages is.
export async function loadContent() {
  if (cache) return cache;

  const [unit5, unit6, irregularVerbsFile] = await Promise.all(
    CONTENT_DOC_IDS.map(fetchContentDoc)
  );

  const state = db.load();
  const customUnits = state.customUnits || [];
  const allUnits = [unit5, unit6, ...customUnits];

  cache = {
    units: allUnits,
    vocab: allUnits.flatMap((u) => u.vocab || []),
    grammarTopics: allUnits.flatMap((u) => u.grammarTopics || []),
    grammarQuestions: allUnits.flatMap((u) => u.grammarQuestions || []),
    conversationScenarios: allUnits.flatMap((u) => u.conversationScenarios || []),
    irregularVerbs: irregularVerbsFile.irregularVerbs || []
  };
  return cache;
}

export function invalidateContentCache() {
  cache = null;
}

export function availableUnitNumbers(content) {
  return [...new Set(content.units.map((u) => u.unit))].sort((a, b) => a - b);
}

// One-time (or re-run-after-editing) sync: pushes the bundled JSON files —
// still shipped in the repo as the editable source of truth for content —
// into the private Firestore `content` collection the app actually reads
// from at runtime. Requires the caller to already be logged in (Firestore
// rules only allow authenticated writes to `content/*`).
export async function syncBundledContentToFirestore() {
  const [unit5, unit6, irregularVerbsFile] = await Promise.all([
    fetch('./src/data/units/unit5.json').then((r) => r.json()),
    fetch('./src/data/units/unit6.json').then((r) => r.json()),
    fetch('./src/data/irregularVerbs.json').then((r) => r.json())
  ]);

  await Promise.all([
    setDoc(doc(firestore, 'content', 'unit5'), unit5),
    setDoc(doc(firestore, 'content', 'unit6'), unit6),
    setDoc(doc(firestore, 'content', 'irregularVerbs'), irregularVerbsFile)
  ]);

  invalidateContentCache();
}
