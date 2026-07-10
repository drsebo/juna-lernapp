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
  const extensionsNote = results.extensions && results.extensions.length > 0
    ? `<p class="subgreeting">Extended ${results.extensions.length}× (+${results.extensions.reduce((a, e) => a + e.minutesAdded, 0)} min)</p>`
    : '';

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

function labelFor(type) {
  if (type === 'vocabulary') return 'vocabulary';
  if (type === 'grammar') return 'grammar';
  if (type === 'conversation') return 'conversation';
  if (type === 'weak-points') return 'weak points';
  return 'practice';
}
