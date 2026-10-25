import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { takeSessionResults } from '../sessionContext.js';
import { recordSessionCompletion } from '../../engine/progress.js';
import { getXp, awardXp, xpForSession, levelInfo } from '../../engine/motivation.js';

export function renderSessionResults(root) {
  const results = takeSessionResults();
  if (!results) {
    navigate('/');
    return;
  }

  const xpBefore = getXp(db.load());
  const earned = xpForSession(results);
  const state = db.update((s) => awardXp(recordSessionCompletion(s, new Date().toISOString()), earned));
  const before = levelInfo(xpBefore);
  const after = levelInfo(getXp(state));
  const leveledUp = after.level > before.level;

  const pct = results.total > 0 ? Math.round((results.correctCount / results.total) * 100) : 0;
  const extensionsNote = buildExtensionsNote(results.extensions);
  const mood = moodFor(pct, results.total);

  root.innerHTML = `
    <div class="results-hero">
      <div class="results-trophy">${mood.emoji}</div>
      <h1 class="greeting">${mood.title}</h1>
      <p class="subgreeting">${mood.text}</p>
      <div class="xp-earned">⚡ +${earned} XP</div>
    </div>

    <div class="level-card">
      <div class="progress-label">
        <span class="progress-title">Level ${after.level} · ${after.title}</span>
        <span>${after.xpToNext} XP to go</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${after.pct}%"></div></div>
    </div>
    ${leveledUp ? `<div class="level-up">🎉 Level up! You're now a ${after.title}.</div>` : ''}

    <div class="results-stat-grid">
      <div class="results-stat good"><div class="num">${results.correctCount}</div><div class="label">Correct</div></div>
      <div class="results-stat practice"><div class="num">${results.wrongCount}</div><div class="label">To practise</div></div>
      <div class="results-stat"><div class="num">${pct}%</div><div class="label">Accuracy</div></div>
    </div>
    <p class="subgreeting" style="text-align:center;">🔥 ${state.streak.count}-day streak · ${labelFor(results.type)} session</p>
    ${extensionsNote}

    <button class="primary-btn" id="home-btn">Continue</button>
  `;

  if (pct >= 80 || leveledUp) launchConfetti();

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

// Feedback scaled to how it went — never negative, but honest: a rough
// session is framed as progress ("these words now come back more often"),
// not hidden behind the same "Nice work!" as a perfect one.
function moodFor(pct, total) {
  if (total === 0) return { emoji: '👍', title: 'Session done!', text: 'Every bit of practice counts.' };
  if (pct === 100) return { emoji: '🏆', title: 'Perfect run!', text: "Every single answer right. That's elite." };
  if (pct >= 80) return { emoji: '🚀', title: 'Awesome work!', text: "You're really getting this." };
  if (pct >= 50) return { emoji: '💪', title: 'Solid session!', text: 'The tricky ones will come back so you can nail them next time.' };
  return { emoji: '🌱', title: 'You showed up — that counts!', text: 'Tough round. The words you missed now come back more often, so they stick.' };
}

function launchConfetti() {
  const colors = ['#5b48e0', '#ffb020', '#0fa38f', '#ff7a45', '#2f86ff', '#7c5cff'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4000);
}

function labelFor(type) {
  if (type === 'vocabulary') return 'vocabulary';
  if (type === 'grammar') return 'grammar';
  if (type === 'conversation') return 'conversation';
  if (type === 'weak-points') return 'weak points';
  return 'practice';
}
