// Server-side account management. These run with admin rights, so the browser
// never needs to see a password or be trusted about who is an admin.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { APP_KEY, emailFor, tempPassword, verifySecret } = require('./shared');

initializeApp();
const auth = getAuth();
const db = getFirestore();
const usersDoc = db.doc(`bcot_overtime_secure/${APP_KEY}/app_auth/USERS`);
const overrideDoc = db.doc(`bcot_overtime_secure/${APP_KEY}/private/override`);
const ROLES = ['user', 'charge', 'admin'];

function requireSignedIn(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please log in.');
  return req.auth;
}
function requireAdmin(req) {
  if (requireSignedIn(req).token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Administrator role required.');
  }
}
function cleanBadge(value) {
  const badge = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(badge)) {
    throw new HttpsError('invalid-argument', 'Badge number can only contain letters, numbers, dots, dashes and underscores.');
  }
  return badge;
}
async function changeUsers(change) {
  return db.runTransaction(async tx => {
    const snap = await tx.get(usersDoc);
    const users = snap.exists ? (snap.data().users || []) : [];
    const result = change(users);
    tx.set(usersDoc, { users }, { merge: true });
    return result;
  });
}

// Creates one or more logins. Each person gets a one-time temporary password,
// returned once to the admin and replaced by the user at first login.
exports.adminCreateUsers = onCall(async req => {
  requireAdmin(req);
  const incoming = Array.isArray(req.data?.users) ? req.data.users : [];
  if (!incoming.length || incoming.length > 500) {
    throw new HttpsError('invalid-argument', 'Provide between 1 and 500 users.');
  }
  const existing = ((await usersDoc.get()).data()?.users) || [];
  const taken = new Set(existing.map(u => String(u.badge || '').toLowerCase()));
  const created = [];
  const skipped = [];
  for (const entry of incoming) {
    const badge = cleanBadge(entry.badge);
    const name = String(entry.name || '').trim();
    const role = ROLES.includes(entry.app_role) ? entry.app_role : 'user';
    if (!name || taken.has(badge.toLowerCase())) { skipped.push(badge); continue; }
    const password = tempPassword();
    const record = await auth.createUser({ email: emailFor(badge), password, displayName: name });
    await auth.setCustomUserClaims(record.uid, { role });
    taken.add(badge.toLowerCase());
    created.push({
      user: {
        id: record.uid, badge, name, nameTitle: String(entry.nameTitle || ''),
        position: String(entry.position || ''), app_role: role, firstLogin: true
      },
      password
    });
  }
  await changeUsers(users => { created.forEach(c => users.push(c.user)); });
  return {
    created: created.map(c => ({ id: c.user.id, badge: c.user.badge, name: c.user.name, password: c.password })),
    skipped
  };
});

exports.adminSetRole = onCall(async req => {
  requireAdmin(req);
  const { id, role } = req.data || {};
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Unknown role.');
  await auth.setCustomUserClaims(String(id), { role });
  await auth.revokeRefreshTokens(String(id));
  await changeUsers(users => {
    const u = users.find(x => x.id === id);
    if (!u) throw new HttpsError('not-found', 'User not found.');
    u.app_role = role;
  });
  return { ok: true };
});

exports.adminSetBadge = onCall(async req => {
  requireAdmin(req);
  const id = String(req.data?.id || '');
  const badge = cleanBadge(req.data?.badge);
  const users = (await usersDoc.get()).data()?.users || [];
  if (users.some(u => u.id !== id && String(u.badge || '').toLowerCase() === badge.toLowerCase())) {
    throw new HttpsError('already-exists', 'That badge number is already assigned to another user.');
  }
  await auth.updateUser(id, { email: emailFor(badge) });
  await changeUsers(list => {
    const u = list.find(x => x.id === id);
    if (!u) throw new HttpsError('not-found', 'User not found.');
    u.badge = badge;
  });
  return { ok: true };
});

exports.adminResetPassword = onCall(async req => {
  requireAdmin(req);
  const id = String(req.data?.id || '');
  const password = tempPassword();
  await auth.updateUser(id, { password });
  await auth.revokeRefreshTokens(id);
  await changeUsers(users => {
    const u = users.find(x => x.id === id);
    if (!u) throw new HttpsError('not-found', 'User not found.');
    u.firstLogin = true;
  });
  return { password };
});

exports.adminRemoveUser = onCall(async req => {
  requireAdmin(req);
  const id = String(req.data?.id || '');
  if (id === req.auth.uid) throw new HttpsError('failed-precondition', 'You cannot remove your own account.');
  await auth.deleteUser(id).catch(e => { if (e.code !== 'auth/user-not-found') throw e; });
  await changeUsers(users => {
    const i = users.findIndex(x => x.id === id);
    if (i >= 0) users.splice(i, 1);
  });
  return { ok: true };
});

// Called by a user right after they replace their temporary password.
exports.completeFirstLogin = onCall(async req => {
  if (req.data?.warm) return { warm: true };
  const { uid, token } = requireSignedIn(req);
  if (typeof token.role !== 'string') throw new HttpsError('permission-denied', 'Not allowed.');
  await changeUsers(users => {
    const u = users.find(x => x.id === uid);
    if (u) u.firstLogin = false;
  });
  return { ok: true };
});

// The "administrator password" charge persons use for OT and settings overrides.
exports.checkOverride = onCall(async req => {
  if (req.data?.warm) return { warm: true };
  const { token } = requireSignedIn(req);
  if (token.role !== 'charge' && token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }
  const stored = (await overrideDoc.get()).data();
  if (!stored) throw new HttpsError('failed-precondition', 'Override password has not been set.');
  return { ok: verifySecret(String(req.data?.password || ''), stored) };
});
