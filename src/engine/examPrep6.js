// Exam prep for grade 6 and later: Schulaufgabe / Ex with a date, material
// picked by photo, by hand or "up to …", a day-by-day study plan, the
// "Can you …" checklist and the mock exam (Probe-Schulaufgabe).
// Grade 5 keeps engine/examPrep.js unchanged.

import { gradeState } from '../storage/db.js';
import { checkVocabAnswer } from './vocabExercises.js';
import { checkGrammarAnswer } from './grammarExercises.js';

export const EXAM_KINDS = {
  schulaufgabe: 'Schulaufgabe',
  ex: 'Ex'
};

// Bayerischer Notenschlüssel: Anteil der erreichten Punkte → Note. Schulen und
// Lehrkräfte setzen die Grenzen unterschiedlich — hier anpassen.
export const GRADE_KEY = [
  { minShare: 0.88, grade: 1 },
  { minShare: 0.75, grade: 2 },
  { minShare: 0.62, grade: 3 },
  { minShare: 0.5, grade: 4 },
  { minShare: 0.25, grade: 5 },
  { minShare: 0, grade: 6 }
];

export const MOCK_EXAM_MINUTES = 45;
const MOCK_VOCAB_ITEMS = 10;
const MOCK_GRAMMAR_ITEMS = 10;
const MOCK_TRANSFORM_ITEMS = 2;
const TRANSFORM_POINTS = 2;
const MINUTES_PER_TOPIC = 8;

export function gradeFor(points, maxPoints) {
  const share = maxPoints > 0 ? points / maxPoints : 0;
  return GRADE_KEY.find((g) => share >= g.minShare).grade;
}

// ---------- active exam (grade 5 keeps the top-level activeExamId) ----------

export function activeExamFor(state, grade) {
  const id = grade === 5 ? state.activeExamId : gradeState(state, grade).activeExamId;
  return state.exams.find((e) => e.id === id) || null;
}

export function setActiveExam(state, grade, examId) {
  if (grade === 5) state.activeExamId = examId;
  else gradeState(state, grade).activeExamId = examId;
  return state;
}

export function examsOfGrade(state, grade) {
  return state.exams.filter((e) => (e.grade || 5) === grade);
}

// ---------- dates ----------

