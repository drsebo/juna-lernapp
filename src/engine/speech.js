// Thin wrapper around the browser's built-in SpeechSynthesis (Web Speech API) —
// no external service, works offline, matches the rest of the app's offline-first
// design. Feature-detected since not every environment supports it.

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text, lang = 'en-GB') {
  if (!canSpeak() || !text) return;
  window.speechSynthesis.cancel(); // avoid overlapping utterances on repeated taps
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9; // slightly slower, easier for a learner to follow
  window.speechSynthesis.speak(utterance);
}
