import { pickWeighted } from './leitner.js';

export const MAX_ATTEMPTS = 3;

// Builds the word list for a session: ~70% from the current unit, ~30% from
// earlier units (spec section 4), with the specific words inside each slice
// chosen by Leitner box weight (spec section 5 — box 1 words come up most).
export function buildVocabSession(vocab, state, currentUnit, count) {
  const recentPool = vocab.filter((w) => w.unit === currentUnit);
  const olderPool = vocab.filter((w) => w.unit < currentUnit);

  const recentCount = Math.min(recentPool.length, Math.round(count * 0.7));
  const olderCount = Math.min(olderPool.length, count - recentCount);

  const recentIds = pickWeighted(recentPool.map((w) => w.id), state, recentCount);
  const olderIds = pickWeighted(olderPool.map((w) => w.id), state, olderCount);

  let chosenIds = [...recentIds, ...olderIds];

  // Top up from whatever's left if either pool was too small.
  if (chosenIds.length < count) {
    const usedIds = new Set(chosenIds);
    const leftoverPool = vocab.filter((w) => !usedIds.has(w.id));
    const extra = pickWeighted(leftoverPool.map((w) => w.id), state, count - chosenIds.length);
    chosenIds = [...chosenIds, ...extra];
  }

  const byId = new Map(vocab.map((w) => [w.id, w]));
  return shuffle(chosenIds.map((id) => byId.get(id)).filter(Boolean));
}

export function buildWeakPointsSession(vocab, state, count) {
  const ids = pickWeighted(vocab.map((w) => w.id), state, count);
  const byId = new Map(vocab.map((w) => [w.id, w]));
  return shuffle(ids.map((id) => byId.get(id)).filter(Boolean));
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
  return str
    .trim()
    .toLowerCase()
    .replace(/^to\s+/, '') // "to go" vs "go" shouldn't matter
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Accepts the primary answer or any "/"-separated alternative (e.g. "to call / to phone"),
// tolerating a single typo (distance <= 1) on reasonably long answers.
export function checkVocabAnswer(userInput, correctAnswer) {
  const guess = normalize(userInput);
  if (!guess) return false;
  const alternatives = correctAnswer.split('/').map((a) => normalize(a));
  return alternatives.some((alt) => {
    if (guess === alt) return true;
    if (alt.length >= 4) return levenshtein(guess, alt) <= 1;
    return false;
  });
}
