import { loadContent, availableUnitNumbers } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
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
    unit: parseUnitFromPosition(state.bookPosition.grammar) || units[units.length - 1],
    mode: 'topics', // 'topics' | 'time'
    topicCount: 3,
    minutes: 15
  };

  draw();

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
      db.update((s) => { s.bookPosition.grammar = `Unit ${local.unit}`; });
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
