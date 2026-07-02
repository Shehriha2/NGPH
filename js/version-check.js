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
        // Firestore REST response: { fields: { v: { stringValue: "..." } } }
        var latest = (data.fields && data.fields.v && data.fields.v.stringValue) || '';
        if (!latest) return;

        var stored = localStorage.getItem(STORE_KEY) || '';
        localStorage.setItem(STORE_KEY, latest);  // always update

        if (stored && stored !== latest) {
          // Hard-reload — bypasses cache for the page and all its resources
          window.location.reload(true);
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
