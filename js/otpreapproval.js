  const AREAS_LIST_KEY  = "BCOT_AREAS_LIST_V1";
  const STAFF_KEY       = "BCOT_STAFF_RECORDS_V2";
  const DUTIES_KEY      = "BCOT_DUTIES_ALL_V1";

  // ── Status ────────────────────────────────────────────────────────────────
  function showStatus(msg, ok=true) {
    const el=document.getElementById("statusBox");
    el.textContent=msg; el.className="status-message "+(ok?"status-ok":"status-err");
    el.style.display="block"; setTimeout(()=>el.style.display="none",4000);
  }

  // ── Populate area select ──────────────────────────────────────────────────
  function buildAreaSelect() {
    const list = (() => { try{ return JSON.parse(localStorage.getItem(AREAS_LIST_KEY)||"[]")||[]; }catch{ return []; } })();
    const sel  = document.getElementById("areaSel");
    sel.innerHTML='<option value="ALL">All Areas</option>';
    list.forEach(a => { const o=document.createElement("option"); o.value=a; o.textContent=a; sel.appendChild(o); });
    const last=(localStorage.getItem("BCOT_CURRENT_AREA_V1")||"ALL").trim().toUpperCase();
    if (last==="ALL"||list.includes(last)) sel.value=last;
  }

  // ── OT helpers (mirror index.html logic) ─────────────────────────────────
  function getDIM(m,y){ return new Date(y,m,0).getDate(); }
  function enabledHols(hols){ return (hols||[]).filter(h=>h.enabled&&h.fromDay&&h.toDay&&h.toDay>=h.fromDay); }
  function sunThuInRange(m,y,f,t){
    const days=getDIM(m,y); f=Math.max(1,f); t=Math.min(days,t); let n=0;
    for(let d=f;d<=t;d++){ const dw=new Date(y,m-1,d).getDay(); if(dw>=0&&dw<=4)n++; }
    return n;
  }
  function holSunThu(hols,m,y){ let n=0; enabledHols(hols).forEach(h=>n+=sunThuInRange(m,y,h.fromDay,h.toDay)); return n; }
  function holAllDays(hols,m,y){
    const days=getDIM(m,y); let n=0;
    enabledHols(hols).forEach(h=>{ const f=Math.max(1,h.fromDay),t=Math.min(days,h.toDay); if(t>=f)n+=t-f+1; });
    return n;
  }
  function isInHolRange(hols,day){ return enabledHols(hols).some(h=>day>=h.fromDay&&day<=h.toDay); }
  function leaveDays(daysData,hols,m,y){
    let all=0,st=0;
    Object.entries(daysData||{}).forEach(([k,v])=>{
      const code=(v||'').toUpperCase().replace(/_O$/,'');
      const day=parseInt(k.replace('day',''),10);
      if(isInHolRange(hols,day)) return; // holiday range already handles this day
      if(code==='L'){                     // 'L' always counts as off-day
        all++;
        const dw=new Date(y,m-1,day).getDay(); if(dw>=0&&dw<=4)st++;
      }
    });
    return {all,st};
  }
  function calcOT(rec,payload){
    if(rec.otOverride!=null){ const v=parseFloat(String(rec.otOverride).replace('+','')); return Number.isFinite(v)?Math.max(0,v):0; }
    const m=payload.month, y=payload.year||new Date().getFullYear();
    const hols=payload.holidays||[], mxd=Number(payload.mixedStdHours)||0;
    const tot=Number(rec.hours)||0, sched=rec.schedType||'';
    const lv=leaveDays(rec.daysData,hols,m,y);
    let std=0;
    if(sched==='Regular'){
      std=Math.max(0,sunThuInRange(m,y,1,getDIM(m,y))-holSunThu(hols,m,y)-lv.st)*9;
    } else if(sched==='12 Hours'){
      const td=getDIM(m,y), rem=Math.max(0,td-holAllDays(hols,m,y)-lv.all);
      std=(rem*15/28)*12;
    } else if(sched==='Mixed'){
      const td=getDIM(m,y), den=Math.max(1,td-holAllDays(hols,m,y));
      std=mxd*(Math.max(0,den-lv.all)/den);
    }
    return Math.max(0,Math.round((tot-std)*10)/10);
  }

  // ── Firestore refs ────────────────────────────────────────────────────────
  function monthRef(key,area,docId){ return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'months',docId); }
  function releaseIndexRef(key,area,docId){ return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'release_index',docId); }
  function releaseDocRef(key,area,releaseId){ return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'releases',releaseId); }

  // ── Release picker ────────────────────────────────────────────────────────
  let _selectedReleaseId = null;

  async function pickRelease() {
    const key = (window.BCOT_APP_KEY||'').trim();
    if (!key) { showStatus("config.js not found.", false); return; }
    const month  = Number(document.getElementById("monthSel").value);
    const year   = Number(document.getElementById("yearSel").value) || new Date().getFullYear();
    const area   = (document.getElementById("areaSel").value||"ALL").trim().toUpperCase();
    const docId  = `${year}-${String(month).padStart(2,'0')}`;

    showStatus("Fetching releases…");
    let releases = [];
    try {
      const snap = await window.FB.getDoc(releaseIndexRef(key, area, docId));
      releases = snap.exists() ? (snap.data().releases || []) : [];
    } catch(e) { showStatus("Failed to load releases: "+(e?.message||e), false); return; }

    // Remove any existing backdrop
    document.getElementById('relPickerBackdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'relPickerBackdrop';
    backdrop.className = 'rel-modal-backdrop';
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });

    const monthName = new Date(year, month-1, 1).toLocaleString('default', {month:'long'});
    let bodyHtml = '';
    if (!releases.length) {
      bodyHtml = `<div class="rel-empty">No releases saved for ${area} — ${monthName} ${year}.<br>Save a release from the Rota page first.</div>`;
    } else {
      [...releases].reverse().forEach(r => {
        const date = r.savedAt ? new Date(r.savedAt).toLocaleString() : '—';
        const note = r.note ? `<span style="color:#374151;"> — ${r.note}</span>` : '';
        bodyHtml += `<div class="rel-item" onclick="applyRelease('${r.id}','${area}')">
          <div>
            <div class="rel-item-name">Release #${r.releaseNum} — ${area}-${monthName.slice(0,3)}</div>
            <div class="rel-item-meta">${date}${note} &nbsp;·&nbsp; ${r.staffCount||'?'} staff</div>
          </div>
          <button class="rel-item-btn">Load</button>
        </div>`;
      });
    }

    backdrop.innerHTML = `<div class="rel-modal">
      <div class="rel-modal-head">
        <span>Pick Release — ${area} / ${monthName} ${year}</span>
        <button class="rel-modal-close" onclick="document.getElementById('relPickerBackdrop').remove()">✕</button>
      </div>
      <div class="rel-modal-body">${bodyHtml}</div>
    </div>`;
    document.body.appendChild(backdrop);

    if (releases.length) showStatus('');
    else showStatus(`No releases found for ${area} ${monthName} ${year}.`, false);
  }

  async function applyRelease(releaseId, area) {
    document.getElementById('relPickerBackdrop')?.remove();
    _selectedReleaseId = releaseId;
    _selectedReleaseArea = area;
    await loadAndBuild();
  }

  let _selectedReleaseArea = null;

  // Cache for printNoSR — populated by every buildForm() call
  let _cachedRows = null, _cachedArea = null, _cachedMeta = null;

  // ── HTML helpers ──────────────────────────────────────────────────────────
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmt(n){ return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}); }
  // Strip trailing badge "(digits)" from staff name — badge column already shows it separately
  function stripBadge(name){ return String(name||'').replace(/\s*\(\d+\)\s*$/, '').trim(); }

  function tableHeaderHtml(){
    return `<table class="ot-table">
      <thead><tr>
        <th style="width:5%;">No.</th>
        <th style="width:10%;">Badge no.</th>
        <th style="width:33%;">Name</th>
        <th style="width:6%;">No. of<br>Hours</th>
        <th style="width:11%;">Total Cost</th>
        <th style="width:9%;">Location</th>
        <th style="width:26%;">Justification</th>
      </tr></thead><tbody>`;
  }

  function tableHeaderNoSRHtml(){
    return `<table class="ot-table">
      <thead><tr>
        <th style="width:5%;">No.</th>
        <th style="width:10%;">Badge no.</th>
        <th style="width:38%;">Name</th>
        <th style="width:12%;">No. of<br>Hours</th>
        <th style="width:10%;">Location</th>
        <th style="width:25%;">Justification</th>
      </tr></thead><tbody>`;
  }

  function sigHtml(meta){
    return `<div class="sig-wrapper">
      <div class="sig-section">
        <div class="sig-block">
          <div class="sig-label">Requested by:</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span>   <input type="text" value="${esc(meta.reqName)}"/></div>
          <div class="sig-field"><span class="sf-key">Title :</span> <input type="text" value="${esc(meta.reqTitle)}"/></div>
          <div class="sig-field"><span class="sf-key">ID No:</span>  <input type="text" value="${esc(meta.reqID)}"/></div>
        </div>
        <div class="sig-block">
          <div class="sig-label">Approved by:</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span>   <input type="text" value="${esc(meta.appName)}"/></div>
          <div class="sig-field"><span class="sf-key">Title :</span> <input type="text" value="${esc(meta.appTitle)}"/></div>
          <div class="sig-field"><span class="sf-key">ID No:</span>  <input type="text" value="${esc(meta.appID)}"/></div>
        </div>
      </div>
    </div>`;
  }

  // Single footer element rendered once — fixed at page-bottom in print, natural flow on screen
  function formFooterHtml(){
    return `<div class="form-footer">
      <span class="ff-left">Prepared by Finance Dept</span>
      <span class="ff-center">Pharmacy automated version</span>
      <span class="ff-right">Overtime Pre-Approval Form (Revised) dated 12/06/10</span>
    </div>`;
  }

  // ── Main form builder with pagination ────────────────────────────────────
  // mode: 'full'      → individual cost column + cost in total row (default)
  //       'noSR'      → no cost column, total hours only in total row
  //       'totalOnly' → no cost column per row, but total row shows hours + total SR amount
  function buildForm(rows, area, meta, mode = 'full') {
    if (mode === 'full') { _cachedRows = rows; _cachedArea = area; _cachedMeta = meta; }

    const wrapper  = document.getElementById('formWrapper');
    const rp1 = Math.max(5, parseInt(document.getElementById('rowsPage1').value,10)||18);
    const rpN = Math.max(5, parseInt(document.getElementById('rowsPageN').value,10)||24);

    const groups = [];
    if (rows.length <= rp1) {
      groups.push(rows);
    } else {
      groups.push(rows.slice(0, rp1));
      let rem = rows.slice(rp1);
      while (rem.length) {
        groups.push(rem.slice(0, rpN));
        rem = rem.slice(rpN);
      }
    }

    const totalPages = groups.length;
    let seq = 1, html = '';

    groups.forEach((group, gi) => {
      const isFirst = gi === 0;
      const isLast  = gi === totalPages - 1;
      const pageNum = gi + 1;

      html += `<div class="print-page${isLast ? '' : ' page-break-after'}">`;

      const pgBadge = totalPages > 1
        ? `<div style="position:absolute;top:0;right:0;font-size:9px;color:#888;font-style:italic;">
             Page ${pageNum} / ${totalPages}</div>`
        : '';

      html += `
      <div class="form-title" style="position:relative;">
        ${pgBadge}
        <div class="main-title">Monthly Overtime Pre-Approval Form</div>
        <div class="sub-title">
          King Abdulaziz Medical City<br>
          National Guard Health Affairs<br>
          Western Region
        </div>
      </div>
      <div class="meta-section">
        <div class="meta-row">
          <div class="meta-cell"><b>Department Name:</b>
            <input type="text" class="meta-val" ${isFirst?'id="deptName"':''} value="${esc(meta.dept)}"/>
          </div>
          <div class="meta-cell"><span>Period covered:</span>
            <input type="text" class="meta-val" ${isFirst?'id="periodCovered"':''} value="${esc(meta.period)}" style="max-width:160px;"/>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-cell"><b>Cost Center No:</b>
            <input type="text" class="meta-val" ${isFirst?'id="costCenter"':''} value="${esc(meta.cost)}" style="max-width:180px;"/>
          </div>
          <div class="meta-cell"><span>Incharge Contact No:</span>
            <input type="text" class="meta-val" ${isFirst?'id="inchargeTel"':''} value="${esc(meta.tel)}" style="max-width:160px;"/>
          </div>
        </div>
      </div>`;

      html += mode === 'noSR' ? tableHeaderNoSRHtml() : tableHeaderHtml();

      group.forEach(r => {
        if (mode === 'full') {
          html += `<tr>
            <td class="num">${seq++}</td>
            <td class="num">${esc(r.badge)}</td>
            <td>${esc(stripBadge(r.name))}</td>
            <td class="num">${r.otHours}</td>
            <td class="num">${fmt(r.totalCost)}</td>
            <td class="loc"><input type="text" value="KASCH" placeholder="Location"/></td>
            <td class="just"><input type="text" value="WEEKEND DUTY" placeholder="Justification"/></td>
          </tr>`;
        } else if (mode === 'noSR') {
          html += `<tr>
            <td class="num">${seq++}</td>
            <td class="num">${esc(r.badge)}</td>
            <td>${esc(stripBadge(r.name))}</td>
            <td class="num">${r.otHours}</td>
            <td class="loc"><input type="text" value="KASCH" placeholder="Location"/></td>
            <td class="just"><input type="text" value="WEEKEND DUTY" placeholder="Justification"/></td>
          </tr>`;
        } else {
          /* totalOnly — 7-column layout, SR cell blank per row */
          html += `<tr>
            <td class="num">${seq++}</td>
            <td class="num">${esc(r.badge)}</td>
            <td>${esc(stripBadge(r.name))}</td>
            <td class="num">${r.otHours}</td>
            <td class="num"></td>
            <td class="loc"><input type="text" value="KASCH" placeholder="Location"/></td>
            <td class="just"><input type="text" value="WEEKEND DUTY" placeholder="Justification"/></td>
          </tr>`;
        }
      });

      const pageHours = group.reduce((s,r) => s + r.otHours, 0);
      const pageTotal = group.reduce((s,r) => s + r.totalCost, 0);

      if (mode === 'full') {
        html += `<tr class="total-row">
          <td colspan="3" style="text-align:center;font-weight:700;">Total Overtime Hours/Cost</td>
          <td class="num"></td>
          <td class="num" style="font-weight:900;">${fmt(pageTotal)}</td>
          <td colspan="2" class="total-note">
            The overtime amount is _______ the ceiling that is defined through the formula to practice,
            fig#1, which was mentioned in the approved minutes of the meeting, JED-16-029120-99492.
          </td>
        </tr>`;
      } else if (mode === 'noSR') {
        html += `<tr class="total-row">
          <td colspan="3" style="text-align:center;font-weight:700;">Total Overtime Hours</td>
          <td class="num" style="font-weight:900;">${pageHours}</td>
          <td colspan="2"></td>
        </tr>`;
      } else {
        /* mode === 'totalOnly' — 7-col layout, individual SR hidden, totals + legal text in total row */
        html += `<tr class="total-row">
          <td colspan="3" style="text-align:center;font-weight:700;">Total Overtime Hours/Cost</td>
          <td class="num" style="font-weight:900;">${pageHours}</td>
          <td class="num" style="font-weight:900;">${fmt(pageTotal)} SR</td>
          <td colspan="2" class="total-note">
            The overtime amount is _______ the ceiling that is defined through the formula to practice,
            fig#1, which was mentioned in the approved minutes of the meeting, JED-16-029120-99492.
          </td>
        </tr>`;
      }

      html += `</tbody></table>`;
      html += sigHtml(meta);
      html += `</div>`;  // end .print-page
    });

    html += formFooterHtml();
    wrapper.innerHTML = html;
  }

  // ── Shared helper: snapshot current meta field values ─────────────────────
  function _snapMeta() {
    return {
      dept:     document.getElementById('deptName')?.value     || _cachedMeta.dept,
      period:   document.getElementById('periodCovered')?.value || _cachedMeta.period,
      cost:     document.getElementById('costCenter')?.value    || _cachedMeta.cost,
      tel:      document.getElementById('inchargeTel')?.value   || _cachedMeta.tel,
      reqName:  document.getElementById('reqName')?.value       || _cachedMeta.reqName,
      reqTitle: document.getElementById('reqTitle')?.value      || _cachedMeta.reqTitle,
      reqID:    document.getElementById('reqID')?.value         || _cachedMeta.reqID,
      appName:  document.getElementById('appName')?.value       || _cachedMeta.appName,
      appTitle: document.getElementById('appTitle')?.value      || _cachedMeta.appTitle,
      appID:    document.getElementById('appID')?.value         || _cachedMeta.appID,
    };
  }

  // ── Print without SR column (hours only) ─────────────────────────────────
  function printNoSR() {
    if (!_cachedRows) { showStatus('Build the form first before printing.', false); return; }
    const meta = _snapMeta();
    buildForm(_cachedRows, _cachedArea, meta, 'noSR');
    window.print();
    buildForm(_cachedRows, _cachedArea, meta, 'full');
  }

  // ── Print hours per person + total SR amount only (no individual amounts) ─
  function printTotalSR() {
    if (!_cachedRows) { showStatus('Build the form first before printing.', false); return; }
    const meta = _snapMeta();
    buildForm(_cachedRows, _cachedArea, meta, 'totalOnly');
    window.print();
    buildForm(_cachedRows, _cachedArea, meta, 'full');
  }

  // ── Fetch approved extensions from Extension.html's Firestore data ───────
  async function fetchGrantedExtensions(month, year, area) {
    try {
      const key  = (window.BCOT_APP_KEY||'').trim(); if(!key) return {};
      const col  = window.FB.collection(window.FB.db,'bcot_overtime_secure',key,'ext_requests');
      const snap = await window.FB.getDocs(col);
      const map  = {};
      snap.forEach(d => {
        const r = d.data();
        if (r.status !== 'granted') return;
        if (r.month !== month || r.year !== year) return;
        if (area && area !== 'ALL' && (r.area||'').toUpperCase() !== area.toUpperCase()) return;
        (r.staffList||[]).forEach(name => { map[name] = (map[name]||0) + (r.hours||0); });
      });
      return map;
    } catch(e) { console.warn('Extension fetch failed:',e); return {}; }
  }

  // ── Load & Build ──────────────────────────────────────────────────────────
  async function loadAndBuild() {
    const key=(window.BCOT_APP_KEY||'').trim();
    if(!key){ showStatus("config.js not found.",false); return; }
    const month=Number(document.getElementById("monthSel").value);
    const year =Number(document.getElementById("yearSel").value)||new Date().getFullYear();
    const area =(document.getElementById("areaSel").value||"ALL").trim().toUpperCase();

    // Snapshot current meta/sig field values before rebuilding
    const meta = {
      dept:     document.getElementById('deptName')?.value   || 'PHARMACEUTICAL CARE DEPARTMENT KASC 6755',
      period:   document.getElementById('periodCovered')?.value || '',
      cost:     document.getElementById('costCenter')?.value  || '028498-7330',
      tel:      document.getElementById('inchargeTel')?.value || '67845 / 67843',
      reqName:  document.getElementById('reqName')?.value     || 'Dr. Mohammed Aseeri',
      reqTitle: document.getElementById('reqTitle')?.value    || 'Director Pharmaceutical Care Services-WR',
      reqID:    document.getElementById('reqID')?.value       || '9146184',
      appName:  document.getElementById('appName')?.value     || 'RPh. Jabr AL Subaie',
      appTitle: document.getElementById('appTitle')?.value    || 'Executive Director, Operations, WR',
      appID:    document.getElementById('appID')?.value       || '3712312',
    };

    showStatus("Loading from cloud…");
    let payload;
    try {
      if(_selectedReleaseId){
        const rArea=_selectedReleaseArea||area;
        const snap=await window.FB.getDoc(releaseDocRef(key,rArea,_selectedReleaseId));
        if(!snap.exists()){ showStatus('Release not found in cloud.',false); _selectedReleaseId=null; return; }
        payload=snap.data();
        _selectedReleaseId=null; _selectedReleaseArea=null;
      } else {
        const docId=`${year}-${String(month).padStart(2,'0')}`;
        const snap=await window.FB.getDoc(monthRef(key,area,docId));
        if(!snap.exists()){ showStatus(`No monthly rota for ${area} ${year}/${String(month).padStart(2,'0')}.`,false); return; }
        payload=snap.data();
      }
    } catch(e){ console.error(e); showStatus("Load failed: "+(e?.message||e),false); return; }

    // Update period label with loaded month
    const monthName=new Date(year,month-1,1).toLocaleString('default',{month:'long'});
    meta.period = `${monthName}-${String(year).slice(-2)}`;

    // Build rows (only staff with positive OT)
    const staffRecs=(() => { try{ return JSON.parse(localStorage.getItem(STAFF_KEY)||"[]")||[]; }catch{ return []; } })();
    const hrrByName={};
    staffRecs.forEach(s=>{ if(s.name&&s.hrr) hrrByName[s.name.trim()]=Number(s.hrr)||0; });

    // Fetch approved extensions from Extension page (Firebase-approved takes priority over manual entry)
    const extMap = await fetchGrantedExtensions(month, year, area);

    const records=Array.isArray(payload.records)?payload.records:[];
    const rows=[];
    records.forEach(rec=>{
      const name=(rec.staffName||'').trim(); if(!name) return;
      const baseOT = calcOT(rec,payload);
      // Firebase-approved extensions take priority; fall back to manually entered value
      const firebaseExt = extMap[name] || 0;
      const ext = firebaseExt > 0 ? firebaseExt : (Number(rec.extension)||0);
      // Combine OT + extension hours, rounded up to nearest integer when extension present
      const otHours = ext > 0 ? Math.ceil(baseOT + ext) : baseOT;
      if(otHours<=0) return;
      const hrr=hrrByName[name]||0;
      const totalCost=Math.round(otHours*hrr*1.5);   // integer SAR — ensures page total = sum of displayed rows
      const staffRec=staffRecs.find(s=>s.name.trim()===name);
      const badge=staffRec?.badge||'—';
      rows.push({ name, badge, otHours, totalCost, hrr });
    });

    buildForm(rows, area, meta);
    showStatus(`Form built — ${rows.length} staff with OT | ${Math.ceil(rows.length / (parseInt(document.getElementById('rowsPage1').value,10)||18)) || 1} page(s) ✅`);
  }

  // Init
  (function init(){
    buildAreaSelect();
    document.getElementById("monthSel").value=String(new Date().getMonth()+1);
    document.getElementById("yearSel").value=String(new Date().getFullYear());
  })();
