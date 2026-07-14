import { navigate } from '../../router.js';
import { loadContent } from '../../data/contentStore.js';
import { db } from '../../storage/db.js';

const AGENT_ID = 'agent_5501kx8em1ckfcas3g3kmm49s72j';
const WIDGET_SCRIPT_SRC = 'https://unpkg.com/@elevenlabs/convai-widget-embed';

const THEMES = [
  { key: 'general', label: 'Surprise me', hint: 'Any topic — let the AI pick.', opener: "Hi! I'm here to help you practice English. What would you like to talk about today?" },
  { key: 'market', label: 'Market / shopping', hint: 'Unit 5', opener: 'Hi there! Welcome to the market — what are you looking for today?' },
  { key: 'cafe', label: 'Café', hint: 'Unit 5', opener: 'Hello, welcome in! What can I get you today?' },
  { key: 'telephone', label: 'On the phone', hint: 'Unit 5', opener: "Ring ring... Hello, this is Sam speaking. Who's calling?" },
  { key: 'party_planning', label: 'Party planning', hint: 'Unit 6', opener: "Hey! I heard you're planning a birthday party — where should we start?" },
  { key: 'party_rules', label: 'Party rules', hint: 'Unit 6', opener: "So, what are the rules for the party — what can and can't we do?" }
];

export async function renderAiConversation(root) {
  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const state = db.load();
  const knownVocabulary = buildKnownVocabulary(content, state);

  const local = { theme: 'general' };
  draw();

  function draw() {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Talk with an AI partner</h1>
      </div>
      <p class="subgreeting">This is a live, open conversation with an AI — not the scripted roleplays. It needs an internet connection and microphone access, and isn't stored in this app.</p>
      <p class="subgreeting">The AI is asked to stick to the ${knownVocabulary.length} words/phrases you've covered so far (Vocabulary: ${state.bookPosition.vocabulary || 'not set'}). It's a best-effort instruction to the AI, not a hard filter — it can still stray sometimes.</p>

      <p class="setup-label">Pick a topic to start with</p>
      <div class="segmented" id="theme-picker">
        ${THEMES.map((t) => `<button class="seg-btn${t.key === local.theme ? ' active' : ''}" data-theme="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="ai-widget-wrap" id="ai-widget-wrap"></div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/conversations'));
    root.querySelectorAll('#theme-picker .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.theme = btn.dataset.theme; draw(); });
    });

    mountWidget(root.querySelector('#ai-widget-wrap'), local.theme, knownVocabulary);
  }
}

function openerFor(theme) {
  return (THEMES.find((t) => t.key === theme) || THEMES[0]).opener;
}

// Scopes the word list to the same teacher-defined learning stand used for the
// Home progress bars (state.bookPosition.vocabulary), not the entire bundled
// content — the AI shouldn't reach for Unit 6 words if only Unit 5 is taught yet.
function buildKnownVocabulary(content, state) {
  const targetUnit = parseUnitFromPosition(state.bookPosition.vocabulary)
    || Math.max(...content.vocab.map((w) => w.unit));
  const inScope = content.vocab.filter((w) => w.unit <= targetUnit);
  const words = new Set();
  inScope.forEach((w) => {
    w.en.split('/').forEach((alt) => words.add(alt.trim()));
  });
  return [...words];
}

function parseUnitFromPosition(position) {
  if (!position) return null;
  const match = position.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function mountWidget(container, theme, knownVocabulary) {
  ensureWidgetScriptLoaded();

  const widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id', AGENT_ID);
  widget.setAttribute('dynamic-variables', JSON.stringify({
    scenario: theme,
    known_vocabulary: knownVocabulary.join(', '),
    // Drives the agent's "Erste Nachricht" field (set to {{opening_line}} in the
    // ElevenLabs dashboard) so the very first thing said already sets the scene
    // for the chosen theme, instead of a generic "what do you want to talk
    // about" greeting that ignores the theme the learner just picked.
    opening_line: openerFor(theme)
  }));
  container.appendChild(widget);
}

let scriptLoadPromise = null;

function ensureWidgetScriptLoaded() {
  if (scriptLoadPromise) return scriptLoadPromise;
  if (document.querySelector(`script[src="${WIDGET_SCRIPT_SRC}"]`)) {
    scriptLoadPromise = Promise.resolve();
    return scriptLoadPromise;
  }
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return scriptLoadPromise;
}
