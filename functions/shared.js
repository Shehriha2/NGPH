const crypto = require('crypto');

const APP_KEY = 'KAMC_WR_BCOT_ROTA_2026_PHARM_TANOMAH';

// Staff log in with a badge number; Firebase Authentication needs an email
// address, so each badge maps to one. No mail is ever sent to these addresses.
function emailFor(badge) {
  return `${String(badge).trim().toLowerCase()}@users.pharmacywr.com`;
}

function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function verifySecret(password, { salt, hash }) {
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

module.exports = { APP_KEY, emailFor, tempPassword, verifySecret };
