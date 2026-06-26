const STAFF_KEY = 'BCOT_STAFF_RECORDS_V2';
const AREAS_KEY = 'BCOT_AREAS_LIST_V1';
let KEY = '';
let users = [], requests = [], rules = {}, currentUser = null, currentTab = '';
let _editRuleArea = null;

// ── Firebase refs ─────────────────────────────────────────────────────────────
function reqsCol()     { return window.FB.collection(window.FB.db,'bcot_overtime_secure',KEY,'ext_requests'); }
function reqDoc(id)    { return window.FB.doc(window.FB.db,'bcot_overtime_secure',KEY,'ext_requests',id); }
function rulesDocRef() { return window.FB.doc(window.FB.db,'bcot_overtime_secure',KEY,'config','ext_rules'); }

async function updateReq(id, d) {
  await window.FB.updateDoc(reqDoc(id), d);
  const i = requests.findIndex(r => r.id === id);
  if (i >= 0) Object.assign(requests[i], d);
}
async function loadAll() {
  const snap = await window.FB.getDocs(reqsCol());
  requests = [];
  snap.forEach(d => requests.push({ id: d.id, ...d.data() }));
  requests.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
}
async function loadRules() {
  try {
    const snap = await window.FB.getDoc(rulesDocRef());
    rules = snap.exists() ? (snap.data() || {}) : {};
  } catch (e) { rules = {}; }
}
async function persistRules() {
  await window.FB.setDoc(rulesDocRef(), rules);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function se(id) { return document.getElementById(id); }
function show(id) { const e = se(id); if (e) e.style.display = ''; }
function hide(id) { const e = se(id); if (e) e.style.display = 'none'; }
function setErr(id, msg) { const e = se(id); if (!e) return; e.textContent = msg; e.style.display = msg ? 'block' : 'none'; }

function calcHours(s, e) {
  if (!s || !e) return 0;
  const [sh,sm] = s.split(':').map(Number), [eh,em] = e.split(':').map(Number);
  const d = (eh*60+em) - (sh*60+sm);
  return d > 0 ? Math.round(d/60*100)/100 : 0;
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d; }
}
function statusBadge(r) {
  const s = typeof r === 'string' ? r : (r.status || '');
  if (s === 'granted')          return `<span class="badge b-granted"><i class="bi bi-check-circle-fill"></i> Granted</span>`;
  if (s === 'cancelled')        return `<span class="badge b-cancelled"><i class="bi bi-x-circle-fill"></i> Rejected</span>`;
  if (s === 'manager_approved') return `<span class="badge b-mgr"><i class="bi bi-check-circle"></i> Mgr Approved</span>`;
  if (typeof r === 'object') {
    const done = (r.approvals || []).filter(a => a.action === 'approved').length;
    const req  = r.approvalsRequired || 1;
    return `<span class="badge b-pending"><i class="bi bi-hourglass-split"></i> Pending ${done}/${req}</span>`;
  }
  return `<span class="badge b-pending"><i class="bi bi-hourglass-split"></i> Pending</span>`;
}
function waBtn(phone, msg, label='<i class="bi bi-whatsapp"></i> WhatsApp') {
  const n = (phone || '').replace(/\D/g,''); if (!n) return '';
  return `<a class="wa-btn" href="https://wa.me/${n}?text=${encodeURIComponent(msg)}" target="_blank">${label}</a>`;
}
function localStaff(area) {
  try {
    const all = JSON.parse(localStorage.getItem(STAFF_KEY) || '[]') || [];
    if (!area || area === 'ALL') return all.map(s => s.name).filter(Boolean);
    return all.filter(s => (s.area||'').toUpperCase().split(',').map(x=>x.trim()).includes(area.toUpperCase())).map(s=>s.name).filter(Boolean);
  } catch { return []; }
}
function localAreas() { try { return JSON.parse(localStorage.getItem(AREAS_KEY)||'[]')||[]; } catch { return []; } }

