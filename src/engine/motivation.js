// XP, levels and the daily streak goal shown on Home and the results screen.
// Everything here is derived from (or stored alongside) the existing progress
// state — XP only ever goes up, so a wrong answer never takes anything away.

export const XP_PER_CORRECT = 10;
export const XP_SESSION_BONUS = 20;

const LEVEL_TITLES = [
  'Starter', 'Explorer', 'Talker', 'Traveller', 'Storyteller',
  'Word Hunter', 'Grammar Ninja', 'Pro', 'Expert', 'Legend'
];

// Older progress docs were created before XP existed (state.xp is missing or
// null) — rather than starting those learners at zero, estimate what they
// would have earned from the answers and sessions already on record.
export function getXp(state) {
  if (typeof state.xp === 'number') return state.xp;
  const vocabCorrect = Object.values(state.leitner || {}).reduce((sum, e) => sum + (e.timesCorrect || 0), 0);
  const grammarCorrect = Object.values(state.grammarProgress || {}).reduce((sum, e) => sum + (e.timesCorrect || 0), 0);
  const sessions = (state.overallProgress && state.overallProgress.sessionsCompleted) || 0;
  return (vocabCorrect + grammarCorrect) * XP_PER_CORRECT + sessions * XP_SESSION_BONUS;
}

// Voice conversations: XP for the time actually spent talking (connected),
// counted from MIN_VOICE_SECONDS on — a session bonus plus XP per full minute.
export const XP_PER_VOICE_MINUTE = 20;
export const MIN_VOICE_SECONDS = 30;

export function xpForVoice(seconds) {
  if (seconds < MIN_VOICE_SECONDS) return 0;
  return XP_SESSION_BONUS + Math.floor(seconds / 60) * XP_PER_VOICE_MINUTE;
}

export function xpForSession(results) {
  return results.correctCount * XP_PER_CORRECT + XP_SESSION_BONUS;
}

export function awardXp(state, amount) {
  state.xp = getXp(state) + amount;
  return state;
}

// Level n starts at 50·n·(n−1) XP: 0, 100, 300, 600, 1000, … — each level
// needs 100 XP more than the one before, so early levels come quickly.
function levelStartXp(level) {
  return 50 * level * (level - 1);
}

export function levelInfo(xp) {
  let level = 1;
  while (levelStartXp(level + 1) <= xp) level += 1;
  const start = levelStartXp(level);
  const next = levelStartXp(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    xpIntoLevel: xp - start,
    xpForLevel: next - start,
    xpToNext: next - xp,
    pct: Math.round(((xp - start) / (next - start)) * 100)
  };
}

// 'done' = already practised today, 'keep' = streak alive but today still
// open, 'start' = no streak running (never practised, or a day was missed).
export function streakStatus(state, todayIso) {
  const last = state.streak.lastSessionDate;
  if (last === todayIso) return 'done';
  if (!last || state.streak.count === 0) return 'start';
  const a = new Date(last + 'T00:00:00');
  const b = new Date(todayIso + 'T00:00:00');
  const gap = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return gap === 1 ? 'keep' : 'start';
}

// How many words sit in each Leitner box, plus the ones never practised —
// makes the box system visible on Home instead of hiding it in the engine.
export function boxCounts(vocab, state) {
  const counts = { fresh: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  vocab.forEach((w) => {
    if (w.type !== 'word') return;
    const entry = state.leitner[w.id];
    if (entry) counts[entry.box] += 1; else counts.fresh += 1;
  });
  return counts;
}
