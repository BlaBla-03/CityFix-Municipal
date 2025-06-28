import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "city-fix-62029.firebaseapp.com",
  databaseURL: "https://city-fix-62029-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "city-fix-62029",
  storageBucket: "city-fix-62029.firebasestorage.app",
  messagingSenderId: "206334849622",
  appId: "1:206334849622:web:89e3b858e2eac4350c01f7",
  measurementId: "G-RBTDZV8LL0"
};

// Initialize Firebase only if it hasn't been initialized already
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
