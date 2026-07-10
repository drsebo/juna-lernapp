import { db } from '../storage/db.js';

let cache = null;

async function fetchUnit(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Loads the bundled Unit 5/6 content plus any manually-uploaded custom units
// (spec section 2/9 — future units added without a rebuild), merges them into
// flat arrays the exercise engines can query directly.
export async function loadContent() {
  if (cache) return cache;

  const [unit5, unit6, irregularVerbsFile] = await Promise.all([
    fetchUnit('./src/data/units/unit5.json'),
    fetchUnit('./src/data/units/unit6.json'),
    fetchUnit('./src/data/irregularVerbs.json')
  ]);

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