export function todayIso(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(dateIso, fromIso = todayIso()) {
  if (!dateIso) return null;
  return Math.round((new Date(dateIso + 'T12:00:00') - new Date(fromIso + 'T12:00:00')) / 86400000);
}

export function countdownLabel(exam, fromIso = todayIso()) {
  const n = daysUntil(exam.date, fromIso);
  if (n === null) return '';
  if (n < 0) return 'vorbei';
  if (n === 0) return 'heute!';
  if (n === 1) return 'morgen!';
  return `noch ${n} Tage`;
}

export function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

// ---------- material ("topics" of an exam) ----------

function sectionKey(w) {
  return `${w.unit}|${w.section}`;
}

// Everything an exam can contain: each grammar topic and each vocabulary
// section of the book, in book order.
export function examTopicCandidates(content) {
  const grammar = content.grammarTopics.map((t) => ({
    topicId: t.id,
    kind: 'grammar',
    unit: t.unit,
    label: `${t.code} — ${t.title}`
  }));
  const sections = new Map();
  content.vocab.forEach((w) => {
    if (!w.section) return;
    const key = sectionKey(w);
    if (!sections.has(key)) {
      sections.set(key, { topicId: `section::${key}`, kind: 'vocab', unit: w.unit, label: `Unit ${w.unit} · ${w.section} (Vocabulary)` });
    }
  });
  return [...grammar, ...sections.values()];
}

export function sortTopics(topics) {
  return [...topics].sort((a, b) => a.unit - b.unit || (a.kind === b.kind ? 0 : a.kind === 'grammar' ? -1 : 1));
}

// "(c) bis Stand X": everything from unit `fromUnit` up to and including
// `toUnit`; with `toRef` (teacher check-in) only up to that grammar topic /
// vocab section within the last unit.
export function topicsUpTo(content, fromUnit, toUnit, toRef = null) {
  const all = examTopicCandidates(content).filter((t) => t.unit >= fromUnit && t.unit <= toUnit);
  if (!toRef) return all;
  const grammarIdx = content.grammarTopics.findIndex((t) => t.id === toRef.grammarTopicId);
  const vocabIdx = content.vocab.findIndex((w) => w.id === toRef.vocabularyWordId);
  const knownGrammar = new Set(content.grammarTopics.slice(0, grammarIdx + 1).map((t) => t.id));
  const knownSections = new Set(content.vocab.slice(0, vocabIdx + 1).filter((w) => w.section).map((w) => `section::${sectionKey(w)}`));
  return all.filter((t) => (t.kind === 'grammar' ? grammarIdx < 0 || knownGrammar.has(t.topicId) : vocabIdx < 0 || knownSections.has(t.topicId)));
}

const GENERIC_TITLE_WORDS = new Set([
  'english', 'deutsch', 'present', 'simple', 'future', 'sentences', 'clauses', 'adjectives',
  'comparison', 'comparisons', 'questions', 'conditional', 'modals', 'forms', 'substitute'
]);

const GRAMMAR_ALIASES = {
  G1: ['going to', 'going-to'],
  G2: ['question tag', 'question-tag'],
  G3: ['questions with prepositions', 'fragen mit präposition'],
  G4: ['steigerung', 'comparison of adjectives', 'comparative', 'superlative'],
  G5: ['as ... as', 'as … as', 'than'],
  G6: ['relative clause', 'relativsatz', 'relativsätze', 'contact clause'],
  G7: ['past progressive', 'verlaufsform der vergangenheit'],
  G8: ['adverbial clause', 'linking words', 'type 0'],
  G9: ['present perfect'],
  G10: ['present perfect vs', 'present perfect or simple past', 'present perfect / simple past'],
  G11: ['timetable', 'fahrplan'],
  G12: ['adverbialsätze', 'subordinate clause', 'konjunktionen'],
  G13: ['substitute form', 'ersatzform', 'be allowed to', 'be able to', 'have to'],
  G14: ['should', 'shouldn\'t', 'giving advice', 'ratschläge'],
  G15: ['will future', 'will-future', 'futur mit will'],
  G16: ['future tenses', 'zukunft im vergleich', 'going to vs'],
  G17: ['if-clause', 'if clause', 'if-sätze', 'if-satz', 'conditional sentences type 1', 'type 1', 'bedingungssätze'],
  G18: ['may/might', 'might', 'can/could']
};

// "(a) Foto": matches OCR text against G-codes ("G 12", "G12"), units
// ("Unit 3" or the unit title), learning goals ("Can you …") and words of
// grammar titles / section names.
export function matchOcrToExamTopics(ocrText, content) {
  const candidates = examTopicCandidates(content);
  const found = new Map();
  const add = (topic, reason) => { if (topic && !found.has(topic.topicId)) found.set(topic.topicId, { ...topic, reason }); };
  const byGrammarCode = new Map(content.grammarTopics.map((t) => [t.code.toUpperCase(), t.id]));
  const text = ocrText.replace(/\s+/g, ' ');
  const lower = text.toLowerCase();

  // "G4–G6", "G 4-6" → G4, G5, G6
  for (const m of text.matchAll(/\bG\s?(\d{1,2})\s?[–-]\s?G?\s?(\d{1,2})\b/gi)) {
    for (let n = Number(m[1]); n <= Number(m[2]) && n - Number(m[1]) < 20; n++) {
      add(candidates.find((c) => c.topicId === byGrammarCode.get(`G${n}`)), `„${m[0]}"`);
    }
  }
  for (const m of text.matchAll(/\bG\s?(\d{1,2})\b/gi)) {
    const id = byGrammarCode.get(`G${Number(m[1])}`);
    add(candidates.find((c) => c.topicId === id), `„${m[0]}"`);
  }

  const unitNumbers = new Set([...text.matchAll(/\bunit\s?(\d)\b/gi)].map((m) => Number(m[1])));
  content.units.forEach((u) => {
    if (u.title && lower.includes(u.title.toLowerCase())) unitNumbers.add(u.unit);
  });
  unitNumbers.forEach((n) => candidates.filter((c) => c.unit === n).forEach((c) => add(c, `Unit ${n}`)));

  const significant = (s) => s.toLowerCase().split(/[^a-zäöüß-]+/).filter((w) => w.length > 4);
  const words = new Set(significant(text));
  (content.learningGoals || []).forEach((g) => {
    const goalWords = significant(`${g.text} ${g.example}`);
    if (goalWords.filter((w) => words.has(w)).length < 2) return;
    g.grammarCodes.forEach((code) => add(candidates.find((c) => c.topicId === byGrammarCode.get(code)), 'Lernziel'));
    g.vocabSections.forEach((s) => add(candidates.find((c) => c.topicId === `section::${g.unit}|${s}`), 'Lernziel'));
  });

  // usual names on a Stoffzettel that aren't the book's titles
  Object.entries(GRAMMAR_ALIASES).forEach(([code, aliases]) => {
    if (aliases.some((a) => lower.includes(a))) add(candidates.find((c) => c.topicId === byGrammarCode.get(code)), 'Stichwort');
  });

  content.grammarTopics.forEach((t) => {
    // generic words ("present", "simple" …) would hit several topics at once
    const titleWords = significant(t.title).filter((w) => !GENERIC_TITLE_WORDS.has(w));
    if (titleWords.some((w) => words.has(w))) add(candidates.find((c) => c.topicId === t.id), 'Titel');
  });

  return sortTopics([...found.values()]);
}

export function createExam6({ grade, kind, date, topics, source, sourceText, now }) {
  return {
    id: `exam_${now}`,
    grade,
    kind,
    date,
    createdAt: now,
    source,
    sourceText: sourceText || '',
    topics: sortTopics(topics).map((t) => ({ topicId: t.topicId, kind: t.kind, unit: t.unit, label: t.label, done: false })),
    goals: {}, // learning goal id → 'red' | 'yellow' | 'green'
    mockResults: []
  };
}

// ---------- study plan ----------

// Spreads the topics that aren't done yet over the days until the exam
// (~2 topics ≈ 15–20 minutes a day). With two or more days left, the day
// before the exam is kept for the mock exam and weak points.
export function buildStudyPlan(exam, fromIso = todayIso()) {
  const daysLeft = daysUntil(exam.date, fromIso);
  if (daysLeft === null || daysLeft < 0) return [];
  const open = exam.topics.map((t, index) => ({ ...t, index })).filter((t) => !t.done);
  // alternate grammar and vocabulary so a day isn't all one kind
  const grammar = open.filter((t) => t.kind === 'grammar');
  const vocab = open.filter((t) => t.kind !== 'grammar');
  const queue = [];
  while (grammar.length || vocab.length) {
    if (grammar.length) queue.push(grammar.shift());
    if (vocab.length) queue.push(vocab.shift());
  }

  const studyDays = Math.max(1, daysLeft >= 2 ? daysLeft - 1 : daysLeft || 1);
  // spread evenly over all study days (e.g. 21 topics / 9 days → 2–3 a day)
  const plan = [];
  for (let d = 0; d < studyDays; d++) {
    const items = queue.slice(Math.floor((d * queue.length) / studyDays), Math.floor(((d + 1) * queue.length) / studyDays));
    if (items.length || d === 0) plan.push({ date: addDays(fromIso, d), items, minutes: items.length * MINUTES_PER_TOPIC, mock: false });
  }
  if (daysLeft >= 2) plan.push({ date: addDays(exam.date, -1), items: [], minutes: MOCK_EXAM_MINUTES, mock: true });
  return plan;
}

export function goalsForExam(exam, content) {
  const units = new Set(exam.topics.map((t) => t.unit));
  return (content.learningGoals || []).filter((g) => units.has(g.unit));
}

export function examCompletionPct6(exam) {
  if (!exam || exam.topics.length === 0) return 0;
  return Math.round((exam.topics.filter((t) => t.done).length / exam.topics.length) * 100);
}

// ---------- mock exam (Probe-Schulaufgabe) ----------

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A vocabulary item "in context": the word's own example sentence with the
// word gapped out — only words whose (base) form appears literally in it.
function gapItem(word) {
  if (!word.example || word.type === 'phrase') return null;
  const base = word.en.split(' / ')[0].replace(/\([^)]*\)/g, '').replace(/^to\s+/, '').replace(/\b(sb|sth)\b/g, '').replace(/\s+/g, ' ').trim();
  if (base.length < 3) return null;
  const match = word.example.match(new RegExp(`\\b${escapeRegExp(base)}\\b`, 'i'));
  if (!match) return null;
  return {
    id: word.id,
    section: `section::${word.unit}|${word.section}`,
    sentence: word.example.replace(match[0], '_____'),
    hint: word.de,
    answer: match[0],
    points: 1
  };
}

