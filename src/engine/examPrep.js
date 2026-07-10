const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'test', 'topics', 'topic', 'english', 'quiz', 'exam',
  'chapter', 'unit', 'seite', 'page', 'für', 'fur', 'und', 'oder', 'klasse', 'klassenarbeit',
  'schulaufgabe', 'prufung', 'prüfung', 'stoff', 'themen'
]);

function significantWords(text) {
  return normalize(text)
    .split(/[^a-zäöüß]+/i)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function normalize(text) {
  return text.toLowerCase();
}

function prettifyCategory(category) {
  return category
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Builds the list of candidate "topics" an exam sheet line could refer to: every
// grammar topic, plus every distinct vocab category treated as a topic of its own.
export function buildMatchCandidates(content) {
  const grammarCandidates = content.grammarTopics.map((t) => ({
    topicId: t.id,
    kind: 'grammar',
    label: `${t.code} — ${t.title}`,
    unit: t.unit,
    searchBlob: normalize([t.code, t.title, t.explanation, ...(t.examples || [])].join(' '))
  }));

  const vocabCategories = new Map();
  content.vocab.forEach((w) => {
    const key = `${w.unit}::${w.category}`;
    if (!vocabCategories.has(key)) {
      vocabCategories.set(key, { unit: w.unit, category: w.category, words: [] });
    }
    vocabCategories.get(key).words.push(w);
  });

  const vocabCandidates = [...vocabCategories.entries()].map(([key, group]) => ({
    topicId: `vocab::${key}`,
    kind: 'vocab',
    label: `${prettifyCategory(group.category)} vocabulary`,
    unit: group.unit,
    searchBlob: normalize([group.category, ...group.words.map((w) => `${w.de} ${w.en}`)].join(' '))
  }));

  return [...grammarCandidates, ...vocabCandidates];
}

// Scores every candidate against a line of OCR'd text by counting shared significant
// words, then keeps only candidates that clear a minimal relevance bar.
function scoreLine(line, candidates) {
  const words = significantWords(line);
  if (words.length === 0) return [];

  return candidates
    .map((c) => {
      const score = words.reduce((sum, w) => sum + (c.searchBlob.includes(w) ? 1 : 0), 0);
      return { candidate: c, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Matches raw OCR text against the bundled content, returning the best candidate
// topics per line (deduped), ready to become an exam log's topic checklist.
export function matchOcrTextToTopics(ocrText, content) {
  const candidates = buildMatchCandidates(content);
  const lines = ocrText.split('\n').map((l) => l.trim()).filter(Boolean);

  const matchedById = new Map();
  for (const line of lines) {
    const ranked = scoreLine(line, candidates).slice(0, 2); // best 1-2 matches per line
    for (const { candidate, score } of ranked) {
      const existing = matchedById.get(candidate.topicId);
      if (!existing || score > existing.score) {
        matchedById.set(candidate.topicId, { ...candidate, score, sourceLine: line });
      }
    }
  }

  return [...matchedById.values()].sort((a, b) => b.score - a.score);
}

export function createExam(matchedTopics, now, sourceText) {
  return {
    id: `exam_${now}`,
    createdAt: now,
    sourceText,
    topics: matchedTopics.map((t) => ({
      topicId: t.topicId,
      kind: t.kind,
      label: t.label,
      done: false
    }))
  };
}

export function examCompletionPct(exam) {
  if (!exam || exam.topics.length === 0) return 0;
  const done = exam.topics.filter((t) => t.done).length;
  return Math.round((done / exam.topics.length) * 100);
}