// ── App init ──────────────────────────────────────────────────────────────────
async function startExtension() {
  KEY = (window.BCOT_APP_KEY || '').trim();
  if (!KEY) { document.body.innerHTML = '<div style="padding:40px;color:red;font-weight:700;text-align:center;">config.js not found.</div>'; return; }
  let t = 0; while (!window.FB && t++ < 50) await new Promise(r => setTimeout(r,100));
  if (!window.FB) { document.body.innerHTML = '<div style="padding:40px;color:red;">Firebase failed to load.</div>'; return; }

  const session = window.BCOT_AUTH?.getSession();
  if (!session) return;

  const appRole = session.app_role || 'user';
  show('appShell');
  se('userNameBadge').textContent = session.name;

  if (appRole === 'user') {
    se('roleBadge').textContent = '⛔ No Access';
    se('appNav').innerHTML = '';
    se('appBody').innerHTML = `<div style="text-align:center;padding:60px 20px;color:#6b7280;">
      <i class="bi bi-lock-fill" style="font-size:40px;color:#9ca3af;margin-bottom:16px;display:block;"></i>
      <div style="font-size:15px;font-weight:700;color:#374151;margin-bottom:8px;">No Extension Access</div>
      <div style="font-size:13px;">Your account does not have access to the extension system.</div>
    </div>`;
    return;
  }

  try {
    users = await window.BCOT_AUTH.fetchExtUsers();
    await loadRules();
    await loadAll();
  } catch (e) {
    se('appBody').innerHTML = '<div style="padding:40px;color:red;">Failed to load data. Check connection.</div>';
    return;
  }

  const myAreas = appRole === 'charge'
    ? Object.entries(rules).filter(([,rule]) => rule.chargePersonId === session.id).map(([area]) => area)
    : [];

  currentUser = { id: session.id, name: session.name, role: appRole, areas: myAreas };
  launchApp();
}

(function () {
  if (window.BCOT_AUTH && window.BCOT_AUTH.getSession()) { startExtension(); }
  else { window.addEventListener('bcotAuth', startExtension, { once: true }); }
})();

// ── Shell ─────────────────────────────────────────────────────────────────────
function launchApp() {
  show('appShell');
  se('userNameBadge').textContent = currentUser.name;
  const rl = { charge:'<i class="bi bi-person-badge"></i> Charge Person', admin:'<i class="bi bi-shield-lock"></i> Administrator' };
  const rc = { charge:'rgba(15,118,110,.65)', admin:'rgba(124,58,237,.65)' };
  const b  = se('roleBadge');
  b.innerHTML        = rl[currentUser.role] || currentUser.role;
  b.style.background = rc[currentUser.role] || 'rgba(255,255,255,.15)';
  buildNav();
}

function buildNav() {
  const tabs = {
    charge: [
      { id:'sv_new',    label:'<i class="bi bi-plus-circle"></i> New Request' },
      { id:'sv_mine',   label:'<i class="bi bi-list-check"></i> My Requests' }
    ],
    admin: [
      { id:'adm_rules', label:'<i class="bi bi-gear-fill"></i> Rules' },
      { id:'adm_pend',  label:'<i class="bi bi-clock"></i> Pending' },
      { id:'adm_hist',  label:'<i class="bi bi-folder2"></i> History' },
      { id:'report',    label:'<i class="bi bi-bar-chart-line"></i> Report' }
    ]
  };
  const myTabs = tabs[currentUser.role] || [];
  se('appNav').innerHTML = myTabs.map(t =>
    `<button class="nav-tab" data-tab="${t.id}" onclick="switchTab('${t.id}')">${t.label}</button>`
  ).join('');
  if (myTabs.length) switchTab(myTabs[0].id);
}

function switchTab(id) {
  currentTab = id;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  renderTab(id);
}

function renderTab(id) {
  const body = se('appBody'); if (!body) return;
  const map = {
    sv_new:    renderNewReq,
    sv_mine:   renderMyReqs,
    adm_rules: renderRulesTab,
    adm_pend:  renderAdminPending,
    adm_hist:  renderAdminHist,
    report:    renderReportTab
  };
  body.innerHTML = (map[id] || (() => ''))();
  if (id === 'sv_new') refreshStaffList();
}