export function buildMockExam(exam, content) {
  const units = [...new Set(exam.topics.map((t) => t.unit))].sort((a, b) => a - b);
  const sectionIds = new Set(exam.topics.filter((t) => t.kind === 'vocab').map((t) => t.topicId));
  const grammarIds = new Set(exam.topics.filter((t) => t.kind === 'grammar').map((t) => t.topicId));

  // 1. Vocabulary — from the exam's sections (or all words of its units)
  const words = content.vocab.filter((w) => w.section && (sectionIds.size ? sectionIds.has(`section::${w.unit}|${w.section}`) : units.includes(w.unit)));
  const vocab = shuffle(words).map(gapItem).filter(Boolean).slice(0, MOCK_VOCAB_ITEMS);

  // 2. Grammar — mixed, incl. transform questions (2 points each)
  const topicUnit = new Map(content.grammarTopics.map((t) => [t.id, t.unit]));
  const questions = content.grammarQuestions.filter((q) => (grammarIds.size ? grammarIds.has(q.topicId) : units.includes(topicUnit.get(q.topicId))));
  const transforms = shuffle(questions.filter((q) => q.type === 'transform')).slice(0, MOCK_TRANSFORM_ITEMS);
  const others = shuffle(questions.filter((q) => q.type !== 'transform')).slice(0, MOCK_GRAMMAR_ITEMS - transforms.length);
  const grammar = shuffle([...others, ...transforms]).map((q) => ({ question: q, points: q.type === 'transform' ? TRANSFORM_POINTS : 1 }));

  // 3. Reading — the story of the latest exam unit that has one
  const taskUnits = (content.examTasks || []).filter((u) => units.includes(u.unit));
  const readingUnit = taskUnits[taskUnits.length - 1] || null;

  // 4. Mediation — one task from the exam's units
  const mediationPool = taskUnits.flatMap((u) => u.mediation);
  const mediation = mediationPool.length ? shuffle(mediationPool)[0] : null;

  return {
    vocab,
    grammar,
    reading: readingUnit ? { unit: readingUnit.unit, story: readingUnit.story, questions: readingUnit.reading } : null,
    mediation
  };
}

