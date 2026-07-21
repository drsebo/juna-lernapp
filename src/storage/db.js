import { firestore } from '../firebase/init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const SCHEMA_VERSION = 3;

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    bookPosition: {
      grammar: null, // e.g. "Unit 5.5"
      vocabulary: null // e.g. "Unit 5"
    },
    // The teacher-confirmed "knows everything up to here" reference used for the
    // Home progress percentages — precise to a specific vocab word / grammar
    // topic (set via the manual input fields on Home), not just a whole unit.
    progressReference: {
      vocabularyWordId: null,
      grammarTopicId: null
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

function migrate(oldState) {
  return { ...defaultState(), ...oldState, schemaVersion: SCHEMA_VERSION };
}

// The rest of the app calls db.load()/db.update() synchronously, dozens of
// call sites across every screen — keeping that interface (instead of making
// everything async) means only this file needed to change when progress
// moved from localStorage to Firestore. initForUser() does the one real
// network round-trip, once, at login; after that, load()/update() work
// against an in-memory copy and push writes to Firestore in the background
// (the Firebase SDK queues them automatically if offline, and syncs once
// back online).
let cachedState = null;
let stateDocRef = null;

async function initForUser(uid) {
  stateDocRef = doc(firestore, 'progress', uid);
  const snap = await getDoc(stateDocRef);
  if (snap.exists()) {
    const data = snap.data();
    cachedState = data.schemaVersion === SCHEMA_VERSION ? data : migrate(data);
  } else {
    cachedState = defaultState();
    await setDoc(stateDocRef, cachedState);
  }
}

function load() {
  return cachedState;
}

function save(state) {
  cachedState = state;
  setDoc(stateDocRef, state).catch((err) => {
    console.error('Failed to sync progress to Firestore', err);
  });
}

function update(mutator) {
  mutator(cachedState);
  save(cachedState);
  return cachedState;
}

export const db = { load, save, update, defaultState, initForUser };
