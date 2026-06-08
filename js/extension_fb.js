  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
  import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, updateDoc }
    from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
  const cfg = {
    apiKey:"AIzaSyDA9hjUxU_DlArK6UIOdfS0PavTgNsUBbw",
    authDomain:"bcotrota.firebaseapp.com", projectId:"bcotrota",
    storageBucket:"bcotrota.firebasestorage.app",
    messagingSenderId:"659421824894",
    appId:"1:659421824894:web:f0546879df8808491ad52f"
  };
  const app = initializeApp(cfg);
  const db  = getFirestore(app);
  window.FB = { db, doc, getDoc, setDoc, collection, addDoc, getDocs, updateDoc };
