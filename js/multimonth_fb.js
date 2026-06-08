    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
    import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
    const app = initializeApp({
      apiKey:"AIzaSyDA9hjUxU_DlArK6UIOdfS0PavTgNsUBbw",
      authDomain:"bcotrota.firebaseapp.com", projectId:"bcotrota",
      storageBucket:"bcotrota.firebasestorage.app",
      messagingSenderId:"659421824894",
      appId:"1:659421824894:web:f0546879df8808491ad52f"
    });
    const db = getFirestore(app);
    window.FB = { db, doc, getDoc };
  