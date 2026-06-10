/* ═══════════════════════════════════════════════════════════════════════════
   BCOT Rota — App Authentication Guard  (js/auth.js)
   ───────────────────────────────────────────────────────────────────────────
   • Fullscreen overlay on every page — nothing visible until authenticated
   • Users stored in Firebase: bcot_overtime_secure/[KEY]/app_auth/USERS
   • Session in localStorage, 12-hour expiry, shared across all tabs
   • First login forces password change (default: 12345)
   • Admin user manager in index.html (protected by OT override password)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */
  const SESSION_KEY  = 'BCOT_AUTH_SESSION_V1';
  const SESSION_TTL  = 12 * 60 * 60 * 1000;   // 12 hours

  let _key         = '';
  let _users       = [];
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
      id: user.id, name: user.name, ts: Date.now()
    }));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  /* ── Firebase helpers ──────────────────────────────────────────────────── */
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
    <div style="font-size:14px;font-weight:600;color:#1a4f8b;">Checking authentication…</div>
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

  /* ── Login actions (called from HTML onclick) ──────────────────────────── */
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

  /* ── Custom dialogs (replaces alert / confirm / prompt) ───────────────── */
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
     User Manager — called from index.html admin panel
     ══════════════════════════════════════════════════════════════════════════ */
  async function openUserManager() {
    if (!_key) { await _bcotAlert('Authentication module is not initialized.', 'Error'); return; }
    try {
      let t = 0;
      while (!window.FB && t++ < 40) await new Promise(r => setTimeout(r, 50));
      await loadUsers();
    } catch (e) { await _bcotAlert('Could not load users — check your connection.', 'Connection Error'); return; }

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

  <!-- User list -->
  <div id="bcot-um-list" style="margin-bottom:20px;"></div>

  <!-- Add user -->
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
    ${u.firstLogin ? '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:10px;margin-left:6px;">First login pending</span>' : ''}
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
      'Reset Password', { confirmLabel: 'Reset', danger: false });
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
     Main init — runs automatically on every page
     ══════════════════════════════════════════════════════════════════════════ */
  (async function init() {
    // 1. Show overlay immediately (before first paint)
    createOverlay();
    showScreen('loading');

    // 2. Get app key
    _key = (window.BCOT_APP_KEY || '').trim();
    if (!_key) {
      $id('bcot-error-msg').textContent = 'config.js not found — app cannot start.';
      showScreen('error');
      return;
    }

    // 3. Fast path: valid session already exists
    const session = getSession();
    if (session) {
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

    // 5. Load users from Firebase
    try {
      await loadUsers();
    } catch (e) {
      $id('bcot-error-msg').textContent = 'Could not load user list — check connection.';
      showScreen('error');
      return;
    }

    // 6. No users yet → first-time setup
    if (!_users.length) {
      showScreen('setup');
      return;
    }

    // 7. Show login form
    buildUserDropdown();
    showScreen('login');
  })();

  /* ── Public API ────────────────────────────────────────────────────────── */
  window.BCOT_AUTH = {
    doLogin,
    doChangePwd,
    doSetup,
    doLogout,
    openUserManager,
    umAddUser,
    umResetPwd,
    umRemoveUser,
    alert  : _bcotAlert,
    confirm: _bcotConfirm,
    prompt : _bcotPrompt,
  };

})();
