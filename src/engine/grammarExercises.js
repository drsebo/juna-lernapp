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

// Grade 6 checking: apostrophe variants (’ from iPad keyboards) and short vs.
// long forms count as the same answer — "I've" = "I have", "won't" = "will
// not", "can't" = "cannot" = "can not". "'s" is only expanded after pronouns
// ("he's" → "he is"); after names it could also be "has" or a possessive.
const SHORT_FORMS = [
  [/\bwon't\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\bain't\b/g, 'is not'],
  [/n't\b/g, ' not'],
  [/'m\b/g, ' am'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/\b(he|she|it|that|what|there|who|where|here|how)'s\b/g, '$1 is']
];

export function normalizeGrammar(str) {
  let out = String(str)
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[.,!?;:]/g, ' ');
  for (const [pattern, replacement] of SHORT_FORMS) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, ' ').trim();
}

export function acceptedAnswersOf(question) {
  return [question.answer, ...(question.acceptedAnswers || [])];
}

export function checkGrammarAnswer(question, userInput) {
  if (question.type === 'multipleChoice') {
    return userInput === question.answer;
  }
  // grade 6 questions may list several right answers and get the lenient
  // check; grade 5 keeps its exact one
  if (question.acceptedAnswers || question.type === 'transform' || question.id.startsWith('k6')) {
    const guess = normalizeGrammar(userInput);
    return guess !== '' && acceptedAnswersOf(question).some((a) => normalizeGrammar(a) === guess);
  }
  return normalize(userInput) === normalize(question.answer);
}

// Grade 6: the chosen topics in book order, each topic's questions shuffled
// as one block — so a topic's rule card can come right before its questions.
export function buildTopicBlockSession(topics, questions, topicIds) {
  const chosen = topics.filter((t) => topicIds.includes(t.id));
  return {
    topics: chosen,
    questions: chosen.flatMap((t) => shuffle(questions.filter((q) => q.topicId === t.id)))
  };
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
