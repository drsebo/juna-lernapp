import { db, gradeState } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { setSessionConfig } from '../sessionContext.js';
import { recognizeText, terminateOcr } from '../../ocr/ocrService.js';
import { availableUnitNumbers } from '../../data/contentStore.js';
import {
  EXAM_KINDS, activeExamFor, setActiveExam, examsOfGrade, todayIso, daysUntil, countdownLabel, formatDate,
  examTopicCandidates, topicsUpTo, matchOcrToExamTopics, createExam6, buildStudyPlan, goalsForExam,
  examCompletionPct6
} from '../../engine/examPrep6.js';

const RATINGS = [
  { key: 'red', icon: '🔴', label: 'Noch nicht' },
  { key: 'yellow', icon: '🟡', label: 'In Übung' },
  { key: 'green', icon: '🟢', label: 'Kann ich' }
];

// Starts the right trainer for one exam topic (grammar topic or vocab section).
export function startPractice(topic) {
  if (topic.kind === 'grammar') {
    setSessionConfig({ type: 'grammar', topicIds: [topic.topicId], showRules: true, mode: 'topics', currentUnit: topic.unit, minutes: 15 });
    navigate('/grammar/session');
  } else {
    setSessionConfig({
      type: 'vocabulary', practice: 'words', mode: 'count', count: 10, minutes: 10, currentUnit: topic.unit,
      sections: [topic.topicId.replace('section::', '')], direction: 'de-en'
    });
    navigate('/vocabulary/session');
  }
}

