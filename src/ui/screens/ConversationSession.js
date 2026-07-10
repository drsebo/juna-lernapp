import { loadContent } from '../../data/contentStore.js';
import { navigate } from '../../router.js';
import { takeSessionConfig, setSessionResults } from '../sessionContext.js';
import { getNode, isEndNode } from '../../engine/conversationEngine.js';

export async function renderConversationSession(root) {
  const config = takeSessionConfig();
  if (!config || config.type !== 'conversation') {
    navigate('/conversations');
    return;
  }

  root.innerHTML = `<div class="placeholder-note">Loading…</div>`;
  const content = await loadContent();
  const scenario = content.conversationScenarios.find((s) => s.id === config.scenarioId);
  if (!scenario) {
    navigate('/conversations');
    return;
  }

  const session = {
    log: [], // { role: 'npc'|'user', text, feedback?, quality? }
    currentNodeId: scenario.startNode,
    quality: { good: 0, ok: 0, wrong: 0 },
    ended: false
  };

  enterNode(scenario.startNode);
  draw();

  function enterNode(nodeId) {
    session.currentNodeId = nodeId;
    const node = getNode(scenario, nodeId);
    session.log.push({ role: 'npc', text: node.npcLine });
  }

  function draw() {
    const node = getNode(scenario, session.currentNodeId);
    const finished = isEndNode(scenario, session.currentNodeId);

    root.innerHTML = `
      <div class="screen-header">
        <button class="back-btn" id="back-btn">‹</button>
        <h1 class="greeting" style="margin:0;font-size:1.2rem;">${scenario.title}</h1>
      </div>
      <div class="chat-log" id="chat-log">
        ${session.log.map(renderLogEntry).join('')}
      </div>
      ${finished
        ? `<button class="primary-btn" id="finish-btn">Finish conversation</button>`
        : `<div class="chat-choices">${node.choices.map((c, i) => `<button class="mc-option" data-idx="${i}">${c.text}</button>`).join('')}</div>`}
    `;

    root.querySelector('#back-btn').addEventListener('click', () => endEarly());
    const chatLog = root.querySelector('#chat-log');
    chatLog.scrollTop = chatLog.scrollHeight;

    if (finished) {
      root.querySelector('#finish-btn').addEventListener('click', finishSession);
    } else {
      root.querySelectorAll('.chat-choices .mc-option').forEach((btn) => {
        btn.addEventListener('click', () => chooseOption(node, Number(btn.dataset.idx)));
      });
    }
  }

  function chooseOption(node, idx) {
    const choice = node.choices[idx];
    session.log.push({ role: 'user', text: choice.text, feedback: choice.feedback, quality: choice.quality });
    session.quality[choice.quality] = (session.quality[choice.quality] || 0) + 1;
    enterNode(choice.next);
    draw();
  }

  function renderLogEntry(entry) {
    if (entry.role === 'npc') {
      return `<div class="chat-bubble npc">${entry.text}</div>`;
    }
    return `
      <div class="chat-bubble user">${entry.text}</div>
      ${entry.feedback ? `<div class="chat-feedback ${entry.quality}">${entry.feedback}</div>` : ''}
    `;
  }

  function endEarly() {
    finishSession();
  }

  function finishSession() {
    if (session.ended) return;
    session.ended = true;
    const { good, ok, wrong } = session.quality;
    setSessionResults({
      type: 'conversation',
      correctCount: good + ok,
      wrongCount: wrong,
      total: good + ok + wrong,
      extensions: []
    });
    navigate('/session-results');
  }
}
