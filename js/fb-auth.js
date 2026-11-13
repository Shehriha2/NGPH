// Firebase Authentication for every page. Pages await ready(app) before calling
// getFirestore(app), so database requests carry the login from the first one.
import { getAuth, signInWithEmailAndPassword, signOut, updatePassword }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const FUNCTIONS_URL = 'https://us-central1-bcotrota.cloudfunctions.net';

export async function ready(app) {
  const auth = getAuth(app);
  // Reads the saved login from this device's storage: no network round trip.
  await auth.authStateReady();
  const post = async (name, data) => {
    const token = await auth.currentUser?.getIdToken();
    return fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      keepalive: true,   // finish even if the page moves on (e.g. redirect after login)
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ data: data || {} })
    });
  };
  window.FBAuth = {
    auth,
    get user() { return auth.currentUser; },
    signIn(badge, password) {
      return signInWithEmailAndPassword(auth, `${badge.trim().toLowerCase()}@users.pharmacywr.com`, password);
    },
    signOut() { return signOut(auth); },
    setPassword(password) { return updatePassword(auth.currentUser, password); },
    async call(name, data) {
      const res = await post(name, data);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) throw new Error(body.error?.message || `Request failed (${res.status})`);
      return body.result;
    },
    // A server function that hasn't run for a while takes a few seconds to
    // start. Calling warm() as soon as we know one is about to be needed
    // (e.g. a password prompt just opened) starts it while the user types.
    warm(name) { post(name, { warm: true }).catch(() => {}); }
  };
}
