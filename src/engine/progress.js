function todayISO(now) {
  return now.slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// Called once when a session (grammar/vocab/conversation/weak-points) finishes.
// `now` is an ISO datetime string supplied by the caller (kept as a param, not
// generated here, so this stays a pure/testable function).
export function recordSessionCompletion(state, now) {
  const today = todayISO(now);
  const last = state.streak.lastSessionDate;

  if (last === today) {
    // already counted today, no change
  } else if (last && daysBetween(last, today) === 1) {
    state.streak.count += 1;
    state.streak.lastSessionDate = today;
  } else {
    state.streak.count = 1;
    state.streak.lastSessionDate = today;
  }

  state.overallProgress.sessionsCompleted += 1;
  return state;
}

export function logTimerExtension(state, mode, minutesAdded, now) {
  state.timerExtensions.push({ date: now, mode, minutesAdded });
  return state;
}

export function logWordCountExtension(state, mode, wordsAdded, now) {
  state.wordCountExtensions.push({ date: now, mode, wordsAdded });
  return state;
}

// Progress against the teacher-defined learning stand (state.bookPosition), not
// against the entire bundled book content — a word/topic from a unit beyond
// where the teacher has taught doesn't count against or for the learner yet.
// Untouched items within the target scope count as 0% (they're expected to be
// known by now but haven't been practiced), which is what makes this an honest
// "how ready are you for what's been taught" measure rather than a vanity stat.
function averageWordMastery(words, state) {
  if (words.length === 0) return 0;
  const total = words.reduce((sum, w) => {
    const entry = state.leitner[w.id];
    const box = entry ? entry.box : 1;
    return sum + (box - 1) / 3;
  }, 0);
  return Math.round((total / words.length) * 100);
}

function averageTopicMastery(topics, state) {
  if (topics.length === 0) return 0;
  const total = topics.reduce((sum, t) => {
    const entry = state.grammarProgress[t.id];
    if (!entry) return sum;
    const attempts = entry.timesCorrect + entry.timesWrong;
    return sum + (attempts === 0 ? 0 : entry.timesCorrect / attempts);
  }, 0);
  return Math.round((total / topics.length) * 100);
}

// Resolves a stored progress-reference id (a specific vocab word / grammar
// topic id — "Juna knows everything up to and including this one") to its
// position in the book-ordered content array. -1 means "not set" or the
// referenced item no longer exists (e.g. content was edited); callers treat
// that as nothing being confirmed yet rather than guessing a default.
export function resolveReferenceIndex(items, itemId) {
  if (!itemId) return -1;
  return items.findIndex((item) => item.id === itemId);
}

export function computeVocabTargetProgress(vocab, state, cutoffIndex) {
  if (cutoffIndex < 0) return 0;
  return averageWordMastery(vocab.filter((w, i) => w.type === 'word' && i <= cutoffIndex), state);
}

export function computeGrammarTargetProgress(grammarTopics, state, cutoffIndex) {
  if (cutoffIndex < 0) return 0;
  return averageTopicMastery(grammarTopics.filter((t, i) => i <= cutoffIndex), state);
}
