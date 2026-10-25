import { loadContent, availableUnitNumbers, defaultUnit } from '../../data/contentStore.js';
import { db, gradeState } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { setSessionConfig } from '../sessionContext.js';

const PRACTICE_TYPES = [
  { key: 'words', label: 'Words' },
  { key: 'verbs', label: 'Irregular verbs' },
  { key: 'pairs', label: 'British vs. American' }
];

const DIRECTIONS = [
  { key: 'de-en', label: 'Deutsch → English' },
  { key: 'en-de', label: 'English → Deutsch' },
  { key: 'mixed', label: 'Mixed' }
];

export async function renderVocabularySetup(root) {
  root.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="back-btn">‹</button>
      <h1 class="greeting" style="margin:0;font-size:1.2rem;">Vocabulary</h1>
    </div>
    <div class="placeholder-note">Loading…</div>
  `;
  root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));

  const content = await loadContent();
  const state = db.load();
  const units = availableUnitNumbers(content);
  // Grade 6 content has book sections ("Check-in", "Station 1", "Focus 1" …)
  // and past participles — that's what unlocks the extra options below.
  // Grade 5 keeps its original single-unit setup.
  const hasSections = content.vocab.some((w) => w.section);
  const hasVerbForms = content.irregularVerbs.some((v) => v.pastParticiple);
  const saved = gradeState(state).vocabSetup || {};

  const startUnit = parseUnitFromPosition(gradeState(state).bookPosition.vocabulary) || defaultUnit(content, gradeState(state));
  const local = {
    unit: startUnit,
    practice: 'words', // 'words' | 'verbs' | 'pairs'
    units: new Set(saved.units && saved.units.length ? saved.units : [startUnit]),
    sections: new Set(saved.sections || []),
    direction: saved.direction || 'de-en',
    verbSet: 'all', // 'all' | 'new'
    mode: 'count', // 'count' | 'time'
    count: 10,
    minutes: 10
  };
  if (hasSections && local.sections.size === 0) selectAllSections();

  draw();

  // "unit|section" keys of the chosen units, in book order
  function sectionsOfUnit(unit) {
    const seen = new Map();
    content.vocab.forEach((w) => {
      if (w.unit !== unit || !w.section || w.type === 'phrase') return;
      seen.set(w.section, (seen.get(w.section) || 0) + 1);
    });
    return [...seen].map(([section, count]) => ({ key: `${unit}|${section}`, section, count }));
  }

  function selectAllSections() {
    local.sections = new Set([...local.units].flatMap((u) => sectionsOfUnit(u).map((s) => s.key)));
  }

  function draw() {
    const practice = hasSections ? local.practice : 'words';
    const sortedUnits = [...local.units].sort((a, b) => a - b);
    const verbCount = local.verbSet === 'new'
      ? content.irregularVerbs.filter((v) => v.introducedIn === content.grade).length
      : content.irregularVerbs.length;
    const canStart = practice !== 'words' || !hasSections || local.sections.size > 0;

    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Vocabulary</h1>
      </div>

      ${hasSections ? `
        <p class="setup-label">What do you want to practise?</p>
        <div class="segmented" id="practice-segmented">
          ${PRACTICE_TYPES.filter((p) => p.key !== 'verbs' || hasVerbForms).map((p) => `<button class="seg-btn${p.key === practice ? ' active' : ''}" data-practice="${p.key}">${p.label}</button>`).join('')}
        </div>
      ` : ''}

      ${practice === 'words' && !hasSections ? `
        <p class="setup-label">Which unit are you currently on?</p>
        <div class="segmented" id="unit-segmented">
          ${units.map((u) => `<button class="seg-btn${u === local.unit ? ' active' : ''}" data-unit="${u}">Unit ${u}</button>`).join('')}
        </div>
      ` : ''}

      ${practice === 'words' && hasSections ? `
        <p class="setup-label">Units <span class="setup-hint">(tap several)</span></p>
        <div class="segmented" id="units-multi">
          ${units.map((u) => `<button class="seg-btn${local.units.has(u) ? ' active' : ''}" data-unit="${u}">Unit ${u}</button>`).join('')}
        </div>

        <p class="setup-label">Sections <button class="text-link-btn inline-link" id="all-sections">all</button></p>
        <div class="preset-row chip-row" id="sections-multi">
          ${sortedUnits.flatMap((u) => sectionsOfUnit(u).map((s) => `
            <button class="preset-btn${local.sections.has(s.key) ? ' active' : ''}" data-key="${s.key}">${sortedUnits.length > 1 ? `U${u} · ` : ''}${s.section} <small>${s.count}</small></button>
          `)).join('') || '<span class="setup-hint">Pick at least one unit.</span>'}
        </div>

        <p class="setup-label">Direction</p>
        <div class="segmented" id="direction-segmented">
          ${DIRECTIONS.map((d) => `<button class="seg-btn${d.key === local.direction ? ' active' : ''}" data-direction="${d.key}">${d.label}</button>`).join('')}
        </div>
      ` : ''}

      ${practice === 'verbs' ? `
        <p class="setup-label">Which verbs?</p>
        <div class="segmented" id="verbset-segmented">
          <button class="seg-btn${local.verbSet === 'all' ? ' active' : ''}" data-verbset="all">All verbs</button>
          <button class="seg-btn${local.verbSet === 'new' ? ' active' : ''}" data-verbset="new">New in Klasse ${content.grade}</button>
        </div>
        <p class="setup-hint">${verbCount} verbs · You see the infinitive and type the simple past and the past participle (go – went – gone).</p>
      ` : ''}

      ${practice === 'pairs' ? `
        <p class="setup-hint">You see a British or an American word and type the other one (film ↔ movie).</p>
      ` : ''}

      <p class="setup-label">How do you want to practise?</p>
      <div class="segmented">
        <button class="seg-btn${local.mode === 'count' ? ' active' : ''}" id="mode-count">Number of ${practice === 'verbs' ? 'verbs' : 'words'}</button>
        <button class="seg-btn${local.mode === 'time' ? ' active' : ''}" id="mode-time">Time limit</button>
      </div>

      ${local.mode === 'count' ? presetRow('count', [5, 10, 15, 20], local.count, practice === 'verbs' ? 'verbs' : 'words') : presetRow('minutes', [5, 10, 15, 20], local.minutes, 'min')}

      <button class="primary-btn" id="start-btn"${canStart ? '' : ' disabled'}>Start session</button>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    root.querySelectorAll('#practice-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.practice = btn.dataset.practice; draw(); });
    });
    root.querySelectorAll('#unit-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.unit = Number(btn.dataset.unit); draw(); });
    });
    root.querySelectorAll('#units-multi .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const unit = Number(btn.dataset.unit);
        if (local.units.has(unit)) {
          local.units.delete(unit);
          local.sections = new Set([...local.sections].filter((k) => !k.startsWith(`${unit}|`)));
        } else {
          local.units.add(unit);
          sectionsOfUnit(unit).forEach((s) => local.sections.add(s.key));
        }
        draw();
      });
    });
    root.querySelector('#all-sections')?.addEventListener('click', () => { selectAllSections(); draw(); });
    root.querySelectorAll('#sections-multi .preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (local.sections.has(key)) local.sections.delete(key); else local.sections.add(key);
        draw();
      });
    });
    root.querySelectorAll('#direction-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.direction = btn.dataset.direction; draw(); });
    });
    root.querySelectorAll('#verbset-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.verbSet = btn.dataset.verbset; draw(); });
    });
    root.querySelector('#mode-count').addEventListener('click', () => { local.mode = 'count'; draw(); });
    root.querySelector('#mode-time').addEventListener('click', () => { local.mode = 'time'; draw(); });
    root.querySelectorAll('.preset-row:not(.chip-row) .preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (local.mode === 'count') local.count = Number(btn.dataset.value);
        else local.minutes = Number(btn.dataset.value);
        draw();
      });
    });
    const customInput = root.querySelector('#custom-value');
    if (customInput) {
      customInput.addEventListener('input', () => {
        const val = Math.max(1, Number(customInput.value) || 0);
        if (local.mode === 'count') local.count = val;
        else local.minutes = val;
      });
    }

    root.querySelector('#start-btn').addEventListener('click', () => {
      if (!canStart) return;
      const base = { type: 'vocabulary', practice, mode: local.mode, count: local.count, minutes: local.minutes };

      if (practice === 'verbs' || practice === 'pairs') {
        setSessionConfig({ ...base, verbSet: local.verbSet });
        navigate('/vocabulary/drill');
        return;
      }

      if (!hasSections) {
        db.update((s) => { gradeState(s).bookPosition.vocabulary = `Unit ${local.unit}`; });
        setSessionConfig({ ...base, currentUnit: local.unit });
        navigate('/vocabulary/session');
        return;
      }

      const currentUnit = Math.max(...sortedUnits);
      db.update((s) => {
        const gs = gradeState(s);
        gs.bookPosition.vocabulary = `Unit ${currentUnit}`;
        gs.vocabSetup = { units: sortedUnits, sections: [...local.sections], direction: local.direction };
      });
      setSessionConfig({ ...base, currentUnit, sections: [...local.sections], direction: local.direction });
      navigate('/vocabulary/session');
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
