const routes = new Map();
let rootEl = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function navigate(path) {
  window.location.hash = path;
}

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

function render() {
  const path = currentPath();
  const renderFn = routes.get(path) || routes.get('/');
  rootEl.innerHTML = '';
  renderFn(rootEl);
}

export function startRouter(root) {
  rootEl = root;
  window.addEventListener('hashchange', render);
  render();
}
