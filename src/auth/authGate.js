import { auth } from '../firebase/init.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// Resolves once with whatever the current auth state is (a User or null) —
// used at app boot to decide whether to show the login screen or go straight
// to the app. Firebase Auth persists the session in IndexedDB by itself, so
// this resolves synchronously-ish (no re-login needed) on repeat visits.
export function waitForInitialUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export function logOut() {
  return signOut(auth);
}

export function renderLogin(root, onSuccess) {
  root.innerHTML = `
    <div class="login-wrap">
      <h1 class="greeting">Juna's English</h1>
      <p class="subgreeting">Log in to continue</p>
      <form id="login-form">
        <input class="exercise-input" type="email" id="login-email" placeholder="Email" autocomplete="username" required />
        <input class="exercise-input" type="password" id="login-password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit" class="primary-btn" id="login-submit">Log in</button>
        <div class="login-error" id="login-error"></div>
      </form>
    </div>
  `;

  const form = root.querySelector('#login-form');
  const errorEl = root.querySelector('#login-error');
  const submitBtn = root.querySelector('#login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    const email = root.querySelector('#login-email').value.trim();
    const password = root.querySelector('#login-password').value;

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      onSuccess(credential.user);
    } catch (err) {
      errorEl.textContent = 'Login failed — check your email and password.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log in';
    }
  });
}