// Scores the automatically checkable parts; mediation is self-assessed
// (ticked key points) and passed in as `mediationPoints`.
export function scoreMockExam(mock, answers, mediationPoints) {
  const vocabResults = mock.vocab.map((item, i) => ({ item, ok: checkVocabAnswer(answers.vocab[i] || '', item.answer) }));
  const grammarResults = mock.grammar.map((g, i) => ({ ...g, ok: checkGrammarAnswer(g.question, answers.grammar[i] || '') }));
  const readingResults = mock.reading ? mock.reading.questions.map((q, i) => ({ question: q, ok: answers.reading[i] === q.answer })) : [];

  const parts = [
    { key: 'vocab', label: 'Vocabulary', points: vocabResults.filter((r) => r.ok).length, max: mock.vocab.length },
    { key: 'grammar', label: 'Grammar', points: grammarResults.filter((r) => r.ok).reduce((n, r) => n + r.points, 0), max: mock.grammar.reduce((n, g) => n + g.points, 0) },
    { key: 'reading', label: 'Reading', points: readingResults.filter((r) => r.ok).length, max: readingResults.length },
    { key: 'mediation', label: 'Mediation', points: mediationPoints, max: mock.mediation ? mock.mediation.points : 0 }
  ].filter((p) => p.max > 0);

  const points = parts.reduce((n, p) => n + p.points, 0);
  const max = parts.reduce((n, p) => n + p.max, 0);

  // what to practise again: grammar topics / vocab sections with mistakes
  const weak = new Map();
  grammarResults.filter((r) => !r.ok).forEach((r) => weak.set(r.question.topicId, 'grammar'));
  vocabResults.filter((r) => !r.ok).forEach((r) => weak.set(r.item.section, 'vocab'));

  return { vocabResults, grammarResults, readingResults, parts, points, max, grade: gradeFor(points, max), weakTopicIds: [...weak.keys()] };
}
