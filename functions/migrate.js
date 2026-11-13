// One-time move from the old password list to Firebase Authentication.
// Run in Cloud Shell (see SECURITY-MIGRATION.md). Output files stay in the
// directory given by OUT_DIR, which must be outside this repository.
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
const { APP_KEY, emailFor, tempPassword } = require('./shared');

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

async function loadUsers() {
  return (await usersDoc.get()).data()?.users || [];
}

async function dryRun() {
  const users = await loadUsers();
  const withBadge = users.filter(u => u.badge && validBadge(u.badge));
  const keep = withBadge.filter(u => !u.firstLogin && String(u.password || '').length >= 6);
  const roles = {};
  users.forEach(u => { const r = u.app_role || 'user'; roles[r] = (roles[r] || 0) + 1; });
  console.log({
    total: users.length, loginsToCreate: withBadge.length, keepOwnPassword: keep.length,
    getTemporaryPassword: withBadge.length - keep.length,
    skippedNoUsableBadge: users.length - withBadge.length, roles
  });
}

async function createAccounts() {
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const users = await loadUsers();
  if (!users.some(u => u.password)) throw new Error('USERS has no passwords: already stripped?');
  fs.writeFileSync(backupFile, JSON.stringify(users), { mode: 0o600 });
  const rows = ['badge,name,role,temporary_password'];
  let created = 0, existing = 0, skipped = 0;
  for (const u of users) {
    if (!u.badge || !validBadge(u.badge)) { skipped++; continue; }
    const role = u.app_role || 'user';
    const keep = !u.firstLogin && String(u.password || '').length >= 6;
    const password = keep ? u.password : tempPassword();
    try {
      await auth.createUser({ uid: u.id, email: emailFor(u.badge), password, displayName: u.name });
      created++;
      if (!keep) rows.push([u.badge, u.name, role, password].map(csvCell).join(','));
    } catch (e) {
      if (e.code !== 'auth/uid-already-exists') { console.error(`Failed: badge ${u.badge}: ${e.code}`); continue; }
      existing++;
    }
    await auth.setCustomUserClaims(u.id, { role });
  }
  fs.writeFileSync(csvFile, rows.join('\n'), { mode: 0o600 });
  console.log({ created, alreadyExisted: existing, skippedNoUsableBadge: skipped, passwordsFile: csvFile });
}

async function strip() {
  if (!fs.existsSync(backupFile)) throw new Error('Run "accounts" first: no backup found.');
  const users = await loadUsers();
  users.forEach(u => {
    // Anyone without a real password of their own must replace the temporary one.
    if (String(u.password || '').length < 6) u.firstLogin = true;
    delete u.password;
  });
  await usersDoc.set({ users }, { merge: true });
  const preceptors = await db.collection(`${base}/preceptors`).get();
  const batch = db.batch();
  preceptors.forEach(d => { if ('password' in d.data()) batch.update(d.ref, { password: FieldValue.delete() }); });
  await batch.commit();
  console.log({ usersStripped: users.length, preceptorsChecked: preceptors.size });
}

async function restore() {
  await usersDoc.set({ users: JSON.parse(fs.readFileSync(backupFile, 'utf8')) }, { merge: true });
  console.log('USERS restored from backup.');
}

async function setOverride() {
  const password = process.env.OVERRIDE_PASSWORD || '';
  if (password.length < 8) throw new Error('Set OVERRIDE_PASSWORD to at least 8 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  await db.doc(`${base}/private/override`).set({ salt, hash });
  console.log('Override password set.');
}

const steps = { 'dry-run': dryRun, accounts: createAccounts, override: setOverride, strip, restore };
const step = steps[process.argv[2]];
if (!step) { console.error(`Usage: node migrate.js ${Object.keys(steps).join('|')}`); process.exit(1); }
step().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
