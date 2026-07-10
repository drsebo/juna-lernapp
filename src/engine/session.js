// Shared recency-weighted content picker used by grammar, vocabulary and conversations
// (spec section 4 & 6): ~70% from the most recent unit/topic, ~30% from earlier ones.

const RECENT_SHARE = 0.7;

// items: array of { id, unit, ...}. currentUnit: number (the unit the learner just told us
// they're at, e.g. 5 for "Unit 5"). Returns a shuffled selection of `count` items.
export function pickRecencyWeighted(items, currentUnit, count) {
  const recentPool = items.filter((item) => item.unit === currentUnit);
  const olderPool = items.filter((item) => item.unit < currentUnit);
  const fallbackPool = items.filter((item) => item.unit > currentUnit);

  const recentCount = Math.round(count * RECENT_SHARE);
  const olderCount = count - recentCount;

  const picked = [
    ...sampleN(recentPool, recentCount),
    ...sampleN(olderPool, olderCount)
  ];

  // Not enough recent/older items? Top up from whatever pool has items left.
  if (picked.length < count) {
    const usedIds = new Set(picked.map((i) => i.id));
    const leftovers = [...recentPool, ...olderPool, ...fallbackPool].filter(
      (i) => !usedIds.has(i.id)
    );
    picked.push(...sampleN(leftovers, count - picked.length));
  }

  return shuffle(picked).slice(0, count);
}

function sampleN(pool, n) {
  return shuffle(pool).slice(0, Math.max(0, n));
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// --- Timer ---

export function createTimer({ limitMinutes, onLimitReached, onTick }) {
  let secondsElapsed = 0;
  let extensions = [];
  let limitSeconds = limitMinutes ? limitMinutes * 60 : null;
  let intervalId = null;
  let notified = false;

  function start() {
    intervalId = setInterval(() => {
      secondsElapsed += 1;
      onTick?.(secondsElapsed);
      if (limitSeconds && !notified && secondsElapsed >= limitSeconds) {
        notified = true;
        onLimitReached?.();
      }
    }, 1000);
  }

  function stop() {
    if (intervalId) clearInterval(intervalId);
  }

  function extend(minutes, now) {
    limitSeconds = (limitSeconds || 0) + minutes * 60;
    notified = false;
    extensions.push({ date: now, minutesAdded: minutes });
  }

  function getExtensions() {
    return extensions;
  }

  return { start, stop, extend, getExtensions };
}
