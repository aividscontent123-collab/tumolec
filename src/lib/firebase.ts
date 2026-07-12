import { getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";

// Public by design — Firebase client config is not a secret, access is
// enforced by Firestore Security Rules (see firestore.rules), not by hiding
// this object. Values come from a Firebase project console (Faza 0 setup).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const existingApp = getApps()[0];
const app = existingApp ?? initializeApp(firebaseConfig);

// experimentalAutoDetectLongPolling: streaming WebChannel bywa buforowany przez
// sieci desktopowe/proxy/ad-blockery -- wtedy pierwszy snapshot dochodzi, ale
// kolejne pushe live już nie (przyczyna: znajomy dołącza, desktop go nie widzi).
// Auto-detect przełącza na long-polling tylko gdy streaming zawiedzie -- backward
// compatible. initializeFirestore rzuca przy drugim wywołaniu na tym samym app
// (HMR w devie), więc inicjalizujemy tylko dla świeżo tworzonego app.
export const db = existingApp
  ? getFirestore(app)
  : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });