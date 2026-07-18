import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { loadContent, availableUnitNumbers } from '../../data/contentStore.js';
import { computeVocabTargetProgress, computeGrammarTargetProgress, resolveReferenceIndex } from '../../engine/progress.js';
import { examCompletionPct } from '../../engine/examPrep.js';

const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const ICONS = {
  grammar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V6a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 4v4a1 1 0 0 0 1 1h4"/><path d="M8 13h8M8 17h5"/></svg>',
  vocabulary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/></svg>',
  conversations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
  exam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  fire: '🔥'
};

export async function renderHome(root) {
  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const units = availableUnitNumbers(content);

  draw();

  function draw() {
    const state = db.load();
    const streak = state.streak.count;
    const hasActiveExam = Boolean(state.activeExamId);

    const vocabRefIndex = resolveReferenceIndex(content.vocab, state.progressReference.vocabularyWordId);
    const grammarRefIndex = resolveReferenceIndex(content.grammarTopics, state.progressReference.grammarTopicId);
    const vocabRefItem = vocabRefIndex >= 0 ? content.vocab[vocabRefIndex] : null;
    const grammarRefItem = grammarRefIndex >= 0 ? content.grammarTopics[grammarRefIndex] : null;

    root.innerHTML = `
      <div class="top-bar">
        <div class="streak-badge"><span class="flame">${ICONS.fire}</span> ${streak} day${streak === 1 ? '' : 's'}</div>
      </div>

      ${positionField({
        key: 'grammar',
        label: 'Grammar known up to',
        placeholder: 'e.g. G30',
        currentValue: grammarRefItem ? grammarRefItem.code : '',
        datalistId: 'grammar-options',
        datalistHtml: content.grammarTopics.map((t) => `<option value="${escapeAttr(t.code)}">${escapeHtml(t.code)} — ${escapeHtml(t.title)}</option>`).join(''),
        status: grammarRefItem
          ? `→ Unit ${grammarRefItem.unit} · ${computeGrammarTargetProgress(content.grammarTopics, state, grammarRefIndex)}% mastered of ${grammarRefIndex + 1} topics covered so far`
          : 'Enter the grammar number your teacher confirmed she knows (e.g. G30), to track real progress.'
      })}
      ${learningPathRow('grammar', grammarRefItem ? grammarRefItem.unit : null, units, (u) => computeGrammarTargetProgress(content.grammarTopics, state, cutoffIndexForUnit(content.grammarTopics, u)))}

      ${positionField({
        key: 'vocabulary',
        label: 'Vocabulary known up to',
        placeholder: 'e.g. bracelet',
        currentValue: vocabRefItem ? vocabRefItem.en : '',
        datalistId: 'vocab-options',
        datalistHtml: content.vocab.map((w) => `<option value="${escapeAttr(w.en)}">${escapeHtml(w.en)} — ${escapeHtml(w.de)} (Unit ${w.unit})</option>`).join(''),
        status: vocabRefItem
          ? `→ Unit ${vocabRefItem.unit} · ${computeVocabTargetProgress(content.vocab, state, vocabRefIndex)}% mastered of ${vocabRefIndex + 1} words covered so far`
          : 'Enter the last English word your teacher confirmed she knows, to track real progress.'
      })}
      ${learningPathRow('vocabulary', vocabRefItem ? vocabRefItem.unit : null, units, (u) => computeVocabTargetProgress(content.vocab, state, cutoffIndexForUnit(content.vocab, u)))}

      ${examBar(state)}

      <h1 class="greeting">Hi Juna! 👋</h1>
      <p class="subgreeting">What do you want to practise today?</p>

      <div class="card-grid">
        ${card('grammar', 'Grammar', 'Units 5 & 6', ICONS.grammar)}
        ${card('vocabulary', 'Vocabulary', 'Units 5 & 6', ICONS.vocabulary)}
        ${card('conversations', 'Conversations', 'Roleplay & dialogue', ICONS.conversations)}
        ${card('exam-prep', 'Exam Prep', hasActiveExam ? 'Active exam in progress' : 'Tap to set up an exam', ICONS.exam, !hasActiveExam)}
      </div>

      <button class="weak-points-btn" id="weak-points-btn">
        <span>⭐ Study weak points</span>
        <span>›</span>
      </button>

      <button class="text-link-btn" id="manage-content-btn">＋ Add unit content</button>
    `;

    root.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => navigate(`/${el.dataset.route}`));
    });
    root.querySelector('#weak-points-btn').addEventListener('click', () => navigate('/weak-points'));
    root.querySelector('#manage-content-btn').addEventListener('click', () => navigate('/manage-content'));
    root.querySelector('#exam-bar').addEventListener('click', () => navigate('/exam-prep'));

    bindPositionInput(root, 'grammar', (text) => findGrammarByCode(content.grammarTopics, text), (match) => {
      db.update((s) => { s.progressReference.grammarTopicId = match ? match.id : null; });
      draw();
    });
    bindPositionInput(root, 'vocabulary', (text) => findVocabByText(content.vocab, text), (match) => {
      db.update((s) => { s.progressReference.vocabularyWordId = match ? match.id : null; });
      draw();
    });
  }
}

