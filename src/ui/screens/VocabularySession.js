import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { takeSessionConfig, setSessionResults } from '../sessionContext.js';
import {
  buildVocabSession, buildWeakPointsSession, buildMixedVocabSession, checkVocabAnswer, checkGermanAnswer,
  withDirections, GRADE6_SHARES, MAX_ATTEMPTS
} from '../../engine/vocabExercises.js';
import { recordAnswer, isNewWord } from '../../engine/leitner.js';
import { createTimer } from '../../engine/session.js';
import { logTimerExtension, logWordCountExtension } from '../../engine/progress.js';
import { speak, canSpeak } from '../../engine/speech.js';

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
  // strict drill to single/multi-word vocab; phrases get their own mode later.
  // Grade 6 also quizzes BE/AE words ("movie theater (AE)") as normal words.
  const quizTypes = content.grade === 5 ? ['word'] : ['word', 'pair'];
  const wordPool = content.vocab.filter((w) => quizTypes.includes(w.type));
  // Grade 6 extras: example sentence and ⚠️ notes after each answer.
  const showDetails = content.grade !== 5;

  // Grade 6 setup sends the chosen book sections: those words (~60 %), earlier
  // grade 6 words (~30 %) and grade 5 words as review (~10 %).
  const parts = config.sections ? await grade6Parts() : null;
  const size = config.mode === 'count' ? config.count : TIME_MODE_POOL_SIZE;

  let words;
  if (config.weakPoints) words = buildWeakPointsSession(wordPool, state, config.count);
  else if (parts) words = buildMixedVocabSession(parts, state, Math.min(size, parts.reduce((n, p) => n + p.pool.length, 0)));
  else words = buildVocabSession(wordPool, state, config.currentUnit, Math.min(wordPool.length, size));
  const queue = withDirections(words, config.direction || 'de-en');

  async function grade6Parts() {
    const keys = new Set(config.sections);
    const inSelection = (w) => keys.has(`${w.unit}|${w.section}`);
    const selected = wordPool.filter(inSelection);
    const position = new Map(content.vocab.map((w, i) => [w.id, i]));
    const lastSelected = Math.max(...selected.map((w) => position.get(w.id)));
    const earlier = wordPool.filter((w) => !inSelection(w) && position.get(w.id) < lastSelected);
    let review = [];
    try {
      review = (await loadContent({ grade: 5 })).vocab.filter((w) => w.type === 'word');
    } catch (err) {
      console.warn('Grade 5 review words unavailable', err);
    }
    return [
      { pool: selected, share: GRADE6_SHARES.selected },
      { pool: earlier, share: GRADE6_SHARES.earlier },
      { pool: review, share: GRADE6_SHARES.review }
    ];
  }

  const session = {
    queue,
    index: 0,
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    finished: false,
    timeUp: false,
    ended: false,
    wordExtensions: [],
    introShown: false
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

  function currentItem() {
    return session.queue[session.index];
  }

  function currentWord() {
    return currentItem().word;
  }

  // The answer to type and the language it's in, for the current direction.
  function expected(item) {
    return item.direction === 'en-de'
      ? { shown: item.word.en, answer: item.word.de, check: checkGermanAnswer, task: 'Translate to German', placeholder: 'Type the German word…' }
      : { shown: item.word.de, answer: item.word.en, check: checkVocabAnswer, task: 'Translate to English', placeholder: 'Type the English word…' };
  }

  function hasDetails(word) {
    return showDetails && Boolean(word.example || word.notes);
  }

  function detailsHtml(word) {
    const notes = (word.notes || '').split(' · ').filter(Boolean);
    return `
      <div class="word-details">
        <div class="word-details-pair"><strong>${word.en}</strong> – ${word.de}</div>
        ${word.example ? `<div class="word-details-example">“${word.example}”</div>` : ''}
        ${notes.map((n) => `<div class="word-details-note${n.startsWith('⚠️') ? ' warn' : ''}">${n.startsWith('⚠️') ? n : `💡 ${n}`}</div>`).join('')}
      </div>
    `;
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
    const exp = expected(currentItem());

    if (!session.introShown && isNewWord(db.load(), word.id)) {
      drawIntroCard(word);
      return;
    }

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
        ${showDetails && !word.grade ? '<div class="review-tag">Klasse 5 review</div>' : ''}
        <div class="exercise-prompt">${exp.shown}</div>
        <div class="exercise-ipa">${exp.task}</div>
        <div class="attempt-dots">
          ${Array.from({ length: MAX_ATTEMPTS }, (_, i) => `<span class="attempt-dot${i < session.attempts ? ' used' : ''}"></span>`).join('')}
        </div>
        <input class="exercise-input" id="answer-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${exp.placeholder}" />
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

  // Shown once, the first time a genuinely new word (no Leitner entry yet) comes
  // up — words already seen before (even Box 1 from a wrong answer) skip straight
  // to the quiz. Presents the word before testing it, like Babbel's word intro step.
  function drawIntroCard(word) {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Vocabulary</h1>
      </div>
      <div class="session-progress">
        <span id="progress-label">New word</span>
        <span></span>
      </div>
      <div class="exercise-card">
        <div class="intro-en">${word.en}</div>
        ${word.ipa ? `<div class="exercise-ipa">/${word.ipa}/</div>` : ''}
        ${canSpeak() ? `<button class="intro-speak-btn" id="speak-btn" aria-label="Listen">🔊</button>` : ''}
        <div class="intro-de">${word.de}</div>
        ${word.example ? `<div class="intro-example">“${word.example}”</div>` : ''}
        <button class="primary-btn" id="intro-continue-btn">Got it — quiz me!</button>
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => endEarly());
    const speakBtn = root.querySelector('#speak-btn');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => {
        speak(word.example ? `${word.en}. ${word.example}` : word.en);
      });
    }
    root.querySelector('#intro-continue-btn').addEventListener('click', () => {
      session.introShown = true;
      drawQuestion();
    });
  }

  // Mirrors the timer's "+5 minutes" offer, but for count-based sessions: once
  // the requested word count is done, offer to keep going instead of forcing a
  // brand-new session setup for one more round.
  function drawCountComplete() {
    const usedIds = new Set(session.queue.map((item) => item.word.id));
    const remainingPool = wordPool.filter((w) => !usedIds.has(w.id));
    const remainingParts = parts && parts.map((p) => ({ ...p, pool: p.pool.filter((w) => !usedIds.has(w.id)) }));
    const remainingCount = remainingParts ? remainingParts.reduce((n, p) => n + p.pool.length, 0) : remainingPool.length;
    const addCount = Math.min(WORDS_PER_EXTENSION, remainingCount);

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
        let extra;
        if (config.weakPoints) extra = buildWeakPointsSession(remainingPool, freshState, addCount);
        else if (remainingParts) extra = buildMixedVocabSession(remainingParts, freshState, addCount);
        else extra = buildVocabSession(remainingPool, freshState, config.currentUnit, addCount);
        session.queue = [...session.queue, ...withDirections(extra, config.direction || 'de-en')];
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
    const exp = expected(currentItem());
    const correct = exp.check(input.value, exp.answer);

    if (correct) {
      input.classList.remove('wrong');
      input.classList.add('correct');
      feedback.textContent = '✓ Correct!';
      feedback.className = 'feedback-text correct';
      resolveWord(true);
      if (hasDetails(word)) {
        input.disabled = true;
        showDetailsAndNext(word);
      } else {
        setTimeout(nextWord, 700);
      }
      return;
    }

    session.attempts += 1;
    // Re-adding the class alone wouldn't replay the shake on a second miss —
    // reading offsetWidth in between forces the animation to restart.
    input.classList.remove('wrong');
    void input.offsetWidth;
    input.classList.add('wrong');
    input.value = '';
    drawAttemptDots();

    if (session.attempts >= MAX_ATTEMPTS) {
      feedback.textContent = 'Not quite.';
      feedback.className = 'feedback-text wrong';
      root.querySelector('.exercise-card').insertAdjacentHTML(
        'beforeend',
        `<div class="reveal-answer">${exp.answer}</div>${hasDetails(word) ? detailsHtml(word) : ''}<button class="primary-btn" id="next-btn">Next word</button>`
      );
      root.querySelector('#submit-btn').remove();
      input.disabled = true;
      resolveWord(false);
      const nextBtn = root.querySelector('#next-btn');
      nextBtn.addEventListener('click', nextWord);
      focusLater(nextBtn);
    } else {
      feedback.textContent = `Not quite — try again (attempt ${session.attempts + 1}/${MAX_ATTEMPTS})`;
      feedback.className = 'feedback-text wrong';
      input.focus();
    }
  }

  // Right answer with an example/notes to show: keep them on screen until the
  // learner taps "Next" (Enter works too — the button gets focus).
  function showDetailsAndNext(word) {
    root.querySelector('#submit-btn').remove();
    root.querySelector('.exercise-card').insertAdjacentHTML(
      'beforeend',
      `${detailsHtml(word)}<button class="primary-btn" id="next-btn">Next word</button>`
    );
    const nextBtn = root.querySelector('#next-btn');
    nextBtn.addEventListener('click', nextWord);
    focusLater(nextBtn);
  }

  // Focus a moment later so the Enter press that submitted the answer doesn't
  // also "click" the freshly focused Next button.
  function focusLater(el) {
    setTimeout(() => el.focus(), 250);
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
    session.introShown = false;
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
