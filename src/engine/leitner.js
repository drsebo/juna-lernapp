export const MIN_BOX = 1;
export const MAX_BOX = 4;

// Each drill keeps its own set of boxes in the progress state: "leitner" for
// words (the default everywhere), "verbLeitner" for the irregular-verb trainer
// and "pairLeitner" for British vs. American English — knowing "go" as a word
// says nothing about knowing "went – gone".
function boxesOf(state, store) {
  if (!state[store]) state[store] = {};
  return state[store];
}

export function getEntry(state, vocabId, store = 'leitner') {
  return (state[store] || {})[vocabId] || { box: MIN_BOX, lastSeen: null, timesCorrect: 0, timesWrong: 0 };
}

// True only for a word never seen before — distinct from "box 1" in general,
// which also covers words seen and gotten wrong. Only genuinely new words
// should get the introduction card before being quizzed.
export function isNewWord(state, vocabId) {
  return !state.leitner[vocabId];
}

export function recordAnswer(state, vocabId, correct, now, store = 'leitner') {
  const entry = getEntry(state, vocabId, store);
  const nextBox = correct
    ? Math.min(MAX_BOX, entry.box + 1)
    : Math.max(MIN_BOX, entry.box - 1);

  const boxes = boxesOf(state, store);
  boxes[vocabId] = {
    box: nextBox,
    lastSeen: now,
    timesCorrect: entry.timesCorrect + (correct ? 1 : 0),
    timesWrong: entry.timesWrong + (correct ? 0 : 1)
  };
  return boxes[vocabId];
}

// Higher weight = asked more often. Box 1 most often, box 4 rarely.
const BOX_WEIGHT = { 1: 8, 2: 4, 3: 2, 4: 1 };

export function weightForBox(box) {
  return BOX_WEIGHT[box] || BOX_WEIGHT[MIN_BOX];
}

export function pickWeighted(vocabIds, state, count, store = 'leitner') {
  const pool = vocabIds.map((id) => ({ id, weight: weightForBox(getEntry(state, id, store).box) }));
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
