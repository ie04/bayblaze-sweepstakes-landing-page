// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCOfLq1nubExLD1bnRquSHMGBLlZno7Hqc",
  authDomain: "bayblaze-sweepstakes.firebaseapp.com",
  projectId: "bayblaze-sweepstakes",
  storageBucket: "bayblaze-sweepstakes.firebasestorage.app",
  messagingSenderId: "228679780946",
  appId: "1:228679780946:web:9fee36d02cbd60f5856d8b",
  measurementId: "G-9GFLC3X4MR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
