
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAPKHwJO40j0-3C6yioQX-P3SyXS85v8lI",
  authDomain: "clone-554be.firebaseapp.com",
  projectId: "clone-554be",
  storageBucket: "clone-554be.firebasestorage.app",
  messagingSenderId: "266698664454",
  appId: "1:266698664454:web:89d1dcd8267973cfa53187",
  measurementId: "G-WJ6YBLXV3B"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };