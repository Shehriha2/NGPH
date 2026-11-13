// Firebase Authentication for every page. Pages await ready(app) before calling
// getFirestore(app), so database requests carry the login from the first one.
// Everything here talks straight to Firebase: there are no server functions.
import { getAuth, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, signOut, updatePassword }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const USERS_DOMAIN = 'users.pharmacywr.com';
// The shared "administrator password" is the password of this account, so
// Firebase checks it and the page never holds it. The account has no role.
const OVERRIDE_EMAIL = 'override@system.pharmacywr.com';
const ALIAS_CACHE = 'BCOT_LOGIN_ALIAS_V1';
const BAD_LOGIN = ['auth/invalid-credential', 'auth/invalid-email', 'auth/wrong-password', 'auth/user-not-found'];

const isBadLogin = e => BAD_LOGIN.includes(e?.code);
// Staff log in with a badge number; Firebase needs an email address, so each
// badge maps to one. No mail is ever sent to these addresses. A badge whose
// first address is used up (password reset, badge reuse) moves on to "+2", "+3"...
const emailFor = (badge, n = 1) =>
  `${String(badge).trim().toLowerCase()}${n > 1 ? '+' + n : ''}@${USERS_DOMAIN}`;

function cachedAlias(badge) {
  try { return JSON.parse(localStorage.getItem(ALIAS_CACHE) || '{}')[badge] || null; } catch (e) { return null; }
}
function rememberAlias(badge, email) {
  try {
    const all = JSON.parse(localStorage.getItem(ALIAS_CACHE) || '{}');
    all[badge] = email;
    localStorage.setItem(ALIAS_CACHE, JSON.stringify(all));
  } catch (e) {}
}

export async function ready(app) {
  const auth = getAuth(app);
  // Reads the saved login from this device's storage: no network round trip.
  await auth.authStateReady();

  // A second, memory-only login slot. Creating a login or checking the
  // override password signs in there, leaving the real user's login untouched.
  let auxAuth = null;
  async function aux() {
    if (!auxAuth) {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
      auxAuth = initializeAuth(initializeApp(app.options, 'bcot-aux'), { persistence: inMemoryPersistence });
    }
    return auxAuth;
  }

  // The few database calls login itself needs, so they work on every page
  // whatever that page chose to put in window.FB.
  async function store() {
    const fs = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = fs.getFirestore(app);
    return {
      get: async path => { const s = await fs.getDoc(fs.doc(db, ...path)); return s.exists() ? s.data() : null; },
      merge: (path, data) => fs.setDoc(fs.doc(db, ...path), data, { merge: true }),
      set: (path, data) => fs.setDoc(fs.doc(db, ...path), data),
      remove: path => fs.deleteDoc(fs.doc(db, ...path))
    };
  }

  window.FBAuth = {
    auth,
    emailFor,
    isBadLogin,
    store,
    get user() { return auth.currentUser; },

    // findAlias(badge) looks up a non-default login address. It runs alongside
    // the normal attempt and is only waited for if that attempt fails, so a
    // normal login is still a single request.
    async signIn(badge, password, findAlias) {
      const b = String(badge).trim().toLowerCase();
      const attempt = email => signInWithEmailAndPassword(auth, email, password);
      const cached = cachedAlias(b);
      if (cached) {
        try { return await attempt(cached); } catch (e) { if (!isBadLogin(e)) throw e; }
      }
      const aliasLookup = findAlias
        ? Promise.resolve().then(() => findAlias(b)).catch(() => null)
        : Promise.resolve(null);
      try {
        return await attempt(emailFor(b));
      } catch (e) {
        if (!isBadLogin(e)) throw e;
        const alias = await aliasLookup;
        if (!alias || alias === cached || alias === emailFor(b)) throw e;
        const cred = await attempt(alias);
        rememberAlias(b, alias);
        return cred;
      }
    },
    signOut() { return signOut(auth); },
    setPassword(password) { return updatePassword(auth.currentUser, password); },

    // Creates a login for a badge and returns { uid, email }. Uses the first
    // address for that badge that is not already taken.
    async createLogin(badge, password) {
      const a = await aux();
      for (let n = 1; n <= 30; n++) {
        const email = emailFor(badge, n);
        try {
          const cred = await createUserWithEmailAndPassword(a, email, password);
          await signOut(a).catch(() => {});
          return { uid: cred.user.uid, email };
        } catch (e) {
          if (e?.code !== 'auth/email-already-in-use') throw e;
        }
      }
      throw new Error('No free login address left for this badge.');
    },

    // True if the password is the shared override password.
    async checkSecret(password) {
      const a = await aux();
      try {
        await signInWithEmailAndPassword(a, OVERRIDE_EMAIL, password);
        await signOut(a).catch(() => {});
        return true;
      } catch (e) {
        if (isBadLogin(e)) return false;
        throw e;
      }
    },
    // Gets the second login slot ready while the user is still typing.
    prepare() { aux().catch(() => {}); }
  };
}
