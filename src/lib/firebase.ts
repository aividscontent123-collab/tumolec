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

// experimentalForceLongPolling: streaming WebChannel bywa buforowany w
// nieskończoność przez sieci desktopowe/proxy/antywirusy -- auto-detect (domyślne
// od SDK v9.22.0, więc nasze wcześniejsze `experimentalAutoDetectLongPolling: true`
// nic nie zmieniało ponad default) nadal czeka na ten strumień zanim się podda,
// co obserwowaliśmy jako operacje (np. tworzenie pokoju) wiszące kilka minut.
// Wymuszenie long-pollingu pomija tę negocjację całkowicie -- każdy request
// zamyka się od razu po dostarczeniu danych, kosztem nieco większego narzutu
// per-request. initializeFirestore rzuca przy drugim wywołaniu na tym samym app
// (HMR w devie), więc inicjalizujemy tylko dla świeżo tworzonego app.
export const db = existingApp
  ? getFirestore(app)
  : initializeFirestore(app, { experimentalForceLongPolling: true });