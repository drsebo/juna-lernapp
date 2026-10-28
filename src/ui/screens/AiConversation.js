import { navigate, onLeaveScreen } from '../../router.js';
import { loadContent } from '../../data/contentStore.js';
import { db, gradeState } from '../../storage/db.js';
import { recordSessionCompletion } from '../../engine/progress.js';
import { awardXp, xpForVoice, MIN_VOICE_SECONDS } from '../../engine/motivation.js';

// ElevenLabs agent per grade. Both use the existing Juna agent for now — to
// give grade 6 its own agent (e.g. a duplicate "Juna English 6" with the
// extended prompt), put its id under 6.
const AGENT_IDS = {
  5: 'agent_5501kx8em1ckfcas3g3kmm49s72j',
  6: 'agent_5501kx8em1ckfcas3g3kmm49s72j'
};
// Official ElevenLabs browser SDK, pinned. Loaded from the CDN (no build step),
// only on this screen — the voice conversation needs internet anyway.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.27.0/+esm';
const LEARNER_NAME = 'Juna';
// Above this length the word list is cut down to the current grade's words
// plus a note that all grade 5 words are known too.
const MAX_VOCABULARY_CHARS = 6000;
// No connection after this long (e.g. microphone or network stuck): give up
// with a message instead of spinning forever.
const CONNECT_TIMEOUT_MS = 15000;

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

let sdkPromise = null;
let sdk = null;

// Started as soon as the screen opens, so that tapping a topic can start the
// session right inside the tap — iPad Safari only allows microphone and audio
// playback from a direct user gesture.
function preloadSdk() {
  if (!sdkPromise) {
    sdkPromise = import(SDK_URL).then((mod) => { sdk = mod; return mod; });
    sdkPromise.catch(() => { sdkPromise = null; });
  }
  return sdkPromise;
}

