/* ═══════════════════════════════════════════════════════════════════════════
   BCOT Rota — App Authentication Guard  (js/auth.js)
   ───────────────────────────────────────────────────────────────────────────
   • Fullscreen overlay on every page — nothing visible until authenticated
   • IP access control — auto-saves visiting IPs, max 12 devices
   • Users stored in Firebase: bcot_overtime_secure/[KEY]/app_auth/USERS
   • IPs stored in Firebase:   bcot_overtime_secure/[KEY]/app_ips/LIST
   • Session in localStorage, 12-hour expiry, shared across all tabs
   • First login forces password change (default: 12345)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */
  const SESSION_KEY  = 'BCOT_AUTH_SESSION_V1';
  const SESSION_TTL  = 12 * 60 * 60 * 1000;   // 12 hours
  const MAX_IPS      = 12;

  /* ── State ─────────────────────────────────────────────────────────────── */
  let _key         = '';
  let _users       = [];
  let _ips         = [];
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
      id: user.id, name: user.name, ts: Date.now(),
      areas: user.areas || 'ALL'
    }));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  /* ── Firebase helpers — Auth ───────────────────────────────────────────── */
  function authDoc() {
    return window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'app_auth', 'USERS');
  }
  async function loadUsers() {
    const snap = await window.FB.getDoc(authDoc());
    _users = snap.exists() ? (snap.data().users || []) : [];
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
    if (typeof window.FB.setDoc !== 'function') return; // some pages omit setDoc
    await window.FB.setDoc(ipDoc(), { ips: _ips });
  }

  /* ── DOM helpers ───────────────────────────────────────────────────────── */
  function $id(id) { return document.getElementById(id); }

  function showScreen(name) {
    ['loading', 'login', 'changepwd', 'setup', 'error', 'blocked'].forEach(s => {
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

  <!-- Blocked -->
  <div id="bcot-scr-blocked" style="display:none;text-align:center;padding:8px 0;">
    <div style="font-size:44px;margin-bottom:14px;">🚫</div>
    <h3 style="margin:0 0 10px;font-size:18px;color:#dc2626;font-weight:700;">Access Restricted</h3>
    <p style="margin:0 0 20px;font-size:13px;color:#374151;line-height:1.7;">
      This device is not registered and the maximum limit of
      <strong>${MAX_IPS} devices</strong> has been reached.
      <br>Please contact your administrator to request access.
    </p>
    <div style="border-top:1px solid #f3f4f6;padding-top:18px;display:flex;
                flex-direction:column;gap:8px;align-items:center;">
      <a href="#" onclick="event.preventDefault(); BCOT_AUTH._adminBypass();"
        style="font-size:12px;color:#1a4f8b;text-decoration:underline;">
        🔑 Administrator? Manage device access
      </a>
      <a href="#" onclick="event.preventDefault(); location.reload();"
        style="font-size:11px;color:#9ca3af;text-decoration:underline;">
        ↻ Reload page
      </a>
    </div>
  </div>

  <!-- Login -->
  <div id="bcot-scr-login" style="display:none;">
    <h2 style="margin:0 0 4px;font-size:21px;color:#1a4f8b;font-weight:700;">${title}</h2>
    <p style="margin:0 0 28px;font-size:12px;color:#6b7280;letter-spacing:.02em;">
      KAMC-WR — Pharmaceutical Care Department
    </p>
    <label style="display:block;font-size:11px;font-weight:700;letter-spacing:.07em;
                  color:#374151;margin-bottom:6px;">USER</label>
    <select id="bcot-login-user"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
             font-size:13px;margin-bottom:18px;background:#fff;box-sizing:border-box;">
    </select>
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

  /* ── User dropdown ─────────────────────────────────────────────────────── */
  function buildUserDropdown() {
    const sel = $id('bcot-login-user');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select user —</option>' +
      _users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
  }

  /* ── Login actions ─────────────────────────────────────────────────────── */
  function doLogin() {
    const id    = $id('bcot-login-user')?.value;
    const pwd   = $id('bcot-login-pwd')?.value;
    const errEl = $id('bcot-login-err');
    if (errEl) errEl.textContent = '';
    if (!id)  { if (errEl) errEl.textContent = 'Please select a user.'; return; }
    const user = _users.find(u => u.id === id);
    if (!user || user.password !== pwd) {
      if (errEl) errEl.textContent = 'Incorrect password.';
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
      await saveUsers();
    } catch (e) { console.error('Auth save error:', e); }
    if ($id('bcot-new-pwd'))     $id('bcot-new-pwd').value = '';
    if ($id('bcot-confirm-pwd')) $id('bcot-confirm-pwd').value = '';
    _finishLogin(_pendingUser);
  }

  async function doSetup() {
    const name  = ($id('bcot-setup-name')?.value || '').trim();
    const errEl = $id('bcot-setup-err');
    if (errEl) errEl.textContent = '';
    if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return; }
    const user = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                   name, password: '12345', firstLogin: true };
    _users = [user];
    try {
      await saveUsers();
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
                               confirmLabel = 'Submit' } = {}) {
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
    _pendingUser = null;
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
  }

  /* ══════════════════════════════════════════════════════════════════════════
     IP Access Control
     ══════════════════════════════════════════════════════════════════════════ */

  /** Fetch this device's public IP from ipify.org (5 s timeout). */
  async function _getMyIP() {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch('https://api64.ipify.org?format=json', { signal: ctrl.signal });
      clearTimeout(tid);
      const data = await resp.json();
      return data.ip || null;
    } catch { return null; }
  }

  /**
   * Check whether this device's IP is allowed.
   * - IP detection fails      → allow (password still protects the app)
   * - IP already in list      → update lastSeen/visits, allow
   * - IP new + slots < MAX    → auto-add, allow
   * - IP new + list full      → block
   */
  async function _checkIP() {
    _myIP = await _getMyIP();
    if (!_myIP) return true;          // can't detect IP — fall through to login

    try {
      await loadIPs();
    } catch { return true; }          // can't read list — fall through to login

    const now      = new Date().toISOString();
    const existing = _ips.find(e => e.ip === _myIP);

    if (existing) {
      existing.lastSeen = now;
      existing.visits   = (existing.visits || 0) + 1;
      try { await saveIPs(); } catch { /* silent — non-critical */ }
      return true;
    }

    // New IP
    if (_ips.length >= MAX_IPS) return false;   // ← blocked

    _ips.push({ ip: _myIP, label: '', firstSeen: now, lastSeen: now, visits: 1 });
    try { await saveIPs(); } catch { /* silent */ }
    return true;
  }

  /** Called from "Administrator?" link on the blocked screen. */
  async function _adminBypass() {
    const pwd = (window.BCOT_OT_OVERRIDE_PASSWORD || '').trim();
    if (!pwd) {
      await _bcotAlert('Override password is not configured on this page.', 'Error');
      return;
    }
    const entered = await _bcotPrompt(
      'Enter the administrator override password to manage device access.',
      { title: '🔑 Admin Override', placeholder: 'Override password',
        type: 'password', confirmLabel: 'Unlock' }
    );
    if (entered === null) return;
    if (entered.trim() !== pwd) {
      await _bcotAlert('Incorrect password.', 'Access Denied');
      return;
    }
    await openIPManager();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     User Manager
     ══════════════════════════════════════════════════════════════════════════ */
  async function openUserManager() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await loadUsers();
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
<div style="background:#fff;border-radius:14px;padding:28px 28px 22px;width:480px;
            max-width:94vw;max-height:86vh;overflow-y:auto;
            box-shadow:0 8px 32px rgba(0,0,0,.2);">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
    <h3 style="margin:0;font-size:16px;color:#1a4f8b;">👥 Login Users</h3>
    <button onclick="document.getElementById('bcot-um-modal').remove();"
      style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;
             line-height:1;padding:0 4px;">&times;</button>
  </div>

  <div id="bcot-um-list" style="margin-bottom:20px;"></div>

  <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">ADD USER</div>
    <div style="display:flex;gap:8px;">
      <input id="bcot-um-newname" type="text" placeholder="Full name"
        style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;"
        onkeydown="if(event.key==='Enter') BCOT_AUTH.umAddUser();" />
      <button onclick="BCOT_AUTH.umAddUser();"
        style="padding:8px 16px;background:#1a4f8b;color:#fff;border:none;
               border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
        + Add
      </button>
    </div>
    <div id="bcot-um-err"
      style="color:#dc2626;font-size:11px;min-height:16px;margin-top:5px;"></div>
    <p style="margin:10px 0 0;font-size:11px;color:#9ca3af;">
      New users get default password <strong>12345</strong> and are asked to change it on first login.
    </p>
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
    list.innerHTML = _users.map(u => `
<div style="display:flex;align-items:center;justify-content:space-between;
            padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:7px;
            background:#f9fafb;">
  <div>
    <span style="font-size:13px;font-weight:600;color:#1f2937;">${u.name}</span>
    ${u.firstLogin
      ? '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:10px;margin-left:6px;">First login pending</span>'
      : ''}
  </div>
  <div style="display:flex;gap:6px;">
    <button onclick="BCOT_AUTH.umResetPwd('${u.id}');"
      style="padding:5px 10px;background:#d97706;color:#fff;border:none;
             border-radius:6px;font-size:11px;cursor:pointer;">Reset</button>
    <button onclick="BCOT_AUTH.umRemoveUser('${u.id}');"
      style="padding:5px 10px;background:#dc2626;color:#fff;border:none;
             border-radius:6px;font-size:11px;cursor:pointer;">Remove</button>
  </div>
</div>`).join('');
  }

  async function umAddUser() {
    const name  = ($id('bcot-um-newname')?.value || '').trim();
    const errEl = $id('bcot-um-err');
    if (errEl) errEl.textContent = '';
    if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return; }
    if (_users.find(u => u.name.toLowerCase() === name.toLowerCase())) {
      if (errEl) errEl.textContent = 'A user with that name already exists.'; return;
    }
    _users.push({ id: _uid(), name, password: '12345', firstLogin: true });
    try {
      await saveUsers();
      if ($id('bcot-um-newname')) $id('bcot-um-newname').value = '';
      _renderUserList();
    } catch (e) { if (errEl) errEl.textContent = 'Save failed: ' + e.message; }
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

  /* ══════════════════════════════════════════════════════════════════════════
     IP Manager
     ══════════════════════════════════════════════════════════════════════════ */
  async function openIPManager() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await loadIPs();
      if (!_myIP) _myIP = await _getMyIP();   // for "This device" badge
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
<div style="background:#fff;border-radius:14px;padding:28px 28px 22px;width:580px;
            max-width:94vw;max-height:86vh;overflow-y:auto;
            box-shadow:0 8px 32px rgba(0,0,0,.2);">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <h3 style="margin:0;font-size:16px;color:#1a4f8b;">🌐 IP Access Control</h3>
    <button onclick="document.getElementById('bcot-ip-modal').remove();"
      style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;
             line-height:1;padding:0 4px;">&times;</button>
  </div>

  <!-- Usage counter + progress bar -->
  <div id="bcot-ip-counter"
    style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;
           padding:10px 14px;margin-bottom:18px;font-size:13px;color:#0369a1;"></div>

  <!-- IP list -->
  <div id="bcot-ip-list" style="margin-bottom:20px;"></div>

  <!-- Manual add -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">
      ADD DEVICE MANUALLY
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <input id="bcot-ip-newip" type="text" placeholder="IP address"
        style="flex:1;min-width:140px;padding:8px 10px;border:1px solid #d1d5db;
               border-radius:7px;font-size:12px;" />
      <input id="bcot-ip-newlabel" type="text" placeholder="Label (optional)"
        style="flex:1;min-width:130px;padding:8px 10px;border:1px solid #d1d5db;
               border-radius:7px;font-size:12px;"
        onkeydown="if(event.key==='Enter') BCOT_AUTH.ipManualAdd();" />
      <button onclick="BCOT_AUTH.ipManualAdd();"
        style="padding:8px 16px;background:#1a4f8b;color:#fff;border:none;
               border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
        + Add
      </button>
    </div>
    <div id="bcot-ip-err"
      style="color:#dc2626;font-size:11px;min-height:16px;margin-top:5px;"></div>
    <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">
      Devices are registered automatically on first visit. Use this to pre-register a device.
    </p>
  </div>
