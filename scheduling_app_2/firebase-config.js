
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcmGU-ExOqb4_2TudtXlHRPXKbURVQzF4",
  authDomain: "calendar-e4b52.firebaseapp.com",
  projectId: "calendar-e4b52",
  storageBucket: "calendar-e4b52.firebasestorage.app",
  messagingSenderId: "232869911739",
  appId: "1:232869911739:web:cc5fd1304c919c7b4c9d9e"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
