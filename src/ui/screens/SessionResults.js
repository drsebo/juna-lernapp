import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { takeSessionResults } from '../sessionContext.js';
import { recordSessionCompletion } from '../../engine/progress.js';

export function renderSessionResults(root) {
  const results = takeSessionResults();
  if (!results) {
    navigate('/');
    return;
  }

  db.update((s) => recordSessionCompletion(s, new Date().toISOString()));

  const pct = results.total > 0 ? Math.round((results.correctCount / results.total) * 100) : 0;
  const extensionsNote = buildExtensionsNote(results.extensions);

  root.innerHTML = `
    <h1 class="greeting">Nice work! 🎉</h1>
    <p class="subgreeting">Here's how this ${labelFor(results.type)} session went.</p>

    <div class="results-stat-grid">
      <div class="results-stat"><div class="num">${results.correctCount}</div><div class="label">Correct</div></div>
      <div class="results-stat"><div class="num">${results.wrongCount}</div><div class="label">Needs practice</div></div>
      <div class="results-stat"><div class="num">${results.total}</div><div class="label">Total</div></div>
      <div class="results-stat"><div class="num">${pct}%</div><div class="label">Accuracy</div></div>
    </div>
    ${extensionsNote}

    <button class="primary-btn" id="home-btn">Back to home</button>
  `;

  root.querySelector('#home-btn').addEventListener('click', () => navigate('/'));
}

// Extension entries are normalized to { amount, unit } by whoever calls
// setSessionResults, so this works whether the session extended by time or by
// word count (or, in principle, both).
function buildExtensionsNote(extensions) {
  if (!extensions || extensions.length === 0) return '';
  const totalsByUnit = {};
  extensions.forEach((e) => { totalsByUnit[e.unit] = (totalsByUnit[e.unit] || 0) + e.amount; });
  const parts = Object.entries(totalsByUnit).map(([unit, amount]) => `+${amount} ${unit}`);
  return `<p class="subgreeting">Extended ${extensions.length}× (${parts.join(', ')})</p>`;
}

function labelFor(type) {
  if (type === 'vocabulary') return 'vocabulary';
  if (type === 'grammar') return 'grammar';
  if (type === 'conversation') return 'conversation';
  if (type === 'weak-points') return 'weak points';
  return 'practice';
}
