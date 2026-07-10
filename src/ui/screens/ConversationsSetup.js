import { loadContent, availableUnitNumbers } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { setSessionConfig } from '../sessionContext.js';
import { orderScenariosByRecency } from '../../engine/conversationEngine.js';

export async function renderConversationsSetup(root) {
  root.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="back-btn">‹</button>
      <h1 class="greeting" style="margin:0;font-size:1.2rem;">Conversations</h1>
    </div>
    <div class="placeholder-note">Loading…</div>
  `;
  root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));

  const content = await loadContent();
  const state = db.load();
  const units = availableUnitNumbers(content);
  const savedUnit = parseUnitFromPosition(state.bookPosition.vocabulary || state.bookPosition.grammar);

  const local = { unit: savedUnit || units[units.length - 1] };
  draw();

  function draw() {
    const ordered = orderScenariosByRecency(content.conversationScenarios, local.unit);

    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Conversations</h1>
      </div>

      <p class="setup-label">Which unit are you currently on?</p>
      <div class="segmented" id="unit-segmented">
        ${units.map((u) => `<button class="seg-btn${u === local.unit ? ' active' : ''}" data-unit="${u}">Unit ${u}</button>`).join('')}
      </div>

      <p class="setup-label">Choose a roleplay</p>
      <div class="scenario-list">
        ${ordered.map((s) => scenarioCard(s, local.unit)).join('')}
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    root.querySelectorAll('#unit-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.unit = Number(btn.dataset.unit); draw(); });
    });
    root.querySelectorAll('.scenario-card').forEach((card) => {
      card.addEventListener('click', () => {
        setSessionConfig({ type: 'conversation', scenarioId: card.dataset.id });
        navigate('/conversations/session');
      });
    });
  }

  function scenarioCard(s, currentUnit) {
    const stars = '⭐'.repeat(s.level || 1);
    const badge = s.unit === currentUnit ? '<span class="scenario-badge">recent</span>' : '';
    return `
      <button class="scenario-card" data-id="${s.id}">
        <div class="scenario-card-top">
          <span class="scenario-title">${s.title}</span>
          ${badge}
        </div>
        <div class="scenario-goal">${s.goal}</div>
        <div class="scenario-meta">${stars} · Unit ${s.unit}</div>
      </button>
    `;
  }
}

function parseUnitFromPosition(position) {
  if (!position) return null;
  const match = position.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}
