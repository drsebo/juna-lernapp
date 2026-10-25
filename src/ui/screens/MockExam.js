import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { createTimer } from '../../engine/session.js';
import { acceptedAnswersOf } from '../../engine/grammarExercises.js';
import {
  EXAM_KINDS, MOCK_EXAM_MINUTES, GRADE_KEY, activeExamFor, buildMockExam, scoreMockExam, gradeFor
} from '../../engine/examPrep6.js';
import { startPractice } from './ExamPrep6.js';

// Probe-Schulaufgabe: Vocabulary → Grammar → Reading → Mediation under a time
// limit, then the evaluation with points per part, a grade (GRADE_KEY) and the
// topics to practise again. The result goes into the exam's log.
export async function renderMockExam(root) {
  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const exam = activeExamFor(db.load(), content.grade);
  if (!exam || !exam.kind) {
    navigate('/exam-prep');
    return;
  }

  const mock = buildMockExam(exam, content);
  const parts = [
    mock.vocab.length && 'vocab',
    mock.grammar.length && 'grammar',
    mock.reading && 'reading',
    mock.mediation && 'mediation'
  ].filter(Boolean);
  const answers = { vocab: [], grammar: [], reading: [], mediation: '' };
  const state = { part: -1, timeUp: false, finished: false, secondsLeft: MOCK_EXAM_MINUTES * 60 };

  const timer = createTimer({
    limitMinutes: MOCK_EXAM_MINUTES,
    onTick: (elapsed) => {
      state.secondsLeft = Math.max(0, MOCK_EXAM_MINUTES * 60 - elapsed);
      const el = root.querySelector('#mock-timer');
      if (el) el.textContent = clock(state.secondsLeft);
    },
    onLimitReached: () => {
      state.timeUp = true;
      collect();
      drawEvaluation();
    }
  });

  drawIntro();

  function topBar(label) {
    return `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Probe-${EXAM_KINDS[exam.kind] || 'Schulaufgabe'}</h1>
      </div>
      <div class="session-progress"><span>${label}</span><span id="mock-timer" class="mock-timer">${clock(state.secondsLeft)}</span></div>
    `;
  }

  function bindBack() {
    root.querySelector('#back-btn').addEventListener('click', () => {
      if (state.part >= 0 && !state.finished && !confirm('Probe-Schulaufgabe abbrechen? Deine Antworten werden nicht gespeichert.')) return;
      timer.stop();
      navigate('/exam-prep');
    });
  }

  function drawIntro() {
    root.innerHTML = `
      ${topBar('Bereit?')}
      <div class="exercise-card mock-card">
        <p>Wie in einer echten Schulaufgabe: <strong>${MOCK_EXAM_MINUTES} Minuten</strong>, ${parts.length} Teile. Du kannst innerhalb eines Teils frei springen; am Ende bekommst du Punkte, eine Note und eine Liste, was du nachüben solltest.</p>
        <ol class="mock-parts">
          ${parts.map((p) => `<li>${PART_LABELS[p]}</li>`).join('')}
        </ol>
        <button class="primary-btn" id="go-btn">Los geht's – Timer starten</button>
      </div>
    `;
    bindBack();
    root.querySelector('#go-btn').addEventListener('click', () => {
      timer.start();
      state.part = 0;
      drawPart();
    });
  }

  function drawPart() {
    if (state.part >= parts.length) {
      drawEvaluation();
      return;
    }
    const key = parts[state.part];
    const last = state.part === parts.length - 1;
    root.innerHTML = `
      ${topBar(`Teil ${state.part + 1} von ${parts.length}: ${PART_LABELS[key]}`)}
      <div class="exercise-card mock-card">${partHtml(key)}</div>
      <button class="primary-btn" id="next-part-btn">${last ? 'Abgeben & auswerten' : 'Weiter zum nächsten Teil'}</button>
    `;
    bindBack();
    root.querySelectorAll('.mock-choice').forEach((btn) => btn.addEventListener('click', () => {
      root.querySelectorAll(`.mock-choice[data-group="${btn.dataset.group}"]`).forEach((b) => b.classList.toggle('active', b === btn));
    }));
    root.querySelector('#next-part-btn').addEventListener('click', () => {
      collect();
      state.part += 1;
      window.scrollTo(0, 0);
      drawPart();
    });
  }

  function partHtml(key) {
    if (key === 'vocab') {
      return `
        <p class="mock-instruction">Complete the sentences with the right English word. <small>(je 1 Punkt)</small></p>
        ${mock.vocab.map((item, i) => `
          <div class="mock-item">
            <div class="mock-num">${i + 1}</div>
            <div class="mock-body">
              <div>${item.sentence} <span class="mock-hint">(${item.hint})</span></div>
              <input class="exercise-input mock-input" data-vocab="${i}" value="${escapeAttr(answers.vocab[i] || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" />
            </div>
          </div>
        `).join('')}
      `;
    }
    if (key === 'grammar') {
      return `
        <p class="mock-instruction">Grammar. <small>(Umformungen 2 Punkte, sonst 1 Punkt)</small></p>
        ${mock.grammar.map(({ question: q, points }, i) => `
          <div class="mock-item">
            <div class="mock-num">${i + 1}</div>
            <div class="mock-body">
              <div>${q.prompt} <span class="mock-hint">(${points} P.)</span></div>
              ${q.type === 'multipleChoice'
                ? `<div class="mock-choices">${q.options.map((o) => `<button class="mock-choice${answers.grammar[i] === o ? ' active' : ''}" data-group="g${i}" data-grammar="${i}" data-value="${escapeAttr(o)}">${o}</button>`).join('')}</div>`
                : `<input class="exercise-input mock-input${q.type === 'transform' ? ' transform-input' : ''}" data-grammar="${i}" value="${escapeAttr(answers.grammar[i] || '')}" placeholder="${q.type === 'transform' ? 'Write the whole sentence…' : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" />`}
            </div>
          </div>
        `).join('')}
      `;
    }
    if (key === 'reading') {
      return `
        <p class="mock-instruction">Read the text and answer the questions. <small>(je 1 Punkt)</small></p>
        <div class="mock-story"><strong>${mock.reading.story.title}</strong><p>${mock.reading.story.text}</p></div>
        ${mock.reading.questions.map((q, i) => `
          <div class="mock-item">
            <div class="mock-num">${i + 1}</div>
            <div class="mock-body">
              <div>${q.type === 'trueFalse' ? `True or false? ${q.question}` : q.question}</div>
              <div class="mock-choices">${q.options.map((o) => `<button class="mock-choice${answers.reading[i] === o ? ' active' : ''}" data-group="r${i}" data-reading="${i}" data-value="${escapeAttr(o)}">${o}</button>`).join('')}</div>
            </div>
          </div>
        `).join('')}
      `;
    }
    const m = mock.mediation;
    return `
      <p class="mock-instruction">Mediation (${m.direction === 'de-en' ? 'Deutsch → Englisch' : 'Englisch → Deutsch'}) <small>(${m.points} Punkte – du bewertest dich danach selbst mit der Musterlösung)</small></p>
      <p><strong>${m.title}</strong></p>
      <p>${m.situation}</p>
      <div class="mock-story">${m.material.replace(/\n/g, '<br>')}</div>
      <p><strong>Aufgabe:</strong> ${m.task}</p>
      <p class="mock-hint">Tipp (S20): nicht Wort für Wort übersetzen – nur, was gebraucht wird.</p>
      <textarea class="exercise-input mock-textarea" id="mediation-text" rows="8">${escapeHtml(answers.mediation)}</textarea>
    `;
  }

  // reads the current page's inputs into `answers`
  function collect() {
    root.querySelectorAll('[data-vocab]').forEach((el) => { answers.vocab[Number(el.dataset.vocab)] = el.value; });
    root.querySelectorAll('input[data-grammar]').forEach((el) => { answers.grammar[Number(el.dataset.grammar)] = el.value; });
    root.querySelectorAll('.mock-choice.active[data-grammar]').forEach((el) => { answers.grammar[Number(el.dataset.grammar)] = el.dataset.value; });
    root.querySelectorAll('.mock-choice.active[data-reading]').forEach((el) => { answers.reading[Number(el.dataset.reading)] = el.dataset.value; });
    const med = root.querySelector('#mediation-text');
    if (med) answers.mediation = med.value;
  }

  function drawEvaluation() {
    if (state.finished) return;
    state.finished = true;
    timer.stop();
    const ticked = new Set();
    render();

    function render() {
      const result = scoreMockExam(mock, answers, ticked.size);
      const topicsById = new Map(exam.topics.map((t) => [t.topicId, t]));
      const weakTopics = result.weakTopicIds.map((id) => topicsById.get(id)).filter(Boolean);

      root.innerHTML = `
        <div class="screen-header">
          <button class="back-btn" id="back-btn">‹</button>
          <h1 class="greeting" style="margin:0;font-size:1.2rem;">Auswertung</h1>
        </div>
        ${state.timeUp ? '<p class="subgreeting">⏰ Die Zeit ist um – ausgewertet wird, was du bis dahin geschrieben hast.</p>' : ''}
        <div class="mock-grade">
          <div class="mock-grade-num">${result.grade}</div>
          <div><strong>${result.points} von ${result.max} Punkten</strong><small>${Math.round((result.points / Math.max(1, result.max)) * 100)} % · Notenschlüssel: ${GRADE_KEY.slice(0, 5).map((g) => `${g.grade} ab ${Math.round(g.minShare * 100)} %`).join(', ')}</small></div>
        </div>
        <div class="mock-parts-result">
          ${result.parts.map((p) => `<div><span>${p.label}</span><strong>${p.points}/${p.max}</strong></div>`).join('')}
        </div>

        ${mock.mediation ? `
          <p class="setup-label">Mediation: vergleiche mit der Musterlösung und hake ab, was du drin hast</p>
          <div class="mock-story"><strong>Deine Antwort:</strong><br>${escapeHtml(answers.mediation) || '<em>(leer)</em>'}</div>
          <div class="topic-checklist">
            ${mock.mediation.keyPoints.map((kp, i) => `<label class="topic-check-item"><input type="checkbox" data-kp="${i}" ${ticked.has(i) ? 'checked' : ''} /><span>${kp}</span></label>`).join('')}
          </div>
          <details class="mock-model"><summary>Musterlösung anzeigen</summary><p>${mock.mediation.modelAnswer}</p></details>
        ` : ''}

        <p class="setup-label">Das solltest du nachüben</p>
        ${weakTopics.length ? `
          <div class="plan-list">
            ${weakTopics.map((t) => `<div class="plan-item"><span>${t.kind === 'grammar' ? '📘' : '🔤'} ${t.label}</span><button class="plan-practise" data-weak="${t.topicId}">Üben</button></div>`).join('')}
          </div>
        ` : '<p class="setup-hint">Bei Vokabeln und Grammatik war alles richtig – super! 🎉</p>'}
        ${result.readingResults.filter((r) => !r.ok).length > 2 ? `<p class="setup-hint">📖 Lies die Story „${mock.reading.story.title}" noch einmal im Buch.</p>` : ''}

        <details class="mock-model"><summary>Alle Lösungen ansehen</summary>${solutionsHtml(result)}</details>

        <button class="primary-btn" id="save-btn">Ergebnis speichern</button>
      `;

      root.querySelector('#back-btn').addEventListener('click', () => navigate('/exam-prep'));
      root.querySelectorAll('[data-kp]').forEach((cb) => cb.addEventListener('change', () => {
        if (cb.checked) ticked.add(Number(cb.dataset.kp)); else ticked.delete(Number(cb.dataset.kp));
        render();
      }));
      root.querySelectorAll('[data-weak]').forEach((b) => b.addEventListener('click', () => {
        saveResult(result);
        startPractice(topicsById.get(b.dataset.weak));
      }));
      root.querySelector('#save-btn').addEventListener('click', () => {
        saveResult(result);
        navigate('/exam-prep');
      });
    }
  }

  let saved = false;
  function saveResult(result) {
    if (saved) return;
    saved = true;
    db.update((s) => {
      const e = s.exams.find((x) => x.id === exam.id);
      e.mockResults = e.mockResults || [];
      e.mockResults.push({
        date: new Date().toISOString(),
        points: result.points,
        max: result.max,
        grade: gradeFor(result.points, result.max),
        parts: result.parts,
        weakTopicIds: result.weakTopicIds,
        timeUp: state.timeUp
      });
    });
  }

  function solutionsHtml(result) {
    const row = (ok, text, correct) => `<div class="mock-solution ${ok ? 'ok' : 'wrong'}">${ok ? '✓' : '✗'} ${text}${ok ? '' : ` → <strong>${correct}</strong>`}</div>`;
    return `
      ${result.vocabResults.length ? `<p class="setup-label">Vocabulary</p>${result.vocabResults.map((r, i) => row(r.ok, `${i + 1}. ${escapeHtml(answers.vocab[i] || '–')}`, r.item.answer)).join('')}` : ''}
      ${result.grammarResults.length ? `<p class="setup-label">Grammar</p>${result.grammarResults.map((r, i) => row(r.ok, `${i + 1}. ${escapeHtml(answers.grammar[i] || '–')}`, acceptedAnswersOf(r.question).join(' / '))).join('')}` : ''}
      ${result.readingResults.length ? `<p class="setup-label">Reading</p>${result.readingResults.map((r, i) => row(r.ok, `${i + 1}. ${escapeHtml(answers.reading[i] || '–')}`, r.question.answer)).join('')}` : ''}
    `;
  }
}

const PART_LABELS = {
  vocab: 'Vocabulary',
  grammar: 'Grammar',
  reading: 'Reading',
  mediation: 'Mediation'
};

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
