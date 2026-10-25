import { loadContent, availableUnitNumbers, defaultUnit } from '../../data/contentStore.js';
import { db, gradeState } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { setSessionConfig } from '../sessionContext.js';

export async function renderGrammarSetup(root) {
  root.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="back-btn">‹</button>
      <h1 class="greeting" style="margin:0;font-size:1.2rem;">Grammar</h1>
    </div>
    <div class="placeholder-note">Loading…</div>
  `;
  root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));

  const content = await loadContent();
  const state = db.load();
  const units = availableUnitNumbers(content);

  const local = {
    unit: parseUnitFromPosition(gradeState(state).bookPosition.grammar) || defaultUnit(content, gradeState(state)),
    mode: 'topics', // 'topics' | 'time'
    topicCount: 3,
    minutes: 15
  };

  // Grade 6: pick the topics themselves (G1–G18, grouped by unit) instead of
  // "n topics around unit X". Grade 5 keeps its original setup.
  if (content.grade !== 5) {
    drawTopicPicker();
    return;
  }

  draw();

  function drawTopicPicker() {
    const saved = gradeState(state).grammarSetup || {};
    const validIds = new Set(content.grammarTopics.map((t) => t.id));
    const pick = {
      topicIds: new Set((saved.topicIds || []).filter((id) => validIds.has(id))),
      showRules: saved.showRules !== false,
      mode: 'all', // 'all' | 'time'
      minutes: 15
    };
    if (pick.topicIds.size === 0) {
      content.grammarTopics.filter((t) => t.unit === local.unit).forEach((t) => pick.topicIds.add(t.id));
    }
    const questionCount = (id) => content.grammarQuestions.filter((q) => q.topicId === id).length;

    render();

    function render() {
      const chosen = content.grammarTopics.filter((t) => pick.topicIds.has(t.id));
      const total = chosen.reduce((n, t) => n + questionCount(t.id), 0);
      root.innerHTML = `
        <div class="screen-header">
          <button class="back-btn" id="back-btn">‹</button>
          <h1 class="greeting" style="margin:0;font-size:1.2rem;">Grammar</h1>
        </div>

        <p class="setup-label">Which topics? <span class="setup-hint">(tap several)</span></p>
        ${units.map((u) => {
          const topics = content.grammarTopics.filter((t) => t.unit === u);
          const allOn = topics.every((t) => pick.topicIds.has(t.id));
          return `
            <div class="topic-unit">
              <button class="topic-unit-head${allOn ? ' active' : ''}" data-unit="${u}">Unit ${u}</button>
              <div class="topic-pick-list">
                ${topics.map((t) => `
                  <button class="topic-pick${pick.topicIds.has(t.id) ? ' active' : ''}" data-id="${t.id}">
                    <strong>${t.code}</strong> ${t.title} <small>${questionCount(t.id)}</small>
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}

        <p class="setup-label">How do you want to practise?</p>
        <div class="segmented">
          <button class="seg-btn${pick.mode === 'all' ? ' active' : ''}" id="mode-all">All questions (${total})</button>
          <button class="seg-btn${pick.mode === 'time' ? ' active' : ''}" id="mode-time">Time limit</button>
        </div>
        ${pick.mode === 'time' ? presetRow('minutes', [5, 10, 15, 20], pick.minutes, 'min') : ''}

        <label class="topic-check-item rule-toggle">
          <input type="checkbox" id="show-rules"${pick.showRules ? ' checked' : ''} />
          <span>Show a rule card before each topic</span>
        </label>

        <button class="primary-btn" id="start-btn"${chosen.length ? '' : ' disabled'}>Start session</button>
      `;

      root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
      root.querySelectorAll('.topic-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (pick.topicIds.has(id)) pick.topicIds.delete(id); else pick.topicIds.add(id);
          render();
        });
      });
      root.querySelectorAll('.topic-unit-head').forEach((btn) => {
        btn.addEventListener('click', () => {
          const topics = content.grammarTopics.filter((t) => t.unit === Number(btn.dataset.unit));
          const allOn = topics.every((t) => pick.topicIds.has(t.id));
          topics.forEach((t) => (allOn ? pick.topicIds.delete(t.id) : pick.topicIds.add(t.id)));
          render();
        });
      });
      root.querySelector('#mode-all').addEventListener('click', () => { pick.mode = 'all'; render(); });
      root.querySelector('#mode-time').addEventListener('click', () => { pick.mode = 'time'; render(); });
      root.querySelectorAll('.preset-btn').forEach((btn) => {
        btn.addEventListener('click', () => { pick.minutes = Number(btn.dataset.value); render(); });
      });
      root.querySelector('#custom-value')?.addEventListener('input', (e) => {
        pick.minutes = Math.max(1, Number(e.target.value) || 0);
      });
      root.querySelector('#show-rules').addEventListener('change', (e) => { pick.showRules = e.target.checked; });

      root.querySelector('#start-btn').addEventListener('click', () => {
        if (!chosen.length) return;
        const currentUnit = Math.max(...chosen.map((t) => t.unit));
        db.update((s) => {
          const gs = gradeState(s);
          gs.bookPosition.grammar = `Unit ${currentUnit}`;
          gs.grammarSetup = { topicIds: chosen.map((t) => t.id), showRules: pick.showRules };
        });
        setSessionConfig({
          type: 'grammar',
          currentUnit,
          topicIds: chosen.map((t) => t.id),
          showRules: pick.showRules,
          mode: pick.mode === 'time' ? 'time' : 'topics',
          minutes: pick.minutes
        });
        navigate('/grammar/session');
      });
    }
  }

  function draw() {
    const topicsInUnit = content.grammarTopics.filter((t) => t.unit === local.unit).length;
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Grammar</h1>
      </div>

      <p class="setup-label">Which unit are you currently on?</p>
      <div class="segmented" id="unit-segmented">
        ${units.map((u) => `<button class="seg-btn${u === local.unit ? ' active' : ''}" data-unit="${u}">Unit ${u}</button>`).join('')}
      </div>

      <p class="setup-label">How do you want to practise?</p>
      <div class="segmented">
        <button class="seg-btn${local.mode === 'topics' ? ' active' : ''}" id="mode-topics">Number of topics</button>
        <button class="seg-btn${local.mode === 'time' ? ' active' : ''}" id="mode-time">Time limit</button>
      </div>

      ${local.mode === 'topics'
        ? presetRow('topicCount', [1, 2, 3, 5], local.topicCount, 'topics')
        : presetRow('minutes', [5, 10, 15, 20], local.minutes, 'min')}

      ${local.mode === 'topics' ? `<p class="setup-label">Unit ${local.unit} has ${topicsInUnit} grammar topic${topicsInUnit === 1 ? '' : 's'}.</p>` : ''}

      <button class="primary-btn" id="start-btn">Start session</button>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    root.querySelectorAll('#unit-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.unit = Number(btn.dataset.unit); draw(); });
    });
    root.querySelector('#mode-topics').addEventListener('click', () => { local.mode = 'topics'; draw(); });
    root.querySelector('#mode-time').addEventListener('click', () => { local.mode = 'time'; draw(); });
    root.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (local.mode === 'topics') local.topicCount = Number(btn.dataset.value);
        else local.minutes = Number(btn.dataset.value);
        draw();
      });
    });
    const customInput = root.querySelector('#custom-value');
    if (customInput) {
      customInput.addEventListener('input', () => {
        const val = Math.max(1, Number(customInput.value) || 0);
        if (local.mode === 'topics') local.topicCount = val;
        else local.minutes = val;
      });
    }

    root.querySelector('#start-btn').addEventListener('click', () => {
      db.update((s) => { gradeState(s).bookPosition.grammar = `Unit ${local.unit}`; });
      setSessionConfig({
        type: 'grammar',
        currentUnit: local.unit,
        mode: local.mode,
        topicCount: local.topicCount,
        minutes: local.minutes
      });
      navigate('/grammar/session');
    });
  }

  function presetRow(key, presets, currentVal, unitLabel) {
    return `
      <div class="preset-row">
        ${presets.map((p) => `<button class="preset-btn${p === currentVal ? ' active' : ''}" data-value="${p}">${p} ${unitLabel}</button>`).join('')}
        <input type="number" id="custom-value" class="preset-custom" min="1" placeholder="custom" value="${presets.includes(currentVal) ? '' : currentVal}" />
      </div>
    `;
  }
}

function parseUnitFromPosition(position) {
  if (!position) return null;
  const match = position.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}
