const STORAGE_KEY = 'juna-lernapp';
const SCHEMA_VERSION = 2;

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    bookPosition: {
      grammar: null, // e.g. "Unit 5.5"
      vocabulary: null // e.g. "Unit 5"
    },
    leitner: {
      // vocabId -> { box: 1-4, lastSeen: ISO string, timesCorrect: n, timesWrong: n }
    },
    grammarProgress: {
      // topicId -> { timesCorrect: n, timesWrong: n, lastSeen: ISO string }
    },
    streak: {
      count: 0,
      lastSessionDate: null // ISO date string, YYYY-MM-DD
    },
    overallProgress: {
      sessionsCompleted: 0
    },
    timerExtensions: [
      // { date: ISO string, mode: "grammar"|"vocabulary"|"conversation", minutesAdded: 5 }
    ],
    wordCountExtensions: [
      // { date: ISO string, mode: "vocabulary", wordsAdded: 5 }
    ],
    exams: [
      // { id, createdAt, topics: [{ topicId, kind: "grammar"|"vocab", done: bool }] }
    ],
    activeExamId: null,
    customUnits: [
      // future manually-uploaded unit content, same shape as data/units/unitN.json
    ]
  };
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      return migrate(parsed);
    }
    return parsed;
  } catch {
    return defaultState();
  }
}

function migrate(oldState) {
  return { ...defaultState(), ...oldState, schemaVersion: SCHEMA_VERSION };
}

function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function update(mutator) {
  const state = load();
  mutator(state);
  save(state);
  return state;
}

export const db = { load, save, update, defaultState };
