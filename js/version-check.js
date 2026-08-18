// ── App Version Gate ──────────────────────────────────────────────────────
// Reads the current version from Firestore (app_config/version document).
// If the stored version differs from what the server has, forces a hard
// reload so all cached JS/HTML files are replaced with the latest copies.
//
// Version format: DDMMYYnn  (e.g. 29062601 = 29 Jun 2026, build 01)
// To publish a new version: use the "🔄 Publish Version" button in Settings.
// ─────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var STORE_KEY = 'BCOT_APP_VERSION_V1';

  // ── Version dot (small circle above the logo) ────────────────────────────
  // Fixed, ordered palette — Publish Version always advances to the NEXT
  // color (see version-admin.js), so it's guaranteed to change every publish
  // rather than risk landing on the same color twice in a row (a hash could).
  var VERSION_DOT_COLORS = ['#dc2626','#16a34a','#2563eb','#d97706','#7c3aed','#0d9488','#db2777','#111827'];
  window.BCOT_VERSION_DOT_COLORS = VERSION_DOT_COLORS;

  window.BCOT_applyVersionDot = function (colorIndex, versionStr) {
    var dot = document.getElementById('app-version-dot');
    if (!dot) return;
    var n   = VERSION_DOT_COLORS.length;
    var idx = ((parseInt(colorIndex, 10) || 0) % n + n) % n;
    dot.style.background = VERSION_DOT_COLORS[idx];
    dot.title = 'App version: ' + (versionStr || '?');
  };

  function check() {
    var appKey = (window.BCOT_APP_KEY     || '').trim();
    var fbKey  = (window.BCOT_FB_API_KEY  || '').trim();
    var projId = (window.BCOT_FB_PROJECT_ID || 'bcotrota').trim();
    if (!appKey || !fbKey) return;  // config.js not loaded yet — skip

    // Firestore REST API — no SDK needed, works on file:// and http://
    var url = 'https://firestore.googleapis.com/v1/projects/' + projId
            + '/databases/(default)/documents/bcot_overtime_secure/'
            + encodeURIComponent(appKey) + '/app_config/version'
            + '?key=' + encodeURIComponent(fbKey)
            + '&_=' + Date.now();   // prevent any intermediate caching

    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject('no-doc'); })
      .then(function (data) {
        // Firestore REST response: { fields: { v: { stringValue: "..." }, c: { integerValue: "..." } } }
        var latest = (data.fields && data.fields.v && data.fields.v.stringValue) || '';
        if (!latest) return;

        var colorIdx = data.fields && data.fields.c && data.fields.c.integerValue;
        window.BCOT_applyVersionDot(colorIdx, latest);

        var stored = localStorage.getItem(STORE_KEY) || '';
        localStorage.setItem(STORE_KEY, latest);  // always update

        if (stored && stored !== latest) {
          // reload(true) is ignored by modern browsers — use a cache-busting
          // query param instead to force a real network fetch of the page.
          var url = window.location.href.split('#')[0];
          var sep = url.indexOf('?') === -1 ? '?' : '&';
          window.location.replace(url + sep + '_v=' + Date.now());
        }
      })
      .catch(function () {
        // Network error or document doesn't exist yet — skip silently.
      });
  }

  // Wait for DOMContentLoaded so config.js has had a chance to run first.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
})();