export async function renderAiConversation(root) {
  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  preloadSdk().catch((err) => console.warn('ElevenLabs SDK not loaded yet', err));
  const content = await loadContent();
  const state = db.load();
  const targetUnit = parseUnitFromPosition(gradeState(state).bookPosition.vocabulary)
    || Math.max(...content.vocab.map((w) => w.unit));
  const allThemes = content.grade === 5 ? GRADE5_THEMES : themesFromScenarios(content);
  // Only the topics of the unit picked on the Conversations screen (plus
  // "Surprise me"); without a picked unit, all of them.
  const pickedUnit = gradeState(state).conversationUnit || null;
  const themes = pickedUnit
    ? allThemes.filter((t) => t.key === 'general' || themeUnit(t) === pickedUnit)
    : allThemes;
  const vocabulary = await buildKnownVocabulary(content, targetUnit);

  let conversation = null; // the running ElevenLabs session
  let ended = false;
  let currentAttempt = null; // guards the connect timeout against old attempts
  let connectedAt = null; // start of the talking time that earns XP
  // leaving the screen (back button, other route) ends a running conversation
  // and credits its talking time before the next screen is drawn
  onLeaveScreen(endConversation);

  drawPicker();

  function drawPicker() {
    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">Talk with an AI partner</h1>
      </div>
      <p class="subgreeting">Tap a topic – the conversation starts right away. Allow the microphone, then just speak. Needs internet; nothing is stored in this app.</p>
      ${pickedUnit ? `<p class="setup-label voice-unit-head">Unit ${pickedUnit} <button class="text-link-btn inline-link" id="change-unit">Unit wechseln</button></p>` : ''}
      <p class="subgreeting">The AI is asked to stick to the ${vocabulary.count} words/phrases you've covered so far (Vocabulary: ${gradeState(state).bookPosition.vocabulary || 'not set'}${vocabulary.grade5Note ? ' + all of Klasse 5' : ''}). It's a best-effort instruction, not a hard filter.</p>

      <div class="voice-topic-list" id="theme-picker">
        ${themes.map((t) => `
          <button class="voice-topic" data-theme="${t.key}">
            <span class="voice-topic-mic">🎙️</span>
            <span class="voice-topic-text"><strong>${t.label}</strong>${t.unitLabel || t.hint ? `<small>${t.unitLabel || t.hint}</small>` : ''}</span>
          </button>
        `).join('')}
      </div>
    `;
    root.querySelector('#back-btn').addEventListener('click', () => navigate('/conversations'));
    root.querySelector('#change-unit')?.addEventListener('click', () => navigate('/conversations'));
    root.querySelectorAll('#theme-picker .voice-topic').forEach((btn) => {
      btn.addEventListener('click', () => start(themes.find((t) => t.key === btn.dataset.theme)));
    });
  }

  // ---------- running conversation ----------

  function start(theme) {
    ended = false;
    const view = drawSession(theme);
    if (!sdk) {
      // SDK still loading (slow connection): wait, then start — on iPad the
      // learner may have to tap "Start" once more, because the tap is used up.
      view.setStatus('connecting', 'Lade das Sprachmodul …');
      preloadSdk()
        .then(() => view.showRetry('Bereit – tippe auf „Gespräch starten“.'))
        .catch(() => view.showError('Das Sprachmodul konnte nicht geladen werden. Bist du online?'));
      return;
    }
    view.setStatus('connecting', 'Verbinde … bitte das Mikrofon erlauben.');
    let connected = false;
    const attempt = {};
    currentAttempt = attempt;
    setTimeout(() => {
      if (!connected && !ended && currentAttempt === attempt) {
        view.showError('Keine Verbindung zustande gekommen. Prüfe Internet und Mikrofon-Erlaubnis und versuch es nochmal.');
      }
    }, CONNECT_TIMEOUT_MS);
    sdk.Conversation.startSession({
      agentId: AGENT_IDS[content.grade] || AGENT_IDS[5],
      connectionType: 'websocket',
      dynamicVariables: dynamicVariables(theme),
      onConnect: () => {
        connected = true;
        connectedAt = Date.now();
        view.setStatus('listening', 'Verbunden – sprich einfach los!');
      },
      onDisconnect: () => {
        conversation = null;
        const xp = creditTalkingTime();
        if (!ended) view.showEnded(xp);
      },
      onError: (message) => {
        console.error('ElevenLabs error', message);
        view.showError(`Fehler im Gespräch: ${message}`);
      },
      onModeChange: ({ mode }) => {
        if (conversation) view.setStatus(mode, mode === 'speaking' ? 'Dein Partner spricht …' : 'Du bist dran – sprich einfach los 🎙️');
      },
      onMessage: ({ message, role, source }) => view.addLine(role || (source === 'ai' ? 'agent' : 'user'), message)
    }).then((conv) => {
      conversation = conv;
      if (ended) conv.endSession();
    }).catch((err) => {
      console.error('Could not start the conversation', err);
      const denied = err && (err.name === 'NotAllowedError' || /permission|denied|not allowed/i.test(String(err.message || err)));
      view.showError(denied
        ? 'Das Mikrofon ist nicht erlaubt. Auf dem iPad: Einstellungen → Apps → Safari → Mikrofon → „Erlauben“ (bzw. beim Nachfragen „Erlauben“ tippen) und dann neu starten.'
        : `Das Gespräch konnte nicht starten (${err && err.message ? err.message : err}). Bist du online?`);
    });

    function drawSession() {
      root.innerHTML = `
        <div class="screen-header">
          <button class="back-btn" id="back-btn">‹</button>
          <h1 class="greeting" style="margin:0;font-size:1.2rem;">${theme.label}</h1>
        </div>
        ${theme.situation ? `<p class="setup-hint">${theme.situation}</p>` : ''}
        <div class="voice-stage">
          <div class="voice-orb" id="voice-orb" data-state="connecting"><span>🎙️</span></div>
          <div class="voice-status" id="voice-status"></div>
        </div>
        <div class="voice-transcript" id="voice-transcript"></div>
        ${theme.phrases ? `<p class="setup-hint voice-phrases"><strong>Hilfe:</strong> ${theme.phrases.slice(0, 4).join(' · ')}</p>` : ''}
        <div class="voice-actions" id="voice-actions">
          <button class="primary-btn secondary" id="mute-btn">🔇 Mikro aus</button>
          <button class="primary-btn" id="end-btn">Gespräch beenden</button>
        </div>
      `;
      const orb = root.querySelector('#voice-orb');
      const status = root.querySelector('#voice-status');
      const transcript = root.querySelector('#voice-transcript');
      const actions = root.querySelector('#voice-actions');
      let muted = false;

      root.querySelector('#back-btn').addEventListener('click', () => { endConversation(); drawPicker(); });
      root.querySelector('#end-btn').addEventListener('click', () => { const xp = endConversation(); showEnded(xp); });
      root.querySelector('#mute-btn').addEventListener('click', (e) => {
        if (!conversation) return;
        muted = !muted;
        conversation.setMicMuted(muted);
        e.currentTarget.textContent = muted ? '🎙️ Mikro an' : '🔇 Mikro aus';
        orb.dataset.muted = String(muted);
      });

      function setStatus(state, text) {
        orb.dataset.state = state;
        status.textContent = text;
      }

      function addLine(role, text) {
        if (!text) return;
        transcript.insertAdjacentHTML('beforeend', `<div class="voice-line ${role === 'agent' ? 'agent' : 'user'}">${escapeHtml(text)}</div>`);
        transcript.scrollTop = transcript.scrollHeight;
      }

      function finalButtons(primaryLabel) {
        actions.innerHTML = `
          <button class="primary-btn secondary" id="topics-btn">Anderes Thema</button>
          <button class="primary-btn" id="again-btn">${primaryLabel}</button>
        `;
        actions.querySelector('#topics-btn').addEventListener('click', drawPicker);
        actions.querySelector('#again-btn').addEventListener('click', () => start(theme));
      }

      function showEnded(xp) {
        setStatus('ended', 'Gespräch beendet – gut gemacht! 🎉');
        if (xp && xp.earned) {
          status.insertAdjacentHTML('afterend', `<div class="xp-earned voice-xp">⚡ +${xp.earned} XP · ${talkTime(xp.seconds)} Englisch gesprochen</div>`);
        } else if (xp) {
          status.insertAdjacentHTML('afterend', `<div class="setup-hint voice-xp">XP gibt es ab ${MIN_VOICE_SECONDS} Sekunden Gespräch.</div>`);
        }
        finalButtons('Nochmal sprechen');
      }

      function showError(text) {
        endConversation();
        setStatus('error', text);
        finalButtons('Nochmal versuchen');
      }

      function showRetry(text) {
        setStatus('ended', text);
        finalButtons('Gespräch starten');
      }

      return { setStatus, addLine, showEnded, showError, showRetry };
    }
  }

  // Returns what creditTalkingTime() credited (null if nothing was running).
  function endConversation() {
    ended = true;
    const xp = creditTalkingTime();
    if (conversation) {
      const conv = conversation;
      conversation = null;
      conv.endSession().catch((err) => console.warn('endSession failed', err));
    }
    return xp;
  }

  // Credits the connected time once per conversation: XP (engine/motivation
  // xpForVoice), the daily goal / streak like any other session, and the
  // total speaking time. Runs on every way out (end button, disconnect,
  // leaving the screen) so no talking time is lost.
  function creditTalkingTime() {
    if (!connectedAt) return null;
    const seconds = Math.round((Date.now() - connectedAt) / 1000);
    connectedAt = null;
    const earned = xpForVoice(seconds);
    db.update((s) => {
      s.overallProgress.voiceSeconds = (s.overallProgress.voiceSeconds || 0) + seconds;
      if (earned > 0) awardXp(recordSessionCompletion(s, new Date().toISOString()), earned);
    });
    return { earned, seconds };
  }

  // Only the variables that exist in the agent (scenario, known_vocabulary,
  // opening_line) are sent — unknown ones can make the session fail. Grade,
  // unit and grammar focus travel inside the scenario text, which the agent's
  // prompt already uses.
  function dynamicVariables(theme) {
    const unit = theme.unit || pickedUnit || targetUnit;
    const focus = grammarFocus(content, theme.grammarCodes, unit);
    const scenario = theme.key === 'general'
      ? 'general – free talk: ask what she would like to talk about'
      : (theme.scenario || `${theme.key} (${theme.hint || `Unit ${unit}`})`);
    return {
      scenario: `${scenario.replace(/[.\s]+$/, '')}. Learner: ${LEARNER_NAME}, grade ${content.grade}, currently at Unit ${unit}. Practise especially: ${focus}.`,
      known_vocabulary: vocabulary.text,
      // Drives the agent's "Erste Nachricht" field (set to {{opening_line}} in the
      // ElevenLabs dashboard) so the very first thing said already sets the scene.
      opening_line: theme.opener
    };
  }
}

// Grade 6 themes carry their unit; grade 5 ones say it in the hint ("Unit 5").
function themeUnit(theme) {
  if (theme.unit) return theme.unit;
  const match = (theme.hint || '').match(/Unit (\d+)/);
  return match ? Number(match[1]) : null;
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

// 96 → "1 Min. 36 Sek."
function talkTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return [m && `${m} Min.`, (s || !m) && `${s} Sek.`].filter(Boolean).join(' ');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