</div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    _renderIPList();
  }

  function _renderIPList() {
    const list    = $id('bcot-ip-list');
    const counter = $id('bcot-ip-counter');
    if (!list) return;

    /* ── usage counter + progress bar ── */
    if (counter) {
      const used     = _ips.length;
      const pct      = Math.min(100, Math.round(used / MAX_IPS * 100));
      const barColor = used >= MAX_IPS      ? '#dc2626'
                     : used >= MAX_IPS - 2  ? '#f59e0b'
                     :                        '#0ea5e9';
      counter.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center;">` +
        `<strong>${used} / ${MAX_IPS} device slots used</strong>` +
        `<span style="font-size:11px;color:${used >= MAX_IPS ? '#dc2626' : '#6b7280'};">` +
        `${MAX_IPS - used} slot${MAX_IPS - used !== 1 ? 's' : ''} remaining</span></div>` +
        `<div style="height:6px;background:#e0f2fe;border-radius:3px;margin-top:8px;">` +
        `<div style="height:100%;background:${barColor};border-radius:3px;` +
        `width:${pct}%;transition:width .3s;"></div></div>`;
    }

    if (!_ips.length) {
      list.innerHTML = '<p style="color:#9ca3af;font-size:13px;margin:0;">No devices registered yet.</p>';
      return;
    }

    const fmtDate = iso => {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleDateString('en-GB',
          { day: '2-digit', month: 'short', year: 'numeric' });
      } catch { return iso.slice(0, 10); }
    };

    list.innerHTML = _ips.map((e, i) => {
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
      <div style="font-size:11px;color:#9ca3af;">
        First seen: ${fmtDate(e.firstSeen)}
        &nbsp;·&nbsp; Last visit: ${fmtDate(e.lastSeen)}
        &nbsp;·&nbsp; Visits: ${e.visits || 1}
      </div>
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
      `Remove <strong>${entry.label || entry.ip}</strong> from the allowed list?<br>` +
      `This frees one slot. The device will be auto-registered on its next visit ` +
      `(if a slot is available).`,
      'Remove Device', { confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    _ips.splice(idx, 1);
    try {
      await saveIPs();
      _renderIPList();
    } catch (e) { await _bcotAlert('Save failed — check connection.', 'Error'); }
  }

  async function ipManualAdd() {
    const ip    = ($id('bcot-ip-newip')?.value    || '').trim();
    const label = ($id('bcot-ip-newlabel')?.value || '').trim();
    const errEl = $id('bcot-ip-err');
    if (errEl) errEl.textContent = '';
    if (!ip) { if (errEl) errEl.textContent = 'IP address is required.'; return; }
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
    const isIPv6 = ip.includes(':');
    if (!isIPv4 && !isIPv6) {
      if (errEl) errEl.textContent = 'Enter a valid IP address (e.g. 192.168.1.1).'; return;
    }
    if (_ips.find(e => e.ip === ip)) {
      if (errEl) errEl.textContent = 'This IP is already in the list.'; return;
    }
    if (_ips.length >= MAX_IPS) {
      if (errEl) errEl.textContent = `Limit reached (${MAX_IPS} devices). Remove one first.`;
      return;
    }
    const now = new Date().toISOString();
    _ips.push({ ip, label, firstSeen: now, lastSeen: now, visits: 0 });
    try {
      await saveIPs();
      if ($id('bcot-ip-newip'))    $id('bcot-ip-newip').value    = '';
      if ($id('bcot-ip-newlabel')) $id('bcot-ip-newlabel').value = '';
      _renderIPList();
    } catch (e) { if (errEl) errEl.textContent = 'Save failed: ' + e.message; }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Area Manager — manage areas list + per-area user access
     ══════════════════════════════════════════════════════════════════════════ */
  const _AREAS_LS   = 'BCOT_AREAS_LIST_V1';
  const _STAFF_LS   = 'BCOT_STAFF_RECORDS_V2';

  function _getLocalAreas() {
    try { return JSON.parse(localStorage.getItem(_AREAS_LS) || '[]') || []; } catch { return []; }
  }
  function _setLocalAreas(list) {
    localStorage.setItem(_AREAS_LS, JSON.stringify(list.sort()));
  }

  /** Save area list into the cloud staff document (merge — does not touch records). */
  async function _saveAreasToCloud(areas) {
    if (!window.FB || typeof window.FB.setDoc !== 'function' || !_key) return;
    await window.FB.setDoc(
      window.FB.doc(window.FB.db, 'bcot_overtime_secure', _key, 'staff_named', 'STAFF_POOL'),
      { areasList: areas },
      { merge: true }
    );
  }

  async function openAreaManager() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await loadUsers();
    } catch (e) {
      await _bcotAlert('Could not load users — check your connection.', 'Connection Error');
      return;
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
    const input = await _bcotPrompt(
      `Enter a new code for area <strong>${oldName}</strong>:`,
      { title: '✏️ Rename Area', placeholder: 'New area code', confirmLabel: 'Rename' }
    );
    if (input === null) return;
    const newName = input.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '').slice(0, 20);
    if (!newName || newName === oldName) return;

    const areas = _getLocalAreas();
    if (areas.includes(newName)) { await _bcotAlert(`Area "${newName}" already exists.`, 'Error'); return; }

    // Update areas list
    const idx = areas.indexOf(oldName);
    if (idx >= 0) areas[idx] = newName;
    _setLocalAreas(areas);

    // Rename in staff records in localStorage
    try {
      const staff = JSON.parse(localStorage.getItem(_STAFF_LS) || '[]');
      let changed = false;
      staff.forEach(s => {
        if (!s.area) return;
        const parts = s.area.split(',').map(a => a.trim().toUpperCase());
        if (parts.includes(oldName)) {
          s.area = parts.map(a => a === oldName ? newName : a).join(',');
          changed = true;
        }
      });
      if (changed) localStorage.setItem(_STAFF_LS, JSON.stringify(staff));
    } catch {}

    // Update user area permissions
    let usersChanged = false;
    _users.forEach(u => {
      if (Array.isArray(u.areas)) {
        const i = u.areas.indexOf(oldName);
        if (i >= 0) { u.areas[i] = newName; usersChanged = true; }
      }
    });

    try {
      await _saveAreasToCloud(_getLocalAreas());
      if (usersChanged) await saveUsers();
      _renderAreaList();
    } catch (e) { await _bcotAlert('Save failed — ' + e.message, 'Error'); }
  }

  async function areaRemove(name) {
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

    // Remove from user permissions
    let usersChanged = false;
    _users.forEach(u => {
      if (Array.isArray(u.areas)) {
        const before = u.areas.length;
        u.areas = u.areas.filter(a => a !== name);
        if (u.areas.length !== before) usersChanged = true;
      }
    });

    try {
      await _saveAreasToCloud(areas);
      if (usersChanged) await saveUsers();
      _renderAreaList();
    } catch (e) { await _bcotAlert('Save failed — ' + e.message, 'Error'); }
  }

  /** Open the per-area access dialog — check/uncheck which users can see this area. */
  async function areaAccess(areaName) {
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
              // Convert from unrestricted to specific: all areas EXCEPT this one
              u.areas = allAreas.filter(a => a !== areaName);
            }
            // If shouldHave: keep 'ALL', no change
          } else if (Array.isArray(u.areas)) {
            if (shouldHave && !u.areas.includes(areaName)) {
              u.areas.push(areaName); u.areas.sort();
            } else if (!shouldHave) {
              u.areas = u.areas.filter(a => a !== areaName);
            }
          }
          // If user now has all areas → simplify back to 'ALL'
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

  /** Called by "✓ All" / "✗ None" buttons inside the access dialog. */
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

    // 5. IP access check — runs before showing login
    const ipAllowed = await _checkIP();
    if (!ipAllowed) {
      showScreen('blocked');
      return;
    }

    // 6. Load user list
    try {
      await loadUsers();
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
    // User manager
    openUserManager,
    umAddUser,
    umResetPwd,
    umRemoveUser,
    // IP manager
    openIPManager,
    ipEditLabel,
    ipRemove,
    ipManualAdd,
    _adminBypass,
    // Area manager
    openAreaManager,
    areaAdd,
    areaRename,
    areaRemove,
    areaAccess,
    _arCheckAll,
    // Dialogs
    alert  : _bcotAlert,
    confirm: _bcotConfirm,
    prompt : _bcotPrompt,
  };

})();
