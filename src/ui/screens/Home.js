import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { loadContent, availableUnitNumbers } from '../../data/contentStore.js';
import { computeVocabTargetProgress, computeGrammarTargetProgress } from '../../engine/progress.js';
import { examCompletionPct } from '../../engine/examPrep.js';
import { HORSE_MASCOT } from '../illustrations.js';

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

    // Default to the first unit, not the last, when no position has been set yet
    // (fresh install) — defaulting to the last unit would mark every earlier
    // unit as "completed" on the learning path despite 0% actually practiced.
    const grammarUnit = parseUnitFromPosition(state.bookPosition.grammar) || units[0];
    const vocabUnit = parseUnitFromPosition(state.bookPosition.vocabulary) || units[0];

    root.innerHTML = `
      <div class="top-bar">
        <div class="streak-badge"><span class="flame">${ICONS.fire}</span> ${streak} day${streak === 1 ? '' : 's'}</div>
      </div>
      ${learningPathRow('grammar', 'Grammar', grammarUnit, units, (u) => computeGrammarTargetProgress(content.grammarTopics, state, u))}
      ${learningPathRow('vocabulary', 'Vocabulary', vocabUnit, units, (u) => computeVocabTargetProgress(content.vocab, state, u))}
      ${examBar(state)}

      <div class="greeting-row">
        <div class="mascot-badge">${HORSE_MASCOT}</div>
        <div>
          <h1 class="greeting">Hi Juna! 👋</h1>
          <p class="subgreeting">What do you want to practise today?</p>
        </div>
      </div>

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

    root.querySelectorAll('.path-node').forEach((node) => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const [kind, unitStr] = node.dataset.setUnit.split(':');
        db.update((s) => { s.bookPosition[kind] = `Unit ${Number(unitStr)}`; });
        draw();
      });
    });
  }
}

// A tappable path of unit "stations". Units before the current position are
// "completed" (taught already), the current one is highlighted, and anything
// after is greyed out as not-yet-reached. Each reached station's ring is the
// *cumulative* progress across the whole book up to and including that unit
// (not just that unit alone) — so the current station always reads as "how
// ready are you for everything up to where you are now."
function learningPathRow(key, label, currentUnit, units, pctForUnit) {
  const nodes = units.map((u, i) => {
    const state = u < currentUnit ? 'completed' : u === currentUnit ? 'current' : 'future';
    const pct = state === 'future' ? null : pctForUnit(u);
    const connector = i < units.length - 1 ? `<div class="path-connector ${u < currentUnit ? 'filled' : ''}"></div>` : '';
    return pathNode(key, u, state, pct) + connector;
  }).join('');

  return `
    <div class="learning-path-wrap">
      <div class="path-label">${label}</div>
      <div class="learning-path">${nodes}</div>
    </div>
  `;
}

function pathNode(key, unit, state, pct) {
  const offset = pct === null ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE * (1 - pct / 100);
  return `
    <div class="path-node ${state}" data-set-unit="${key}:${unit}">
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

function parseUnitFromPosition(position) {
  if (!position) return null;
  const match = position.match(/(\d+)/);
  return match ? Number(match[1]) : null;
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
