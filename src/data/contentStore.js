import { firestore } from '../firebase/init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db, activeGrade } from '../storage/db.js';

// Book content lives in Firestore (gated by login), kept in sync from the
// bundled JSON via scripts/syncContent.js (run from the terminal). Which
// documents exist — and which grade each belongs to — is listed in the
// `content/index` document (source: src/data/contentIndex.json), so adding a
// grade or unit doesn't mean touching this file.
//
// Fallbacks, so a grade whose content hasn't been synced yet still works
// (e.g. while testing locally before the next `npm run sync-content`): a
// missing index uses the bundled contentIndex.json, a missing content
// document is read from its bundled JSON file next to this module.

let indexPromise = null;
const docPromises = new Map();
const gradeCache = new Map();

async function fetchBundled(file) {
  const res = await fetch(new URL(file, import.meta.url));
  if (!res.ok) throw new Error(`Couldn't load bundled content "${file}" (${res.status})`);
  return res.json();
}

function loadIndex() {
  if (!indexPromise) {
    indexPromise = getDoc(doc(firestore, 'content', 'index')).then((snap) => {
      if (snap.exists()) return snap.data();
      console.warn('No content/index in Firestore yet — using the bundled contentIndex.json. Run "npm run sync-content".');
      return fetchBundled('./contentIndex.json');
    });
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}

function loadDoc(entry) {
  if (!docPromises.has(entry.id)) {
    const promise = getDoc(doc(firestore, 'content', entry.id)).then((snap) => {
      if (snap.exists()) return snap.data();
      console.warn(`Content document "${entry.id}" not in Firestore yet — using the bundled ${entry.file}. Run "npm run sync-content".`);
      return fetchBundled(`./${entry.file}`);
    });
    promise.catch(() => docPromises.delete(entry.id));
    docPromises.set(entry.id, promise);
  }
  return docPromises.get(entry.id);
}

// Returns the content of one grade (default: the learner's active grade) in
// the same flat shape the screens have always used — so every screen that
// calls loadContent() automatically shows the grade picked on Home.
export async function loadContent({ grade } = {}) {
  const wanted = grade ?? activeGrade(db.load());
  if (gradeCache.has(wanted)) return gradeCache.get(wanted);

  const index = await loadIndex();
  const entries = index.documents.filter((d) => d.grade === wanted);
  if (entries.length === 0) throw new Error(`No content for grade ${wanted} in the content index.`);
  const docs = await Promise.all(entries.map(loadDoc));
  const byKind = (kind) => docs.filter((_, i) => entries[i].kind === kind);

  // Index order = book order, which the progress maths relies on.
  const units = byKind('unit');
  const goalFiles = byKind('learningGoals');

  const content = {
    grade: wanted,
    units,
    vocab: units.flatMap((u) => u.vocab || []),
    grammarTopics: units.flatMap((u) => u.grammarTopics || []),
    grammarQuestions: units.flatMap((u) => u.grammarQuestions || []),
    conversationScenarios: units.flatMap((u) => u.conversationScenarios || []),
    irregularVerbs: byKind('irregularVerbs').flatMap((f) => f.irregularVerbs || []),
    learningGoals: goalFiles.flatMap((f) => f.learningGoals || []),
    skills: goalFiles.flatMap((f) => f.skills || [])
  };
  gradeCache.set(wanted, content);
  return content;
}

export async function availableGrades() {
  const index = await loadIndex();
  return index.grades || [...new Set(index.documents.map((d) => d.grade))].sort((a, b) => a - b);
}

export function availableUnitNumbers(content) {
  return [...new Set(content.units.map((u) => u.unit))].sort((a, b) => a - b);
}

// Unit preselected on the setup screens when no unit was picked there yet.
// Grade 5 keeps its old default (the last unit). Other grades use the unit of
// the teacher-confirmed "known up to" word/topic, else their first unit —
// instead of jumping to the end of a book that was just started.
export function defaultUnit(content, { progressReference }) {
  const units = availableUnitNumbers(content);
  if (content.grade === 5) return units[units.length - 1];
  const ref = content.vocab.find((w) => w.id === progressReference.vocabularyWordId)
    || content.grammarTopics.find((t) => t.id === progressReference.grammarTopicId);
  return ref ? ref.unit : units[0];
}

// "Units 5 & 6", "Units 1–6" — for subtitles that used to be hard-coded.
export function unitRangeLabel(content) {
  const units = availableUnitNumbers(content);
  if (units.length === 0) return '';
  if (units.length === 1) return `Unit ${units[0]}`;
  if (units.length === 2) return `Units ${units[0]} & ${units[1]}`;
  return `Units ${units[0]}–${units[units.length - 1]}`;
}