// ── Shared card ───────────────────────────────────────────────────────────────
function reqCard(r) {
  return `<div class="req-card">
    <div class="req-card-hdr">
      ${statusBadge(r)}
      <b>${esc(r.area)}</b>
      <span style="font-size:11px;color:#6b7280;">${fmtDate(r.date)} · ${r.startTime||''}–${r.endTime||''}</span>
      <b style="color:var(--primary);">${r.hours}h</b>
    </div>
    <div style="margin:6px 0;">${(r.staffList||[]).map(n=>`<span class="staff-chip">${esc(n)}</span>`).join('')}</div>
    <div class="req-card-body">
      <b>By:</b> ${esc(r.supervisorName||'—')} &nbsp;·&nbsp; <b>Submitted:</b> ${fmtDate(r.submittedAt)}<br>
      <b>Justification:</b> ${esc(r.justification||'—')}
      ${(r.approvals||[]).map(a =>
        `<br><span style="color:${a.action==='approved'?'var(--green)':'var(--red)'};">
          <b>${esc(a.byName)}:</b> <i class="bi ${a.action==='approved'?'bi-check-circle-fill':'bi-x-circle-fill'}"></i> ${a.action==='approved'?'Approved':'Rejected'}${a.note?' — '+esc(a.note):''}
        </span>`
      ).join('')}
    </div>
  </div>`;
}

// ── Charge: New Request ───────────────────────────────────────────────────────
function renderNewReq() {
  const myAreas = currentUser.areas || [];
  if (!myAreas.length) return `
    <div class="section-title">New Extension Request</div>
    <div class="empty-state">
      <i class="bi bi-gear" style="font-size:30px;color:#9ca3af;margin-bottom:12px;display:block;"></i>
      No areas assigned to you yet.<br>Ask an administrator to configure the Extension Rules.
    </div>`;
  const aOpts = myAreas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  return `<div class="section-title">New Extension Request</div>
  <div class="panel" style="max-width:620px;">
    <div class="fg"><label>Area</label><select id="reqArea" onchange="refreshStaffList()">${aOpts}</select></div>
    <div class="fg"><label>Staff Members <span style="font-weight:400;color:#6b7280;">(select one or more)</span></label>
      <div class="staff-grid" id="staffGrid"><span style="color:#9ca3af;font-size:12px;">Loading…</span></div>
    </div>
    <div class="fg"><label>Date</label><input type="date" id="reqDate" value="${new Date().toISOString().slice(0,10)}"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px;">
      <div class="fg" style="margin:0;"><label>Start Time</label><input type="time" id="reqStart" onchange="calcHrsDisplay()"/></div>
      <div class="fg" style="margin:0;"><label>End Time</label>  <input type="time" id="reqEnd"   onchange="calcHrsDisplay()"/></div>
      <div class="hours-badge" id="hrsDisplay">0 h</div>
    </div>
    <div class="fg"><label>Justification</label><textarea id="reqJust" placeholder="Reason for this extension…"></textarea></div>
    <button class="btn btn-primary" onclick="submitReq()">Submit Request</button>
    <div class="err-msg" id="reqErr"></div>
    <div class="ok-msg"  id="reqOk"></div>
  </div>`;
}

function refreshStaffList() {
  const area = se('reqArea')?.value, grid = se('staffGrid'); if (!grid) return;
  const staff = localStaff(area);
  if (!staff.length) { grid.innerHTML = '<span style="color:#9ca3af;font-size:12px;">No staff for this area.</span>'; return; }
  grid.innerHTML = staff.map(n => `<label class="staff-item"><input type="checkbox" class="sc" value="${esc(n)}"/> ${esc(n)}</label>`).join('');
}

function calcHrsDisplay() {
  const h = calcHours(se('reqStart')?.value, se('reqEnd')?.value);
  const el = se('hrsDisplay'); if (!el) return;
  el.textContent = h > 0 ? h + ' h' : '0 h';
  el.style.color = h > 0 ? 'var(--primary)' : '#9ca3af';
}

