// ── App Version Gate ──────────────────────────────────────────────────────
// Fetches version.json with no-cache on every page load.
// If the server version differs from the last seen version, forces a hard
// reload so all cached JS/HTML files are replaced with the latest copies.
//
// Version format: DDMMYYnn  (e.g. 29062601 = 29 Jun 2026, build 01)
// To deploy a new version: edit version.json and change "v" to the new code.
// ─────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var KEY = 'BCOT_APP_VERSION_V1';

  // Determine the base path so this works regardless of which sub-folder a
  // page sits in.  All pages currently live in the same folder as version.json
  // so a bare relative path is fine.
  var VERSION_URL = 'version.json';

  fetch(VERSION_URL + '?_=' + Date.now(), { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) return;
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      var latest = String(data.v || '').trim();
      if (!latest) return;

      var stored = localStorage.getItem(KEY) || '';

      // Always write the latest version so the next load has it
      localStorage.setItem(KEY, latest);

      if (stored && stored !== latest) {
        // Hard-reload: tells the browser to re-fetch all resources, bypassing
        // the cache (equivalent to Ctrl+Shift+R / Cmd+Shift+R).
        window.location.reload(true);
      }
    })
    .catch(function () {
      // Network unavailable or file:// restriction — skip silently.
    });
})();
