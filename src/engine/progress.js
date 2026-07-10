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