async function submitReq() {
  setErr('reqErr','');
  const area  = se('reqArea')?.value;
  const staff = Array.from(document.querySelectorAll('.sc:checked')).map(c => c.value);
  const date  = se('reqDate')?.value;
  const start = se('reqStart')?.value;
  const end   = se('reqEnd')?.value;
  const just  = (se('reqJust')?.value || '').trim();

  if (!area)         { setErr('reqErr','Select an area.'); return; }
  if (!staff.length) { setErr('reqErr','Select at least one staff member.'); return; }
  if (!date||!start||!end) { setErr('reqErr','Set date and time range.'); return; }
  const hours = calcHours(start, end);
  if (hours <= 0)    { setErr('reqErr','End time must be after start time.'); return; }
  if (!just)         { setErr('reqErr','Justification is required.'); return; }

  const rule = rules[area];
  if (!rule) { setErr('reqErr','No approval rule configured for this area. Contact an administrator.'); return; }

  const dt  = new Date(date);
  const req = {
    supervisorId: currentUser.id, supervisorName: currentUser.name,
    area, staffList: staff, date, startTime: start, endTime: end, hours, justification: just,
    status: 'pending', month: dt.getMonth()+1, year: dt.getFullYear(),
    approverIds: rule.approverIds || [], approvalsRequired: rule.approvalsRequired || 1,
    approvals: [], submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };

  try {
    const ref = await window.FB.addDoc(reqsCol(), req);
    requests.unshift({ id: ref.id, ...req });
    if (se('reqJust')) se('reqJust').value = '';
    document.querySelectorAll('.sc:checked').forEach(c => c.checked = false);
    if (se('hrsDisplay')) se('hrsDisplay').textContent = '0 h';
    const ok = se('reqOk'); ok.textContent = '✅ Request submitted — awaiting approval'; ok.style.display = 'block';
    setTimeout(() => ok.style.display = 'none', 4500);
  } catch (e) { setErr('reqErr','Failed: '+(e?.message||e)); }
}

// ── Charge: My Requests ───────────────────────────────────────────────────────
function renderMyReqs() {
  const mine = requests.filter(r => r.supervisorId === currentUser.id);
  if (!mine.length) return `<div class="section-title">My Requests</div><div class="empty-state">No requests submitted yet.</div>`;
  return `<div class="section-title">My Requests (${mine.length})</div>` + mine.map(r => reqCard(r)).join('');
}

