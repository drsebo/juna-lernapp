import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { takeSessionConfig, setSessionResults } from '../sessionContext.js';
import { buildVocabSession, buildWeakPointsSession, checkVocabAnswer, MAX_ATTEMPTS } from '../../engine/vocabExercises.js';
import { recordAnswer } from '../../engine/leitner.js';
import { createTimer } from '../../engine/session.js';
import { logTimerExtension, logWordCountExtension } from '../../engine/progress.js';

const WORDS_PER_EXTENSION = 5;

const TIME_MODE_POOL_SIZE = 60;

export async function renderVocabularySession(root) {
  const config = takeSessionConfig();
  if (!config || config.type !== 'vocabulary') {
    navigate('/vocabulary');
    return;
  }

  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const state = db.load();

  // Phrases (e.g. "I'd like …") aren't fair typed-recall targets — restrict this
  // strict DE->EN drill to single/multi-word vocab; phrases get their own mode later.
  const wordPool = content.vocab.filter((w) => w.type === 'word');

  const queue = config.weakPoints
    ? buildWeakPointsSession(wordPool, state, config.count)
    : buildVocabSession(
        wordPool,
        state,
        config.currentUnit,
        config.mode === 'count' ? config.count : Math.min(wordPool.length, TIME_MODE_POOL_SIZE)
      );

  const session = {
    queue,
    index: 0,
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    finished: false,
    timeUp: false,
    ended: false,
    wordExtensions: []
  };

  let timer = null;
  if (config.mode === 'time') {
    timer = createTimer({
      limitMinutes: config.minutes,
      onTick: (seconds) => updateTimerDisplay(seconds),
      onLimitReached: () => {
        session.timeUp = true;
        renderTimerBanner();
      }
    });
    timer.start();
  }

  drawQuestion();

  function currentWord() {
    return session.queue[session.index];
  }

  function drawQuestion() {
    if (session.index >= session.queue.length) {
      if (config.mode === 'count') {
        drawCountComplete();
      } else {
        finishSession();
      }
      return;
    }
    const word = currentWord();
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Vocabulary</h1>
      </div>
      <div class="session-progress">
        <span id="progress-label">${config.mode === 'count' ? `Word ${session.index + 1} of ${session.queue.length}` : `Word ${session.index + 1}`}</span>
        <span id="timer-display">${config.mode === 'time' ? '0:00' : ''}</span>
      </div>
      <div class="exercise-card">
        <div class="exercise-prompt">${word.de}</div>
        <div class="exercise-ipa">Translate to English</div>
        <div class="attempt-dots">
          ${Array.from({ length: MAX_ATTEMPTS }, (_, i) => `<span class="attempt-dot${i < session.attempts ? ' used' : ''}"></span>`).join('')}
        </div>
        <input class="exercise-input" id="answer-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the English word…" />
        <div class="feedback-text" id="feedback"></div>
        <button class="primary-btn" id="submit-btn">Check</button>
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => endEarly());
    const input = root.querySelector('#answer-input');
    const submitBtn = root.querySelector('#submit-btn');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(); });
    submitBtn.addEventListener('click', submitAnswer);
  }

  // Mirrors the timer's "+5 minutes" offer, but for count-based sessions: once
  // the requested word count is done, offer to keep going instead of forcing a
  // brand-new session setup for one more round.
  function drawCountComplete() {
    const usedIds = new Set(session.queue.map((w) => w.id));
    const remainingPool = wordPool.filter((w) => !usedIds.has(w.id));
    const addCount = Math.min(WORDS_PER_EXTENSION, remainingPool.length);

    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Vocabulary</h1>
      </div>
      <div class="exercise-card">
        <div class="exercise-prompt">Nice work! 🎉</div>
        <div class="exercise-ipa">You've finished all ${session.queue.length} words.</div>
        ${addCount > 0
          ? `<button class="primary-btn" id="learn-more-btn">Learn ${addCount} more word${addCount === 1 ? '' : 's'}</button>`
          : `<div class="feedback-text" style="margin-top:10px;">No more new words available right now.</div>`}
        <button class="primary-btn secondary" id="finish-count-btn" style="margin-top:10px;">Finish session</button>
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => endEarly());
    root.querySelector('#finish-count-btn').addEventListener('click', finishSession);
    const learnMoreBtn = root.querySelector('#learn-more-btn');
    if (learnMoreBtn) {
      learnMoreBtn.addEventListener('click', () => {
        const freshState = db.load();
        const extra = config.weakPoints
          ? buildWeakPointsSession(remainingPool, freshState, addCount)
          : buildVocabSession(remainingPool, freshState, config.currentUnit, addCount);
        session.queue = [...session.queue, ...extra];
        const now = new Date().toISOString();
        session.wordExtensions.push({ amount: extra.length, unit: 'words' });
        db.update((s) => logWordCountExtension(s, 'vocabulary', extra.length, now));
        drawQuestion();
      });
    }
  }

  function submitAnswer() {
    const input = root.querySelector('#answer-input');
    const feedback = root.querySelector('#feedback');
    const word = currentWord();
    const correct = checkVocabAnswer(input.value, word.en);

    if (correct) {
      input.classList.add('correct');
      feedback.textContent = '✓ Correct!';
      feedback.className = 'feedback-text correct';
      resolveWord(true);
      setTimeout(nextWord, 700);
      return;
    }

    session.attempts += 1;
    input.classList.add('wrong');
    input.value = '';
    drawAttemptDots();

    if (session.attempts >= MAX_ATTEMPTS) {
      feedback.textContent = 'Not quite.';
      feedback.className = 'feedback-text wrong';
      root.querySelector('.exercise-card').insertAdjacentHTML(
        'beforeend',
        `<div class="reveal-answer">${word.en}</div><button class="primary-btn" id="next-btn">Next word</button>`
      );
      root.querySelector('#submit-btn').remove();
      input.disabled = true;
      resolveWord(false);
      root.querySelector('#next-btn').addEventListener('click', nextWord);
    } else {
      feedback.textContent = `Not quite — try again (attempt ${session.attempts + 1}/${MAX_ATTEMPTS})`;
      feedback.className = 'feedback-text wrong';
      input.focus();
    }
  }

  function drawAttemptDots() {
    root.querySelectorAll('.attempt-dot').forEach((dot, i) => {
      dot.classList.toggle('used', i < session.attempts);
    });
  }

  function resolveWord(correct) {
    if (correct) session.correctCount += 1; else session.wrongCount += 1;
    db.update((s) => recordAnswer(s, currentWord().id, correct, new Date().toISOString()));
  }

  function nextWord() {
    session.index += 1;
    session.attempts = 0;
    drawQuestion();
  }

  function updateTimerDisplay(seconds) {
    const el = root.querySelector('#timer-display');
    if (!el) return;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderTimerBanner() {
    if (root.querySelector('.timer-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'timer-banner';
    banner.innerHTML = `
      <div>You've reached your ${config.minutes} minutes — nice work! 🎉</div>
      <div class="banner-actions">
        <button class="extend-btn" id="extend-btn">+5 minutes</button>
        <button class="finish-btn" id="finish-btn">Finish session</button>
      </div>
    `;
    document.body.appendChild(banner);
    banner.querySelector('#extend-btn').addEventListener('click', () => {
      const now = new Date().toISOString();
      timer.extend(5, now);
      db.update((s) => logTimerExtension(s, 'vocabulary', 5, now));
      session.timeUp = false;
      banner.remove();
    });
    banner.querySelector('#finish-btn').addEventListener('click', () => {
      banner.remove();
      timer.stop();
      finishSession();
    });
  }

  function endEarly() {
    if (timer) timer.stop();
    document.querySelector('.timer-banner')?.remove();
    finishSession();
  }

  function finishSession() {
    if (session.ended) return;
    session.ended = true;
    if (timer) timer.stop();
    document.querySelector('.timer-banner')?.remove();
    const timeExtensions = timer ? timer.getExtensions().map((e) => ({ amount: e.minutesAdded, unit: 'min' })) : [];
    setSessionResults({
      type: 'vocabulary',
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      total: session.correctCount + session.wrongCount,
      extensions: [...timeExtensions, ...session.wordExtensions]
    });
    navigate('/session-results');
  }
}
