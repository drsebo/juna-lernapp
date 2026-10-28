const routes = new Map();
let rootEl = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function navigate(path) {
  window.location.hash = path;
}

// A screen with something still running (e.g. a voice conversation) can
// register a handler that runs once, right before the next screen is drawn —
// so its side effects (like credited XP) are visible on that next screen.
const leaveHandlers = new Set();

export function onLeaveScreen(handler) {
  leaveHandlers.add(handler);
}

function runLeaveHandlers() {
  const handlers = [...leaveHandlers];
  leaveHandlers.clear();
  handlers.forEach((handler) => {
    try {
      handler();
    } catch (err) {
      console.error('Leave handler failed', err);
    }
  });
}

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

// Screens are async (most start with `await loadContent()`), but nothing
// awaited that promise here before — an error (e.g. Firestore content not
// synced yet, or offline with nothing cached) meant the initial "Loading…"
// placeholder just stayed forever with a silent unhandled rejection. Catch
// it and show something actionable instead.
function render() {
  const path = currentPath();
  const renderFn = routes.get(path) || routes.get('/');
  runLeaveHandlers();
  rootEl.innerHTML = '';
  Promise.resolve(renderFn(rootEl)).catch((err) => {
    console.error('Failed to render screen', err);
    rootEl.innerHTML = `
      <div class="placeholder-note">
        Something went wrong loading this screen.<br>
        <span style="font-size:0.8rem;opacity:0.8;">${String(err && err.message || err)}</span>
      </div>
    `;
  });
}

export function startRouter(root) {
  rootEl = root;
  window.addEventListener('hashchange', render);
  render();
}