// ── Admin: Rules Setup ────────────────────────────────────────────────────────
function renderRulesTab() {
  const areas   = localAreas();
  const admins  = users.filter(u => (u.app_role||'user') === 'admin');
  const charges = users.filter(u => (u.app_role||'user') === 'charge');

  if (!areas.length) return `
    <div class="section-title"><i class="bi bi-gear-fill"></i> Extension Approval Rules</div>
    <div class="empty-state">No areas found. Create areas in the main rota first.</div>`;

  const rows = areas.map(area => {
    if (_editRuleArea === area) return editRuleRow(area, rules[area], charges, admins);
    const rule = rules[area];
    if (!rule) return `<tr>
      <td><b>${esc(area)}</b></td>
      <td colspan="3" style="color:#9ca3af;font-style:italic;font-size:11px;">Not configured</td>
      <td><button class="btn btn-sm btn-primary" onclick="editRule('${esc(area)}')"><i class="bi bi-plus-circle"></i> Configure</button></td>
    </tr>`;
    const cp  = users.find(u => u.id === rule.chargePersonId);
    const aps = (rule.approverIds||[]).map(id => users.find(u=>u.id===id)?.name||'?').join(' · ');
    return `<tr>
      <td><b>${esc(area)}</b></td>
      <td>${esc(cp?.name || rule.chargePersonName || '—')}</td>
      <td style="text-align:center;">${rule.approvalsRequired||1}</td>
      <td>${esc(aps||'—')}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editRule('${esc(area)}')"><i class="bi bi-pencil"></i> Edit</button>
        <button class="btn btn-sm btn-red" style="margin-left:4px;" onclick="deleteRule('${esc(area)}')"><i class="bi bi-x-lg"></i></button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="section-title"><i class="bi bi-gear-fill"></i> Extension Approval Rules</div>
    <p style="font-size:12px;color:#6b7280;margin-bottom:16px;">
      Configure who submits and who approves extension requests for each area.
    </p>
    <div style="overflow-x:auto;">
      <table class="setup-table">
        <thead><tr>
          <th style="width:14%;">Area</th>
          <th style="width:22%;">Charge Person</th>
          <th style="width:10%;text-align:center;">Approvals</th>
          <th>Approvers</th>
          <th style="width:110px;">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function editRuleRow(area, existing, charges, admins) {
  const req = existing?.approvalsRequired || 1;
  const ap1 = (existing?.approverIds||[])[0] || '';
  const ap2 = (existing?.approverIds||[])[1] || '';

  const cOpts = charges.length
    ? charges.map(u => `<option value="${esc(u.id)}" ${existing?.chargePersonId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')
    : '<option value="">No charge persons available</option>';

  const aOpts = sel => ['<option value="">— Select —</option>',
    ...admins.map(u => `<option value="${esc(u.id)}" ${sel===u.id?'selected':''}>${esc(u.name)}</option>`)
  ].join('');

  return `<tr style="background:#eef2ff;">
    <td colspan="5" style="padding:16px;">
      <div style="font-weight:800;color:#3730a3;margin-bottom:12px;"><i class="bi bi-gear"></i> Configuring: <b>${esc(area)}</b></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;align-items:end;">
        <div class="fg" style="margin:0;"><label>Charge Person</label><select id="re_charge">${cOpts}</select></div>
        <div class="fg" style="margin:0;">
          <label>Approvals Required</label>
          <select id="re_count" onchange="document.getElementById('re_ap2wrap').style.display=this.value==='2'?'':'none'">
            <option value="1" ${req===1?'selected':''}>1 approval</option>
            <option value="2" ${req===2?'selected':''}>2 approvals</option>
          </select>
        </div>
        <div class="fg" style="margin:0;"><label>Approver 1</label><select id="re_ap1">${aOpts(ap1)}</select></div>
        <div class="fg" style="margin:0;" id="re_ap2wrap" ${req<2?'style="display:none"':''}>
          <label>Approver 2</label><select id="re_ap2">${aOpts(ap2)}</select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-green btn-sm" onclick="saveRule('${esc(area)}')"><i class="bi bi-floppy"></i> Save</button>
        <button class="btn btn-outline btn-sm" onclick="cancelEditRule()"><i class="bi bi-x-lg"></i> Cancel</button>
      </div>
      <div class="err-msg" id="re_err"></div>
    </td>
  </tr>`;
}

function editRule(area)   { _editRuleArea = area; switchTab('adm_rules'); }
function cancelEditRule() { _editRuleArea = null; switchTab('adm_rules'); }

async function saveRule(area) {
  const chargeId = se('re_charge')?.value;
  const count    = parseInt(se('re_count')?.value || '1');
  const ap1      = se('re_ap1')?.value;
  const ap2      = se('re_ap2')?.value;

  if (!chargeId)                      { setErr('re_err','Select a charge person.'); return; }
  if (!ap1)                           { setErr('re_err','Select Approver 1.'); return; }
  if (count === 2 && !ap2)            { setErr('re_err','Select Approver 2.'); return; }
  if (count === 2 && ap1 === ap2)     { setErr('re_err','Approvers must be different people.'); return; }

  const approverIds = count === 2 ? [ap1, ap2] : [ap1];
  rules[area] = {
    chargePersonId:    chargeId,
    chargePersonName:  users.find(u=>u.id===chargeId)?.name || '',
    approvalsRequired: count,
    approverIds,
    approverNames: approverIds.map(id => users.find(u=>u.id===id)?.name||'').filter(Boolean)
  };

  try {
    await persistRules();
    _editRuleArea = null;
    switchTab('adm_rules');
  } catch (e) { setErr('re_err','Save failed. Try again.'); }
}

async function deleteRule(area) {
  if (!confirm(`Remove the rule for ${area}?`)) return;
  delete rules[area];
  try { await persistRules(); switchTab('adm_rules'); }
  catch (e) { alert('Delete failed. Try again.'); }
}

// ── Admin: Pending Approvals ──────────────────────────────────────────────────
function renderAdminPending() {
  const list = requests.filter(r =>
    r.status === 'pending' &&
    (r.approverIds||[]).includes(currentUser.id) &&
    !(r.approvals||[]).some(a => a.by === currentUser.id)
  );
  const refreshBtn = `<button class="btn btn-sm btn-outline no-print" style="margin-bottom:14px;"
    onclick="loadAll().then(()=>renderTab('adm_pend'))"><i class="bi bi-arrow-clockwise"></i> Refresh</button>`;

  if (!list.length) return `
    <div class="section-title"><i class="bi bi-clock"></i> Pending Approvals</div>${refreshBtn}
    <div class="empty-state">No requests waiting for your approval.</div>`;

  return `<div class="section-title"><i class="bi bi-clock"></i> Pending Approvals (${list.length})</div>${refreshBtn}` +
    list.map(r => {
      const done = (r.approvals||[]).filter(a=>a.action==='approved').length;
      return `<div class="req-card">
        <div class="req-card-hdr">
          ${statusBadge(r)}
          <b>${esc(r.area)}</b>
          <span style="font-size:11px;color:#6b7280;">${fmtDate(r.date)} · ${r.startTime||''}–${r.endTime||''}</span>
          <b style="color:var(--primary);">${r.hours}h</b>
        </div>
        <div style="margin:6px 0;">${(r.staffList||[]).map(n=>`<span class="staff-chip">${esc(n)}</span>`).join('')}</div>
        <div class="req-card-body">
          <b>By:</b> ${esc(r.supervisorName||'—')} &nbsp;·&nbsp; <b>Submitted:</b> ${fmtDate(r.submittedAt)}<br>
          <b>Justification:</b> ${esc(r.justification||'—')}
          ${r.approvalsRequired>1&&done>0 ? `<br><b>Progress:</b> ${done}/${r.approvalsRequired} approvals received` : ''}
          ${(r.approvals||[]).map(a=>`<br><b>${esc(a.byName)}:</b> <i class="bi bi-check-circle-fill" style="color:var(--green);"></i> Approved${a.note?' — '+esc(a.note):''}`).join('')}
        </div>
        <div class="req-card-actions">
          <input type="text" id="an_${r.id}" placeholder="Note (optional)"
            style="flex:1;min-width:140px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;"/>
          <button class="btn btn-green btn-sm" onclick="adminApprove('${r.id}')"><i class="bi bi-check-lg"></i> Approve</button>
          <button class="btn btn-red   btn-sm" onclick="adminReject('${r.id}')"><i class="bi bi-x-lg"></i> Reject</button>
        </div>
      </div>`;
    }).join('');
}

async function adminApprove(id) {
  const note = (se('an_'+id)?.value||'').trim();
  const r = requests.find(x=>x.id===id); if (!r) return;

  const newApprovals = [...(r.approvals||[]), {
    by: currentUser.id, byName: currentUser.name,
    at: new Date().toISOString(), action: 'approved', note
  }];
  const approvedCount = newApprovals.filter(a=>a.action==='approved').length;
  const granted       = approvedCount >= (r.approvalsRequired||1);

  await updateReq(id, {
    approvals: newApprovals,
    status:    granted ? 'granted' : 'pending',
    updatedAt: new Date().toISOString(),
    ...(granted ? { grantedAt: new Date().toISOString() } : {})
  });

  const sub = users.find(u=>u.id===r.supervisorId);
  let notice;
  if (granted) {
    const msg = `✅ Extension GRANTED\n\nArea: ${r.area}\nStaff: ${(r.staffList||[]).join(', ')}\nDate: ${r.date} | ${r.startTime}–${r.endTime} (${r.hours}h)\nApproved by: ${currentUser.name}`;
    notice = `<div class="notice notice-green"><i class="bi bi-check-circle-fill"></i> Extension granted — all approvals complete. ${sub?waBtn(sub.phone||'',msg):''}</div>`;
  } else {
    notice = `<div class="notice notice-green"><i class="bi bi-check-lg"></i> Your approval recorded — waiting for the second approver.</div>`;
  }
  renderTab('adm_pend');
  se('appBody').insertAdjacentHTML('afterbegin', notice);
}

async function adminReject(id) {
  const note = (se('an_'+id)?.value||'').trim();
  if (!note) { alert('Please enter a rejection reason.'); return; }
  const r = requests.find(x=>x.id===id); if (!r) return;

  const newApprovals = [...(r.approvals||[]), {
    by: currentUser.id, byName: currentUser.name,
    at: new Date().toISOString(), action: 'rejected', note
  }];
  await updateReq(id, { approvals: newApprovals, status: 'cancelled', updatedAt: new Date().toISOString() });

  const sub = users.find(u=>u.id===r.supervisorId);
  const msg = `❌ Extension Request Rejected\n\nArea: ${r.area}\nDate: ${r.date}\nRejected by: ${currentUser.name}\nReason: ${note}`;
  const notice = `<div class="notice notice-red"><i class="bi bi-x-circle-fill"></i> Request rejected. ${sub?waBtn(sub.phone||'',msg):''}</div>`;
  renderTab('adm_pend');
  se('appBody').insertAdjacentHTML('afterbegin', notice);
}

// ── Admin: History ────────────────────────────────────────────────────────────
function renderAdminHist() {
  const list = requests.filter(r =>
    ((r.approverIds||[]).includes(currentUser.id) || (r.approvals||[]).some(a=>a.by===currentUser.id))
    && r.status !== 'pending'
  );
  const refreshBtn = `<button class="btn btn-sm btn-outline no-print" style="margin-bottom:14px;"
    onclick="loadAll().then(()=>renderTab('adm_hist'))"><i class="bi bi-arrow-clockwise"></i> Refresh</button>`;
  if (!list.length) return `<div class="section-title"><i class="bi bi-folder2"></i> History</div>${refreshBtn}<div class="empty-state">No history yet.</div>`;
  return `<div class="section-title"><i class="bi bi-folder2"></i> History (${list.length})</div>${refreshBtn}` + list.map(r => reqCard(r)).join('');
}

// ── Report ────────────────────────────────────────────────────────────────────
function renderReportTab(){
  const areas  = localAreas();
  const aOpts  = ['ALL',...areas].map(a=>`<option value="${esc(a)}">${a==='ALL'?'All Areas':esc(a)}</option>`).join('');
  const allStaff=(()=>{ try{ return JSON.parse(localStorage.getItem(STAFF_KEY)||'[]')||[]; }catch{ return []; } })();
  const sOpts  = ['ALL',...allStaff.map(s=>s.name).filter(Boolean)].map(n=>`<option value="${esc(n)}">${n==='ALL'?'All Staff':esc(n)}</option>`).join('');
  const today  = new Date().toISOString().slice(0,10);
  const firstM = new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10);
  return `
  <div class="rpt-controls no-print">
    <div class="section-title" style="margin-bottom:12px;"><i class="bi bi-bar-chart-line"></i> Extension Hours Report</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;align-items:end;">
      <div class="fg" style="margin:0;"><label>From Date</label><input type="date" id="rptFrom" value="${firstM}"/></div>
      <div class="fg" style="margin:0;"><label>To Date</label><input type="date" id="rptTo" value="${today}"/></div>
      <div class="fg" style="margin:0;"><label>Area</label><select id="rptArea">${aOpts}</select></div>
      <div class="fg" style="margin:0;"><label>Staff</label><select id="rptStaff">${sOpts}</select></div>
      <div class="fg" style="margin:0;"><label>Status</label>
        <select id="rptStatus">
          <option value="granted">Granted Only</option>
          <option value="ALL">All Statuses</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="generateReport()">Generate</button>
        <button class="btn btn-outline no-print" onclick="window.print()" style="display:none;" id="rptPrintBtn"><i class="bi bi-printer-fill"></i> Print</button>
      </div>
    </div>
  </div>
  <div id="reportOutput"></div>`;
}

function generateReport(){
  const from   = se('rptFrom')?.value;
  const to     = se('rptTo')?.value;
  const area   = se('rptArea')?.value   || 'ALL';
  const staff  = se('rptStaff')?.value  || 'ALL';
  const status = se('rptStatus')?.value || 'granted';
  if(!from||!to){ alert('Please set a date range.'); return; }

  const filtered = requests.filter(r=>{
    if(!r.date) return false;
    if(r.date<from||r.date>to) return false;
    if(status!=='ALL'&&r.status!==status) return false;
    if(area!=='ALL'&&(r.area||'')!==area) return false;
    if(staff!=='ALL'&&!(r.staffList||[]).includes(staff)) return false;
    return true;
  });

  const rows=[];
  filtered.forEach(r=>{
    const names=(staff!=='ALL')?[staff]:(r.staffList||[]);
    names.forEach(name=>rows.push({...r,_name:name}));
  });
  rows.sort((a,b)=>(a.date+a._name).localeCompare(b.date+b._name));

  const output=se('reportOutput');
  const printBtn=se('rptPrintBtn');
  if(!output) return;

  if(!rows.length){
    output.innerHTML=`<div class="empty-state">No records found for the selected filters.</div>`;
    if(printBtn) printBtn.style.display='none';
    return;
  }

  const totalHours=Math.round(rows.reduce((s,r)=>s+(Number(r.hours)||0),0)*100)/100;
  const areaLabel =area==='ALL'?'All Areas':area;
  const staffLabel=staff==='ALL'?'All Staff':staff;
  const statusLabel=status==='ALL'?'All Statuses':'Granted Only';

  output.innerHTML=`
  <div class="rpt-wrap" id="rptDoc">
    <div class="rpt-header">
      <div class="rpt-title">Staff Extension Hours Report</div>
      <div class="rpt-sub">
        King Abdulaziz Medical City &nbsp;·&nbsp; National Guard Health Affairs &nbsp;·&nbsp; Western Region<br>
        Pharmaceutical Care Department
      </div>
      <div class="rpt-meta">
        <span><b>Period:</b> ${fmtDate(from)} — ${fmtDate(to)}</span>
        <span><b>Area:</b> ${esc(areaLabel)}</span>
        <span><b>Staff:</b> ${esc(staffLabel)}</span>
        <span><b>Filter:</b> ${esc(statusLabel)}</span>
        <span><b>Generated:</b> ${fmtDate(new Date().toISOString().slice(0,10))}</span>
      </div>
    </div>
    <table class="rpt-table">
      <thead><tr>
        <th style="width:4%;">No.</th>
        <th style="width:19%;">Staff Name</th>
        <th style="width:8%;">Area</th>
        <th style="width:10%;">Date</th>
        <th style="width:11%;">Time</th>
        <th style="width:6%;">Hours</th>
        <th style="width:13%;">Submitted By</th>
        <th style="width:9%;">Status</th>
        <th style="width:20%;">Justification</th>
      </tr></thead>
      <tbody>
        ${rows.map((r,i)=>`<tr>
          <td style="text-align:center;">${i+1}</td>
          <td><b>${esc(r._name)}</b></td>
          <td style="text-align:center;">${esc(r.area||'')}</td>
          <td style="text-align:center;">${fmtDate(r.date)}</td>
          <td style="text-align:center;white-space:nowrap;">${r.startTime||''}–${r.endTime||''}</td>
          <td style="text-align:center;font-weight:800;color:#1a4f8b;">${r.hours}</td>
          <td>${esc(r.supervisorName||'')}</td>
          <td style="text-align:center;">${statusBadge(r)}</td>
          <td style="font-size:10px;">${esc(r.justification||'')}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right;font-weight:700;font-size:12px;padding:7px 8px;">
            Total Records: ${rows.length} &nbsp;·&nbsp; Total Extension Hours:
          </td>
          <td style="text-align:center;font-weight:900;font-size:14px;color:#1a4f8b;">${totalHours}</td>
          <td colspan="3"></td>
        </tr>
      </tfoot>
    </table>
  </div>`;
  if(printBtn) printBtn.style.display='inline-flex';
}
