// ── Publish New Version ───────────────────────────────────────────────────
// Called by the admin "🔄 Publish Version" button.
// Prompts for a version string, writes it to Firestore via the REST API.
// All users' browsers will hard-reload on their next page load.
//
// Version format: DDMMYYnn  (29 Jun 2026, build 1 → "29062601")
// ─────────────────────────────────────────────────────────────────────────
window.bumpAppVersion = async function () {
  var appKey = (window.BCOT_APP_KEY      || '').trim();
  var fbKey  = (window.BCOT_FB_API_KEY   || '').trim();
  var projId = (window.BCOT_FB_PROJECT_ID || 'bcotrota').trim();
  if (!appKey || !fbKey) { alert('Config not loaded.'); return; }

  // Build a sensible default: today's date + 01
  var d  = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yy = String(d.getFullYear()).slice(-2);
  var suggested = dd + mm + yy + '01';

  // Use app's custom prompt if available, fall back to native
  var v;
  if (window.BCOT_AUTH && typeof window.BCOT_AUTH.prompt === 'function') {
    v = await window.BCOT_AUTH.prompt(
      'Enter a version string to publish.\nAll users will hard-refresh on their next page load.',
      { title: '🔄 Publish New Version', placeholder: suggested, defaultValue: suggested, confirmLabel: 'Publish' }
    );
  } else {
    v = window.prompt('New version string (e.g. ' + suggested + '):', suggested);
  }
  if (!v) return;
  v = v.trim();
  if (!v) return;

  // PATCH the Firestore document via REST API
  var url = 'https://firestore.googleapis.com/v1/projects/' + projId
          + '/databases/(default)/documents/bcot_overtime_secure/'
          + encodeURIComponent(appKey) + '/app_config/version'
          + '?key=' + encodeURIComponent(fbKey)
          + '&updateMask.fieldPaths=v';

  try {
    var r = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { v: { stringValue: v } } })
    });
    if (!r.ok) throw new Error('Firestore returned HTTP ' + r.status);

    // Update admin's own localStorage so they don't self-trigger a reload
    localStorage.setItem('BCOT_APP_VERSION_V1', v);

    var msg = 'Version set to <strong>' + v + '</strong>.<br><br>'
            + 'All users will hard-refresh on their next page load.';
    if (window.BCOT_AUTH && typeof window.BCOT_AUTH.alert === 'function') {
      window.BCOT_AUTH.alert(msg, '✅ Version Published');
    } else {
      alert('Version updated to ' + v + '. All users will refresh on next load.');
    }
  } catch (e) {
    alert('Failed to publish version: ' + (e.message || e));
  }
};
