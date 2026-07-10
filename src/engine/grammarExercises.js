import { pickRecencyWeighted } from './session.js';

// Grammar sessions are sized by "number of topics" (spec section 4), not question
// count — each chosen topic contributes all of its seed questions, so covering more
// topics naturally means a longer session.
export function buildGrammarSession(topics, questions, currentUnit, topicCount) {
  const chosenTopics = pickRecencyWeighted(topics, currentUnit, topicCount);
  const topicIds = new Set(chosenTopics.map((t) => t.id));
  const sessionQuestions = shuffle(questions.filter((q) => topicIds.has(q.topicId)));
  return { topics: chosenTopics, questions: sessionQuestions };
}

export function buildWeakGrammarSession(topics, questions, state, topicCount) {
  const weak = [...topics].sort((a, b) => weaknessScore(state, b.id) - weaknessScore(state, a.id));
  const chosenTopics = weak.slice(0, topicCount);
  const topicIds = new Set(chosenTopics.map((t) => t.id));
  const sessionQuestions = shuffle(questions.filter((q) => topicIds.has(q.topicId)));
  return { topics: chosenTopics, questions: sessionQuestions };
}

export function weaknessScore(state, topicId) {
  const entry = state.grammarProgress[topicId];
  if (!entry) return 1; // never seen counts as somewhat weak, gets a chance
  const total = entry.timesCorrect + entry.timesWrong;
  if (total === 0) return 1;
  return entry.timesWrong / total;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(str) {
  return str.trim().toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
}

export function checkGrammarAnswer(question, userInput) {
  if (question.type === 'multipleChoice') {
    return userInput === question.answer;
  }
  return normalize(userInput) === normalize(question.answer);
}

export function recordGrammarAnswer(state, topicId, correct, now) {
  const entry = state.grammarProgress[topicId] || { timesCorrect: 0, timesWrong: 0, lastSeen: null };
  state.grammarProgress[topicId] = {
    timesCorrect: entry.timesCorrect + (correct ? 1 : 0),
    timesWrong: entry.timesWrong + (correct ? 0 : 1),
    lastSeen: now
  };
  return state.grammarProgress[topicId];
}
