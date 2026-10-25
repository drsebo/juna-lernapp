import { db, gradeState } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { loadContent, availableGrades, unitRangeLabel } from '../../data/contentStore.js';
import { computeVocabTargetProgress, computeGrammarTargetProgress, resolveReferenceIndex } from '../../engine/progress.js';
import { examCompletionPct } from '../../engine/examPrep.js';
import { activeExamFor, countdownLabel, examCompletionPct6, EXAM_KINDS } from '../../engine/examPrep6.js';
import { logOut } from '../../auth/authGate.js';
import { getXp, levelInfo, streakStatus, boxCounts } from '../../engine/motivation.js';
import { checkVocabAnswer } from '../../engine/vocabExercises.js';

const ICONS = {
  grammar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V6a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 4v4a1 1 0 0 0 1 1h4"/><path d="M8 13h8M8 17h5"/></svg>',
  vocabulary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/></svg>',
  conversations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
  exam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  fire: '🔥'
};

// Example values for the teacher check-in fields, per grade.
const POSITION_EXAMPLES = {
  5: { grammar: 'G30', vocabulary: 'bracelet' },
  6: { grammar: 'G3', vocabulary: 'industry' }
};

export async function renderHome(root) {
  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const [content, grades] = await Promise.all([loadContent(), availableGrades()]);
  const examples = POSITION_EXAMPLES[content.grade] || POSITION_EXAMPLES[6];
  const units = unitRangeLabel(content);
  // draw() re-renders the whole screen after each position edit — remember
  // whether the teacher panel was open so it doesn't snap shut mid-edit.
  let teacherPanelOpen = false;
  // result of the last "Stand bestätigen" tap, shown until the next redraw
  let confirmMessage = null;

  draw();

  function draw() {
    const state = db.load();
    const streak = state.streak.count;
    const activeExam = activeExamFor(state, content.grade);
    const hasActiveExam = Boolean(activeExam);
    const { progressReference } = gradeState(state, content.grade);

    const vocabRefIndex = resolveReferenceIndex(content.vocab, progressReference.vocabularyWordId);
    const grammarRefIndex = resolveReferenceIndex(content.grammarTopics, progressReference.grammarTopicId);
    const vocabRefItem = vocabRefIndex >= 0 ? content.vocab[vocabRefIndex] : null;
    const grammarRefItem = grammarRefIndex >= 0 ? content.grammarTopics[grammarRefIndex] : null;

    const xp = getXp(state);
    const lvl = levelInfo(xp);
    const streakState = streakStatus(state, new Date().toISOString().slice(0, 10));
    const shownStreak = streakState === 'start' ? 0 : streak;
    // With a confirmed vocabulary stand, the word count and boxes cover only
    // the words up to it — the ones that actually have to be learnt by now.
    const wordsToLearn = vocabRefIndex >= 0 ? content.vocab.slice(0, vocabRefIndex + 1) : content.vocab;
    const boxes = boxCounts(wordsToLearn, state);
    const totalWords = boxes.fresh + boxes[1] + boxes[2] + boxes[3] + boxes[4];

    root.innerHTML = `
      <div class="top-bar">
        <div class="hello">Hi Juna! 👋</div>
        <div class="streak-badge${shownStreak === 0 ? ' cold' : ''}"><span class="flame">${ICONS.fire}</span> ${shownStreak} day${shownStreak === 1 ? '' : 's'}</div>
      </div>

      ${grades.length > 1 ? `
        <div class="segmented grade-switch" id="grade-switch">
          ${grades.map((g) => `<button class="seg-btn${g === content.grade ? ' active' : ''}" data-grade="${g}">Klasse ${g}</button>`).join('')}
        </div>
      ` : ''}

      <div class="hero">
        <div class="hero-row">
          <div class="level-ring" style="--pct:${lvl.pct}">
            <div class="level-ring-inner"><span class="lvl-label">LEVEL</span><span class="lvl-num">${lvl.level}</span></div>
          </div>
          <div class="hero-text">
            <div class="hero-title">${lvl.title}</div>
            <div class="hero-sub">${xp} XP collected · ${boxes[4]} words mastered</div>
          </div>
        </div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${lvl.pct}%"></div></div>
        <div class="xp-meta"><span>${lvl.xpIntoLevel} / ${lvl.xpForLevel} XP</span><span>${lvl.xpToNext} XP to Level ${lvl.level + 1}</span></div>
      </div>

      ${goalStrip(streakState, streak)}

      <div class="section-title">What do you want to practise?</div>
      <div class="card-grid">
        ${card('grammar', 'Grammar', `${content.grammarTopics.length} topics · ${units}`, ICONS.grammar)}
        ${card('vocabulary', 'Vocabulary', `${boxes[4]} of ${totalWords} words mastered`, ICONS.vocabulary)}
        ${card('conversations', 'Conversations', `${content.conversationScenarios.length} roleplays · ${units}`, ICONS.conversations)}
        ${card('exam-prep', 'Exam Prep', examCardSub(activeExam), ICONS.exam, !hasActiveExam)}
      </div>

      <button class="weak-points-btn" id="weak-points-btn">
        <span>⭐ Study weak points<small>${boxes[1] > 0 ? `${boxes[1]} word${boxes[1] === 1 ? '' : 's'} in box 1 — level them up!` : 'Nothing weak right now — nice!'}</small></span>
        <span>›</span>
      </button>

      ${examBar(activeExam)}

      <div class="section-title">Your word boxes</div>
      <div class="boxes">
        ${boxCell('fresh', boxes.fresh, 'New')}
        ${boxCell(1, boxes[1], 'Box 1')}
        ${boxCell(2, boxes[2], 'Box 2')}
        ${boxCell(3, boxes[3], 'Box 3')}
        ${boxCell(4, boxes[4], 'Mastered')}
      </div>
      <p class="boxes-hint">Every right answer moves a word one box up. Get it to “Mastered”!</p>

      <details class="teacher-panel" id="teacher-panel"${teacherPanelOpen ? ' open' : ''}>
        <summary><span>Teacher check-in<small>${vocabRefItem || grammarRefItem ? `Stand: ${[grammarRefItem && `bis ${grammarRefItem.code}`, vocabRefItem && `${totalWords} Vokabeln`].filter(Boolean).join(' · ')}${progressReference.confirmedAt ? ` · bestätigt am ${new Date(progressReference.confirmedAt).toLocaleDateString('de-DE')}` : ''}` : 'What has been confirmed in class'}</small></span></summary>
        <div class="teacher-panel-body">
          ${positionField({
            key: 'grammar',
            label: 'Grammar known up to',
            placeholder: `e.g. ${examples.grammar}`,
            currentValue: grammarRefItem ? grammarRefItem.code : '',
            datalistId: 'grammar-options',
            datalistHtml: content.grammarTopics.map((t) => `<option value="${escapeAttr(t.code)}">${escapeHtml(t.code)} — ${escapeHtml(t.title)}</option>`).join(''),
            status: grammarRefItem
              ? `→ Unit ${grammarRefItem.unit} · ${grammarRefIndex + 1} topics covered so far`
              : `Enter the grammar number your teacher confirmed she knows (e.g. ${examples.grammar}), to track real progress.`,
            pct: grammarRefItem ? computeGrammarTargetProgress(content.grammarTopics, state, grammarRefIndex) : 0
          })}

          ${positionField({
            key: 'vocabulary',
            label: 'Vocabulary known up to',
            placeholder: `e.g. ${examples.vocabulary}`,
            currentValue: vocabRefItem ? vocabRefItem.en : '',
            status: vocabRefItem
              ? `→ Unit ${vocabRefItem.unit} · ${totalWords} words to learn so far`
              : 'Enter the last English word your teacher confirmed she knows, to track real progress.',
            pct: vocabRefItem ? computeVocabTargetProgress(content.vocab, state, vocabRefIndex) : 0
          })}
          <button class="primary-btn" id="confirm-stand-btn">Stand bestätigen</button>
          <div class="stand-feedback${confirmMessage ? ` ${confirmMessage.ok ? 'ok' : 'error'}` : ''}" id="stand-feedback" role="status">${confirmMessage ? confirmMessage.text : ''}</div>
        </div>
      </details>

      <button class="text-link-btn" id="logout-btn">Log out</button>
    `;

    root.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => navigate(`/${el.dataset.route}`));
    });
    root.querySelectorAll('#grade-switch .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const grade = Number(btn.dataset.grade);
        if (grade === content.grade) return;
        db.update((s) => { s.activeGrade = grade; });
        renderHome(root);
      });
    });
    root.querySelector('#weak-points-btn').addEventListener('click', () => navigate('/weak-points'));
    root.querySelector('#exam-bar')?.addEventListener('click', () => navigate('/exam-prep'));
    root.querySelector('#teacher-panel').addEventListener('toggle', (e) => { teacherPanelOpen = e.target.open; });
    root.querySelector('#logout-btn').addEventListener('click', () => {
      // No persistent onAuthStateChanged listener is set up (app.js only checks
      // auth once at boot) — a full reload is the simplest way to land back on
      // the login screen after signing out.
      logOut().then(() => window.location.reload());
    });

    confirmMessage = null;
    bindTeacherCheckIn(root, content, () => draw(), (message) => { confirmMessage = message; });
  }
}

