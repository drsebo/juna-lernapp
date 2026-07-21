import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Public client identifiers, not secrets — Firebase access control is
// enforced by Firestore/Auth security rules, not by hiding these values.
const firebaseConfig = {
  apiKey: 'AIzaSyABdEDkmaCOSXbq7mTc2G-6svGlNT-zjrk',
  authDomain: 'juna-lernapp.firebaseapp.com',
  projectId: 'juna-lernapp',
  storageBucket: 'juna-lernapp.firebasestorage.app',
  messagingSenderId: '7818760796',
  appId: '1:7818760796:web:a19208b2e1a6b4bddb8c99'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Persistent (IndexedDB-backed) local cache — matches this app's offline-first
// requirement: reads/writes keep working without a connection, and queued
// writes sync automatically once the device is back online.
export const firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache()
});
