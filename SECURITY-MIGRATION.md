# Moving to secure login

Follow in order. Parts 3 to 5 should happen in one sitting at a quiet time, because
logins stop working on the old site as soon as passwords are removed.

## What staff will notice

- **Everyone logs in once** after the switch, because the old saved logins stop counting.
- **Staff who already chose their own password (6+ characters) keep it.** Nothing changes for them.
- **Staff still on the default password get a one-time temporary password** (from the CSV in Part 3)
  and choose their own at first login, exactly as they do today.
- **Speed:** the login form appears immediately, signing in is one direct request to Firebase, and a
  returning user on the same device goes straight in without waiting for the network. The server
  functions are only used for admin actions, the override password and the first-login flag, and
  those are started early in the background so nobody waits on them.

## Part 1: Firebase console (https://console.firebase.google.com, project `bcotrota`)

1. **Upgrade** to the Blaze plan and set a budget alert (for example $5).
2. **Authentication > Sign-in method:** enable **Email/Password**.
3. **Authentication > Settings > User actions:** turn off **Enable create (sign-up)**.

## Part 2: Deploy the server functions

Open **Cloud Shell** from https://console.cloud.google.com (the `>_` icon, project `bcotrota`).
It already has the tools needed, so nothing is installed on your PC.

```bash
git clone -b feature/secure-login https://github.com/Shehriha2/NGPH.git
cd NGPH/functions && npm install && cd ..
gcloud config set project bcotrota
gcloud auth application-default login
firebase login --no-localhost
firebase deploy --only functions
cd functions && node migrate.js dry-run
```

Check the dry-run totals look right: 388 users, and the admins you expect. Nothing changes yet.
The old site keeps working throughout this part.

## Part 3: Create the logins

```bash
node migrate.js accounts
OVERRIDE_PASSWORD='choose-a-new-long-password' node migrate.js override
```

`accounts` saves two private files in `~/ngph-migration`, which is outside the repository:
`users-backup.json` and `temporary-passwords.csv`. Download the CSV using the Cloud Shell
**More > Download** menu, and keep it private.

Note your own temporary password from the CSV if your account is on it.

## Part 4: Publish the new site

Merge `feature/secure-login` into `main` and wait for pharmacywr.com to update. Check that
https://pharmacywr.com/js/fb-auth.js loads. Then log in as an admin to confirm it works.

## Part 5: Remove the passwords and lock the database

```bash
node migrate.js strip
cd .. && firebase deploy --only firestore:rules
```

## Part 6: Check it worked

- Log in as an admin, a charge person and a regular user, and open their usual pages.
- In a private window, open this link. It must show `PERMISSION_DENIED`, not a user list:
  `https://firestore.googleapis.com/v1/projects/bcotrota/databases/(default)/documents/bcot_overtime_secure/KAMC_WR_BCOT_ROTA_2026_PHARM_TANOMAH/app_auth/USERS`
- Click **Publish Version** in Settings so every browser picks up the new files.

## Part 7: Clean up

Hand out temporary passwords privately. Then delete the migration files:

```bash
rm -rf ~/ngph-migration
```

## If something goes wrong

Restore the old login in this order:

1. In the Firebase console, go to **Firestore > Rules** and publish the previous version from the history.
2. Run `node migrate.js restore`. This needs `~/ngph-migration` to still exist.
3. Revert the merge on `main`.

Restoring brings the password exposure back, so only use it to get staff working again
while the problem is fixed.
