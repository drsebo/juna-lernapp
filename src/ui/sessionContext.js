// Tiny in-memory handoff between screens (Setup -> Session -> Results).
// Not persisted — a page reload mid-session just returns to Home, which is fine
// for a local single-user learning app.
let pendingConfig = null;
let lastResults = null;

export function setSessionConfig(config) {
  pendingConfig = config;
}

export function takeSessionConfig() {
  const config = pendingConfig;
  pendingConfig = null;
  return config;
}

export function setSessionResults(results) {
  lastResults = results;
}

export function takeSessionResults() {
  const results = lastResults;
  lastResults = null;
  return results;
}
