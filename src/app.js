import { registerRoute, startRouter } from './router.js';
import { renderHome } from './ui/screens/Home.js';
import { renderVocabularySetup } from './ui/screens/VocabularySetup.js';
import { renderVocabularySession } from './ui/screens/VocabularySession.js';
import { renderGrammarSetup } from './ui/screens/GrammarSetup.js';
import { renderGrammarSession } from './ui/screens/GrammarSession.js';
import { renderConversationsSetup } from './ui/screens/ConversationsSetup.js';
import { renderConversationSession } from './ui/screens/ConversationSession.js';
import { renderAiConversation } from './ui/screens/AiConversation.js';
import { renderSessionResults } from './ui/screens/SessionResults.js';
import { renderWeakPoints } from './ui/screens/WeakPoints.js';
import { renderExamPrep } from './ui/screens/ExamPrep.js';
import { waitForInitialUser, renderLogin } from './auth/authGate.js';
import { db } from './storage/db.js';

registerRoute('/', renderHome);
registerRoute('/grammar', renderGrammarSetup);
registerRoute('/grammar/session', renderGrammarSession);
registerRoute('/vocabulary', renderVocabularySetup);
registerRoute('/vocabulary/session', renderVocabularySession);
registerRoute('/session-results', renderSessionResults);
registerRoute('/conversations', renderConversationsSetup);
registerRoute('/conversations/session', renderConversationSession);
registerRoute('/conversations/ai', renderAiConversation);
registerRoute('/exam-prep', renderExamPrep);
registerRoute('/weak-points', renderWeakPoints);

const appRoot = document.getElementById('app');

async function boot(user) {
  await db.initForUser(user.uid);
  startRouter(appRoot);
}

appRoot.innerHTML = `<div class="placeholder-note">Loading…</div>`;

waitForInitialUser().then((user) => {
  if (user) {
    return boot(user);
  }
  renderLogin(appRoot, boot);
}).catch((err) => {
  console.error('Failed to start the app', err);
  appRoot.innerHTML = `
    <div class="placeholder-note">
      Couldn't connect. Check your internet connection and reload.<br>
      <span style="font-size:0.8rem;opacity:0.8;">${String(err && err.message || err)}</span>
    </div>
  `;
});
