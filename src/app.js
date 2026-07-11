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
import { renderManageContent } from './ui/screens/ManageContent.js';

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
registerRoute('/manage-content', renderManageContent);

startRouter(document.getElementById('app'));
