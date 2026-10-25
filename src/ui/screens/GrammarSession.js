import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { takeSessionConfig, setSessionResults } from '../sessionContext.js';
import {
  buildGrammarSession, buildWeakGrammarSession, buildTopicBlockSession, checkGrammarAnswer, recordGrammarAnswer, acceptedAnswersOf
} from '../../engine/grammarExercises.js';
import { createTimer } from '../../engine/session.js';
import { logTimerExtension } from '../../engine/progress.js';

const TIME_MODE_TOPIC_COUNT = 20;
// A wrongly answered question comes back this many questions later (grade 6),
// at most MAX_REPEATS times.
const REPEAT_GAP = 3;
const MAX_REPEATS = 2;

export async function renderGrammarSession(root) {
  const config = takeSessionConfig();
  if (!config || config.type !== 'grammar') {
    navigate('/grammar');
    return;
  }

  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const state = db.load();

  // Grade 6: rule cards, repeats of wrong answers, "Also right: …" — grade 5
  // keeps its original flow.
  const grade6Flow = content.grade !== 5;
  const { questions } = config.weakPoints
    ? buildWeakGrammarSession(content.grammarTopics, content.grammarQuestions, state, config.topicCount)
    : config.topicIds
      ? buildTopicBlockSession(content.grammarTopics, content.grammarQuestions, config.topicIds)
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
    ended: false,
    rulesShown: new Set(),
    skipRules: !(grade6Flow && config.showRules),
    repeats: new Map() // question id → times re-queued
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

    if (topic && !session.skipRules && !session.rulesShown.has(topic.id)) {
      drawRuleCard(topic);
      return;
    }
    const isRepeat = (session.repeats.get(q.id) || 0) > 0 && session.questions.indexOf(q) < session.index;

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
        ${isRepeat ? '<div class="review-tag">Once more</div>' : ''}
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
        <input class="exercise-input${q.type === 'transform' ? ' transform-input' : ''}" id="answer-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${q.type === 'transform' ? 'Write the whole sentence…' : 'Type your answer…'}" />
        <button class="primary-btn" id="submit-btn">Check</button>
      `;
      const input = answerArea.querySelector('#answer-input');
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(input.value); });
      answerArea.querySelector('#submit-btn').addEventListener('click', () => submitAnswer(input.value));
    }
  }

  // Short rule reminder before a topic's first question — skippable, and
  // "Skip rule cards" turns them off for the rest of the session.
  function drawRuleCard(topic) {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Grammar</h1>
      </div>
      <div class="session-progress"><span>Rule card</span><span id="timer-display"></span></div>
      <div class="exercise-card rule-card">
        <div class="exercise-ipa">${topic.code}${topic.bookPages ? ` · Buch ${topic.bookPages.replace(/^S\.\s*/, 'S. ')}` : ''}</div>
        <div class="exercise-prompt" style="font-size:1.15rem;">${topic.title}</div>
        <p class="rule-text">${topic.explanation}</p>
        ${(topic.examples || []).length ? `<div class="rule-examples">${topic.examples.slice(0, 2).map((e) => `<div>“${e}”</div>`).join('')}</div>` : ''}
        ${(topic.commonMistakes || []).length ? `<div class="rule-mistakes"><strong>Watch out:</strong>${topic.commonMistakes.map((m) => `<div>⚠️ ${m}</div>`).join('')}</div>` : ''}
        <button class="primary-btn" id="rule-go-btn">Got it — let's go!</button>
        <button class="text-link-btn" id="rule-skip-btn">Skip rule cards</button>
      </div>
    `;
    root.querySelector('#back-btn').addEventListener('click', () => endEarly());
    root.querySelector('#rule-go-btn').addEventListener('click', () => { session.rulesShown.add(topic.id); drawQuestion(); });
    root.querySelector('#rule-skip-btn').addEventListener('click', () => { session.skipRules = true; drawQuestion(); });
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

    if (grade6Flow && q.type !== 'multipleChoice') {
      const others = acceptedAnswersOf(q).filter((a, i, all) => a !== q.answer && all.indexOf(a) === i && a !== value.trim());
      if (others.length) feedback.insertAdjacentHTML('afterend', `<div class="also-right">Also right: ${others.join(' · ')}</div>`);
    }
    const willRepeat = grade6Flow && !correct && (session.repeats.get(q.id) || 0) < MAX_REPEATS;

    // Only show a hint on wrong answers — a specific, rule-based one where we have
    // it for the exact mistake made (multiple choice), falling back to the
    // question's general explanation otherwise.
    if (!correct) {
      const hint = (q.type === 'multipleChoice' && q.optionHints && q.optionHints[value]) || q.explanation;
      if (hint) {
        const explEl = root.querySelector('#explanation');
        explEl.style.display = 'block';
        explEl.style.fontSize = '0.85rem';
        explEl.textContent = hint;
      }
    }

    if (willRepeat) {
      session.repeats.set(q.id, (session.repeats.get(q.id) || 0) + 1);
      session.questions.splice(Math.min(session.index + 1 + REPEAT_GAP, session.questions.length), 0, q);
    }

    root.querySelector('.exercise-card').insertAdjacentHTML(
      'beforeend',
      `${willRepeat ? '<div class="also-right">🔁 This one comes back later in the round.</div>' : ''}<button class="primary-btn" id="next-btn">${session.index + 1 >= session.questions.length ? 'Finish' : 'Next question'}</button>`
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
