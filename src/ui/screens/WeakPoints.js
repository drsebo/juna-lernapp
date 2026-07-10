import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { setSessionConfig } from '../sessionContext.js';
import { getEntry } from '../../engine/leitner.js';
import { weaknessScore } from '../../engine/grammarExercises.js';

export async function renderWeakPoints(root) {
  root.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="back-btn">‹</button>
      <h1 class="greeting" style="margin:0;font-size:1.2rem;">Study weak points</h1>
    </div>
    <div class="placeholder-note">Loading…</div>
  `;
  root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));

  const content = await loadContent();
  const state = db.load();

  const wordPool = content.vocab.filter((w) => w.type === 'word');
  const boxOneWords = wordPool.filter((w) => getEntry(state, w.id).box === 1);
  const weakTopics = weakGrammarTopics(content.grammarTopics, state);

  const local = {
    vocabCount: Math.min(10, boxOneWords.length || 1),
    topicCount: Math.min(2, weakTopics.length || 1)
  };

  draw();

  function draw() {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Study weak points</h1>
      </div>
      <p class="subgreeting">Pulled from Box 1 words and shakier grammar topics — the stuff worth another look.</p>

      <div class="weak-section">
        <p class="setup-label">Weak vocabulary — ${boxOneWords.length} word${boxOneWords.length === 1 ? '' : 's'} in Box 1</p>
        ${boxOneWords.length === 0
          ? `<div class="placeholder-note">No weak words right now — nice work! Practise Vocabulary normally to build up Box data.</div>`
          : `
            <div class="preset-row">
              ${[5, 10, 15].filter((n) => n <= boxOneWords.length || n === 5).map((n) => `<button class="preset-btn${n === local.vocabCount ? ' active' : ''}" data-target="vocab" data-value="${Math.min(n, boxOneWords.length)}">${Math.min(n, boxOneWords.length)} words</button>`).join('')}
              <button class="preset-btn${local.vocabCount === boxOneWords.length ? ' active' : ''}" data-target="vocab" data-value="${boxOneWords.length}">All (${boxOneWords.length})</button>
            </div>
            <button class="primary-btn secondary" id="start-vocab-btn">Practise weak vocabulary</button>
          `}
      </div>

      <div class="weak-section">
        <p class="setup-label">Weak grammar — ${weakTopics.length} topic${weakTopics.length === 1 ? '' : 's'} to revisit</p>
        ${weakTopics.length === 0
          ? `<div class="placeholder-note">No grammar topics tracked yet.</div>`
          : `
            <div class="preset-row">
              ${[1, 2, 3].filter((n) => n <= weakTopics.length || n === 1).map((n) => { const v = Math.min(n, weakTopics.length); return `<button class="preset-btn${v === local.topicCount ? ' active' : ''}" data-target="topic" data-value="${v}">${v} topic${v === 1 ? '' : 's'}</button>`; }).join('')}
              <button class="preset-btn${local.topicCount === weakTopics.length ? ' active' : ''}" data-target="topic" data-value="${weakTopics.length}">All (${weakTopics.length})</button>
            </div>
            <button class="primary-btn secondary" id="start-grammar-btn">Practise weak grammar</button>
          `}
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    root.querySelectorAll('.preset-btn[data-target="vocab"]').forEach((btn) => {
      btn.addEventListener('click', () => { local.vocabCount = Number(btn.dataset.value); draw(); });
    });
    root.querySelectorAll('.preset-btn[data-target="topic"]').forEach((btn) => {
      btn.addEventListener('click', () => { local.topicCount = Number(btn.dataset.value); draw(); });
    });

    const startVocabBtn = root.querySelector('#start-vocab-btn');
    if (startVocabBtn) {
      startVocabBtn.addEventListener('click', () => {
        setSessionConfig({ type: 'vocabulary', weakPoints: true, mode: 'count', count: local.vocabCount });
        navigate('/vocabulary/session');
      });
    }

    const startGrammarBtn = root.querySelector('#start-grammar-btn');
    if (startGrammarBtn) {
      startGrammarBtn.addEventListener('click', () => {
        setSessionConfig({ type: 'grammar', weakPoints: true, mode: 'topics', topicCount: local.topicCount });
        navigate('/grammar/session');
      });
    }
  }
}

// Mirrors the vocab Leitner Box 1 definition ("new or just got wrong") so both
// weak-points lists mean the same thing: unpracticed or struggled-with content.
// Topics answered correctly every time (score 0) are the only ones excluded.
function weakGrammarTopics(topics, state) {
  return topics
    .filter((t) => weaknessScore(state, t.id) > 0)
    .sort((a, b) => weaknessScore(state, b.id) - weaknessScore(state, a.id));
}
