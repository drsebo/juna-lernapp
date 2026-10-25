import { firestore } from '../firebase/init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const SCHEMA_VERSION = 4;
const DEFAULT_GRADE = 6;

// Learning stand that only makes sense within one grade (both grades have a
// "Unit 5", and grammar codes / word positions are per book).
function defaultGradeState() {
  return {
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
    }
  };
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    // Grade picked on Home; every screen loads that grade's content.
    activeGrade: DEFAULT_GRADE,
    // grade ("5" | "6") -> defaultGradeState(). Everything else below (Leitner
    // boxes, grammar progress, streak, XP, exams) is shared across grades —
    // content ids are unique across grades (grade 6 uses a "k6" prefix).
    byGrade: {
      5: defaultGradeState(),
      6: defaultGradeState()
    },
    leitner: {
      // vocabId -> { box: 1-4, lastSeen: ISO string, timesCorrect: n, timesWrong: n }
    },
    // Own boxes for the grade 6 drills (see engine/leitner.js): irregular
    // verbs (k6iv_… ids) and British vs. American pairs (vocab ids).
    verbLeitner: {},
    pairLeitner: {},
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
    // Total XP earned. Missing on docs from before XP existed —
    // engine/motivation.js getXp() then estimates it from past answers.
    xp: 0,
    timerExtensions: [
      // { date: ISO string, mode: "grammar"|"vocabulary"|"conversation", minutesAdded: 5 }
    ],
    wordCountExtensions: [
      // { date: ISO string, mode: "vocabulary", wordsAdded: 5 }
    ],
    exams: [
      // { id, createdAt, topics: [{ topicId, kind: "grammar"|"vocab", done: bool }] }
    ],
    activeExamId: null
  };
}

// v3 → v4: the single bookPosition/progressReference of the grade 5 app
// becomes byGrade[5]; Leitner boxes, grammar progress, streak, XP and exams
// carry over untouched. byGrade entries that already exist win, so a doc that
// went back and forth between an old and a new app version keeps its grade 6
// stand.
function migrate(oldState) {
  const state = { ...defaultState(), ...oldState, schemaVersion: SCHEMA_VERSION };
  const byGrade = { 5: defaultGradeState(), 6: defaultGradeState(), ...(oldState.byGrade || {}) };
  if (!(oldState.byGrade && oldState.byGrade[5]) && (oldState.bookPosition || oldState.progressReference)) {
    const fresh = defaultGradeState();
    byGrade[5] = {
      bookPosition: { ...fresh.bookPosition, ...(oldState.bookPosition || {}) },
      progressReference: { ...fresh.progressReference, ...(oldState.progressReference || {}) }
    };
  }
  state.byGrade = byGrade;
  state.activeGrade = oldState.activeGrade || DEFAULT_GRADE;
  return state;
}

export function activeGrade(state) {
  return (state && state.activeGrade) || DEFAULT_GRADE;
}

// The per-grade learning stand ({ bookPosition, progressReference }) of the
// given grade (default: the active one). Works on the object passed in, so it
// can be used both on db.load() and inside db.update() mutators.
export function gradeState(state, grade = activeGrade(state)) {
  if (!state.byGrade[grade]) state.byGrade[grade] = defaultGradeState();
  return state.byGrade[grade];
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
    mirrorLegacyFields(cachedState);
    await setDoc(stateDocRef, cachedState);
  }
}

function load() {
  return cachedState;
}

// The app version currently live (grade 5 only) reads the top-level
// bookPosition/progressReference. Mirroring grade 5 there keeps that version
// working on the same Firestore doc until it has been replaced everywhere.
function mirrorLegacyFields(state) {
  const grade5 = state.byGrade && state.byGrade[5];
  if (!grade5) return;
  state.bookPosition = { ...grade5.bookPosition };
  state.progressReference = { ...grade5.progressReference };
}

function save(state) {
  mirrorLegacyFields(state);
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
