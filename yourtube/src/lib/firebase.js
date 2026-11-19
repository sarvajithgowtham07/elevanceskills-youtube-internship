import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC4uTSYTNo3dAY3cdQdZ6Boxp-2N0DfWKY",
  authDomain: "yourtube-clone-e4a4b.firebaseapp.com",
  projectId: "yourtube-clone-e4a4b",
  storageBucket: "yourtube-clone-e4a4b.firebasestorage.app",
  messagingSenderId: "9992737563",
  appId: "1:9992737563:web:55669764f5045047def9be",
  measurementId: "G-D8JWZJD8DE"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };
