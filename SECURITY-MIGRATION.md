# Moving to secure login

Everything here works on the **free Firebase plan**. No billing account, no upgrade and no
reseller sign-up is needed.

Follow in order. Parts 3 to 5 should happen in one sitting at a quiet time, because
logins stop working on the old site as soon as passwords are removed.

## What staff will notice

- **Everyone logs in once** after the switch, because the old saved logins stop counting.
- **Staff who already chose their own password (6+ characters) keep it.** Nothing changes for them.
- **Staff still on the default password get a one-time temporary password** (from the CSV in Part 3)
  and choose their own at first login, exactly as they do today.
- **Speed:** the login form appears immediately, signing in is one direct request to Firebase, and a
  returning user on the same device goes straight in without waiting for the network. There are no
  server functions, so nothing has a slow start.

## What changes for administrators

- **Reset Password** gives the person a fresh login with a temporary password and retires the old
  one. To the user it looks the same as before. An administrator cannot reset their own password
  this way; another administrator has to do it.
- **Import From Staff** can create roughly 100 logins per hour from one network. If it stops early
  it says so; run it again later for the rest.
- **The override password** must now be at least 8 characters. It is set in Part 3, and changed
  later by running the same command again.

## Part 1: Firebase console (https://console.firebase.google.com, project `bcotrota`)

1. **Authentication > Sign-in method:** enable **Email/Password** (leave "Email link" off).
2. Leave sign-up enabled. The app uses it when an administrator adds a user. An account somebody
   creates for themselves has no role, so the database rules give it nothing.
3. **Project settings (gear icon) > Service accounts > Generate new private key.** A `.json` file
   downloads. It is a master key to the project: keep it private, and delete it in Part 7.

## Part 2: Check what will happen

Open **Cloud Shell** from https://shell.cloud.google.com (free, nothing is installed on your PC).
Upload the key file with the **More (three dots) > Upload** menu, then:

```bash
git clone -b feature/secure-login https://github.com/Shehriha2/NGPH.git
cd NGPH/migration && npm install
export GOOGLE_APPLICATION_CREDENTIALS=$(ls ~/bcotrota-*.json | head -1)
node migrate.js dry-run
```

Check the totals look right: about 388 users, and the administrators you expect. Nothing changes
yet, and the old site keeps working.

If Cloud Shell is closed and reopened, run the `cd` and `export` lines again.

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
https://pharmacywr.com/js/fb-auth.js loads. Then log in as an administrator to confirm it works.

## Part 5: Remove the passwords and lock the database

```bash
node migrate.js strip
```

Then in the Firebase console open **Firestore Database > Rules**, replace everything there with
the contents of `firestore.rules` from this repository, and click **Publish**.

## Part 6: Check it worked

- Log in as an administrator, a charge person and a regular user, and open their usual pages.
- As an administrator, add a test user, log in as them in a private window, then remove them.
- In a private window, open this link. It must show `PERMISSION_DENIED`, not a user list:
  `https://firestore.googleapis.com/v1/projects/bcotrota/databases/(default)/documents/bcot_overtime_secure/KAMC_WR_BCOT_ROTA_2026_PHARM_TANOMAH/app_auth/USERS`
- Click **Publish Version** in Settings so every browser picks up the new files.

## Part 7: Clean up

Hand out temporary passwords privately. Then delete the migration files and the key:

```bash
rm -rf ~/ngph-migration ~/bcotrota-*.json
```

Also delete the key file from your PC's Downloads folder, and in the Firebase console under
**Project settings > Service accounts > Manage service account permissions > Keys**, delete the
key you generated.

## If something goes wrong

Restore the old login in this order:

1. In the Firebase console, go to **Firestore Database > Rules** and publish the previous version
   from the history.
2. Run `node migrate.js restore`. This needs `~/ngph-migration` and the key to still exist.
3. Revert the merge on `main`.

Restoring brings the password exposure back, so only use it to get staff working again
while the problem is fixed.
