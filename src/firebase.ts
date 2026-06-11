import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Analytics conditionally
export const analytics =
  typeof window !== "undefined"
    ? isSupported().then((yes) => (yes ? getAnalytics(app) : null))
    : null;

// Initialize Firestore
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
}, firebaseConfig.firestoreDatabaseId);

// Check if we need to use a specific database ID (usually '(default)' but good to be explicit if provided)
// Note: firebaseConfig.firestoreDatabaseId is from our config file
if (
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== "(default)"
) {
  console.warn(
    `Note: Using non-default database ID: ${firebaseConfig.firestoreDatabaseId}`,
  );
}

// Test connection and handle offline errors
if (typeof window !== "undefined") {
  import("firebase/firestore").then(({ doc, getDocFromServer }) => {
    // Try to get a non-existent doc to test connectivity
    getDocFromServer(doc(db, "_connection_test_", "ping"))
      .then(() => console.log("Firestore connection check completed."))
      .catch((error) => {
        if (
          error.code === "unavailable" ||
          (error.message && error.message.includes("offline"))
        ) {
          console.warn("Firestore is currently unavailable or offline.");
        } else if (error.code === "permission-denied") {
          console.log(
            "Firestore connection test: Reachable but non-admin (expected if not logged in).",
          );
        } else if (error.code === 'resource-exhausted' || (error.message && error.message.toLowerCase().includes('quota'))) {
          console.warn("Firestore connection check bypassed: Quota limit exceeded.");
        } else {
          console.error("Firestore connection test failed:", error);
        }
      });
  });
}

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
