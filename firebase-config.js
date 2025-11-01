
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC_TY1CvpYlBq146IjDkkPvjpYc-s2B6eY",
  authDomain: "eali-81b8b.firebaseapp.com",
  projectId: "eali-81b8b",
  storageBucket: "eali-81b8b.firebasestorage.app",
  messagingSenderId: "705842164237",
  appId: "1:705842164237:web:aefdec82ef182d46309b44",
  measurementId: "G-7T2TXKLVRM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { db, analytics, app };
