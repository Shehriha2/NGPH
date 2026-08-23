/* ═══════════════════════════════════════════════════════════════════════════
   BCOT Rota — App Authentication Guard  (js/auth.js)
   ───────────────────────────────────────────────────────────────────────────
   • Fullscreen overlay on every page — nothing visible until authenticated
   • IP/device logging — every visit is recorded, but never blocks access;
     username + password is the only access gate
   • Users stored in Firebase: bcot_overtime_secure/[KEY]/app_auth/USERS
   • IPs stored in Firebase:   bcot_overtime_secure/[KEY]/app_ips/LIST (log only)
   • Session in localStorage, 12-hour expiry, shared across all tabs
   • First login forces password change (default: 12345)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */
  const SESSION_KEY     = 'BCOT_AUTH_SESSION_V1';
  const SESSION_TTL     = 12 * 60 * 60 * 1000;   // 12 hours

  /* ── State ─────────────────────────────────────────────────────────────── */
  let _key         = '';
  let _users       = [];
  let _ips         = [];          // access log — every IP/device ever seen
  let _myIP        = null;
  let _pendingUser = null;

  /* ── Session helpers ───────────────────────────────────────────────────── */
  function getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!s) return null;
      if (Date.now() - (s.ts || 0) > SESSION_TTL) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch { return null; }
  }
  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id:             user.id,
      badge:          user.badge          || '',
      name:           user.name,
      nameTitle:      user.nameTitle || '',
      position:       user.position || user.title || '',
      ts:             Date.now(),
      areas:          user.areas || 'ALL',
      app_role:       user.app_role       || 'user',
      ext_role:       user.ext_role       || '',
      ext_phone:      user.ext_phone      || '',
      ext_areas:      user.ext_areas      || [],
      ext_manager_id: user.ext_manager_id || ''
    }));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  /**
   * Firestore's one-shot getDoc/setDoc calls have no built-in timeout — on a
   * connection that can't cleanly reach Firestore (restrictive network,
   * captive portal, flaky Wi-Fi), they can hang indefinitely with nothing
   * ever thrown, which left the login gate stuck forever with no error shown.
   * Races the call against a plain timer so a stuck connection surfaces as a
   * rejection instead of a silent hang.
   */
  function _withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error((label || 'Request') + ' timed out')), ms))
    ]);
  }

  /* ── Firebase helpers — Auth ───────────────────────────────────────────── */
  function authDoc() {
    return window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'app_auth', 'USERS');
  }
  async function loadUsers() {
    const snap = await window.FB.getDoc(authDoc());
    _users = snap.exists() ? (snap.data().users || []) : [];
  }
  async function _ensureUsers() {
    if (_users.length) return;
    if (!_key) return;
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await _withTimeout(loadUsers(), 10000, 'Load users');
    } catch (e) { console.warn('[BCOT_AUTH] _ensureUsers:', e); }
  }
  async function saveUsers() {
    await window.FB.setDoc(authDoc(), { users: _users });
  }

  /* ── Firebase helpers — IP list ────────────────────────────────────────── */
  function ipDoc() {
    return window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'app_ips', 'LIST');
  }
  async function loadIPs() {
    const snap = await window.FB.getDoc(ipDoc());
    _ips = snap.exists() ? (snap.data().ips || []) : [];
  }
  async function saveIPs() {
    if (typeof window.FB.setDoc !== 'function') return;
    await window.FB.setDoc(ipDoc(), { ips: _ips });
  }

  /* ── DOM helpers ───────────────────────────────────────────────────────── */
  function $id(id) { return document.getElementById(id); }

  function showScreen(name) {
    ['loading', 'login', 'changepwd', 'setup', 'error'].forEach(s => {
      const el = $id('bcot-scr-' + s);
      if (el) el.style.display = (s === name) ? '' : 'none';
    });
  }

  /* ── Build overlay ─────────────────────────────────────────────────────── */
  function createOverlay() {
    if ($id('bcot-auth-overlay')) return;
    const title = document.title || 'BCOT Rota';

    const wrap = document.createElement('div');
    wrap.id = 'bcot-auth-overlay';
    wrap.style.cssText =
      'position:fixed;inset:0;background:#eef2f7;z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:Arial,sans-serif;';

    wrap.innerHTML = `
<div style="background:#fff;border-radius:16px;padding:48px 40px;width:440px;
            max-width:92vw;box-shadow:0 8px 32px rgba(0,0,0,.13);">

  <!-- Loading -->
  <div id="bcot-scr-loading" style="text-align:center;color:#6b7280;padding:20px 0;">
    <div style="font-size:28px;margin-bottom:12px;">🔒</div>
    <div style="font-size:14px;font-weight:600;color:#1a4f8b;">Checking access…</div>
  </div>

  <!-- Login -->
  <div id="bcot-scr-login" style="display:none;">
    <h2 style="margin:0 0 4px;font-size:21px;color:#1a4f8b;font-weight:700;">${title}</h2>
    <p style="margin:0 0 28px;font-size:12px;color:#6b7280;letter-spacing:.02em;">
      KAMC-WR — Pharmaceutical Care Department
    </p>
    <label style="display:block;font-size:11px;font-weight:700;letter-spacing:.07em;
                  color:#374151;margin-bottom:6px;">USERNAME</label>
    <input id="bcot-login-badge" type="text" placeholder="Enter username"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
             font-size:13px;margin-bottom:18px;background:#fff;box-sizing:border-box;"
      onkeydown="if(event.key==='Enter') BCOT_AUTH.doLogin();" />
    <label style="display:block;font-size:11px;font-weight:700;letter-spacing:.07em;
                  color:#374151;margin-bottom:6px;">PASSWORD</label>
    <input id="bcot-login-pwd" type="password" placeholder="Enter password"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
             font-size:13px;box-sizing:border-box;margin-bottom:6px;"
      onkeydown="if(event.key==='Enter') BCOT_AUTH.doLogin();" />
    <div id="bcot-login-err"
      style="color:#dc2626;font-size:12px;min-height:18px;margin-bottom:12px;"></div>
    <button onclick="BCOT_AUTH.doLogin();"
      style="width:100%;padding:12px;background:#1a4f8b;color:#fff;border:none;
             border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
      Login
    </button>
  </div>

  <!-- Change password (first login) -->
  <div id="bcot-scr-changepwd" style="display:none;">
    <h2 style="margin:0 0 4px;font-size:21px;color:#1a4f8b;font-weight:700;">Set Your Password</h2>
    <p style="margin:0 0 24px;font-size:12px;color:#6b7280;">
      First login — please choose a personal password (min 6 characters).
    </p>
    <label style="display:block;font-size:11px;font-weight:700;letter-spacing:.07em;
                  color:#374151;margin-bottom:6px;">NEW PASSWORD</label>
    <input id="bcot-new-pwd" type="password"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
             font-size:13px;box-sizing:border-box;margin-bottom:14px;" />
    <label style="display:block;font-size:11px;font-weight:700;letter-spacing:.07em;
                  color:#374151;margin-bottom:6px;">CONFIRM PASSWORD</label>
    <input id="bcot-confirm-pwd" type="password"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
             font-size:13px;box-sizing:border-box;margin-bottom:6px;"
      onkeydown="if(event.key==='Enter') BCOT_AUTH.doChangePwd();" />
    <div id="bcot-changepwd-err"
      style="color:#dc2626;font-size:12px;min-height:18px;margin-bottom:12px;"></div>
    <button onclick="BCOT_AUTH.doChangePwd();"
      style="width:100%;padding:12px;background:#2e8b57;color:#fff;border:none;
             border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
      Set Password &amp; Login
    </button>
  </div>

  <!-- First-time setup -->
  <div id="bcot-scr-setup" style="display:none;">
    <h2 style="margin:0 0 4px;font-size:21px;color:#1a4f8b;font-weight:700;">First-Time Setup</h2>
    <p style="margin:0 0 24px;font-size:12px;color:#6b7280;">
      No users found. Create the first admin account.<br>
      Default password will be <strong>12345</strong> — you will be asked to change it.
    </p>
    <label style="display:block;font-size:11px;font-weight:700;letter-spacing:.07em;
                  color:#374151;margin-bottom:6px;">USERNAME</label>
    <input id="bcot-setup-badge" type="text" placeholder="Username"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
             font-size:13px;box-sizing:border-box;margin-bottom:14px;" />
    <label style="display:block;font-size:11px;font-weight:700;letter-spacing:.07em;
                  color:#374151;margin-bottom:6px;">YOUR NAME</label>
    <input id="bcot-setup-name" type="text" placeholder="Full name"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
             font-size:13px;box-sizing:border-box;margin-bottom:6px;"
      onkeydown="if(event.key==='Enter') BCOT_AUTH.doSetup();" />
    <div id="bcot-setup-err"
      style="color:#dc2626;font-size:12px;min-height:18px;margin-bottom:12px;"></div>
    <button onclick="BCOT_AUTH.doSetup();"
      style="width:100%;padding:12px;background:#1a4f8b;color:#fff;border:none;
             border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
      Create Account
    </button>
  </div>

  <!-- Error -->
  <div id="bcot-scr-error" style="display:none;text-align:center;padding:10px 0;">
    <div style="font-size:28px;margin-bottom:12px;">⚠️</div>
    <p id="bcot-error-msg" style="color:#dc2626;font-size:13px;margin:0;"></p>
  </div>

</div>`;

    document.body.appendChild(wrap);
  }

  /* ── (dropdown removed — login now uses badge number text input) ────────── */
  function buildUserDropdown() { /* no-op: select replaced by text input */ }

  /* ── Login actions ─────────────────────────────────────────────────────── */
  function doLogin() {
    const badge = ($id('bcot-login-badge')?.value || '').trim();
    const pwd   = $id('bcot-login-pwd')?.value;
    const errEl = $id('bcot-login-err');
    if (errEl) errEl.textContent = '';
    if (!badge) { if (errEl) errEl.textContent = 'Please enter your username.'; return; }
    const user = _users.find(u => u.badge === badge);
    if (!user || user.password !== pwd) {
      if (errEl) errEl.textContent = 'Invalid username or password.';
      return;
    }
    _pendingUser = user;
    if ($id('bcot-login-pwd')) $id('bcot-login-pwd').value = '';
    if (user.firstLogin) { showScreen('changepwd'); return; }
    _finishLogin(user);
  }

  async function doChangePwd() {
    const np    = $id('bcot-new-pwd')?.value;
    const cp    = $id('bcot-confirm-pwd')?.value;
    const errEl = $id('bcot-changepwd-err');
    if (errEl) errEl.textContent = '';
    if (!np || np.length < 6) { if (errEl) errEl.textContent = 'Minimum 6 characters.'; return; }
    if (np !== cp)             { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }
    _pendingUser.password   = np;
    _pendingUser.firstLogin = false;
    const idx = _users.findIndex(u => u.id === _pendingUser.id);
    if (idx >= 0) _users[idx] = Object.assign({}, _pendingUser);
    try {
      await _withTimeout(saveUsers(), 10000, 'Save password');
    } catch (e) { console.error('Auth save error:', e); }
    if ($id('bcot-new-pwd'))     $id('bcot-new-pwd').value = '';
    if ($id('bcot-confirm-pwd')) $id('bcot-confirm-pwd').value = '';
    _finishLogin(_pendingUser);
  }

  async function doSetup() {
    const badge = ($id('bcot-setup-badge')?.value || '').trim();
    const name  = ($id('bcot-setup-name')?.value  || '').trim();
    const errEl = $id('bcot-setup-err');
    if (errEl) errEl.textContent = '';
    if (!badge) { if (errEl) errEl.textContent = 'Username is required.'; return; }
    if (!name)  { if (errEl) errEl.textContent = 'Name is required.'; return; }
    const user = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                   badge, name, password: '12345', firstLogin: true };
    _users = [user];
    try {
      await _withTimeout(saveUsers(), 10000, 'Save user');
    } catch (e) { if (errEl) errEl.textContent = 'Could not save — check connection.'; return; }
    _pendingUser = user;
    showScreen('changepwd');
  }

  /* ── Custom dialogs ────────────────────────────────────────────────────── */
  function _dialogBase(innerHtml) {
    const ov = document.createElement('div');
    ov.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:999999;' +
      'display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
    ov.innerHTML =
      `<div style="background:#fff;border-radius:14px;padding:28px 28px 24px;` +
      `width:400px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.22);">${innerHtml}</div>`;
    document.body.appendChild(ov);
    return ov;
  }

  function _bcotAlert(msg, title = 'Notice') {
    return new Promise(resolve => {
      const ov = _dialogBase(`
        <h3 style="margin:0 0 10px;font-size:16px;color:#1a4f8b;">${title}</h3>
        <p style="margin:0 0 22px;font-size:13px;color:#374151;line-height:1.6;">${msg}</p>
        <div style="text-align:right;">
          <button id="_ba_ok" style="padding:9px 26px;background:#1a4f8b;color:#fff;border:none;
            border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">OK</button>
        </div>`);
      ov.querySelector('#_ba_ok').onclick = () => { ov.remove(); resolve(); };
    });
  }

  function _bcotConfirm(msg, title = 'Confirm', { confirmLabel = 'Confirm', danger = false } = {}) {
    return new Promise(resolve => {
      const btnBg = danger ? '#dc2626' : '#1a4f8b';
      const ov = _dialogBase(`
        <h3 style="margin:0 0 10px;font-size:16px;color:#1a4f8b;">${title}</h3>
        <p style="margin:0 0 22px;font-size:13px;color:#374151;line-height:1.6;">${msg}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="_bc_no" style="padding:9px 22px;background:#f3f4f6;color:#374151;
            border:1px solid #d1d5db;border-radius:8px;font-size:13px;cursor:pointer;">Cancel</button>
          <button id="_bc_yes" style="padding:9px 22px;background:${btnBg};color:#fff;border:none;
            border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">${confirmLabel}</button>
        </div>`);
      ov.querySelector('#_bc_yes').onclick = () => { ov.remove(); resolve(true); };
      ov.querySelector('#_bc_no').onclick  = () => { ov.remove(); resolve(false); };
    });
  }

  function _bcotPrompt(msg, { title = 'Enter Value', placeholder = '', type = 'text',
                               confirmLabel = 'Submit', defaultValue = '' } = {}) {
    return new Promise(resolve => {
      const ov = _dialogBase(`
        <h3 style="margin:0 0 10px;font-size:16px;color:#1a4f8b;">${title}</h3>
        <p style="margin:0 0 12px;font-size:13px;color:#374151;">${msg}</p>
        <input id="_bp_inp" type="${type}" placeholder="${placeholder}"
          style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
                 font-size:13px;box-sizing:border-box;margin-bottom:18px;" />
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="_bp_no" style="padding:9px 22px;background:#f3f4f6;color:#374151;
            border:1px solid #d1d5db;border-radius:8px;font-size:13px;cursor:pointer;">Cancel</button>
          <button id="_bp_ok" style="padding:9px 22px;background:#1a4f8b;color:#fff;border:none;
            border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">${confirmLabel}</button>
        </div>`);
      const inp = ov.querySelector('#_bp_inp');
      if (defaultValue) inp.value = defaultValue;
      const submit = () => { const v = inp.value; ov.remove(); resolve(v); };
      inp.onkeydown = e => { if (e.key === 'Enter') submit(); };
      setTimeout(() => inp.focus(), 50);
      ov.querySelector('#_bp_ok').onclick = submit;
      ov.querySelector('#_bp_no').onclick = () => { ov.remove(); resolve(null); };
    });
  }

  function doLogout() {
    _bcotConfirm('You will need to log in again to access the app.', 'Log Out?',
      { confirmLabel: 'Log Out', danger: true })
      .then(ok => { if (ok) { clearSession(); location.reload(); } });
  }

  /* ── After successful auth ─────────────────────────────────────────────── */
  function _finishLogin(user) {
    setSession(user);
    window.BCOT_AUTH_ALLOWED_AREAS = user.areas || 'ALL';
    _removeOverlay();
    _addLogoutButton(user.name);
    _initIdleTimer();
    _pendingUser = null;
    // Marks this bcotAuth dispatch as coming from a login just submitted on
    // *this* page load, as opposed to an existing session picked up on
    // arrival — index.html uses this to tell "just logged in here, about to
    // be redirected" apart from "already had a session, came back here".
    // A plain in-memory flag (not persisted) so it can never leak into a
    // later page load, including one that finished logging in elsewhere.
    window.__bcotFreshLogin = true;
    window.dispatchEvent(new CustomEvent('bcotAuth', { detail: getSession() }));
    _linkUserToIP(user);
  }

  function _removeOverlay() {
    const el = $id('bcot-auth-overlay');
    if (el) el.remove();
  }

  function _addLogoutButton(name) {
    if ($id('bcot-logout-btn')) return;
    const btn = document.createElement('button');
    btn.id    = 'bcot-logout-btn';
    btn.title = 'Click to log out';
    btn.textContent = '👤 ' + name;
    btn.style.cssText =
      'position:fixed;top:8px;right:10px;z-index:9998;padding:5px 14px;' +
      'background:rgba(26,79,139,.88);color:#fff;border:none;border-radius:20px;' +
      'font-size:11px;font-family:Arial,sans-serif;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.22);';
    btn.onclick = doLogout;
    document.body.appendChild(btn);
    const ps = document.createElement('style');
    ps.textContent = '@media print{#bcot-logout-btn{display:none!important}}';
    document.head.appendChild(ps);
  }

  /* ── Idle-logout timer (15 min) ─────────────────────────────────────────── */
  let _idleTimerStarted = false;
  function _initIdleTimer() {
    if (_idleTimerStarted) return;
    _idleTimerStarted = true;
    const IDLE_MS = 15 * 60 * 1000;
    const WARN_MS =  1 * 60 * 1000;
    let _idleT = null, _warnT = null, _warnEl = null;

    function _clearWarn() {
      if (_warnEl) { _warnEl.remove(); _warnEl = null; }
    }
    function _showWarn() {
      _clearWarn();
      _warnEl = document.createElement('div');
      _warnEl.textContent = '⚠️  No activity detected — you will be logged out in 1 minute.';
      _warnEl.style.cssText =
        'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:99999;' +
        'background:#b45309;color:#fff;padding:10px 24px;border-radius:8px;' +
        'font-size:13px;font-family:Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3);' +
        'white-space:nowrap;';
      document.body.appendChild(_warnEl);
    }
    function _doIdleLogout() {
      _clearWarn();
      clearSession();
      const overlay = document.createElement('div');
      overlay.textContent = 'Session expired due to inactivity. Logging out…';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.75);' +
        'display:flex;align-items:center;justify-content:center;' +
        'color:#fff;font-size:15px;font-family:Arial,sans-serif;text-align:center;padding:20px;';
      document.body.appendChild(overlay);
      setTimeout(() => location.reload(), 2500);
    }
    function _reset() {
      clearTimeout(_idleT);
      clearTimeout(_warnT);
      _clearWarn();
      _warnT = setTimeout(_showWarn,     IDLE_MS - WARN_MS);
      _idleT = setTimeout(_doIdleLogout, IDLE_MS);
    }
    ['mousemove','mousedown','keydown','scroll','touchstart','click'].forEach(ev =>
      document.addEventListener(ev, _reset, { passive: true })
    );
    _reset();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     IP / Device Logging (audit only — never blocks access)
     ══════════════════════════════════════════════════════════════════════════ */

  /** Fetch this device's public IP from ipify.org (5 s timeout). */
  async function _getMyIP() {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch('https://api4.ipify.org?format=json', { signal: ctrl.signal });
      clearTimeout(tid);
      const data = await resp.json();
      return data.ip || null;
    } catch { return null; }
  }

  /**
   * Record this device's IP in the access log. Best-effort and non-blocking:
   * any failure (IP detection, Firestore) is swallowed — logging is an audit
   * trail, not a gate, so it must never stop a user from reaching login.
   */
  async function _logIP() {
    try {
      _myIP = await _getMyIP();
      if (!_myIP) return;

      await loadIPs();
      const now   = new Date().toISOString();
      const entry = _ips.find(e => e.ip === _myIP);
      if (entry) {
        entry.lastSeen = now;
        entry.visits   = (entry.visits || 0) + 1;
      } else {
        _ips.push({
          ip:        _myIP,
          label:     '',
          firstSeen: now,
          lastSeen:  now,
          visits:    1,
          ua:        (navigator.userAgent || '').slice(0, 120)
        });
      }
      await saveIPs();
    } catch {}
  }

  /**
   * Associate the just-logged-in user with this device's IP entry, so the
   * admin can see who has used each IP. An IP can be shared by more than one
   * person (an office PC across shifts), so each entry keeps a *list* of
   * users rather than a single owner — never overwritten, only appended to.
   * Best-effort and non-blocking, same as _logIP(); called fire-and-forget
   * from _finishLogin so a slow/failed write never delays showing the app.
   */
  async function _linkUserToIP(user) {
    try {
      if (!_myIP || !user || !user.badge) return;
      if (!_ips.length) await loadIPs();

      const now = new Date().toISOString();
      let entry = _ips.find(e => e.ip === _myIP);
      if (!entry) {
        entry = { ip: _myIP, label: '', firstSeen: now, lastSeen: now, visits: 1,
                   ua: (navigator.userAgent || '').slice(0, 120) };
        _ips.push(entry);
      }
      if (!Array.isArray(entry.users)) entry.users = [];
      const link = entry.users.find(u => u.badge === user.badge);
      if (link) {
        link.name      = user.name;
        link.nameTitle = user.nameTitle || '';
        link.lastLogin = now;
        link.logins    = (link.logins || 0) + 1;
      } else {
        entry.users.push({
          badge: user.badge, name: user.name, nameTitle: user.nameTitle || '',
          firstLogin: now, lastLogin: now, logins: 1
        });
      }
      await saveIPs();
    } catch {}
  }

  /* ══════════════════════════════════════════════════════════════════════════
     User Manager
     ══════════════════════════════════════════════════════════════════════════ */
  async function openUserManager() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await _withTimeout(loadUsers(), 10000, 'Load users');
    } catch (e) {
      await _bcotAlert('Could not load users — check your connection.', 'Connection Error');
      return;
    }
    _renderUserManagerModal();
  }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function _renderUserManagerModal() {
    const existing = $id('bcot-um-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bcot-um-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;' +
      'display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';

    modal.innerHTML = `
<div style="background:#fff;border-radius:14px;padding:28px 32px 22px;width:720px;
            max-width:96vw;max-height:90vh;display:flex;flex-direction:column;
            box-shadow:0 8px 32px rgba(0,0,0,.2);">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-shrink:0;">
    <h3 style="margin:0;font-size:17px;color:#1a4f8b;">👥 Login Users</h3>
    <button onclick="document.getElementById('bcot-um-modal').remove();"
      style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;
             line-height:1;padding:0 6px;">&times;</button>
  </div>

  <!-- Scrollable user list -->
  <div id="bcot-um-list" style="flex:1;overflow-y:auto;margin-bottom:20px;min-height:0;"></div>

  <!-- Add user form -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;flex-shrink:0;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;color:#374151;">ADD USER</div>
      <button onclick="BCOT_AUTH.umImportFromStaff();"
        style="padding:6px 14px;background:#0f766e;color:#fff;border:none;
               border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
        📥 Import All From Staff
      </button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
      <input id="bcot-um-newbadge" type="text" placeholder="Badge no. *"
        style="width:100px;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;" />
      <select id="bcot-um-nametitle"
        style="padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;background:#fff;min-width:90px;">
        <option value="">Title *</option>
        <option value="Dr.">Dr.</option>
        <option value="Mr.">Mr.</option>
        <option value="Ms.">Ms.</option>
        <option value="Mrs.">Mrs.</option>
        <option value="R.Ph.">R.Ph.</option>
      </select>
      <input id="bcot-um-newname" type="text" placeholder="Full name *"
        style="flex:1;min-width:160px;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;"
        onkeydown="if(event.key==='Enter') BCOT_AUTH.umAddUser();" />
      <button onclick="BCOT_AUTH.umAddUser();"
        style="padding:8px 18px;background:#1a4f8b;color:#fff;border:none;
               border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
        + Add
      </button>
    </div>
    <div id="bcot-um-err"
      style="color:#dc2626;font-size:11px;min-height:16px;margin-top:4px;"></div>
    <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">
      New users get default password <strong>12345</strong> and are asked to change it on first login.
    </p>
  </div>

  <!-- Footer buttons -->
  <div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:14px;
              display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
    <button onclick="document.getElementById('bcot-um-modal').remove();"
      style="padding:9px 24px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;
             border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
      ✕ Close
    </button>
    <button onclick="BCOT_AUTH.umSaveAll();"
      style="padding:9px 28px;background:#2e8b57;color:#fff;border:none;
             border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
      💾 Save
    </button>
  </div>
</div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    _renderUserList();
  }

  function _renderUserList() {
    const list = $id('bcot-um-list');
    if (!list) return;
    if (!_users.length) {
      list.innerHTML = '<p style="color:#9ca3af;font-size:13px;margin:0;">No users yet.</p>';
      return;
    }
    const extRoleLabel = { staff:'Staff member', supervisor:'Supervisor', manager:'Manager / AD', director:'Director' };
    list.innerHTML = _users.map(u => {
      const pos        = u.position || u.title || '';
      const dispName   = [u.nameTitle, u.name].filter(Boolean).join(' ');
      const extRole    = u.ext_role  || '';
      const appRole    = u.app_role  || 'user';
      const AR_LABEL   = { user:'User', charge:'Charge Person', admin:'Admin' };
      const AR_COLOR   = { user:'#6b7280', charge:'#0f766e', admin:'#7c3aed' };
      return `
<div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:7px;background:#f9fafb;overflow:hidden;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;gap:8px;">
    <div style="min-width:0;">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
        <span style="font-size:13px;font-weight:600;color:#1f2937;">${dispName}</span>
        <span style="font-size:10px;background:${AR_COLOR[appRole]};color:#fff;padding:1px 7px;border-radius:10px;font-weight:700;">${AR_LABEL[appRole]||appRole}</span>
        ${u.firstLogin ? '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:10px;">First login pending</span>' : ''}
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px;">
        <span style="background:#e0e7ff;color:#3730a3;padding:1px 7px;border-radius:8px;font-weight:700;font-size:10px;">🪪 ${u.badge || '<em>no badge</em>'}</span>
        ${pos ? `&nbsp;·&nbsp;<span style="color:#1a4f8b;font-weight:600;">📋 ${pos}</span>` : ''}
        ${extRole ? `&nbsp;·&nbsp;<span style="color:#0f766e;font-weight:600;">🔧 ${extRoleLabel[extRole]||extRole}</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center;flex-shrink:0;">
      <select onchange="BCOT_AUTH.umSaveRole('${u.id}', this.value)"
        style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:11px;background:#fff;cursor:pointer;color:#1f2937;">
        <option value="user"   ${appRole==='user'  ?'selected':''}>User</option>
        <option value="charge" ${appRole==='charge'?'selected':''}>Charge Person</option>
        <option value="admin"  ${appRole==='admin' ?'selected':''}>Admin</option>
      </select>
      <button onclick="BCOT_AUTH.umSetBadge('${u.id}');"
        style="padding:5px 10px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">🪪 Badge</button>
      <button onclick="BCOT_AUTH.umSetPosition('${u.id}');"
        style="padding:5px 10px;background:#0284c7;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">✏ Position</button>
      <button onclick="BCOT_AUTH.umResetPwd('${u.id}');"
        style="padding:5px 10px;background:#d97706;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">Reset</button>
      <button onclick="BCOT_AUTH.umRemoveUser('${u.id}');"
        style="padding:5px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">Remove</button>
    </div>
  </div>
</div>`;
    }).join('');
  }

  async function umAddUser() {
    const badge     = ($id('bcot-um-newbadge')?.value   || '').trim();
    const nameTitle = ($id('bcot-um-nametitle')?.value  || '').trim();
    const name      = ($id('bcot-um-newname')?.value    || '').trim();
    const errEl     = $id('bcot-um-err');
    if (errEl) errEl.textContent = '';
    if (!badge)     { if (errEl) errEl.textContent = 'Badge number is required.'; return; }
    if (!nameTitle) { if (errEl) errEl.textContent = 'Title is required.'; return; }
    if (!name)      { if (errEl) errEl.textContent = 'Name is required.';  return; }
    if (_users.find(u => u.badge === badge)) {
      if (errEl) errEl.textContent = 'A user with that badge number already exists.'; return;
    }
    _users.push({ id: _uid(), badge, nameTitle, name, position: '', password: '12345', firstLogin: true });
    try {
      await saveUsers();
      if ($id('bcot-um-newbadge')) $id('bcot-um-newbadge').value = '';
      if ($id('bcot-um-newname'))  $id('bcot-um-newname').value  = '';
      _renderUserList();
    } catch (e) { if (errEl) errEl.textContent = 'Save failed: ' + e.message; }
  }

  /**
   * Bulk-create a login account (role User, default password 12345) for
   * every staff member in Staff Management who doesn't already have one.
   * Staff records repeat per area (same badge, multiple rows), so entries
   * are de-duplicated by badge; staff with no badge number are skipped
   * since a badge is what they'd log in with.
   */
  async function umImportFromStaff() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }

    let staffRecords = [];
    try {
      const snap = await window.FB.getDoc(
        window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'staff_named', 'STAFF_POOL')
      );
      staffRecords = (snap.exists() && Array.isArray(snap.data().records)) ? snap.data().records : [];
    } catch (e) {
      await _bcotAlert('Could not load the staff list — check your connection.', 'Connection Error');
      return;
    }

    const existingBadges = new Set(_users.map(u => u.badge));
    const seenBadges      = new Set();
    const toAdd           = [];
    let noBadge = 0, alreadyHasLogin = 0, external = 0;

    staffRecords.forEach(r => {
      const badge = String(r?.badge || '').trim();
      const name  = String(r?.name  || '').trim();
      if (r?.department) { external++; return; }
      if (!badge) { noBadge++; return; }
      if (!name || seenBadges.has(badge)) return;
      if (existingBadges.has(badge)) { alreadyHasLogin++; return; }
      seenBadges.add(badge);
      toAdd.push({
        id: _uid(), badge, nameTitle: '', name, position: '',
        password: '12345', firstLogin: true, app_role: 'user'
      });
    });

    if (!toAdd.length) {
      await _bcotAlert(
        `Nothing to import.<br>` +
        (alreadyHasLogin ? `${alreadyHasLogin} staff member(s) already have a login.<br>` : '') +
        (external ? `${external} staff member(s) are external collaborators and are skipped.<br>` : '') +
        (noBadge ? `${noBadge} staff member(s) have no badge number, so they can't be given a login.` : ''),
        'Import From Staff'
      );
      return;
    }

    const ok = await _bcotConfirm(
      `Create login accounts for <strong>${toAdd.length}</strong> staff member(s) not yet in this list?<br>` +
      `Each gets role <strong>User</strong> and the default password <strong>12345</strong> ` +
      `— they'll be asked to set a personal password on first login.` +
      (alreadyHasLogin ? `<br><br>${alreadyHasLogin} already have a login and will be skipped.` : '') +
      (external ? `<br>${external} are external collaborators and will be skipped.` : '') +
      (noBadge ? `<br>${noBadge} have no badge number and will be skipped.` : ''),
      'Import From Staff', { confirmLabel: `Add ${toAdd.length}` }
    );
    if (!ok) return;

    _users = _users.concat(toAdd);
    try {
      await saveUsers();
      _renderUserList();
      await _bcotAlert(`Added ${toAdd.length} user${toAdd.length !== 1 ? 's' : ''}.`, 'Import Complete');
    } catch (e) { await _bcotAlert('Save failed — ' + e.message, 'Error'); }
  }

  async function umSetPosition(id) {
    const u = _users.find(u => u.id === id);
    if (!u) return;
    const newPos = await _bcotPrompt(
      `Set the position for <strong>${[u.nameTitle, u.name].filter(Boolean).join(' ')}</strong>.<br>
       This appears on every printed rota page under the name.`,
      { title: '📋 Position', placeholder: 'e.g. Clinical Pharmacist, Director', confirmLabel: 'Save' }
    );
    if (newPos === null) return;
    u.position = newPos.trim();
    delete u.title;
    try {
      await saveUsers();
      _renderUserList();
    } catch (e) { await _bcotAlert('Save failed — check your connection.', 'Error'); }
  }

  async function umSetBadge(id) {
    const u = _users.find(u => u.id === id);
    if (!u) return;
    const newBadge = await _bcotPrompt(
      `Set the badge number for <strong>${[u.nameTitle, u.name].filter(Boolean).join(' ')}</strong>.<br>
       This is what the user types at login.`,
      { title: '🪪 Badge Number', placeholder: 'e.g. 12345', confirmLabel: 'Save',
        defaultValue: u.badge || '' }
    );
    if (newBadge === null) return;
    const b = newBadge.trim();
    if (!b) { await _bcotAlert('Badge number cannot be empty.', 'Validation'); return; }
    if (_users.find(u2 => u2.badge === b && u2.id !== id)) {
      await _bcotAlert('That badge number is already assigned to another user.', 'Duplicate'); return;
    }
    u.badge = b;
    try {
      await saveUsers();
      _renderUserList();
    } catch (e) { await _bcotAlert('Save failed — check your connection.', 'Error'); }
  }

  async function umResetPwd(id) {
    const u = _users.find(u => u.id === id);
    if (!u) return;
    const ok = await _bcotConfirm(
      `Reset password for <strong>${u.name}</strong> to the default <strong>12345</strong>?<br>They will be required to set a new password on their next login.`,
      'Reset Password', { confirmLabel: 'Reset' });
    if (!ok) return;
    u.password   = '12345';
    u.firstLogin = true;
    try {
      await saveUsers();
      _renderUserList();
    } catch (e) { await _bcotAlert('Save failed — check your connection.', 'Error'); }
  }

  async function umRemoveUser(id) {
    const u = _users.find(u => u.id === id);
    if (!u) return;
    const ok = await _bcotConfirm(
      `Remove <strong>${u.name}</strong> from the login users list?<br>They will no longer be able to access the app.`,
      'Remove User', { confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    _users = _users.filter(u => u.id !== id);
    try {
      await saveUsers();
      _renderUserList();
    } catch (e) { await _bcotAlert('Save failed — check your connection.', 'Error'); }
  }

  async function umSaveExt(id) {
    const u = _users.find(u => u.id === id);
    if (!u) return;
    u.ext_role       = ($id(`bcot-ext-role-${id}`)?.value  || '').trim();
    u.ext_phone      = ($id(`bcot-ext-phone-${id}`)?.value || '').trim();
    const areasRaw   = ($id(`bcot-ext-areas-${id}`)?.value || '').trim();
    u.ext_areas      = areasRaw ? areasRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    u.ext_manager_id = ($id(`bcot-ext-mgr-${id}`)?.value   || '').trim();
    try {
      await saveUsers();
      _renderUserList();
    } catch (e) { await _bcotAlert('Save failed — check your connection.', 'Error'); }
  }

  async function umSaveRole(id, role) {
    const u = _users.find(u => u.id === id);
    if (!u) return;
    const allowed = ['user', 'charge', 'admin'];
    if (!allowed.includes(role)) return;
    u.app_role = role;
    try {
      await saveUsers();
      _renderUserList();
    } catch (e) { await _bcotAlert('Save failed — check your connection.', 'Error'); }
  }

  async function umSaveAll() {
    try {
      await saveUsers();
      const el = document.getElementById('bcot-um-modal');
      if (el) el.remove();
    } catch (e) { await _bcotAlert('Save failed — check your connection.', 'Error'); }
  }

  async function fetchExtUsers() {
    if (!_users.length) {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      try { await _withTimeout(loadUsers(), 10000, 'Load users'); } catch (e) { console.warn('[BCOT_AUTH] fetchExtUsers:', e); }
    }
    return _users.map(u => ({
      id:              u.id,
      badge:           u.badge          || '',
      name:            [u.nameTitle, u.name].filter(Boolean).join(' '),
      app_role:        u.app_role       || 'user',
      role:            u.ext_role       || '',
      phone:           u.ext_phone      || '',
      areas:           u.ext_areas      || [],
      linkedManagerId: u.ext_manager_id || ''
    }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     IP Manager
     ══════════════════════════════════════════════════════════════════════════ */
  async function openIPManager() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await _withTimeout(loadIPs(), 10000, 'Load IPs');
      if (!_myIP) _myIP = await _getMyIP();
    } catch (e) {
      await _bcotAlert('Could not load IP list — check your connection.', 'Connection Error');
      return;
    }
    _renderIPManagerModal();
  }

  function _renderIPManagerModal() {
    const existing = $id('bcot-ip-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bcot-ip-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;' +
      'display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';

    modal.innerHTML = `
<div style="background:#fff;border-radius:14px;padding:28px 28px 22px;width:600px;
            max-width:94vw;max-height:86vh;overflow-y:auto;
            box-shadow:0 8px 32px rgba(0,0,0,.2);">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <h3 style="margin:0;font-size:16px;color:#1a4f8b;">🌐 Device / IP Access Log</h3>
    <button onclick="document.getElementById('bcot-ip-modal').remove();"
      style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;
             line-height:1;padding:0 4px;">&times;</button>
  </div>

  <!-- Total count -->
  <div id="bcot-ip-counter"
    style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;
           padding:10px 14px;margin-bottom:10px;font-size:13px;color:#0369a1;"></div>

  <p style="margin:0 0 14px;font-size:11px;color:#9ca3af;">
    Access is controlled by username + password only. Every device below was let in
    automatically and is listed here for reference — nothing needs approval.
  </p>

  <!-- Device log -->
  <div id="bcot-ip-list" style="margin-bottom:4px;"></div>
</div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    _renderIPCounter();
    _renderIPList();
  }

  function _renderIPCounter() {
    const counter = $id('bcot-ip-counter');
    if (!counter) return;
    const total = _ips.length;
    counter.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">` +
      `<div><strong>${total} device${total !== 1 ? 's' : ''} recorded</strong>` +
      `<span style="font-size:11px;color:#6b7280;margin-left:10px;">Unlimited — access is not restricted by IP</span></div>` +
      (total ? `<button onclick="BCOT_AUTH.ipClearAll();" ` +
        `style="padding:5px 12px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;` +
        `border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">` +
        `🗑️ Clear All</button>` : ``) +
      `</div>`;
  }

  async function ipClearAll() {
    if (!_ips.length) return;
    const ok = await _bcotConfirm(
      `Permanently clear the entire access log?<br>` +
      `This deletes all <strong>${_ips.length}</strong> recorded device${_ips.length !== 1 ? 's' : ''} ` +
      `(IPs, labels, linked usernames, visit history). It does not affect who can log in — only the log itself.`,
      'Clear Access Log', { confirmLabel: 'Clear All', danger: true }
    );
    if (!ok) return;
    _ips = [];
    try {
      await saveIPs();
      _renderIPCounter();
      _renderIPList();
    } catch (e) { await _bcotAlert('Save failed — ' + e.message, 'Error'); }
  }

  function _renderIPList() {
    const list = $id('bcot-ip-list');
    if (!list) return;

    const fmtDate = iso => {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleDateString('en-GB',
          { day: '2-digit', month: 'short', year: 'numeric' });
      } catch { return iso.slice(0, 10); }
    };

    if (!_ips.length) {
      list.innerHTML =
        `<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">📋 RECORDED DEVICES</div>` +
        `<p style="color:#9ca3af;font-size:13px;margin:0;">No visits recorded yet.</p>`;
      return;
    }

    const sorted = [..._ips].sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));

    list.innerHTML =
      `<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">📋 RECORDED DEVICES (${_ips.length})</div>` +
      sorted.map(e => {
        const i = _ips.indexOf(e);
        const isMe = (e.ip === _myIP);
        return `
<div style="border:1px solid ${isMe ? '#93c5fd' : '#e5e7eb'};border-radius:9px;
            padding:10px 12px;margin-bottom:8px;
            background:${isMe ? '#eff6ff' : '#f9fafb'};">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:700;color:#1f2937;
                     font-family:monospace;">${e.ip}</span>
        ${isMe
          ? '<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:10px;">This device</span>'
          : ''}
        <span style="font-size:11px;color:#6b7280;font-style:italic;">
          ${e.label ? e.label : '<span style="color:#d1d5db;">No label</span>'}
        </span>
        <button onclick="BCOT_AUTH.ipEditLabel(${i});"
          style="font-size:10px;padding:2px 7px;background:#e5e7eb;color:#374151;
                 border:none;border-radius:5px;cursor:pointer;line-height:1.5;">✏️ Label</button>
      </div>
      <div style="font-size:12px;color:#1a4f8b;margin-bottom:4px;">
        👤 ${
          (e.users && e.users.length)
            ? [...e.users].sort((a, b) => (b.lastLogin||'').localeCompare(a.lastLogin||''))
                .map(u => [u.nameTitle, u.name].filter(Boolean).join(' ') +
                          `<span style="color:#9ca3af;"> (${u.badge})</span>` +
                          (u.logins > 1 ? ` ×${u.logins}` : ''))
                .join(', ')
            : '<span style="color:#d1d5db;">No login recorded from this IP yet</span>'
        }
      </div>
      <div style="font-size:11px;color:#9ca3af;">
        First seen: ${fmtDate(e.firstSeen)}
        &nbsp;·&nbsp; Last visit: ${fmtDate(e.lastSeen)}
        &nbsp;·&nbsp; Visits: ${e.visits || 1}
      </div>
      ${e.ua ? `<div style="font-size:10px;color:#d1d5db;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.ua}</div>` : ''}
    </div>
    <button onclick="BCOT_AUTH.ipRemove(${i});"
      style="padding:5px 12px;background:#dc2626;color:#fff;border:none;
             border-radius:6px;font-size:11px;cursor:pointer;
             white-space:nowrap;flex-shrink:0;">
      Remove
    </button>
  </div>
</div>`;
      }).join('');
  }

  async function ipEditLabel(idx) {
    const entry = _ips[idx];
    if (!entry) return;
    const newLabel = await _bcotPrompt(
      `Set a label for <strong>${entry.ip}</strong>:`,
      { title: '✏️ Edit Label',
        placeholder: 'e.g. Office PC, Dr. Ahmed Phone',
        confirmLabel: 'Save' }
    );
    if (newLabel === null) return;
    entry.label = newLabel.trim();
    try {
      await saveIPs();
      _renderIPList();
    } catch (e) { await _bcotAlert('Save failed — check connection.', 'Error'); }
  }

  async function ipRemove(idx) {
    const entry = _ips[idx];
    if (!entry) return;
    const ok = await _bcotConfirm(
      `Remove <strong>${entry.label || entry.ip}</strong> from the log?<br>` +
      `It will reappear automatically the next time that device visits.`,
      'Remove Log Entry', { confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    _ips.splice(idx, 1);
    try {
      await saveIPs();
      _renderIPCounter();
      _renderIPList();
    } catch (e) { await _bcotAlert('Save failed — check connection.', 'Error'); }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Area Manager — manage areas list + per-area user access
     ══════════════════════════════════════════════════════════════════════════ */
  const _AREAS_LS      = 'BCOT_AREAS_LIST_V1';
  const _AREAS_META_LS = 'BCOT_AREAS_META_V1';
  const _STAFF_LS      = 'BCOT_STAFF_RECORDS_V2';
  const _DUTIES_LS     = 'BCOT_DUTIES_ALL_V1';

  function _getLocalAreas() {
    try { return JSON.parse(localStorage.getItem(_AREAS_LS) || '[]') || []; } catch { return []; }
  }
  function _setLocalAreas(list) {
    localStorage.setItem(_AREAS_LS, JSON.stringify(list.sort()));
  }
  function _getLocalAreasMeta() {
    try { return JSON.parse(localStorage.getItem(_AREAS_META_LS) || '{}') || {}; } catch { return {}; }
  }
  function _setLocalAreasMeta(meta) {
    localStorage.setItem(_AREAS_META_LS, JSON.stringify(meta));
  }

  // areasMeta is optional — pass it whenever a rename/remove/add needs to
  // carry per-area metadata (label, enabled, createdBy, remarks) along with
  // the bare code list, so Area Management (index.js AM namespace) never
  // ends up with an orphaned or missing metadata entry after this runs.
  async function _saveAreasToCloud(areas, areasMeta) {
    if (!window.FB || typeof window.FB.setDoc !== 'function' || !_key) return;
    const payload = { areasList: areas };
    if (areasMeta) payload.areasMeta = areasMeta;
    await window.FB.setDoc(
      window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'staff_named', 'STAFF_POOL'),
      payload,
      { merge: true }
    );
  }

  async function openAreaManager() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await _withTimeout(loadUsers(), 10000, 'Load users');
    } catch (e) {
      await _bcotAlert('Could not load users — check your connection.', 'Connection Error');
      return;
    }
    if (!_getLocalAreas().length && window.FB && _key) {
      try {
        const snap = await window.FB.getDoc(
          window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'staff_named', 'STAFF_POOL')
        );
        if (snap.exists()) {
          const cloudAreas = snap.data()?.areasList;
          if (Array.isArray(cloudAreas) && cloudAreas.length) {
            _setLocalAreas(cloudAreas);
          }
        }
      } catch (e) { console.warn('[AreaMgr] cloud area load:', e); }
    }
    _renderAreaManagerModal();
  }

  function _renderAreaManagerModal() {
    const ex = $id('bcot-ar-modal'); if (ex) ex.remove();
    const modal = document.createElement('div');
    modal.id = 'bcot-ar-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;' +
      'display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';

    modal.innerHTML = `
<div style="background:#fff;border-radius:14px;padding:28px 28px 22px;width:600px;
            max-width:94vw;max-height:86vh;overflow-y:auto;
            box-shadow:0 8px 32px rgba(0,0,0,.2);">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <h3 style="margin:0;font-size:16px;color:#1a4f8b;">🗂️ Area Management</h3>
    <button onclick="document.getElementById('bcot-ar-modal').remove();"
      style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;
             line-height:1;padding:0 4px;">&times;</button>
  </div>

  <div id="bcot-ar-list" style="margin-bottom:20px;"></div>

  <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">ADD NEW AREA</div>
    <div style="display:flex;gap:8px;">
      <input id="bcot-ar-newname" type="text" placeholder="Area code (e.g. ACC, ICU, OPD)"
        style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;
               font-size:12px;text-transform:uppercase;"
        onkeydown="if(event.key==='Enter') BCOT_AUTH.areaAdd();" />
      <button onclick="BCOT_AUTH.areaAdd();"
        style="padding:8px 16px;background:#1a4f8b;color:#fff;border:none;
               border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
        + Add
      </button>
    </div>
    <div id="bcot-ar-err" style="color:#dc2626;font-size:11px;min-height:16px;margin-top:5px;"></div>
    <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">
      Areas are used to filter staff and rota views.
      Use <strong>🔒 Access</strong> to restrict which users can see each area.
    </p>
  </div>
</div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    _renderAreaList();
  }

  function _renderAreaList() {
    const list = $id('bcot-ar-list'); if (!list) return;
    const areas = _getLocalAreas();

    if (!areas.length) {
      list.innerHTML = '<p style="color:#9ca3af;font-size:13px;margin:0;">No areas yet — add one below.</p>';
      return;
    }

    const anyRestricted = _users.some(u => Array.isArray(u.areas));

    list.innerHTML = areas.map(area => {
      const withAccess = _users.filter(u =>
        !u.areas || u.areas === 'ALL' || (Array.isArray(u.areas) && u.areas.includes(area))
      );
      let accessLabel, accessColor;
      if (!anyRestricted || withAccess.length === _users.length) {
        accessLabel = 'All users'; accessColor = '#16a34a';
      } else {
        accessLabel = `${withAccess.length} / ${_users.length} users`;
        accessColor = withAccess.length === 0 ? '#dc2626' : '#d97706';
      }
      const safeArea = area.replace(/'/g, "\\'");
      return `
<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;
            padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:7px;
            background:#f9fafb;">
  <div style="flex:1;min-width:0;">
    <span style="font-size:13px;font-weight:700;color:#1f2937;font-family:monospace;">${area}</span>
    <span style="font-size:11px;color:${accessColor};margin-left:10px;">👤 ${accessLabel}</span>
  </div>
  <div style="display:flex;gap:5px;flex-shrink:0;">
    <button onclick="BCOT_AUTH.areaAccess('${safeArea}');"
      style="padding:5px 10px;background:#1a4f8b;color:#fff;border:none;
             border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">
      🔒 Access
    </button>
    <button onclick="BCOT_AUTH.areaRename('${safeArea}');"
      style="padding:5px 10px;background:#d97706;color:#fff;border:none;
             border-radius:6px;font-size:11px;cursor:pointer;">
      Rename
    </button>
    <button onclick="BCOT_AUTH.areaRemove('${safeArea}');"
      style="padding:5px 10px;background:#dc2626;color:#fff;border:none;
             border-radius:6px;font-size:11px;cursor:pointer;">
      Remove
    </button>
  </div>
</div>`;
    }).join('');
  }

  async function areaAdd() {
    const raw   = ($id('bcot-ar-newname')?.value || '').trim().toUpperCase()
                    .replace(/[^A-Z0-9_\-]/g, '').slice(0, 20);
    const errEl = $id('bcot-ar-err');
    if (errEl) errEl.textContent = '';
    if (!raw) { if (errEl) errEl.textContent = 'Enter a valid area code.'; return; }
    const areas = _getLocalAreas();
    if (areas.includes(raw)) { if (errEl) errEl.textContent = `"${raw}" already exists.`; return; }
    areas.push(raw);
    _setLocalAreas(areas);
    try {
      await _saveAreasToCloud(_getLocalAreas());
      if ($id('bcot-ar-newname')) $id('bcot-ar-newname').value = '';
      _renderAreaList();
    } catch (e) { if (errEl) errEl.textContent = 'Cloud save failed: ' + e.message; }
  }

  async function areaRename(oldName) {
    await _ensureUsers();
    const input = await _bcotPrompt(
      `Enter a new code for area <strong>${oldName}</strong>:`,
      { title: '✏️ Rename Area', placeholder: 'New area code', confirmLabel: 'Rename' }
    );
    if (input === null) return;
    const newName = input.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '').slice(0, 20);
    if (!newName || newName === oldName) return;

    const areas = _getLocalAreas();
    if (areas.includes(newName)) { await _bcotAlert(`Area "${newName}" already exists.`, 'Error'); return; }

    const idx = areas.indexOf(oldName);
    if (idx >= 0) areas[idx] = newName;
    _setLocalAreas(areas);

    const meta = _getLocalAreasMeta();
    if (meta[oldName]) { meta[newName] = meta[oldName]; delete meta[oldName]; }
    _setLocalAreasMeta(meta);

    let staff = null, staffChanged = false;
    try {
      staff = JSON.parse(localStorage.getItem(_STAFF_LS) || '[]');
      staff.forEach(s => {
        if (!s.area) return;
        const parts = s.area.split(',').map(a => a.trim().toUpperCase());
        if (parts.includes(oldName)) {
          s.area = parts.map(a => a === oldName ? newName : a).join(',');
          staffChanged = true;
        }
      });
      if (staffChanged) localStorage.setItem(_STAFF_LS, JSON.stringify(staff));
    } catch { staff = null; staffChanged = false; }

    let duties = null, dutiesChanged = false;
    try {
      duties = JSON.parse(localStorage.getItem(_DUTIES_LS) || '{}');
      Object.values(duties).forEach(d => {
        if (!d.area) return;
        const parts = d.area.split(',').map(a => a.trim().toUpperCase());
        if (parts.includes(oldName)) {
          d.area = parts.map(a => a === oldName ? newName : a).join(',');
          dutiesChanged = true;
        }
      });
      if (dutiesChanged) localStorage.setItem(_DUTIES_LS, JSON.stringify(duties));
    } catch { duties = null; dutiesChanged = false; }

    let usersChanged = false;
    _users.forEach(u => {
      if (Array.isArray(u.areas)) {
        const i = u.areas.indexOf(oldName);
        if (i >= 0) { u.areas[i] = newName; usersChanged = true; }
      }
    });

    try {
      await _saveAreasToCloud(_getLocalAreas(), meta);
      if (usersChanged) await saveUsers();
      if (staffChanged && window.FB && _key) {
        await window.FB.setDoc(
          window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'staff_named', 'STAFF_POOL'),
          { records: staff }, { merge: true }
        );
      }
      if (dutiesChanged && window.FB && _key) {
        await window.FB.setDoc(
          window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'duties_named', 'DUTIES_POOL'),
          { duties }, { merge: true }
        );
      }
      _renderAreaList();
    } catch (e) { await _bcotAlert('Save failed — ' + e.message, 'Error'); }
  }

  async function areaRemove(name) {
    await _ensureUsers();
    let staffCount = 0;
    try {
      const staff = JSON.parse(localStorage.getItem(_STAFF_LS) || '[]');
      staffCount = staff.filter(s =>
        (s.area || '').split(',').map(a => a.trim().toUpperCase()).includes(name)
      ).length;
    } catch {}

    const ok = await _bcotConfirm(
      `Remove area <strong>${name}</strong> from the list?` +
      (staffCount ? `<br><br>⚠️ ${staffCount} staff member(s) are tagged with this area.` +
        ` Their records are not deleted, but this area will no longer appear in filters.` : ''),
      'Remove Area', { confirmLabel: 'Remove', danger: true }
    );
    if (!ok) return;

    const areas = _getLocalAreas().filter(a => a !== name);
    _setLocalAreas(areas);

    const meta = _getLocalAreasMeta();
    delete meta[name];
    _setLocalAreasMeta(meta);

    let usersChanged = false;
    _users.forEach(u => {
      if (Array.isArray(u.areas)) {
        const before = u.areas.length;
        u.areas = u.areas.filter(a => a !== name);
        if (u.areas.length !== before) usersChanged = true;
      }
    });

    try {
      await _saveAreasToCloud(areas, meta);
      if (usersChanged) await saveUsers();
      _renderAreaList();
    } catch (e) { await _bcotAlert('Save failed — ' + e.message, 'Error'); }
  }

  async function areaAccess(areaName) {
    await _ensureUsers();
    if (!_users.length) { await _bcotAlert('No users configured yet.', 'Notice'); return; }
    const allAreas = _getLocalAreas();

    return new Promise(resolve => {
      const userRows = _users.map(u => {
        const hasAccess = !u.areas || u.areas === 'ALL' ||
                          (Array.isArray(u.areas) && u.areas.includes(areaName));
        return `
<div style="display:flex;align-items:center;gap:10px;padding:8px 0;
            border-bottom:1px solid #f3f4f6;">
  <input type="checkbox" id="ar-chk-${u.id}" ${hasAccess ? 'checked' : ''}
    style="width:16px;height:16px;cursor:pointer;flex-shrink:0;accent-color:#1a4f8b;" />
  <label for="ar-chk-${u.id}"
    style="font-size:13px;color:#374151;cursor:pointer;flex:1;">${u.name}</label>
</div>`;
      }).join('');

      const ov = _dialogBase(`
        <h3 style="margin:0 0 6px;font-size:16px;color:#1a4f8b;">🔒 Access — ${areaName}</h3>
        <p style="margin:0 0 12px;font-size:12px;color:#6b7280;">
          Unchecked users will not see <strong>${areaName}</strong> in any page filter.
        </p>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button onclick="BCOT_AUTH._arCheckAll(true);"
            style="flex:1;padding:5px;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;
                   border-radius:6px;font-size:11px;cursor:pointer;">✓ All</button>
          <button onclick="BCOT_AUTH._arCheckAll(false);"
            style="flex:1;padding:5px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;
                   border-radius:6px;font-size:11px;cursor:pointer;">✗ None</button>
        </div>
        <div style="max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;
                    padding:0 12px;margin-bottom:18px;">
          ${userRows}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="_ar_cancel" style="padding:9px 22px;background:#f3f4f6;color:#374151;
            border:1px solid #d1d5db;border-radius:8px;font-size:13px;cursor:pointer;">Cancel</button>
          <button id="_ar_save" style="padding:9px 22px;background:#1a4f8b;color:#fff;border:none;
            border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Save Access</button>
        </div>`);

      ov.querySelector('#_ar_save').onclick = async () => {
        const checkedIds = new Set(_users.filter(u => $id('ar-chk-' + u.id)?.checked).map(u => u.id));
        const allChecked = checkedIds.size === _users.length;

        _users.forEach(u => {
          const shouldHave = checkedIds.has(u.id);
          if (!u.areas || u.areas === 'ALL') {
            if (!shouldHave) {
              u.areas = allAreas.filter(a => a !== areaName);
            }
          } else if (Array.isArray(u.areas)) {
            if (shouldHave && !u.areas.includes(areaName)) {
              u.areas.push(areaName); u.areas.sort();
            } else if (!shouldHave) {
              u.areas = u.areas.filter(a => a !== areaName);
            }
          }
          if (Array.isArray(u.areas) && allAreas.length &&
              allAreas.every(a => u.areas.includes(a))) {
            u.areas = 'ALL';
          }
        });

        try {
          await saveUsers();
          ov.remove();
          _renderAreaList();
          resolve();
        } catch (e) {
          await _bcotAlert('Save failed — ' + e.message, 'Error');
          ov.remove(); resolve();
        }
      };
      ov.querySelector('#_ar_cancel').onclick = () => { ov.remove(); resolve(); };
    });
  }

  function _arCheckAll(checked) {
    _users.forEach(u => { const el = $id('ar-chk-' + u.id); if (el) el.checked = checked; });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Main init — runs automatically on every page
     ══════════════════════════════════════════════════════════════════════════ */
  (async function init() {
    // 1. Show overlay immediately (blocks all page content)
    createOverlay();
    showScreen('loading');

    // The page's own <head> ships with `html{visibility:hidden}` so nothing
    // paints before this script runs. Reveal now — the overlay (z-index
    // 99999, fixed inset:0) is what actually becomes visible, never the raw
    // page content underneath, even for a single frame.
    document.documentElement.style.visibility = 'visible';

    // 2. Get app key
    _key = (window.BCOT_APP_KEY || '').trim();
    if (!_key) {
      $id('bcot-error-msg').textContent = 'config.js not found — app cannot start.';
      showScreen('error');
      return;
    }

    // 3. Fast path: valid session — skip IP check (device already authenticated)
    const session = getSession();
    if (session) {
      window.BCOT_AUTH_ALLOWED_AREAS = session.areas || 'ALL';
      _removeOverlay();
      _addLogoutButton(session.name);
      window.dispatchEvent(new CustomEvent('bcotAuth', { detail: session }));
      return;
    }

    // 4. Wait for Firebase module (deferred script may not have run yet)
    let t = 0;
    while (!window.FB && t++ < 100) await new Promise(r => setTimeout(r, 50));
    if (!window.FB) {
      $id('bcot-error-msg').textContent = 'Firebase failed to initialize. Check your connection.';
      showScreen('error');
      return;
    }

    // 5. Log this device's IP for the admin's records — never blocks login
    try { await _withTimeout(_logIP(), 6000, 'IP log'); } catch {}

    // 6. Load user list
    try {
      await _withTimeout(loadUsers(), 10000, 'Load users');
    } catch (e) {
      $id('bcot-error-msg').textContent = 'Could not load user list — check connection.';
      showScreen('error');
      return;
    }

    // 7. No users yet → first-time setup
    if (!_users.length) {
      showScreen('setup');
      return;
    }

    // 8. Show login form
    buildUserDropdown();
    showScreen('login');
  })();

  /* ── Public API ────────────────────────────────────────────────────────── */
  window.BCOT_AUTH = {
    // Login
    doLogin,
    doChangePwd,
    doSetup,
    doLogout,
    getSession,
    // User manager
    openUserManager,
    umAddUser,
    umImportFromStaff,
    umSetBadge,
    umSetPosition,
    umResetPwd,
    umRemoveUser,
    umSaveExt,
    umSaveRole,
    umSaveAll,
    fetchExtUsers,
    // IP / device log
    openIPManager,
    ipEditLabel,
    ipRemove,
    ipClearAll,
    // Area manager
    openAreaManager,
    areaAdd,
    areaRename,
    areaRemove,
    areaAccess,
    _arCheckAll,
    syncAreasList: async () => { try { await _saveAreasToCloud(_getLocalAreas()); } catch(e) { console.warn('[syncAreasList]', e); } },
    // Dialogs
    alert  : _bcotAlert,
    confirm: _bcotConfirm,
    prompt : _bcotPrompt,
  };

})();
