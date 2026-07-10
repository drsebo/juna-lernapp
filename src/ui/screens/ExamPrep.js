import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { recognizeText, terminateOcr } from '../../ocr/ocrService.js';
import { matchOcrTextToTopics, createExam, examCompletionPct } from '../../engine/examPrep.js';

export async function renderExamPrep(root) {
  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const state = db.load();

  const activeExam = state.exams.find((e) => e.id === state.activeExamId);
  if (activeExam) {
    drawActiveExam(activeExam);
  } else {
    drawStart();
  }

  function drawStart() {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Exam Prep</h1>
      </div>
      <p class="subgreeting">Photograph a machine-printed exam prep sheet from school and we'll match its topics against Units 5 &amp; 6 — fully offline, nothing leaves this device.</p>
      <label class="primary-btn" for="photo-input" style="display:block;text-align:center;">📷 Take or choose a photo</label>
      <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none;" />
      ${state.exams.length > 0 ? `<p class="setup-label" style="margin-top:24px;">Past exams</p>${pastExamsList(state.exams)}` : ''}
    `;
    root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    root.querySelector('#photo-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handlePhoto(file);
    });
  }

  function pastExamsList(exams) {
    return `
      <div class="scenario-list">
        ${[...exams].reverse().map((ex) => `
          <div class="scenario-card" style="cursor:default;">
            <div class="scenario-card-top">
              <span class="scenario-title">${new Date(ex.createdAt).toLocaleDateString()}</span>
              <span class="scenario-badge">${examCompletionPct(ex)}%</span>
            </div>
            <div class="scenario-goal">${ex.topics.length} topic${ex.topics.length === 1 ? '' : 's'}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function handlePhoto(file) {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Exam Prep</h1>
      </div>
      <div class="placeholder-note">🔎 Reading the photo offline… this can take up to a minute on older devices.</div>
    `;
    root.querySelector('#back-btn').addEventListener('click', () => drawStart());

    try {
      const text = await recognizeText(file);
      const matches = matchOcrTextToTopics(text, content);
      drawReview(text, matches);
    } catch (err) {
      root.innerHTML = `
        <div class="screen-header">
          <button class="back-btn" id="back-btn">‹</button>
          <h1 class="greeting" style="margin:0;font-size:1.2rem;">Exam Prep</h1>
        </div>
        <div class="placeholder-note">Couldn't read that photo (${err.message}). Try again with better lighting or a straighter angle.</div>
        <button class="primary-btn" id="retry-btn">Try again</button>
      `;
      root.querySelector('#back-btn').addEventListener('click', () => drawStart());
      root.querySelector('#retry-btn').addEventListener('click', () => drawStart());
    }
  }

  function drawReview(ocrText, matches) {
    const selected = new Set(matches.map((m) => m.topicId));

    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Confirm topics</h1>
      </div>
      <p class="subgreeting">${matches.length === 0 ? "We couldn't match any topics automatically — the photo text is shown below in case it helps." : 'Uncheck anything that doesn\'t belong. This becomes your exam checklist.'}</p>
      <div class="topic-checklist" id="topic-checklist">
        ${matches.map((m) => `
          <label class="topic-check-item">
            <input type="checkbox" data-id="${m.topicId}" checked />
            <span>${m.label}</span>
          </label>
        `).join('')}
      </div>
      <details style="margin:14px 0;">
        <summary class="setup-label" style="cursor:pointer;">Raw text we read from the photo</summary>
        <div class="ocr-text-preview">${escapeHtml(ocrText) || '(no text detected)'}</div>
      </details>
      <button class="primary-btn" id="save-btn" ${matches.length === 0 ? 'disabled' : ''}>Save exam</button>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => drawStart());
    root.querySelectorAll('#topic-checklist input').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
      });
    });

    root.querySelector('#save-btn').addEventListener('click', () => {
      const chosen = matches.filter((m) => selected.has(m.topicId));
      const now = new Date().toISOString();
      const exam = createExam(chosen, now, ocrText);
      const updated = db.update((s) => {
        s.exams.push(exam);
        s.activeExamId = exam.id;
      });
      terminateOcr();
      drawActiveExam(updated.exams.find((e) => e.id === exam.id));
    });
  }

  function drawActiveExam(exam) {
    const pct = examCompletionPct(exam);
    const doneCount = exam.topics.filter((t) => t.done).length;

    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Exam Prep</h1>
      </div>
      <p class="subgreeting">Started ${new Date(exam.createdAt).toLocaleDateString()}</p>
      <div class="progress-wrap">
        <div class="progress-label"><span>${doneCount} of ${exam.topics.length} topics done</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="topic-checklist">
        ${exam.topics.map((t, i) => `
          <label class="topic-check-item">
            <input type="checkbox" data-idx="${i}" ${t.done ? 'checked' : ''} />
            <span>${t.label}</span>
          </label>
        `).join('')}
      </div>
      <button class="primary-btn secondary" id="new-exam-btn">Start a different exam</button>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    root.querySelectorAll('.topic-checklist input').forEach((cb) => {
      cb.addEventListener('change', () => {
        const idx = Number(cb.dataset.idx);
        const updated = db.update((s) => {
          const e = s.exams.find((x) => x.id === exam.id);
          e.topics[idx].done = cb.checked;
        });
        drawActiveExam(updated.exams.find((e) => e.id === exam.id));
      });
    });
    root.querySelector('#new-exam-btn').addEventListener('click', () => {
      db.update((s) => { s.activeExamId = null; });
      drawStart();
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
