// One-time move from the old password list to Firebase Authentication.
// Run in Cloud Shell (see SECURITY-MIGRATION.md) with GOOGLE_APPLICATION_CREDENTIALS
// pointing at a service-account key. Output files go to OUT_DIR, which must be
// outside this repository.
//
//   node migrate.js dry-run     report what would happen, change nothing
//   node migrate.js accounts    back up USERS, create logins, write temp passwords
//   OVERRIDE_PASSWORD=... node migrate.js override   set the override password
//   node migrate.js strip       remove passwords from USERS and preceptors
//   node migrate.js restore     put the USERS backup back (rollback)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const APP_KEY = 'KAMC_WR_BCOT_ROTA_2026_PHARM_TANOMAH';
// Must match js/fb-auth.js.
const OVERRIDE_EMAIL = 'override@system.pharmacywr.com';
const emailFor = badge => `${String(badge).trim().toLowerCase()}@users.pharmacywr.com`;

initializeApp({ projectId: 'bcotrota' });
const auth = getAuth();
const db = getFirestore();
const base = `bcot_overtime_secure/${APP_KEY}`;
const usersDoc = db.doc(`${base}/app_auth/USERS`);
const outDir = process.env.OUT_DIR || path.join(require('os').homedir(), 'ngph-migration');
const backupFile = path.join(outDir, 'users-backup.json');
const csvFile = path.join(outDir, 'temporary-passwords.csv');

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const validBadge = b => /^[A-Za-z0-9._-]+$/.test(b);
const canLogIn = u => u.id && u.badge && validBadge(u.badge);
// Staff who already chose a password of their own keep it.
const keepsPassword = u => !u.firstLogin && String(u.password || '').length >= 6;

function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

async function loadDoc() {
  return (await usersDoc.get()).data() || {};
}

// The database rules read `roles` (login id -> role) to decide who gets in,
// and the login screen reads `pending` (who must choose a new password).
function accessMaps(users, existingPending) {
  const roles = {}, pending = {};
  users.filter(canLogIn).forEach(u => {
    roles[u.id] = u.app_role || 'user';
    const already = existingPending ? existingPending[u.id] : undefined;
    pending[u.id] = typeof already === 'boolean' ? already : !keepsPassword(u);
  });
  return { roles, pending };
}

async function dryRun() {
  const users = (await loadDoc()).users || [];
  const withLogin = users.filter(canLogIn);
  const keep = withLogin.filter(keepsPassword);
  const roles = {};
  withLogin.forEach(u => { const r = u.app_role || 'user'; roles[r] = (roles[r] || 0) + 1; });
  console.log({
    total: users.length, loginsToCreate: withLogin.length, keepOwnPassword: keep.length,
    getTemporaryPassword: withLogin.length - keep.length,
    skippedNoUsableBadge: users.length - withLogin.length, roles
  });
  if (!roles.admin) console.log('WARNING: no administrator would have a login. Do not continue.');
}

async function createAccounts() {
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const users = (await loadDoc()).users || [];
  if (!users.some(u => u.password)) throw new Error('USERS has no passwords: already stripped?');
  fs.writeFileSync(backupFile, JSON.stringify(users), { mode: 0o600 });
  const rows = ['badge,name,role,temporary_password'];
  let created = 0, existing = 0, failed = 0;
  for (const u of users.filter(canLogIn)) {
    const keep = keepsPassword(u);
    const password = keep ? u.password : tempPassword();
    try {
      await auth.createUser({ uid: u.id, email: emailFor(u.badge), password, displayName: u.name });
      created++;
      if (!keep) rows.push([u.badge, u.name, u.app_role || 'user', password].map(csvCell).join(','));
    } catch (e) {
      if (e.code === 'auth/uid-already-exists') { existing++; continue; }
      failed++;
      console.error(`Failed: badge ${u.badge}: ${e.code}`);
    }
  }
  // Keep the temporary passwords from an earlier run of this step.
  if (created || !fs.existsSync(csvFile)) fs.writeFileSync(csvFile, rows.join('\n'), { mode: 0o600 });
  await usersDoc.update(accessMaps(users));
  console.log({
    created, alreadyExisted: existing, failed,
    skippedNoUsableBadge: users.length - users.filter(canLogIn).length, passwordsFile: csvFile
  });
  if (failed) console.log('Some logins failed. Fix the cause and run this step again before continuing.');
}

async function strip() {
  if (!fs.existsSync(backupFile)) throw new Error('Run "accounts" first: no backup found.');
  const data = await loadDoc();
  const users = data.users || [];
  const { roles, pending } = accessMaps(users, data.pending);
  if (!Object.values(roles).includes('admin')) throw new Error('No administrator has a login. Nothing changed.');
  users.forEach(u => { delete u.password; delete u.firstLogin; });
  await usersDoc.update({ users, roles, pending });
  const preceptors = await db.collection(`${base}/preceptors`).get();
  const batch = db.batch();
  preceptors.forEach(d => { if ('password' in d.data()) batch.update(d.ref, { password: FieldValue.delete() }); });
  await batch.commit();
  console.log({ usersStripped: users.length, withAccess: Object.keys(roles).length, preceptorsChecked: preceptors.size });
}

async function restore() {
  await usersDoc.set({ users: JSON.parse(fs.readFileSync(backupFile, 'utf8')) }, { merge: true });
  console.log('USERS restored from backup.');
}

// The override password is the password of a login that has no role, so
// Firebase checks it and nothing about it is stored in the database.
async function setOverride() {
  const password = process.env.OVERRIDE_PASSWORD || '';
  if (password.length < 8) throw new Error('Set OVERRIDE_PASSWORD to at least 8 characters.');
  try {
    const existing = await auth.getUserByEmail(OVERRIDE_EMAIL);
    await auth.updateUser(existing.uid, { password });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ email: OVERRIDE_EMAIL, password, displayName: 'Override password' });
  }
  console.log('Override password set.');
}

const steps = { 'dry-run': dryRun, accounts: createAccounts, override: setOverride, strip, restore };
const step = steps[process.argv[2]];
if (!step) { console.error(`Usage: node migrate.js ${Object.keys(steps).join('|')}`); process.exit(1); }
step().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
