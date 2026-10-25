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
    .replace(/[‘’ʼ`´]/g, "'") // iPad keyboards type ’ instead of '
    .replace(/…|\.\.\./g, ' ')
    .replace(/^to\s+/, '') // "to go" vs "go" shouldn't matter
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Labels in brackets that are never part of the answer.
const LABELS = /^(infml|fml|AE|BE|pl|sg|pl only|km)$|^[+=]/i;

// "to hang out (with) (infml)" → "hang out", "hang out with": each bracketed
// part like "(sb)" or "(with)" may be typed or left out, labels such as
// "(infml)" / "(AE)" are always dropped, and "sb"/"sth" are optional. For
// "life, lives (pl)" any comma-separated form counts.
function englishVariants(answer) {
  const out = new Set();
  for (const part of [answer, ...answer.split(',')]) {
    const cleaned = part.replace(/\(([^)]*)\)/g, (m, inner) => (LABELS.test(inner.trim()) ? '' : m));
    // every bracket group: left out, or one of its "/"-alternatives ("(to/with)")
    let variants = [''];
    let rest = cleaned;
    for (const m of cleaned.matchAll(/\(([^)]*)\)/g)) {
      const [before] = rest.split(m[0]);
      rest = rest.slice(before.length + m[0].length);
      const options = ['', ...m[1].split('/')];
      variants = variants.flatMap((v) => options.map((o) => v + before + o));
    }
    for (const v of variants.map((x) => x + rest)) {
      out.add(normalize(v));
      out.add(normalize(v.replace(/\b(sb|sth)\b/g, ' ')));
    }
  }
  out.delete('');
  return [...out];
}

// Accepts the primary answer or any "/"-separated alternative (e.g. "to call / to phone").
// Exact match only (after normalizing case/whitespace/punctuation) — a vocabulary drill
// should confirm the learner actually knows the correct spelling, not approve near-misses
// like a missing letter (e.g. "Supermarke" for "supermarket").
export function checkVocabAnswer(userInput, correctAnswer) {
  const guess = normalize(userInput.replace(/[()]/g, ''));
  if (!guess) return false;
  // split on "/" only outside brackets: "to be connected (to/with)" is one answer
  return correctAnswer.split(/\/(?![^(]*\))/).some((alt) => englishVariants(alt).includes(guess));
}

// German meanings are separated by ";" or "," ("enden; landen"); any one of them
// counts. Gender endings ("Angeber/-in", "neueste/-r/-s"), bracketed parts
// ("(sich) verstecken") and "jmdn./jmdm./etw." may be left out.
function germanVariants(meaning) {
  const out = new Set();
  // "Angeber/-in" → "Angeber" and "Angeberin"
  for (const base of [meaning.replace(/\/-\w+/g, ''), meaning.replace(/\/-(\w+)/, '$1').replace(/\/-\w+/g, '')]) {
    for (const v of [base.replace(/\([^)]*\)/g, ' '), base.replace(/[()]/g, '')]) {
      out.add(normalizeDe(v));
      out.add(normalizeDe(v.replace(/\b(jmdn|jmdm|jmds|etw)\./g, ' ')));
    }
  }
  out.delete('');
  return [...out];
}

function normalizeDe(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/…|\.\.\./g, ' ')
    .replace(/[.,!?;]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkGermanAnswer(userInput, correctAnswer) {
  const guess = normalizeDe(userInput.replace(/\/-\w+/g, '').replace(/[()]/g, ''));
  if (!guess) return false;
  return correctAnswer.split(/[;,]/).some((meaning) => germanVariants(meaning).includes(guess));
}

// One question = one word in one direction ("de-en": German shown, English
// typed; "en-de": the other way round). "mixed" decides per word.
export function withDirections(words, direction) {
  return words.map((word) => ({
    word,
    direction: direction === 'mixed' ? (Math.random() < 0.5 ? 'de-en' : 'en-de') : direction
  }));
}

// Grade 6 sessions: the chosen units/sections (~60 %), earlier grade 6 words
// (~30 %) and grade 5 words as review (~10 %), each slice picked by Leitner box
// weight. A slice that runs short is topped up from the next ones.
export const GRADE6_SHARES = { selected: 0.6, earlier: 0.3, review: 0.1 };

export function buildMixedVocabSession(parts, state, count) {
  const wanted = parts.map((p) => Math.round(count * p.share));
  wanted[0] += count - wanted.reduce((a, b) => a + b, 0);
  const chosen = new Set();
  parts.forEach((p, i) => {
    pickWeighted(p.pool.map((w) => w.id), state, Math.min(wanted[i], p.pool.length)).forEach((id) => chosen.add(id));
  });
  for (const p of parts) {
    if (chosen.size >= count) break;
    const left = p.pool.filter((w) => !chosen.has(w.id)).map((w) => w.id);
    pickWeighted(left, state, count - chosen.size).forEach((id) => chosen.add(id));
  }
  const byId = new Map(parts.flatMap((p) => p.pool).map((w) => [w.id, w]));
  return shuffle([...chosen].map((id) => byId.get(id)).filter(Boolean));
}
