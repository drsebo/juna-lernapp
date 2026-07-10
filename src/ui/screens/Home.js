import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { loadContent, availableUnitNumbers } from '../../data/contentStore.js';
import { computeVocabTargetProgress, computeGrammarTargetProgress } from '../../engine/progress.js';

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
  const local = { editingBar: null }; // 'grammar' | 'vocabulary' | null

  draw();

  function draw() {
    const state = db.load();
    const streak = state.streak.count;
    const hasActiveExam = Boolean(state.activeExamId);

    const grammarUnit = parseUnitFromPosition(state.bookPosition.grammar) || units[units.length - 1];
    const vocabUnit = parseUnitFromPosition(state.bookPosition.vocabulary) || units[units.length - 1];
    const grammarPct = computeGrammarTargetProgress(content.grammarTopics, state, grammarUnit);
    const vocabPct = computeVocabTargetProgress(content.vocab, state, vocabUnit);

    root.innerHTML = `
      <div class="top-bar">
        <div class="streak-badge"><span class="flame">${ICONS.fire}</span> ${streak} day${streak === 1 ? '' : 's'}</div>
      </div>
      ${progressBlock('grammar', 'Grammar', grammarUnit, grammarPct, units, local.editingBar === 'grammar')}
      ${progressBlock('vocabulary', 'Vocabulary', vocabUnit, vocabPct, units, local.editingBar === 'vocabulary')}

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

    root.querySelectorAll('.position-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.edit;
        local.editingBar = local.editingBar === key ? null : key;
        draw();
      });
    });
    root.querySelectorAll('[data-set-unit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [kind, unitStr] = btn.dataset.setUnit.split(':');
        db.update((s) => { s.bookPosition[kind] = `Unit ${Number(unitStr)}`; });
        local.editingBar = null;
        draw();
      });
    });
  }
}

function progressBlock(key, label, currentUnit, pct, units, isEditing) {
  return `
    <div class="progress-wrap">
      <div class="progress-label">
        <span class="progress-title">${label} <button class="position-edit-btn" data-edit="${key}">Unit ${currentUnit} ✎</button></span>
        <span>${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      ${isEditing ? `
        <div class="position-picker">
          ${units.map((u) => `<button class="seg-btn${u === currentUnit ? ' active' : ''}" data-set-unit="${key}:${u}">Unit ${u}</button>`).join('')}
        </div>
      ` : ''}
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
