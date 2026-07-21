import { db } from '../../storage/db.js';
import { navigate } from '../../router.js';
import { invalidateContentCache, syncBundledContentToFirestore } from '../../data/contentStore.js';

export function renderManageContent(root) {
  let lastMessage = null; // { cls, text } — survives the re-render triggered right after a successful upload
  let syncMessage = null;
  draw();

  function draw() {
    const state = db.load();
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Add unit content</h1>
      </div>
      <p class="subgreeting">Add a future unit's vocabulary, grammar and conversations without waiting for an app update. The file must follow the app's content schema (see <code>src/data/schema.md</code>) — export it as <code>.json</code>.</p>

      <label class="primary-btn" for="unit-file-input" style="display:block;text-align:center;">📄 Choose a unit .json file</label>
      <input type="file" id="unit-file-input" accept="application/json,.json" style="display:none;" />
      <div id="upload-feedback" class="feedback-text ${lastMessage ? lastMessage.cls : ''}" style="text-align:center;margin-top:10px;">${lastMessage ? lastMessage.text : ''}</div>

      <button class="text-link-btn" id="sync-content-btn" style="margin-top:24px;">🔄 Re-sync bundled Unit 5/6 content to the database</button>
      <div id="sync-feedback" class="feedback-text ${syncMessage ? syncMessage.cls : ''}" style="text-align:center;">${syncMessage ? syncMessage.text : ''}</div>

      ${state.customUnits.length > 0 ? `
        <p class="setup-label" style="margin-top:28px;">Added units</p>
        <div class="scenario-list">
          ${state.customUnits.map((u, i) => `
            <div class="scenario-card" style="cursor:default;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div class="scenario-title">Unit ${u.unit}${u.title ? ' — ' + u.title : ''}</div>
                <div class="scenario-goal">${(u.vocab || []).length} words · ${(u.grammarTopics || []).length} grammar topics · ${(u.conversationScenarios || []).length} conversations</div>
              </div>
              <button class="back-btn" data-remove-idx="${i}" title="Remove">✕</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    root.querySelector('#unit-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });
    root.querySelector('#sync-content-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Syncing…';
      try {
        await syncBundledContentToFirestore();
        syncMessage = { cls: 'correct', text: 'Content synced to the database.' };
      } catch (err) {
        syncMessage = { cls: 'wrong', text: `Sync failed: ${err.message}` };
      }
      draw();
    });
    root.querySelectorAll('[data-remove-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.removeIdx);
        db.update((s) => { s.customUnits.splice(idx, 1); });
        invalidateContentCache();
        draw();
      });
    });
  }

  async function handleFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const problems = validateUnit(parsed);
      if (problems.length > 0) {
        lastMessage = { cls: 'wrong', text: `Couldn't add this file: ${problems[0]}` };
        draw();
        return;
      }
      db.update((s) => {
        s.customUnits = s.customUnits.filter((u) => u.unit !== parsed.unit);
        s.customUnits.push(parsed);
      });
      invalidateContentCache();
      lastMessage = { cls: 'correct', text: `Added Unit ${parsed.unit}!` };
      draw();
    } catch (err) {
      lastMessage = { cls: 'wrong', text: `That file isn't valid JSON (${err.message}).` };
      draw();
    }
  }
}

function validateUnit(parsed) {
  const problems = [];
  if (typeof parsed !== 'object' || parsed === null) problems.push('the file must contain a JSON object.');
  if (typeof parsed.unit !== 'number') problems.push('missing a numeric "unit" field.');
  const hasContent = ['vocab', 'grammarTopics', 'grammarQuestions', 'conversationScenarios']
    .some((key) => Array.isArray(parsed[key]) && parsed[key].length > 0);
  if (!hasContent) problems.push('no vocab, grammarTopics, grammarQuestions or conversationScenarios found.');
  return problems;
}
