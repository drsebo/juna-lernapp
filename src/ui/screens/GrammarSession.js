import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { takeSessionConfig, setSessionResults } from '../sessionContext.js';
import { buildGrammarSession, buildWeakGrammarSession, checkGrammarAnswer, recordGrammarAnswer } from '../../engine/grammarExercises.js';
import { createTimer } from '../../engine/session.js';
import { logTimerExtension } from '../../engine/progress.js';

const TIME_MODE_TOPIC_COUNT = 20;

export async function renderGrammarSession(root) {
  const config = takeSessionConfig();
  if (!config || config.type !== 'grammar') {
    navigate('/grammar');
    return;
  }

  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const state = db.load();

  const { questions } = config.weakPoints
    ? buildWeakGrammarSession(content.grammarTopics, content.grammarQuestions, state, config.topicCount)
    : buildGrammarSession(
        content.grammarTopics,
        content.grammarQuestions,
        config.currentUnit,
        config.mode === 'topics' ? config.topicCount : TIME_MODE_TOPIC_COUNT
      );
  const topicsById = new Map(content.grammarTopics.map((t) => [t.id, t]));

  const session = {
    questions,
    index: 0,
    correctCount: 0,
    wrongCount: 0,
    answered: false,
    timeUp: false,
    ended: false
  };

  let timer = null;
  if (config.mode === 'time') {
    timer = createTimer({
      limitMinutes: config.minutes,
      onTick: (seconds) => updateTimerDisplay(seconds),
      onLimitReached: () => { session.timeUp = true; renderTimerBanner(); }
    });
    timer.start();
  }

  drawQuestion();

  function currentQuestion() {
    return session.questions[session.index];
  }

  function drawQuestion() {
    if (session.index >= session.questions.length) {
      finishSession();
      return;
    }
    session.answered = false;
    const q = currentQuestion();
    const topic = topicsById.get(q.topicId);

    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Grammar</h1>
      </div>
      <div class="session-progress">
        <span id="progress-label">${config.mode === 'topics' ? `Question ${session.index + 1} of ${session.questions.length}` : `Question ${session.index + 1}`}</span>
        <span id="timer-display">${config.mode === 'time' ? '0:00' : ''}</span>
      </div>
      <div class="exercise-card">
        <div class="exercise-ipa">${topic ? `${topic.code} — ${topic.title}` : ''}</div>
        <div class="exercise-prompt" style="font-size:1.15rem;">${q.prompt}</div>
        <div id="answer-area" style="margin-top:18px;"></div>
        <div class="feedback-text" id="feedback"></div>
        <div id="explanation" class="reveal-answer" style="font-size:0.85rem;display:none;"></div>
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => endEarly());

    const answerArea = root.querySelector('#answer-area');
    if (q.type === 'multipleChoice') {
      answerArea.innerHTML = `
        <div class="mc-options">
          ${q.options.map((opt) => `<button class="mc-option" data-value="${escapeAttr(opt)}">${opt}</button>`).join('')}
        </div>
      `;
      answerArea.querySelectorAll('.mc-option').forEach((btn) => {
        btn.addEventListener('click', () => submitAnswer(btn.dataset.value, btn));
      });
    } else {
      answerArea.innerHTML = `
        <input class="exercise-input" id="answer-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type your answer…" />
        <button class="primary-btn" id="submit-btn">Check</button>
      `;
      const input = answerArea.querySelector('#answer-input');
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(input.value); });
      answerArea.querySelector('#submit-btn').addEventListener('click', () => submitAnswer(input.value));
    }
  }

  function submitAnswer(value, clickedBtn) {
    if (session.answered) return;
    session.answered = true;
    const q = currentQuestion();
    const correct = checkGrammarAnswer(q, value);

    if (q.type === 'multipleChoice') {
      root.querySelectorAll('.mc-option').forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.value === q.answer) btn.classList.add('correct');
        else if (btn === clickedBtn) btn.classList.add('wrong');
      });
    } else {
      const input = root.querySelector('#answer-input');
      input.disabled = true;
      input.classList.add(correct ? 'correct' : 'wrong');
      root.querySelector('#submit-btn').disabled = true;
    }

    const feedback = root.querySelector('#feedback');
    feedback.textContent = correct ? '✓ Correct!' : `Not quite — correct answer: ${q.answer}`;
    feedback.className = `feedback-text ${correct ? 'correct' : 'wrong'}`;

    if (q.explanation) {
      const explEl = root.querySelector('#explanation');
      explEl.style.display = 'block';
      explEl.style.fontSize = '0.85rem';
      explEl.textContent = q.explanation;
    }

    root.querySelector('.exercise-card').insertAdjacentHTML(
      'beforeend',
      `<button class="primary-btn" id="next-btn">${session.index + 1 >= session.questions.length ? 'Finish' : 'Next question'}</button>`
    );
    root.querySelector('#next-btn').addEventListener('click', nextQuestion);

    if (correct) session.correctCount += 1; else session.wrongCount += 1;
    db.update((s) => recordGrammarAnswer(s, q.topicId, correct, new Date().toISOString()));
  }

  function nextQuestion() {
    session.index += 1;
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
      db.update((s) => logTimerExtension(s, 'grammar', 5, now));
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
    setSessionResults({
      type: 'grammar',
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      total: session.correctCount + session.wrongCount,
      extensions: timer ? timer.getExtensions().map((e) => ({ amount: e.minutesAdded, unit: 'min' })) : []
    });
    navigate('/session-results');
  }
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}