// A manual text field (with a native datalist of valid values for assistance)
// used to pin down exactly which word/topic the teacher confirmed as known —
// far more precise than picking a whole unit, and the actual source of truth
// for the progress percentages shown below it and on the learning path.
function positionField({ key, label, placeholder, currentValue, datalistId, datalistHtml, status }) {
  return `
    <div class="position-field-wrap">
      <div class="path-label">${label}</div>
      <input
        class="position-input"
        id="position-input-${key}"
        list="${datalistId}"
        placeholder="${escapeAttr(placeholder)}"
        value="${escapeAttr(currentValue)}"
        autocomplete="off"
      />
      <datalist id="${datalistId}">${datalistHtml}</datalist>
      <div class="position-status" id="position-status-${key}">${status}</div>
    </div>
  `;
}

function bindPositionInput(root, key, matcher, onResolved) {
  const input = root.querySelector(`#position-input-${key}`);
  const status = root.querySelector(`#position-status-${key}`);
  input.addEventListener('change', () => {
    const text = input.value.trim();
    if (text === '') {
      input.classList.remove('input-error');
      onResolved(null);
      return;
    }
    const match = matcher(text);
    if (match) {
      input.classList.remove('input-error');
      onResolved(match);
    } else {
      input.classList.add('input-error');
      status.textContent = 'Not found in the list — pick a suggestion as you type.';
    }
  });
}

function findVocabByText(vocab, text) {
  const norm = text.trim().toLowerCase();
  return vocab.find((w) => w.en.trim().toLowerCase() === norm) || null;
}

function findGrammarByCode(grammarTopics, text) {
  const norm = text.trim().toLowerCase();
  return grammarTopics.find((t) => t.code.trim().toLowerCase() === norm) || null;
}

// Index of the last item (in book order) belonging to a unit at or before the
// given one — i.e. "everything through the end of this unit". Used to give
// each learning-path station a cumulative percentage, same as before this
// became word/topic-precise for the actual stored reference.
function cutoffIndexForUnit(items, unit) {
  let idx = -1;
  items.forEach((item, i) => { if (item.unit <= unit) idx = i; });
  return idx;
}

// A read-only path of unit "stations" showing cumulative progress. Units
// before the reference's unit are "completed", the reference's own unit is
// "current", anything after is "future" — greyed out until a reference is set
// at all (cutoffUnit === null), which happens on first use before either
// position field above has been filled in.
function learningPathRow(key, cutoffUnit, units, pctForUnit) {
  const nodes = units.map((u, i) => {
    const state = cutoffUnit === null ? 'future' : u < cutoffUnit ? 'completed' : u === cutoffUnit ? 'current' : 'future';
    const pct = state === 'future' ? null : pctForUnit(u);
    const connector = i < units.length - 1 ? `<div class="path-connector ${cutoffUnit !== null && u < cutoffUnit ? 'filled' : ''}"></div>` : '';
    return pathNode(u, state, pct) + connector;
  }).join('');

  return `
    <div class="learning-path-wrap">
      <div class="learning-path">${nodes}</div>
    </div>
  `;
}

function pathNode(unit, state, pct) {
  const offset = pct === null ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE * (1 - pct / 100);
  return `
    <div class="path-node ${state}">
      <svg viewBox="0 0 52 52" class="path-ring">
        <circle cx="26" cy="26" r="${RING_RADIUS}" class="ring-bg"/>
        ${state !== 'future' ? `<circle cx="26" cy="26" r="${RING_RADIUS}" class="ring-fill" stroke-dasharray="${RING_CIRCUMFERENCE}" stroke-dashoffset="${offset}"/>` : ''}
      </svg>
      <div class="path-node-inner">${state === 'completed' ? '✓' : unit}</div>
      <div class="path-node-label">Unit ${unit}${state !== 'future' ? ` · ${pct}%` : ''}</div>
    </div>
  `;
}

// A third bar, separate from the two subject paths: covers only the topics an
// active exam actually needs (not the whole book), and sits greyed-out/inert
// until an exam is set up — mirrors the Exam Prep card's own active/inactive
// state so the two never contradict each other.
function examBar(state) {
  const activeExam = state.exams.find((e) => e.id === state.activeExamId);
  const pct = activeExam ? examCompletionPct(activeExam) : 0;

  return `
    <div class="progress-wrap exam-bar${activeExam ? '' : ' disabled'}" id="exam-bar">
      <div class="progress-label">
        <span class="progress-title">📋 Exam Prep</span>
        <span>${activeExam ? `${pct}%` : 'No active exam'}</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

function card(route, title, sub, iconSvg, greyed = false) {
  return `
    <button class="card${greyed ? ' disabled' : ''}" data-route="${route}">
      <div class="card-icon">${iconSvg}</div>
      <div class="card-title">${title}</div>
      <div class="card-sub">${sub}</div>
    </button>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
