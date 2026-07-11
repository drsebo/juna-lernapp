import { navigate } from '../../router.js';

const AGENT_ID = 'agent_5501kx8em1ckfcas3g3kmm49s72j';
const WIDGET_SCRIPT_SRC = 'https://unpkg.com/@elevenlabs/convai-widget-embed';

const THEMES = [
  { key: 'general', label: 'Surprise me', hint: 'Any topic — let the AI pick.' },
  { key: 'market', label: 'Market / shopping', hint: 'Unit 5' },
  { key: 'cafe', label: 'Café', hint: 'Unit 5' },
  { key: 'telephone', label: 'On the phone', hint: 'Unit 5' },
  { key: 'party_planning', label: 'Party planning', hint: 'Unit 6' },
  { key: 'party_rules', label: 'Party rules', hint: 'Unit 6' }
];

export function renderAiConversation(root) {
  const local = { theme: 'general' };
  draw();

  function draw() {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Talk with an AI partner</h1>
      </div>
      <p class="subgreeting">This is a live, open conversation with an AI — not the scripted roleplays. It needs an internet connection and microphone access, and isn't stored in this app.</p>

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

    mountWidget(root.querySelector('#ai-widget-wrap'), local.theme);
  }
}

function mountWidget(container, theme) {
  ensureWidgetScriptLoaded();

  const widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id', AGENT_ID);
  widget.setAttribute('dynamic-variables', JSON.stringify({ scenario: theme }));
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
