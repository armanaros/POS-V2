import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAYjqWRCm9hYR5faIfqQagQm8aEnbC10x4",
  authDomain: "ptownv2.firebaseapp.com",
  projectId: "ptownv2",
  storageBucket: "ptownv2.appspot.com",
  messagingSenderId: "884750923953",
  appId: "1:884750923953:web:6d9d0108495156fcdf4a90",
  measurementId: "G-M98V9QFED6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Ensure auth state persists across sessions (avoid accidental sign-outs on idle)
setPersistence(auth, browserLocalPersistence).catch(err => {
  // Not fatal — log and continue with default persistence
  // Some environments (like certain embedded webviews) may not support local persistence
  // and will fall back to the default behavior.
  // eslint-disable-next-line no-console
  console.warn('Failed to set auth persistence to local:', err?.message || err);
});

export default app;