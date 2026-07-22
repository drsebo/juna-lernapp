import { firestore } from '../firebase/init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const CONTENT_DOC_IDS = ['unit5', 'unit6', 'irregularVerbs'];

let cache = null;

async function fetchContentDoc(id) {
  const snap = await getDoc(doc(firestore, 'content', id));
  if (!snap.exists()) {
    throw new Error(`Missing content document "${id}" — run "npm run sync-content" once.`);
  }
  return snap.data();
}

// Loads the Unit 5/6 content. Lives in Firestore (gated by login) rather
// than static JSON files, so it isn't publicly fetchable the way the app
// shell on GitHub Pages is — kept in sync from the bundled JSON via
// scripts/syncContent.js (run from the terminal), not from within the app.
export async function loadContent() {
  if (cache) return cache;

  const [unit5, unit6, irregularVerbsFile] = await Promise.all(
    CONTENT_DOC_IDS.map(fetchContentDoc)
  );
  const allUnits = [unit5, unit6];

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

export function availableUnitNumbers(content) {
  return [...new Set(content.units.map((u) => u.unit))].sort((a, b) => a - b);
}
