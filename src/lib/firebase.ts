import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }

  if (!isFirebaseConfigured()) {
    throw new Error(
      "Missing Firebase web config. Rebuild with .env.local values set.",
    );
  }

  app = initializeApp(firebaseConfig);
  return app;
}

export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}