// The two "known up to" fields are only saved with "Stand bestätigen" (or
// Enter) — typing alone changes nothing. Both values are checked first; if one
// isn't found, nothing is saved and the field says why. An empty field clears
// that part of the stand.
function bindTeacherCheckIn(root, content, redraw, setMessage) {
  const fields = {
    grammar: { input: root.querySelector('#position-input-grammar'), status: root.querySelector('#position-status-grammar') },
    vocabulary: { input: root.querySelector('#position-input-vocabulary'), status: root.querySelector('#position-status-vocabulary') }
  };
  const feedback = root.querySelector('#stand-feedback');

  Object.values(fields).forEach(({ input }) => {
    input.addEventListener('input', () => {
      input.classList.remove('input-error');
      feedback.className = 'stand-feedback pending';
      feedback.textContent = 'Noch nicht gespeichert – tippe auf „Stand bestätigen“.';
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
  });
  root.querySelector('#confirm-stand-btn').addEventListener('click', confirm);

  function confirm() {
    const grammarText = fields.grammar.input.value.trim();
    const vocabText = fields.vocabulary.input.value.trim();
    const grammar = grammarText ? findGrammarByCode(content.grammarTopics, grammarText) : null;
    const word = vocabText ? findVocabByText(content.vocab, vocabText) : null;

    const errors = [];
    if (grammarText && !grammar) {
      fields.grammar.input.classList.add('input-error');
      fields.grammar.status.textContent = `„${grammarText}“ gibt es nicht – bitte einen G-Code wie ${content.grammarTopics[2] ? content.grammarTopics[2].code : 'G3'} eingeben.`;
      errors.push('Grammatik');
    }
    if (vocabText && !word) {
      fields.vocabulary.input.classList.add('input-error');
      fields.vocabulary.status.textContent = `„${vocabText}“ steht nicht in der Vokabelliste – bitte das englische Wort genau wie im Buch eingeben.`;
      errors.push('Vokabeln');
    }
    if (errors.length) {
      feedback.className = 'stand-feedback error';
      feedback.textContent = `Nicht gespeichert – bitte ${errors.join(' und ')} prüfen.`;
      return;
    }

    db.update((s) => {
      const gs = gradeState(s, content.grade);
      gs.progressReference.grammarTopicId = grammar ? grammar.id : null;
      gs.progressReference.vocabularyWordId = word ? word.id : null;
      gs.progressReference.confirmedAt = new Date().toISOString();
      // keeps the unit preselection on the setup screens and the AI word list in step
      if (grammar) gs.bookPosition.grammar = `Unit ${grammar.unit}`;
      if (word) gs.bookPosition.vocabulary = `Unit ${word.unit}`;
    });

    const parts = [];
    parts.push(grammar ? `Grammatik bis ${grammar.code}` : 'kein Grammatik-Stand');
    // same count as the Vocabulary card: words (not phrases) up to the stand
    const wordCount = word ? content.vocab.slice(0, content.vocab.indexOf(word) + 1).filter((w) => w.type === 'word').length : 0;
    parts.push(word ? `Vokabeln bis „${word.en}“ (${wordCount} Vokabeln, Unit ${word.unit})` : 'kein Vokabel-Stand');
    setMessage({ ok: true, text: `✓ Gespeichert: ${parts.join(' · ')}` });
    redraw();
  }
}

// A plain manual text field used to pin down exactly which word/topic the
// teacher confirmed as known — far more precise than picking a whole unit,
// and the actual source of truth for the mastery bar shown below it. A
// datalist of valid values is optional (grammar codes are few enough that
// suggestions help; the full vocab list is long enough that on-device
// datalist pickers got in the way more than they helped, so that one is
// plain free-text entry).
function positionField({ key, label, placeholder, currentValue, datalistId, datalistHtml, status, pct }) {
  return `
    <div class="position-field-wrap">
      <div class="path-label">${label}</div>
      <input
        class="position-input"
        id="position-input-${key}"
        ${datalistId ? `list="${datalistId}"` : ''}
        placeholder="${escapeAttr(placeholder)}"
        value="${escapeAttr(currentValue)}"
        autocomplete="off"
      />
      ${datalistId ? `<datalist id="${datalistId}">${datalistHtml}</datalist>` : ''}
      <div class="position-status" id="position-status-${key}">${status}</div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="position-pct">${pct}% mastered</div>
    </div>
  `;
}

// Exact match first; otherwise the same tolerant check as the vocabulary
// trainer ("hang out" finds "to hang out (with) (infml)").
function findVocabByText(vocab, text) {
  const norm = text.trim().toLowerCase();
  return vocab.find((w) => w.en.trim().toLowerCase() === norm)
    || vocab.find((w) => checkVocabAnswer(text, w.en))
    || null;
}

// "G3", "g3", "G 3"
function findGrammarByCode(grammarTopics, text) {
  const norm = text.trim().toLowerCase().replace(/\s+/g, '');
  return grammarTopics.find((t) => t.code.trim().toLowerCase().replace(/\s+/g, '') === norm) || null;
}

// Shown only while an exam is active — covers just the topics that exam needs
// (not the whole book). Without an exam the greyed-out Exam Prep card already
// says everything, so a second empty bar would only be noise.
function examCardSub(exam) {
  if (!exam) return 'Tap to set up an exam';
  if (!exam.kind) return 'Active exam in progress';
  return `${EXAM_KINDS[exam.kind]}: ${countdownLabel(exam)}`;
}

function examBar(activeExam) {
  if (!activeExam) return '';
  // grade 6 exams have a type and date: show the countdown
  const pct = activeExam.kind ? examCompletionPct6(activeExam) : examCompletionPct(activeExam);
  const title = activeExam.kind ? `📋 ${EXAM_KINDS[activeExam.kind]} · ${countdownLabel(activeExam)}` : '📋 Exam Prep';

  return `
    <div class="progress-wrap exam-bar" id="exam-bar">
      <div class="progress-label">
        <span class="progress-title">${title}</span>
        <span>${pct}% ready</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

function goalStrip(streakState, streak) {
  if (streakState === 'done') {
    return `<div class="goal-strip done"><div class="goal-check">✓</div><div><strong>Daily goal done!</strong><span>Your ${streak}-day streak is safe. Extra practice still earns XP.</span></div></div>`;
  }
  if (streakState === 'keep') {
    return `<div class="goal-strip"><div class="goal-check">1</div><div><strong>Daily goal: 1 session</strong><span>Practise today to keep your ${streak}-day streak alive 🔥</span></div></div>`;
  }
  return `<div class="goal-strip"><div class="goal-check">1</div><div><strong>Daily goal: 1 session</strong><span>One short session today starts a new streak.</span></div></div>`;
}

function boxCell(box, count, name) {
  return `<div class="box-cell" data-box="${box}"><div class="box-num">${count}</div><div class="box-name">${name}</div></div>`;
}

function card(route, title, sub, iconSvg, greyed = false) {
  return `
    <button class="card${greyed ? ' disabled' : ''}" data-route="${route}">
      <div class="card-icon">${iconSvg}</div>
      <div class="card-title">${title}</div>
      <div class="card-sub">${sub}</div>
    </button>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
