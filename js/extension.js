const STAFF_KEY = 'BCOT_STAFF_RECORDS_V2';
const AREAS_KEY = 'BCOT_AREAS_LIST_V1';
let KEY = '';
let users = [], requests = [], currentUser = null, currentTab = '';

// ── Firebase refs ─────────────────────────────────────────────────────────────
function reqsCol()    { return window.FB.collection(window.FB.db,'bcot_overtime_secure',KEY,'ext_requests'); }
function reqDoc(id)   { return window.FB.doc(window.FB.db,'bcot_overtime_secure',KEY,'ext_requests',id); }

async function updateReq(id, d)  { await window.FB.updateDoc(reqDoc(id),d); const i=requests.findIndex(r=>r.id===id); if(i>=0) Object.assign(requests[i],d); }

async function loadAll() {
  const r = await window.FB.getDocs(reqsCol());
  requests = [];
  r.forEach(d => requests.push({id:d.id,...d.data()}));
  requests.sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid()  { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function se(id) { return document.getElementById(id); }
function show(id){ const e=se(id); if(e) e.style.display=''; }
function hide(id){ const e=se(id); if(e) e.style.display='none'; }
function setErr(id,msg){ const e=se(id); if(!e) return; e.textContent=msg; e.style.display=msg?'block':'none'; }

function calcHours(s,e){
  if(!s||!e) return 0;
  const [sh,sm]=s.split(':').map(Number), [eh,em]=e.split(':').map(Number);
  const d=(eh*60+em)-(sh*60+sm);
  return d>0 ? Math.round(d/60*100)/100 : 0;
}
function fmtDate(d){ if(!d) return '—'; try{ return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }catch{ return d; } }
function statusBadge(s){
  const cls={pending:'b-pending',manager_approved:'b-mgr',granted:'b-granted',cancelled:'b-cancelled'};
  const lbl={pending:'Pending',manager_approved:'Mgr Approved',granted:'✅ Granted',cancelled:'Cancelled'};
  return `<span class="badge ${cls[s]||''}">${lbl[s]||s}</span>`;
}
function waLink(phone,msg){
  const n=(phone||'').replace(/\D/g,''); if(!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}
function waBtn(phone,msg,label='📱 WhatsApp'){
  const l=waLink(phone,msg); if(!l) return '';
  return `<a class="wa-btn" href="${l}" target="_blank">${label}</a>`;
}
function localStaff(area){
  try{
    const all=JSON.parse(localStorage.getItem(STAFF_KEY)||'[]')||[];
    if(!area||area==='ALL') return all.map(s=>s.name).filter(Boolean);
    return all.filter(s=>(s.area||'').toUpperCase().split(',').map(x=>x.trim()).includes(area.toUpperCase())).map(s=>s.name).filter(Boolean);
  }catch{ return []; }
}
function localAreas(){ try{ return JSON.parse(localStorage.getItem(AREAS_KEY)||'[]')||[]; }catch{ return []; } }

// ── App init ──────────────────────────────────────────────────────────────────
async function startExtension() {
  KEY = (window.BCOT_APP_KEY||'').trim();
  if(!KEY){ document.body.innerHTML='<div style="padding:40px;color:red;font-weight:700;text-align:center;">config.js not found.</div>'; return; }
  let t=0; while(!window.FB && t++<50) await new Promise(r=>setTimeout(r,100));
  if(!window.FB){ document.body.innerHTML='<div style="padding:40px;color:red;">Firebase failed to load.</div>'; return; }

  const session = window.BCOT_AUTH?.getSession();
  if (!session) return; // auth.js handles the login overlay

  const role = session.ext_role || '';
  if (!role || role === 'staff') {
    se('appShell').style.display = '';
    se('roleBadge').textContent = '⛔ No Access';
    se('userNameBadge').textContent = session.name;
    se('appNav').innerHTML = '';
    se('appBody').innerHTML = `<div style="text-align:center;padding:60px 20px;color:#6b7280;">
      <div style="font-size:40px;margin-bottom:16px;">🔒</div>
      <div style="font-size:15px;font-weight:700;color:#374151;margin-bottom:8px;">No Extension Access</div>
      <div style="font-size:13px;">Your account has no Extension role assigned.<br>Contact the system administrator.</div>
    </div>`;
    return;
  }

  currentUser = {
    id:              session.id,
    name:            session.name,
    role:            role,
    phone:           session.ext_phone      || '',
    areas:           session.ext_areas      || [],
    linkedManagerId: session.ext_manager_id || ''
  };

  try {
    users = await window.BCOT_AUTH.fetchExtUsers();
    await loadAll();
  } catch(e) {
    se('appBody').innerHTML = '<div style="padding:40px;color:red;">Failed to load data. Check connection.</div>';
    return;
  }
  launchApp();
}

(function(){
  if (window.BCOT_AUTH && window.BCOT_AUTH.getSession()) {
    startExtension();
  } else {
    window.addEventListener('bcotAuth', startExtension, { once: true });
  }
})();

// ── App shell ─────────────────────────────────────────────────────────────────
function launchApp(){
  hide('screenLogin'); hide('screenChangePwd');
  show('appShell');
  se('userNameBadge').textContent = currentUser.name;
  const rl={supervisor:'👤 Supervisor',manager:'🗂 Manager/AD',director:'🏆 Director'};
  const rc={supervisor:'rgba(26,79,139,.65)',manager:'rgba(15,118,110,.65)',director:'rgba(124,58,237,.65)'};
  const b=se('roleBadge'); b.textContent=rl[currentUser.role]||currentUser.role; b.style.background=rc[currentUser.role]||'rgba(255,255,255,.15)';
  buildNav();
}

function buildNav(){
  const tabs={
    supervisor:[{id:'sv_new',label:'➕ New Request'},{id:'sv_mine',label:'📋 My Requests'},{id:'report',label:'📊 Report'}],
    manager:   [{id:'mg_pend',label:'🕐 Pending'},{id:'mg_hist',label:'📁 History'},{id:'report',label:'📊 Report'}],
    director:  [{id:'dr_pend',label:'🕐 Awaiting Approval'},{id:'dr_hist',label:'📁 History'},{id:'report',label:'📊 Report'}],
  };
  const myTabs=tabs[currentUser.role]||[];
  se('appNav').innerHTML=myTabs.map(t=>`<button class="nav-tab" data-tab="${t.id}" onclick="switchTab('${t.id}')">${t.label}</button>`).join('');
  if(myTabs.length) switchTab(myTabs[0].id);
}

function switchTab(id){
  currentTab=id;
  document.querySelectorAll('.nav-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  renderTab(id);
}

function renderTab(id){
  const body=se('appBody'); if(!body) return;
  const map={sv_new:renderNewReq,sv_mine:renderMyReqs,mg_pend:renderMgrPending,mg_hist:renderMgrHist,dr_pend:renderDrPending,dr_hist:renderDrHist,report:renderReportTab};
  body.innerHTML=(map[id]||(() =>''))();
  if(id==='sv_new') refreshStaffList();
}

// ── Shared card ───────────────────────────────────────────────────────────────
function baseCard(r, extra=''){
  return `<div class="req-card">
    <div class="req-card-hdr">
      ${statusBadge(r.status)}
      <b>${esc(r.area)}</b>
      <span style="font-size:11px;color:#6b7280;">${fmtDate(r.date)} · ${r.startTime||''}–${r.endTime||''}</span>
      <b style="color:var(--primary);">${r.hours}h</b>
    </div>
    <div style="margin:6px 0;">${(r.staffList||[]).map(n=>`<span class="staff-chip">${esc(n)}</span>`).join('')}</div>
    <div class="req-card-body">
      <b>By:</b> ${esc(r.supervisorName||'—')} &nbsp;·&nbsp; <b>Submitted:</b> ${fmtDate(r.submittedAt)}<br>
      <b>Justification:</b> ${esc(r.justification||'—')}
      ${r.managerNote?`<br><b>Manager note:</b> ${esc(r.managerNote)}`:''}
      ${r.directorJustification?`<br><b>Director note:</b> ${esc(r.directorJustification)}`:''}
    </div>
    ${extra}
  </div>`;
}

// ── Supervisor: New request ───────────────────────────────────────────────────
function renderNewReq(){
  const myAreas=currentUser.areas||[];
  if(!myAreas.length) return `<div class="empty-state">No areas assigned to you. Ask the Director to update your profile.</div>`;
  const aOpts=myAreas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
  return `<div class="section-title">New Extension Request</div>
  <div class="panel" style="max-width:620px;">
    <div class="fg"><label>Area</label><select id="reqArea" onchange="refreshStaffList()">${aOpts}</select></div>
    <div class="fg"><label>Staff Members <span style="font-weight:400;color:#6b7280;">(select one or more)</span></label>
      <div class="staff-grid" id="staffGrid"><span style="color:#9ca3af;font-size:12px;">Loading…</span></div>
    </div>
    <div class="fg"><label>Date</label><input type="date" id="reqDate" value="${new Date().toISOString().slice(0,10)}"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px;">
      <div class="fg" style="margin:0;"><label>Start Time</label><input type="time" id="reqStart" onchange="calcHrsDisplay()"/></div>
      <div class="fg" style="margin:0;"><label>End Time</label><input type="time" id="reqEnd" onchange="calcHrsDisplay()"/></div>
      <div class="hours-badge" id="hrsDisplay">0 h</div>
    </div>
    <div class="fg"><label>Justification</label><textarea id="reqJust" placeholder="Reason for this extension…"></textarea></div>
    <button class="btn btn-primary" onclick="submitReq()">Submit Request</button>
    <div class="err-msg" id="reqErr"></div>
    <div class="ok-msg"  id="reqOk"></div>
  </div>`;
}

function refreshStaffList(){
  const area=se('reqArea')?.value, grid=se('staffGrid'); if(!grid) return;
  const staff=localStaff(area);
  if(!staff.length){ grid.innerHTML='<span style="color:#9ca3af;font-size:12px;">No staff for this area.</span>'; return; }
  grid.innerHTML=staff.map(n=>`<label class="staff-item"><input type="checkbox" class="sc" value="${esc(n)}"/> ${esc(n)}</label>`).join('');
}

function calcHrsDisplay(){
  const h=calcHours(se('reqStart')?.value, se('reqEnd')?.value);
  const el=se('hrsDisplay'); if(!el) return;
  el.textContent=h>0?h+' h':'0 h';
  el.style.color=h>0?'var(--primary)':'#9ca3af';
}

async function submitReq(){
  setErr('reqErr','');
  const area=se('reqArea')?.value;
  const staff=Array.from(document.querySelectorAll('.sc:checked')).map(c=>c.value);
  const date=se('reqDate')?.value, start=se('reqStart')?.value, end=se('reqEnd')?.value;
  const just=(se('reqJust')?.value||'').trim();
  if(!area)         { setErr('reqErr','Select an area.'); return; }
  if(!staff.length) { setErr('reqErr','Select at least one staff member.'); return; }
  if(!date||!start||!end){ setErr('reqErr','Set date and time range.'); return; }
  const hours=calcHours(start,end);
  if(hours<=0)      { setErr('reqErr','End time must be after start time.'); return; }
  if(!just)         { setErr('reqErr','Justification is required.'); return; }
  const dt=new Date(date);
  const mgr=users.find(u=>u.id===currentUser.linkedManagerId);
  const req={
    supervisorId:currentUser.id, supervisorName:currentUser.name, supervisorPhone:currentUser.phone||'',
    area, staffList:staff, date, startTime:start, endTime:end, hours, justification:just,
    status:'pending', month:dt.getMonth()+1, year:dt.getFullYear(),
    managerId:currentUser.linkedManagerId||'', managerName:mgr?.name||'', managerPhone:mgr?.phone||'',
    managerNote:'', directorJustification:'',
    submittedAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  try{
    const ref=await window.FB.addDoc(reqsCol(),req);
    requests.unshift({id:ref.id,...req});
    if(se('reqJust')) se('reqJust').value='';
    document.querySelectorAll('.sc:checked').forEach(c=>c.checked=false);
    if(se('hrsDisplay')) se('hrsDisplay').textContent='0 h';
    const ok=se('reqOk'); ok.textContent='✅ Request submitted — Status: Pending'; ok.style.display='block';
    setTimeout(()=>ok.style.display='none',4500);
  }catch(e){ setErr('reqErr','Failed: '+(e?.message||e)); }
}

// ── Supervisor: My requests ───────────────────────────────────────────────────
function renderMyReqs(){
  const mine=requests.filter(r=>r.supervisorId===currentUser.id);
  if(!mine.length) return `<div class="section-title">My Requests</div><div class="empty-state">No requests submitted yet.</div>`;
  return `<div class="section-title">My Requests (${mine.length})</div>`+mine.map(r=>baseCard(r)).join('');
}

// ── Manager: Pending ──────────────────────────────────────────────────────────
function renderMgrPending(){
  const list=requests.filter(r=>r.status==='pending'&&r.managerId===currentUser.id);
  if(!list.length) return `<div class="section-title">Pending Requests</div><div class="empty-state">No pending requests.</div>`;
  return `<div class="section-title">Pending Requests (${list.length})</div>`+
    list.map(r=>`<div class="req-card">
      <div class="req-card-hdr">${statusBadge(r.status)}<b>${esc(r.area)}</b>
        <span style="font-size:11px;color:#6b7280;">${fmtDate(r.date)} · ${r.startTime}–${r.endTime}</span>
        <b style="color:var(--primary);">${r.hours}h</b>
      </div>
      <div style="margin:6px 0;">${(r.staffList||[]).map(n=>`<span class="staff-chip">${esc(n)}</span>`).join('')}</div>
      <div class="req-card-body">
        <b>By:</b> ${esc(r.supervisorName)} &nbsp;·&nbsp; <b>Date:</b> ${fmtDate(r.date)}<br>
        <b>Justification:</b> ${esc(r.justification)}
      </div>
      <div class="req-card-actions">
        <input type="text" id="mn_${r.id}" placeholder="Note (optional)" style="flex:1;min-width:140px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;"/>
        <button class="btn btn-green btn-sm" onclick="mgrApprove('${r.id}')">✔ Approve</button>
        <button class="btn btn-red   btn-sm" onclick="mgrReject('${r.id}')">✖ Reject</button>
      </div>
    </div>`).join('');
}

function renderMgrHist(){
  const list=requests.filter(r=>r.managerId===currentUser.id&&r.status!=='pending');
  if(!list.length) return `<div class="section-title">History</div><div class="empty-state">No history yet.</div>`;
  return `<div class="section-title">History (${list.length})</div>`+list.map(r=>baseCard(r)).join('');
}

async function mgrApprove(id){
  const note=(se('mn_'+id)?.value||'').trim();
  const r=requests.find(x=>x.id===id); if(!r) return;
  await updateReq(id,{status:'manager_approved',managerNote:note,updatedAt:new Date().toISOString()});
  const dir=users.find(u=>u.role==='director');
  const msg=`📋 Extension Request — Awaiting Your Approval\n\nArea: ${r.area}\nStaff: ${(r.staffList||[]).join(', ')}\nDate: ${r.date} | ${r.startTime}–${r.endTime} (${r.hours}h)\nSupervisor: ${r.supervisorName}\nJustification: ${r.justification}\nManager Note: ${note||'—'}\n\nPlease review in the Extension system.`;
  const notice=`<div class="notice notice-green">✅ Approved — forwarded to Director. ${dir?waBtn(dir.phone,msg,'📱 Notify Director'):''}</div>`;
  renderTab('mg_pend');
  se('appBody').insertAdjacentHTML('afterbegin',notice);
}

async function mgrReject(id){
  const note=(se('mn_'+id)?.value||'').trim();
  if(!note){ alert('Please enter a rejection reason.'); return; }
  const r=requests.find(x=>x.id===id); if(!r) return;
  await updateReq(id,{status:'cancelled',managerNote:note,updatedAt:new Date().toISOString()});
  const sup=users.find(u=>u.id===r.supervisorId);
  const msg=`❌ Extension Request Rejected\n\nArea: ${r.area}\nDate: ${r.date} | ${r.startTime}–${r.endTime}\nReason: ${note}`;
  const notice=`<div class="notice notice-red">Request rejected. ${sup?waBtn(sup.phone,msg,'📱 Notify Supervisor'):''}</div>`;
  renderTab('mg_pend');
  se('appBody').insertAdjacentHTML('afterbegin',notice);
}

// ── Director: Pending ─────────────────────────────────────────────────────────
function renderDrPending(){
  const list=requests.filter(r=>r.status==='manager_approved');
  if(!list.length) return `<div class="section-title">Awaiting Your Approval</div><div class="empty-state">No requests awaiting approval.</div>`;
  return `<div class="section-title">Awaiting Approval (${list.length})</div>`+
    list.map(r=>`<div class="req-card">
      <div class="req-card-hdr">${statusBadge(r.status)}<b>${esc(r.area)}</b>
        <span style="font-size:11px;color:#6b7280;">${fmtDate(r.date)} · ${r.startTime}–${r.endTime}</span>
        <b style="color:var(--primary);">${r.hours}h</b>
      </div>
      <div style="margin:6px 0;">${(r.staffList||[]).map(n=>`<span class="staff-chip">${esc(n)}</span>`).join('')}</div>
      <div class="req-card-body">
        <b>Supervisor:</b> ${esc(r.supervisorName)} &nbsp;·&nbsp; <b>Manager:</b> ${esc(r.managerName||'—')}<br>
        <b>Date:</b> ${fmtDate(r.date)} &nbsp;·&nbsp; <b>Time:</b> ${r.startTime}–${r.endTime} &nbsp;·&nbsp; <b>Hours:</b> ${r.hours}h<br>
        <b>Justification:</b> ${esc(r.justification)}<br>
        ${r.managerNote?`<b>Manager Note:</b> ${esc(r.managerNote)}`:''}
      </div>
      <div class="req-card-actions">
        <input type="text" id="dj_${r.id}" placeholder="Director justification (required)" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;"/>
        <button class="btn btn-green btn-sm" onclick="drGrant('${r.id}')">✔ Grant</button>
        <button class="btn btn-red   btn-sm" onclick="drReject('${r.id}')">✖ Reject</button>
      </div>
    </div>`).join('');
}

function renderDrHist(){
  const list=requests.filter(r=>r.status==='granted'||r.status==='cancelled');
  if(!list.length) return `<div class="section-title">History</div><div class="empty-state">No history yet.</div>`;
  return `<div class="section-title">History (${list.length})</div>`+list.map(r=>baseCard(r)).join('');
}

async function drGrant(id){
  const just=(se('dj_'+id)?.value||'').trim();
  if(!just){ alert('Please enter your justification before granting.'); return; }
  const r=requests.find(x=>x.id===id); if(!r) return;
  await updateReq(id,{status:'granted',directorJustification:just,grantedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const sup=users.find(u=>u.id===r.supervisorId);
  const msg=`✅ Extension GRANTED\n\nArea: ${r.area}\nStaff: ${(r.staffList||[]).join(', ')}\nDate: ${r.date} | ${r.startTime}–${r.endTime} (${r.hours}h)\nApproved by: ${currentUser.name}\nJustification: ${just}`;
  const notice=`<div class="notice notice-green">✅ Extension GRANTED — hours locked. ${sup?waBtn(sup.phone,msg,'📱 Notify Supervisor'):''}</div>`;
  renderTab('dr_pend');
  se('appBody').insertAdjacentHTML('afterbegin',notice);
}

async function drReject(id){
  const just=(se('dj_'+id)?.value||'').trim();
  if(!just){ alert('Please enter a justification for rejection.'); return; }
  const r=requests.find(x=>x.id===id); if(!r) return;
  await updateReq(id,{status:'cancelled',directorJustification:just,updatedAt:new Date().toISOString()});
  const sup=users.find(u=>u.id===r.supervisorId);
  const msg=`❌ Extension REJECTED by Director\n\nArea: ${r.area}\nDate: ${r.date} | ${r.startTime}–${r.endTime}\nReason: ${just}`;
  const notice=`<div class="notice notice-red">Request rejected (kept for documentation, 0 hrs). ${sup?waBtn(sup.phone,msg,'📱 Notify Supervisor'):''}</div>`;
  renderTab('dr_pend');
  se('appBody').insertAdjacentHTML('afterbegin',notice);
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
    <div class="section-title" style="margin-bottom:12px;">📊 Extension Hours Report</div>
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
        <button class="btn btn-outline no-print" onclick="window.print()" style="display:none;" id="rptPrintBtn">🖨 Print</button>
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

  // Filter requests by criteria
  const filtered = requests.filter(r=>{
    if(!r.date) return false;
    if(r.date<from||r.date>to) return false;
    if(status!=='ALL'&&r.status!==status) return false;
    if(area!=='ALL'&&(r.area||'')!==area) return false;
    if(staff!=='ALL'&&!(r.staffList||[]).includes(staff)) return false;
    return true;
  });

  // Expand: one row per staff per request
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
        <th style="width:13%;">Supervisor</th>
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
          <td style="text-align:center;">${statusBadge(r.status)}</td>
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