export function renderExamPrep6(root, content) {
  const grade = content.grade;
  const units = availableUnitNumbers(content);
  const candidates = examTopicCandidates(content);

  const active = activeExamFor(db.load(), grade);
  if (active) drawActiveExam(active); else drawStart();

  function header(title, back) {
    return `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">${title}</h1>
      </div>
    `;
  }

  function bindBack(fn) {
    root.querySelector('#back-btn').addEventListener('click', fn);
  }

  // ---------- start ----------

  function drawStart() {
    const exams = examsOfGrade(db.load(), grade);
    root.innerHTML = `
      ${header('Exam Prep')}
      <p class="subgreeting">Lege deine nächste Schulaufgabe oder Ex an: Datum, Stoff – dann bekommst du einen Lernplan bis zum Termin und kannst eine Probe-Schulaufgabe schreiben.</p>
      <button class="primary-btn" id="new-exam-btn">＋ Neue Prüfung anlegen</button>
      ${exams.length ? `<p class="setup-label" style="margin-top:24px;">Frühere Prüfungen</p>${examList(exams)}` : ''}
    `;
    bindBack(() => navigate('/'));
    root.querySelector('#new-exam-btn').addEventListener('click', () => drawCreate());
    root.querySelectorAll('[data-open-exam]').forEach((el) => el.addEventListener('click', () => {
      const exam = db.update((s) => setActiveExam(s, grade, el.dataset.openExam)).exams.find((e) => e.id === el.dataset.openExam);
      drawActiveExam(exam);
    }));
  }

  function examList(exams) {
    return `
      <div class="scenario-list">
        ${[...exams].reverse().map((ex) => {
          const last = (ex.mockResults || []).slice(-1)[0];
          return `
            <button class="scenario-card exam-card" data-open-exam="${ex.id}">
              <div class="scenario-card-top">
                <span class="scenario-title">${ex.kind ? EXAM_KINDS[ex.kind] : 'Exam'} ${ex.date ? `· ${formatDate(ex.date)}` : `· ${new Date(ex.createdAt).toLocaleDateString()}`}</span>
                <span class="scenario-badge">${ex.kind ? examCompletionPct6(ex) : 0}%</span>
              </div>
              <div class="scenario-goal">${ex.topics.length} Themen${last ? ` · Probe: Note ${last.grade} (${last.points}/${last.max})` : ''}</div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  // ---------- create ----------

  function drawCreate() {
    const ref = gradeState(db.load(), grade).progressReference;
    const refLabel = refText(ref);
    const form = {
      kind: 'schulaufgabe',
      date: addDaysIso(14),
      method: 'manual', // 'photo' | 'manual' | 'upto'
      selected: new Set(),
      fromUnit: units[0],
      upTo: refLabel ? 'ref' : String(units[units.length - 1]),
      ocrText: '',
      status: ''
    };
    render();

    function render() {
      root.innerHTML = `
        ${header('Neue Prüfung')}
        <p class="setup-label">Art</p>
        <div class="segmented" id="kind-seg">
          ${Object.entries(EXAM_KINDS).map(([k, label]) => `<button class="seg-btn${form.kind === k ? ' active' : ''}" data-kind="${k}">${label}</button>`).join('')}
        </div>

        <p class="setup-label">Datum</p>
        <input class="exercise-input date-input" type="date" id="exam-date" value="${form.date}" min="${todayIso()}" />

        <p class="setup-label">Stoff</p>
        <div class="segmented" id="method-seg">
          <button class="seg-btn${form.method === 'photo' ? ' active' : ''}" data-method="photo">📷 Stoffzettel</button>
          <button class="seg-btn${form.method === 'manual' ? ' active' : ''}" data-method="manual">Selbst wählen</button>
          <button class="seg-btn${form.method === 'upto' ? ' active' : ''}" data-method="upto">Bis Stand …</button>
        </div>

        ${form.method === 'photo' ? `
          <p class="setup-hint">Foto vom Stoffzettel: Die Texterkennung läuft offline auf dem Gerät und sucht G-Codes (G1–G18), Units, Unit-Titel und Lernziele. Danach kannst du die Auswahl unten anpassen.</p>
          <label class="primary-btn secondary" for="photo-input" style="display:block;text-align:center;">📷 Foto aufnehmen oder wählen</label>
          <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none;" />
        ` : ''}

        ${form.method === 'upto' ? `
          <div class="upto-row">
            <label>von <select id="from-unit">${units.map((u) => `<option value="${u}"${u === form.fromUnit ? ' selected' : ''}>Unit ${u}</option>`).join('')}</select></label>
            <label>bis <select id="up-to">
              ${refLabel ? `<option value="ref"${form.upTo === 'ref' ? ' selected' : ''}>Stand Teacher check-in (${refLabel})</option>` : ''}
              ${units.map((u) => `<option value="${u}"${String(u) === form.upTo ? ' selected' : ''}>Ende Unit ${u}</option>`).join('')}
            </select></label>
          </div>
          <button class="primary-btn secondary" id="apply-upto">Stoff übernehmen</button>
        ` : ''}

        ${form.status ? `<p class="setup-hint">${form.status}</p>` : ''}

        <p class="setup-label">Ausgewählt: ${form.selected.size} Themen <button class="text-link-btn inline-link" id="clear-sel">leeren</button></p>
        ${units.map((u) => {
          const topics = candidates.filter((c) => c.unit === u);
          const allOn = topics.every((t) => form.selected.has(t.topicId));
          return `
            <div class="topic-unit">
              <button class="topic-unit-head${allOn ? ' active' : ''}" data-unit="${u}">Unit ${u}</button>
              <div class="topic-pick-list">
                ${topics.map((t) => `<button class="topic-pick${form.selected.has(t.topicId) ? ' active' : ''}" data-id="${t.topicId}">${t.kind === 'grammar' ? '📘' : '🔤'} ${t.kind === 'grammar' ? t.label : t.label.replace(/^Unit \d+ · /, '')}</button>`).join('')}
              </div>
            </div>
          `;
        }).join('')}

        ${form.ocrText ? `<details style="margin:14px 0;"><summary class="setup-label" style="cursor:pointer;">Erkannter Text vom Foto</summary><div class="ocr-text-preview">${escapeHtml(form.ocrText)}</div></details>` : ''}

        <button class="primary-btn" id="save-btn"${form.selected.size && form.date ? '' : ' disabled'}>Prüfung speichern</button>
      `;

      bindBack(() => drawStart());
      root.querySelectorAll('#kind-seg .seg-btn').forEach((b) => b.addEventListener('click', () => {
        form.kind = b.dataset.kind;
        if (form.kind === 'ex' && form.date === addDaysIso(14)) form.date = addDaysIso(2);
        render();
      }));
      root.querySelector('#exam-date').addEventListener('change', (e) => { form.date = e.target.value; render(); });
      root.querySelectorAll('#method-seg .seg-btn').forEach((b) => b.addEventListener('click', () => { form.method = b.dataset.method; form.status = ''; render(); }));
      root.querySelector('#photo-input')?.addEventListener('change', (e) => { if (e.target.files[0]) readPhoto(e.target.files[0]); });
      root.querySelector('#from-unit')?.addEventListener('change', (e) => { form.fromUnit = Number(e.target.value); });
      root.querySelector('#up-to')?.addEventListener('change', (e) => { form.upTo = e.target.value; });
      root.querySelector('#apply-upto')?.addEventListener('click', () => {
        const toRef = form.upTo === 'ref' ? ref : null;
        const toUnit = toRef ? refUnit(ref) : Number(form.upTo);
        const topics = topicsUpTo(content, form.fromUnit, Math.max(toUnit, form.fromUnit), toRef);
        form.selected = new Set(topics.map((t) => t.topicId));
        form.status = `${topics.length} Themen übernommen – unten kannst du noch abwählen.`;
        render();
      });
      root.querySelector('#clear-sel').addEventListener('click', () => { form.selected.clear(); render(); });
      root.querySelectorAll('.topic-pick').forEach((b) => b.addEventListener('click', () => {
        if (form.selected.has(b.dataset.id)) form.selected.delete(b.dataset.id); else form.selected.add(b.dataset.id);
        render();
      }));
      root.querySelectorAll('.topic-unit-head').forEach((b) => b.addEventListener('click', () => {
        const topics = candidates.filter((c) => c.unit === Number(b.dataset.unit));
        const allOn = topics.every((t) => form.selected.has(t.topicId));
        topics.forEach((t) => (allOn ? form.selected.delete(t.topicId) : form.selected.add(t.topicId)));
        render();
      }));
      root.querySelector('#save-btn').addEventListener('click', () => {
        if (!form.selected.size || !form.date) return;
        const now = new Date().toISOString();
        const exam = createExam6({
          grade, kind: form.kind, date: form.date, now, source: form.method, sourceText: form.ocrText,
          topics: candidates.filter((c) => form.selected.has(c.topicId))
        });
        const saved = db.update((s) => { s.exams.push(exam); setActiveExam(s, grade, exam.id); });
        terminateOcr();
        drawActiveExam(saved.exams.find((e) => e.id === exam.id));
      });
    }

    async function readPhoto(file) {
      form.status = '🔎 Lese das Foto offline … das kann auf älteren Geräten bis zu einer Minute dauern.';
      render();
      try {
        const text = await recognizeText(file);
        const matches = matchOcrToExamTopics(text, content);
        form.ocrText = text;
        matches.forEach((m) => form.selected.add(m.topicId));
        form.status = matches.length
          ? `${matches.length} Themen erkannt – bitte prüfen und ggf. ergänzen.`
          : 'Keine Themen erkannt – wähle den Stoff bitte unten selbst aus.';
      } catch (err) {
        form.status = `Das Foto konnte nicht gelesen werden (${err.message}). Versuch es mit besserem Licht – oder wähle den Stoff selbst aus.`;
      }
      render();
    }
  }

  // ---------- active exam ----------

  function drawActiveExam(exam) {
    const plan = buildStudyPlan(exam);
    const goals = goalsForExam(exam, content);
    const pct = examCompletionPct6(exam);
    const today = todayIso();
    const left = daysUntil(exam.date);

    root.innerHTML = `
      ${header(EXAM_KINDS[exam.kind] || 'Exam')}
      <div class="exam-countdown">
        <div class="exam-countdown-days">${countdownLabel(exam)}</div>
        <div class="exam-countdown-date">${EXAM_KINDS[exam.kind]} am ${formatDate(exam.date)} · ${exam.topics.length} Themen</div>
      </div>
      <div class="progress-wrap">
        <div class="progress-label"><span>${exam.topics.filter((t) => t.done).length} von ${exam.topics.length} Themen geübt</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>

      <button class="primary-btn" id="mock-btn">📝 Probe-Schulaufgabe starten</button>

      ${left !== null && left >= 0 ? `
        <p class="setup-label">Lernplan bis zur ${EXAM_KINDS[exam.kind]}</p>
        <div class="plan-list">
          ${plan.map((day) => `
            <div class="plan-day${day.date === today ? ' today' : ''}">
              <div class="plan-day-head"><strong>${day.date === today ? 'Heute' : formatDate(day.date)}</strong><span>${day.mock ? `${day.minutes} Min.` : day.items.length ? `ca. ${day.minutes} Min.` : ''}</span></div>
              ${day.mock ? `<div class="plan-item">📝 Probe-Schulaufgabe schreiben, danach die Schwachstellen üben</div>` : ''}
              ${!day.mock && !day.items.length ? '<div class="plan-item muted">Alles geübt – wiederhole, was noch 🔴 oder 🟡 ist.</div>' : ''}
              ${day.items.map((t) => `
                <div class="plan-item">
                  <label><input type="checkbox" data-done="${t.index}" /> ${t.kind === 'grammar' ? '📘' : '🔤'} ${t.label}</label>
                  <button class="plan-practise" data-practise="${t.index}">Üben</button>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${goals.length ? `
        <p class="setup-label">Can you …? – Selbsteinschätzung</p>
        <div class="goal-list">
          ${goals.map((g) => `
            <div class="goal-item">
              <div class="goal-text"><strong>${g.text}</strong><small>${g.example}</small></div>
              <div class="goal-rating">
                ${RATINGS.map((r) => `<button class="rating-btn${exam.goals[g.id] === r.key ? ' active' : ''}" data-goal="${g.id}" data-rating="${r.key}" title="${r.label}">${r.icon}</button>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${(exam.mockResults || []).length ? `
        <p class="setup-label">Probe-Schulaufgaben</p>
        <div class="goal-list">
          ${exam.mockResults.slice().reverse().map((r) => `
            <div class="goal-item"><div class="goal-text"><strong>Note ${r.grade} · ${r.points}/${r.max} Punkte</strong><small>${new Date(r.date).toLocaleDateString('de-DE')} · ${r.parts.map((p) => `${p.label} ${p.points}/${p.max}`).join(' · ')}</small></div></div>
          `).join('')}
        </div>
      ` : ''}

      <details class="teacher-panel" style="margin-top:16px;">
        <summary><span>Ganzer Stoff (${exam.topics.length})<small>abhaken, was du sicher kannst</small></span></summary>
        <div class="topic-checklist">
          ${exam.topics.map((t, i) => `
            <label class="topic-check-item"><input type="checkbox" data-done="${i}" ${t.done ? 'checked' : ''} /><span>${t.label}</span></label>
          `).join('')}
        </div>
      </details>

      <button class="primary-btn secondary" id="close-exam-btn" style="margin-top:16px;">Andere Prüfung / neue anlegen</button>
    `;

    bindBack(() => navigate('/'));
    root.querySelector('#mock-btn').addEventListener('click', () => navigate('/exam-prep/mock'));
    root.querySelectorAll('[data-done]').forEach((cb) => cb.addEventListener('change', () => {
      const updated = db.update((s) => { s.exams.find((e) => e.id === exam.id).topics[Number(cb.dataset.done)].done = cb.checked; });
      drawActiveExam(updated.exams.find((e) => e.id === exam.id));
    }));
    root.querySelectorAll('[data-practise]').forEach((b) => b.addEventListener('click', () => startPractice(exam.topics[Number(b.dataset.practise)])));
    root.querySelectorAll('.rating-btn').forEach((b) => b.addEventListener('click', () => {
      const updated = db.update((s) => {
        const e = s.exams.find((x) => x.id === exam.id);
        e.goals = e.goals || {};
        e.goals[b.dataset.goal] = b.dataset.rating;
      });
      drawActiveExam(updated.exams.find((e) => e.id === exam.id));
    }));
    root.querySelector('#close-exam-btn').addEventListener('click', () => {
      db.update((s) => setActiveExam(s, grade, null));
      drawStart();
    });
  }

  function refText(ref) {
    const g = content.grammarTopics.find((t) => t.id === ref.grammarTopicId);
    const w = content.vocab.find((v) => v.id === ref.vocabularyWordId);
    return [g && g.code, w && w.en].filter(Boolean).join(' / ');
  }

  function refUnit(ref) {
    const g = content.grammarTopics.find((t) => t.id === ref.grammarTopicId);
    const w = content.vocab.find((v) => v.id === ref.vocabularyWordId);
    return Math.max(g ? g.unit : 0, w ? w.unit : 0) || units[units.length - 1];
  }
}

function addDaysIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayIso(d);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
