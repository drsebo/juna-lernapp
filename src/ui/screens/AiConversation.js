import { navigate } from '../../router.js';
import { loadContent } from '../../data/contentStore.js';
import { db, gradeState } from '../../storage/db.js';

// ElevenLabs agent per grade. Both use the existing Juna agent for now — to
// give grade 6 its own agent (e.g. a duplicate "Juna English 6" with the
// extended prompt), put its id under 6.
const AGENT_IDS = {
  5: 'agent_5501kx8em1ckfcas3g3kmm49s72j',
  6: 'agent_5501kx8em1ckfcas3g3kmm49s72j'
};
const WIDGET_SCRIPT_SRC = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
const LEARNER_NAME = 'Juna';
// Above this length the word list is cut down to the current grade's words
// plus a note that all grade 5 words are known too.
const MAX_VOCABULARY_CHARS = 6000;

const GENERAL_THEME = { key: 'general', label: 'Surprise me', hint: 'Any topic — let the AI pick.', opener: "Hi! I'm here to help you practice English. What would you like to talk about today?" };

// Grade 5 topics (unchanged). Grade 6 topics come from the roleplay
// scenarios in the content (03_konversationen.md → conversationScenarios).
const GRADE5_THEMES = [
  GENERAL_THEME,
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
  const targetUnit = parseUnitFromPosition(gradeState(state).bookPosition.vocabulary)
    || Math.max(...content.vocab.map((w) => w.unit));
  const themes = content.grade === 5 ? GRADE5_THEMES : themesFromScenarios(content);
  const vocabulary = await buildKnownVocabulary(content, targetUnit);

  const local = { theme: 'general' };
  draw();

  function draw() {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Talk with an AI partner</h1>
      </div>
      <p class="subgreeting">This is a live, open conversation with an AI — not the scripted roleplays. It needs an internet connection and microphone access, and isn't stored in this app.</p>
      <p class="subgreeting">The AI is asked to stick to the ${vocabulary.count} words/phrases you've covered so far (Vocabulary: ${gradeState(state).bookPosition.vocabulary || 'not set'}${vocabulary.grade5Note ? ' + all of Klasse 5' : ''}). It's a best-effort instruction to the AI, not a hard filter — it can still stray sometimes.</p>

      <p class="setup-label">Pick a topic to start with</p>
      <div class="segmented theme-picker" id="theme-picker">
        ${themes.map((t) => `<button class="seg-btn${t.key === local.theme ? ' active' : ''}" data-theme="${t.key}">${t.label}${t.unitLabel ? ` <small>${t.unitLabel}</small>` : ''}</button>`).join('')}
      </div>
      ${currentTheme().situation ? `<p class="setup-hint theme-situation">${currentTheme().situation}${currentTheme().phrases ? `<br><em>${currentTheme().phrases.slice(0, 3).join(' · ')}</em>` : ''}</p>` : ''}

      <div class="ai-widget-wrap" id="ai-widget-wrap"></div>
    `;

    root.querySelector('#back-btn').addEventListener('click', () => navigate('/conversations'));
    root.querySelectorAll('#theme-picker .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => { local.theme = btn.dataset.theme; draw(); });
    });

    mountWidget(root.querySelector('#ai-widget-wrap'), content.grade, dynamicVariables());
  }

  function currentTheme() {
    return themes.find((t) => t.key === local.theme) || themes[0];
  }

  // Variables the agent's prompt can use ({{scenario}}, {{grade}} …). Grade 5
  // keeps sending the theme key as "scenario", exactly as before.
  function dynamicVariables() {
    const theme = currentTheme();
    const unit = theme.unit || targetUnit;
    return {
      scenario: content.grade === 5 ? theme.key : theme.scenario || 'free conversation about everyday topics',
      known_vocabulary: vocabulary.text,
      // Drives the agent's "Erste Nachricht" field (set to {{opening_line}} in the
      // ElevenLabs dashboard) so the very first thing said already sets the scene
      // for the chosen theme, instead of a generic "what do you want to talk
      // about" greeting that ignores the theme the learner just picked.
      opening_line: theme.opener,
      grade: String(content.grade),
      unit: String(unit),
      grammar_focus: grammarFocus(content, theme.grammarCodes, unit),
      learner_name: LEARNER_NAME
    };
  }
}

function themesFromScenarios(content) {
  return [
    GENERAL_THEME,
    ...content.conversationScenarios.map((s) => ({
      key: s.id.replace(/^k\d+c_/, ''),
      label: s.title,
      unit: s.unit,
      unitLabel: s.section ? `Unit ${s.unit} · ${s.section}` : `Unit ${s.unit}`,
      opener: s.openingLine || s.nodes[s.startNode].npcLine,
      situation: s.situation,
      phrases: s.phrases,
      grammarCodes: s.grammarCodes || [],
      scenario: `${s.title} (Unit ${s.unit}): ${s.situation || s.goal}`
    }))
  ];
}

// "going-to future, question tags" — the English part of the topic titles of
// the theme's G-codes, or else of all topics in the unit.
function grammarFocus(content, codes, unit) {
  const topics = codes && codes.length
    ? content.grammarTopics.filter((t) => codes.includes(t.code))
    : content.grammarTopics.filter((t) => t.unit === unit);
  return topics.map((t) => t.title.replace(/\s*\(.*\)\s*$/, '')).join(', ') || 'free conversation';
}

// Scopes the word list to the same teacher-defined learning stand used for the
// Home progress bars (bookPosition.vocabulary of the active grade), not the entire bundled
// content — the AI shouldn't reach for Unit 6 words if only Unit 5 is taught yet.
// From grade 6 on, all grade 5 words count as known too; if the list gets too
// long for the agent, only this grade's words are sent plus a short note.
async function buildKnownVocabulary(content, targetUnit) {
  const wordsOf = (vocab, compact) => {
    const words = new Set();
    vocab.forEach((w) => w.en.split('/').forEach((alt) => {
      // compact: "LOL (= laughing out loud)" → "LOL", "to hang out (with) (infml)" → "to hang out"
      const word = compact ? alt.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ') : alt;
      if (word.trim()) words.add(word.trim());
    }));
    return [...words];
  };
  if (content.grade === 5) {
    const words = wordsOf(content.vocab.filter((w) => w.unit <= targetUnit), false);
    return { text: words.join(', '), count: words.length, grade5Note: false };
  }
  const current = wordsOf(content.vocab.filter((w) => w.unit <= targetUnit), true);

  let earlier = [];
  try {
    earlier = wordsOf((await loadContent({ grade: 5 })).vocab, true);
  } catch (err) {
    console.warn('Grade 5 vocabulary unavailable', err);
  }
  const all = [...new Set([...current, ...earlier])];
  const full = all.join(', ');
  if (full.length <= MAX_VOCABULARY_CHARS) return { text: full, count: all.length, grade5Note: false };
  return { text: `${current.join(', ')} (plus all grade 5 words)`, count: current.length, grade5Note: true };
}

function parseUnitFromPosition(position) {
  if (!position) return null;
  const match = position.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function mountWidget(container, grade, variables) {
  ensureWidgetScriptLoaded();

  const widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id', AGENT_IDS[grade] || AGENT_IDS[5]);
  widget.setAttribute('dynamic-variables', JSON.stringify(variables));
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
