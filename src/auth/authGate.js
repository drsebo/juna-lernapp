import { auth } from '../firebase/init.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
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
        <button type="button" class="text-link-btn login-forgot" id="login-forgot">Forgot password?</button>
      </form>
    </div>
  `;

  const form = root.querySelector('#login-form');
  const errorEl = root.querySelector('#login-error');
  const submitBtn = root.querySelector('#login-submit');
  const forgotBtn = root.querySelector('#login-forgot');
  const emailInput = root.querySelector('#login-email');

  function showMessage(text, isError) {
    errorEl.textContent = text;
    errorEl.classList.toggle('login-info', !isError);
  }

  // Firebase sends the reset e-mail (template set in the Firebase console);
  // the link in it opens a Firebase page to choose a new password, then the
  // learner logs in here as usual.
  forgotBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) {
      showMessage('Enter your email above first, then tap “Forgot password?” again.', true);
      emailInput.focus();
      return;
    }
    forgotBtn.disabled = true;
    try {
      await sendPasswordResetEmail(auth, email);
      // Same message whether or not the address has an account — don't reveal which.
      showMessage(`If ${email} has an account, a reset link is on its way. Check the inbox (and spam folder).`, false);
    } catch (err) {
      showMessage(err && err.code === 'auth/invalid-email'
        ? 'That email address doesn’t look right.'
        : 'Couldn’t send the reset email — check your internet connection and try again.', true);
    } finally {
      forgotBtn.disabled = false;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage('', true);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    const email = emailInput.value.trim();
    const password = root.querySelector('#login-password').value;

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      onSuccess(credential.user);
    } catch (err) {
      showMessage('Login failed — check your email and password.', true);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log in';
    }
  });
}
