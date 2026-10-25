import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { takeSessionConfig, setSessionResults } from '../sessionContext.js';
import { checkVocabAnswer, MAX_ATTEMPTS } from '../../engine/vocabExercises.js';
import { pickWeighted, recordAnswer } from '../../engine/leitner.js';
import { createTimer } from '../../engine/session.js';
import { logTimerExtension } from '../../engine/progress.js';

const TIME_MODE_POOL_SIZE = 60;

// Two small grade 6 drills with their own Leitner boxes (engine/leitner.js):
// - "verbs": infinitive → simple past + past participle (irregularVerbs6.json)
// - "pairs": British ↔ American English (vocab entries with type "pair")
export async function renderVocabularyDrill(root) {
  const config = takeSessionConfig();
  if (!config || config.type !== 'vocabulary' || !['verbs', 'pairs'].includes(config.practice)) {
    navigate('/vocabulary');
    return;
  }

  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const isVerbs = config.practice === 'verbs';
  const store = isVerbs ? 'verbLeitner' : 'pairLeitner';
  const title = isVerbs ? 'Irregular verbs' : 'British vs. American';

  const pool = isVerbs ? verbPool() : await pairPool();
  const size = Math.min(pool.length, config.mode === 'count' ? config.count : TIME_MODE_POOL_SIZE);
  const byId = new Map(pool.map((item) => [item.id, item]));
  const queue = pickWeighted(pool.map((item) => item.id), db.load(), size, store)
    .map((id) => byId.get(id))
    // pairs: ask for the American word or the British one, at random
    .map((item) => (isVerbs ? item : { ...item, ask: Math.random() < 0.5 ? 'ae' : 'be' }));

  function verbPool() {
    return content.irregularVerbs.filter((v) => v.pastParticiple && (config.verbSet !== 'new' || v.introducedIn === content.grade));
  }

  // Grade 6 pairs carry { be, ae }; grade 5 pairs have the British word in
  // "en" and "AE: …" in the notes — both become { id, be, ae, de }.
  async function pairPool() {
    const fromGrade = (vocab) => vocab
      .filter((w) => w.type === 'pair')
      .map((w) => {
        if (w.pair) return { id: w.id, be: w.pair.be, ae: w.pair.ae, de: w.de };
        const ae = (w.notes || '').match(/AE:\s*(.+)/);
        return ae ? { id: w.id, be: w.en, ae: ae[1].trim(), de: w.de } : null;
      })
      .filter((p) => p && p.be && p.ae);
    let grade5 = [];
    if (content.grade !== 5) {
      try { grade5 = fromGrade((await loadContent({ grade: 5 })).vocab); } catch (err) { console.warn('Grade 5 pairs unavailable', err); }
    }
    return [...fromGrade(content.vocab), ...grade5];
  }

  const session = { index: 0, attempts: 0, correctCount: 0, wrongCount: 0, ended: false };

  let timer = null;
  if (config.mode === 'time') {
    timer = createTimer({
      limitMinutes: config.minutes,
      onTick: (seconds) => {
        const el = root.querySelector('#timer-display');
        if (el) el.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      },
      onLimitReached: () => renderTimerBanner()
    });
    timer.start();
  }

  if (queue.length === 0) {
    root.innerHTML = `<div class="placeholder-note">Nothing to practise here yet.</div>`;
    return;
  }
  draw();

  function current() {
    return queue[session.index];
  }

  // Fields to fill in for the current item: [{ key, label, answer }]
  function fields(item) {
    if (isVerbs) {
      return [
        { key: 'past', label: 'simple past', answer: item.simplePast },
        { key: 'participle', label: 'past participle', answer: item.pastParticiple }
      ];
    }
    return [{ key: item.ask, label: item.ask === 'ae' ? 'American English' : 'British English', answer: item[item.ask] }];
  }

  function promptHtml(item) {
    if (isVerbs) {
      return `
        <div class="exercise-prompt">${item.infinitive}</div>
        <div class="exercise-ipa">${item.de}</div>
      `;
    }
    const shownSide = item.ask === 'ae' ? 'be' : 'ae';
    return `
      <div class="exercise-ipa">${shownSide === 'be' ? '🇬🇧 British' : '🇺🇸 American'}</div>
      <div class="exercise-prompt">${item[shownSide]}</div>
      <div class="exercise-ipa">${item.de} · What's the ${item.ask === 'ae' ? '🇺🇸 American' : '🇬🇧 British'} word?</div>
    `;
  }

  function solutionText(item) {
    return isVerbs
      ? `${item.infinitive} – ${item.simplePast} – ${item.pastParticiple}`
      : `🇬🇧 ${item.be} · 🇺🇸 ${item.ae}`;
  }

  function draw() {
    if (session.index >= queue.length) {
      finishSession();
      return;
    }
    const item = current();
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">${title}</h1>
      </div>
      <div class="session-progress">
        <span>${config.mode === 'count' ? `${session.index + 1} of ${queue.length}` : `${session.index + 1}`}</span>
        <span id="timer-display">${config.mode === 'time' ? '0:00' : ''}</span>
      </div>
      <div class="exercise-card">
        ${promptHtml(item)}
        <div class="attempt-dots">
          ${Array.from({ length: MAX_ATTEMPTS }, (_, i) => `<span class="attempt-dot${i < session.attempts ? ' used' : ''}"></span>`).join('')}
        </div>
        ${fields(item).map((f) => `
          <label class="drill-field-label" for="field-${f.key}">${f.label}</label>
          <input class="exercise-input" id="field-${f.key}" data-key="${f.key}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />
        `).join('')}
        <div class="feedback-text" id="feedback"></div>
        <button class="primary-btn" id="submit-btn">Check</button>
      </div>
    `;
    root.querySelector('#back-btn').addEventListener('click', finishSession);
    const inputs = [...root.querySelectorAll('.exercise-input')];
    inputs[0].focus();
    inputs.forEach((input, i) => {
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        // Enter in the first verb field jumps to the second one
        if (i < inputs.length - 1 && !inputs[i + 1].value) inputs[i + 1].focus();
        else submit();
      });
    });
    root.querySelector('#submit-btn').addEventListener('click', submit);
  }

  function submit() {
    const item = current();
    const results = fields(item).map((f) => {
      const input = root.querySelector(`#field-${f.key}`);
      return { input, ok: checkVocabAnswer(input.value, f.answer) };
    });
    const feedback = root.querySelector('#feedback');
    results.forEach(({ input, ok }) => {
      input.classList.remove('wrong', 'correct');
      void input.offsetWidth;
      input.classList.add(ok ? 'correct' : 'wrong');
    });

    if (results.every((r) => r.ok)) {
      feedback.textContent = `✓ Correct! ${isVerbs ? solutionText(item) : ''}`;
      feedback.className = 'feedback-text correct';
      resolve(true);
      setTimeout(next, 900);
      return;
    }

    session.attempts += 1;
    root.querySelectorAll('.attempt-dot').forEach((dot, i) => dot.classList.toggle('used', i < session.attempts));
    // keep what was right, clear only the wrong field(s)
    results.filter((r) => !r.ok).forEach((r) => { r.input.value = ''; });

    if (session.attempts >= MAX_ATTEMPTS) {
      feedback.textContent = 'Not quite.';
      feedback.className = 'feedback-text wrong';
      root.querySelector('#submit-btn').remove();
      results.forEach((r) => { r.input.disabled = true; });
      root.querySelector('.exercise-card').insertAdjacentHTML(
        'beforeend',
        `<div class="reveal-answer">${solutionText(item)}</div><button class="primary-btn" id="next-btn">Next</button>`
      );
      resolve(false);
      const nextBtn = root.querySelector('#next-btn');
      nextBtn.addEventListener('click', next);
      setTimeout(() => nextBtn.focus(), 250);
    } else {
      const wrongCount = results.filter((r) => !r.ok).length;
      feedback.textContent = isVerbs && wrongCount === 1
        ? `One form is right — fix the other one (attempt ${session.attempts + 1}/${MAX_ATTEMPTS})`
        : `Not quite — try again (attempt ${session.attempts + 1}/${MAX_ATTEMPTS})`;
      feedback.className = 'feedback-text wrong';
      (results.find((r) => !r.ok) || results[0]).input.focus();
    }
  }

  function resolve(correct) {
    if (correct) session.correctCount += 1; else session.wrongCount += 1;
    db.update((s) => recordAnswer(s, current().id, correct, new Date().toISOString(), store));
  }

  function next() {
    session.index += 1;
    session.attempts = 0;
    draw();
  }

  function renderTimerBanner() {
    if (document.querySelector('.timer-banner')) return;
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
      banner.remove();
    });
    banner.querySelector('#finish-btn').addEventListener('click', finishSession);
  }

  function finishSession() {
    if (session.ended) return;
    session.ended = true;
    if (timer) timer.stop();
    document.querySelector('.timer-banner')?.remove();
    setSessionResults({
      type: 'vocabulary',
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      total: session.correctCount + session.wrongCount,
      extensions: timer ? timer.getExtensions().map((e) => ({ amount: e.minutesAdded, unit: 'min' })) : []
    });
    navigate('/session-results');
  }
}
