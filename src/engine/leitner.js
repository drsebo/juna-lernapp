export const MIN_BOX = 1;
export const MAX_BOX = 4;

export function getEntry(state, vocabId) {
  return state.leitner[vocabId] || { box: MIN_BOX, lastSeen: null, timesCorrect: 0, timesWrong: 0 };
}

// True only for a word never seen before — distinct from "box 1" in general,
// which also covers words seen and gotten wrong. Only genuinely new words
// should get the introduction card before being quizzed.
export function isNewWord(state, vocabId) {
  return !state.leitner[vocabId];
}

export function recordAnswer(state, vocabId, correct, now) {
  const entry = getEntry(state, vocabId);
  const nextBox = correct
    ? Math.min(MAX_BOX, entry.box + 1)
    : Math.max(MIN_BOX, entry.box - 1);

  state.leitner[vocabId] = {
    box: nextBox,
    lastSeen: now,
    timesCorrect: entry.timesCorrect + (correct ? 1 : 0),
    timesWrong: entry.timesWrong + (correct ? 0 : 1)
  };
  return state.leitner[vocabId];
}

// Higher weight = asked more often. Box 1 most often, box 4 rarely.
const BOX_WEIGHT = { 1: 8, 2: 4, 3: 2, 4: 1 };

export function weightForBox(box) {
  return BOX_WEIGHT[box] || BOX_WEIGHT[MIN_BOX];
}

export function pickWeighted(vocabIds, state, count) {
  const pool = vocabIds.map((id) => ({ id, weight: weightForBox(getEntry(state, id).box) }));
  const picked = [];
  const remaining = [...pool];

  while (picked.length < count && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      r -= remaining[idx].weight;
      if (r <= 0) break;
    }
    const chosenIdx = Math.min(idx, remaining.length - 1);
    picked.push(remaining[chosenIdx].id);
    remaining.splice(chosenIdx, 1);
  }
  return picked;
}

export function boxOneIds(vocabIds, state) {
  return vocabIds.filter((id) => getEntry(state, id).box === MIN_BOX);
}
