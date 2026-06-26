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
  function leaveDays(daysData,hols,m,y,leaveSet){
    let all=0,st=0;
    Object.entries(daysData||{}).forEach(([k,v])=>{
      const code=(v||'').toUpperCase().replace(/_O$/,'');
      const day=parseInt(k.replace('day',''),10);
      if(isInHolRange(hols,day)) return;
      if(code==='L'||leaveSet.has(code)){
        all++;
        const dw=new Date(y,m-1,day).getDay(); if(dw>=0&&dw<=4)st++;
      }
    });
    return {all,st};
  }
  function calcOT(rec,payload){
    if(rec.otOverride!=null){ const v=parseFloat(String(rec.otOverride).replace('+','')); return Number.isFinite(v)?Math.max(0,v):0; }
    // Use OT value saved by the rota (eliminates formula drift)
    if(rec.otCalc!=null){ const v=Number(rec.otCalc); return Number.isFinite(v)?Math.max(0,v):0; }
    // Legacy fallback for releases saved before otCalc was added
    const m=payload.month, y=payload.year||new Date().getFullYear();
    const hols=payload.holidays||[], mxd=Number(payload.mixedStdHours)||0;
    const tot=Number(rec.hours)||0, sched=rec.schedType||'';
    const leaveSet=new Set(Array.isArray(payload.leaveCodes)?payload.leaveCodes:['AL']);
    const lv=leaveDays(rec.daysData,hols,m,y,leaveSet);
    let std=0;
    if(sched==='Regular'){
      std=Math.max(0,sunThuInRange(m,y,1,getDIM(m,y))-holSunThu(hols,m,y)-lv.st)*9;
    } else if(sched==='12 Hours'){
      const td=getDIM(m,y), rem=Math.max(0,td-holAllDays(hols,m,y)-lv.all);
      std=Math.round((rem*15/28)*12*10)/10;
    } else if(sched==='Mixed'){
      const td=getDIM(m,y), den=Math.max(1,td-holAllDays(hols,m,y));
      std=mxd*(Math.max(0,den-lv.all)/den);
    }
    return Math.max(0, sched==='12 Hours' ? Math.ceil(tot-std) : Math.round((tot-std)*10)/10);
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

  // ── Summary page (last page — grand totals across all regular pages) ─────
  function summaryPageHtml(groups, meta, mode) {
    const showCost = mode !== 'noSR';
    const pages = groups.map((g, gi) => ({
      pageNum: gi + 1,
      count:   g.length,
      hours:   g.reduce((s,r) => s + r.otHours, 0),
      cost:    g.reduce((s,r) => s + r.totalCost, 0),
    }));
    const grandCount = pages.reduce((s,p) => s + p.count, 0);
    const grandHours = pages.reduce((s,p) => s + p.hours, 0);
    const grandCost  = pages.reduce((s,p) => s + p.cost,  0);

    let pageRows = '';
    pages.forEach(p => {
      pageRows += `<tr>
        <td class="num" style="font-weight:600;">Page ${p.pageNum}</td>
        <td class="num">${p.count}</td>
        <td class="num">${p.hours}</td>
        ${showCost ? `<td class="num">${fmt(p.cost)}</td>` : ''}
      </tr>`;
    });

    return `<div class="print-page">
      <div class="form-title">
        <div class="main-title" style="color:#1a4f8b;">Monthly Overtime Pre-Approval — Grand Summary</div>
        <div class="sub-title">
          King Abdulaziz Medical City<br>National Guard Health Affairs<br>Western Region
        </div>
      </div>
      <div class="meta-section">
        <div class="meta-row">
          <div class="meta-cell"><b>Department Name:</b>
            <input type="text" class="meta-val" value="${esc(meta.dept)}" readonly/>
          </div>
          <div class="meta-cell"><span>Period covered:</span>
            <input type="text" class="meta-val" value="${esc(meta.period)}" style="max-width:160px;" readonly/>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-cell"><b>Cost Center No:</b>
            <input type="text" class="meta-val" value="${esc(meta.cost)}" style="max-width:180px;" readonly/>
          </div>
          <div class="meta-cell"><span>Total pages:</span>
            <span class="meta-val" style="border:none;font-weight:700;">${groups.length}</span>
          </div>
        </div>
      </div>
      <table class="ot-table" style="margin-top:10px;">
        <thead><tr>
          <th style="width:20%;">Page</th>
          <th style="width:20%;">Staff Count</th>
          <th style="width:${showCost?'25':'60'}%;">Total Hours</th>
          ${showCost ? '<th style="width:35%;">Total Cost (﷼)</th>' : ''}
        </tr></thead>
        <tbody>
          ${pageRows}
          <tr class="total-row" style="background:#fef9c3;">
            <td style="text-align:center;font-weight:900;">Grand Total</td>
            <td class="num" style="font-weight:900;">${grandCount}</td>
            <td class="num" style="font-weight:900;">${grandHours}</td>
            ${showCost ? `<td class="num" style="font-weight:900;">${fmt(grandCost)} ﷼</td>` : ''}
          </tr>
        </tbody>
      </table>
      ${sigHtml(meta)}
    </div>`;
  }

  // ── Main form builder with pagination ────────────────────────────────────
  // mode: 'full'      → individual cost column + cost in total row (default)
  //       'noSR'      → no cost column, total hours only in total row
  //       'totalOnly' → no cost column per row, but total row shows hours + total SR amount
  function buildFormHtml(rows, area, meta, mode = 'full', includeSummary = true) {
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
      const pageNum = gi + 1;

      html += `<div class="print-page page-break-after">`;

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
            ${_locCell(r)}
            ${_justCell(r)}
          </tr>`;
        } else if (mode === 'noSR') {
          html += `<tr>
            <td class="num">${seq++}</td>
            <td class="num">${esc(r.badge)}</td>
            <td>${esc(stripBadge(r.name))}</td>
            <td class="num">${r.otHours}</td>
            ${_locCell(r)}
            ${_justCell(r)}
          </tr>`;
        } else {
          /* totalOnly — 7-column layout, SR cell blank per row */
          html += `<tr>
            <td class="num">${seq++}</td>
            <td class="num">${esc(r.badge)}</td>
            <td>${esc(stripBadge(r.name))}</td>
            <td class="num">${r.otHours}</td>
            <td class="num"></td>
            ${_locCell(r)}
            ${_justCell(r)}
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
          <td class="num" style="font-weight:900;">${fmt(pageTotal)} ﷼</td>
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

    if (includeSummary) html += summaryPageHtml(groups, meta, mode);
    return html;
  }

  function buildForm(rows, area, meta, mode = 'full') {
    if (mode === 'full') { _cachedRows = rows; _cachedArea = area; _cachedMeta = meta; }
    document.getElementById('formWrapper').innerHTML = buildFormHtml(rows, area, meta, mode) + formFooterHtml();
  }

  // ── Picker-trigger cell helpers ───────────────────────────────────────────
  const _PT = 'cursor:pointer;caret-color:transparent;width:100%;border:none;background:transparent;font-size:11px;font-family:Arial,sans-serif;outline:none;padding:0;';
  function _locCell(r) {
    return `<td class="loc"><input type="text" class="picker-trigger" value="${esc(r.loc||'')}" placeholder="📍 Click to select…" readonly style="${_PT}"/></td>`;
  }
  function _justCell(r) {
    return `<td class="just"><input type="text" class="picker-trigger" value="${esc(r.just||'')}" placeholder="📋 Click to select…" readonly style="${_PT}"/></td>`;
  }
  function _snapRowSelections() {
    if (!_cachedRows) return;
    document.querySelectorAll('#formWrapper .ot-table tbody tr').forEach(tr => {
      if (tr.classList.contains('total-row')) return;
      const idx = parseInt(tr.cells[0]?.textContent || '0') - 1;
      if (idx < 0 || idx >= _cachedRows.length) return;
      _cachedRows[idx].loc  = tr.querySelector('td.loc  .picker-trigger')?.value || '';
      _cachedRows[idx].just = tr.querySelector('td.just .picker-trigger')?.value || '';
    });
  }

  // ── Recalculate costs after justification change ─────────────────────────
  // ON-CALL DUTY → hours × HRR × 0.1 ; everything else → hours × HRR × 1.5
  function _recalcAfterJust(targetRow, newJust) {
    if (!_cachedRows) return;  // only 'full' mode has cached rows
    const dataRows = [...document.querySelectorAll('#formWrapper .ot-table tbody tr:not(.total-row)')];
    dataRows.forEach(tr => {
      if (targetRow && tr !== targetRow) return;
      const idx = parseInt(tr.cells[0]?.textContent || '0') - 1;
      if (idx < 0 || idx >= _cachedRows.length) return;
      const cr   = _cachedRows[idx];
      const mult = newJust === 'ON-CALL DUTY' ? 0.1 : 1.5;
      const cost = Math.round(cr.otHours * cr.hrr * mult);
      cr.totalCost = cost;
      if (tr.cells[4]) tr.cells[4].textContent = fmt(cost);
    });
    // Update each page's total-row cost cell (cells[2] in full mode)
    document.querySelectorAll('#formWrapper .ot-table tbody').forEach(tbody => {
      const totalRow = tbody.querySelector('.total-row');
      if (!totalRow) return;
      const pageSum = [...tbody.querySelectorAll('tr:not(.total-row)')].reduce((s, tr) => {
        const idx = parseInt(tr.cells[0]?.textContent || '0') - 1;
        return s + ((_cachedRows[idx]?.totalCost) || 0);
      }, 0);
      if (totalRow.cells[2]) totalRow.cells[2].textContent = fmt(pageSum);
    });
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
    _snapRowSelections();
    const meta = _snapMeta();
    buildForm(_cachedRows, _cachedArea, meta, 'noSR');
    window.print();
    buildForm(_cachedRows, _cachedArea, meta, 'full');
  }

  // ── Print hours per person + total SR amount only (no individual amounts) ─
  function printTotalSR() {
    if (!_cachedRows) { showStatus('Build the form first before printing.', false); return; }
    _snapRowSelections();
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

  // ── Row builder (shared by single-area and all-areas) ────────────────────
  function _buildRowsFromPayload(payload, staffRecs, hrrByName, extMap) {
    const records = Array.isArray(payload.records) ? payload.records : [];
    const rows = [];
    records.forEach(rec => {
      const name = (rec.staffName||'').trim(); if(!name) return;
      const baseOT = calcOT(rec, payload);
      const firebaseExt = extMap[name] || 0;
      const ext = firebaseExt > 0 ? firebaseExt : (Number(rec.extension)||0);
      const otHours = ext > 0 ? Math.ceil(baseOT + ext) : baseOT;
      if(otHours<=0) return;
      const hrr = hrrByName[name] || 0;
      const totalCost = Math.round(otHours * hrr * 1.5);
      const staffRec = staffRecs.find(s => s.name.trim() === name);
      const badge = staffRec?.badge || '—';
      rows.push({ name, badge, otHours, totalCost, hrr, loc: '', just: '' });
    });
    return rows;
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
        showStatus('No release selected. Pick a release first.', false);
        pickRelease();
        return;
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
    const rows = _buildRowsFromPayload(payload, staffRecs, hrrByName, extMap);

    buildForm(rows, area, meta);
    showStatus(`Form built — ${rows.length} staff with OT | ${Math.ceil(rows.length / (parseInt(document.getElementById('rowsPage1').value,10)||18)) || 1} page(s) ✅`);
  }

  // ── Fetch latest named release for one area ───────────────────────────────
  async function _fetchLatestRelease(key, area, month, year) {
    try {
      const docId = `${year}-${String(month).padStart(2,'0')}`;
      const snap  = await window.FB.getDoc(releaseIndexRef(key, area, docId));
      if (!snap.exists()) return null;
      const releases = snap.data().releases || [];
      if (!releases.length) return null;
      const latest = releases[releases.length - 1];
      const rdoc   = await window.FB.getDoc(releaseDocRef(key, area, latest.id));
      return rdoc.exists() ? { payload: rdoc.data(), relMeta: latest } : null;
    } catch { return null; }
  }

  // ── Master summary page (across all areas) ────────────────────────────────
  function masterSummaryHtml(items, month, year) {
    const monthName  = new Date(year, month-1, 1).toLocaleString('default', {month:'long'});
    const grandStaff = items.reduce((s,i) => s + i.staffCount, 0);
    const grandHours = items.reduce((s,i) => s + i.totalHours, 0);
    const grandCost  = items.reduce((s,i) => s + i.totalCost,  0);
    const rowsHtml   = items.map(it => `<tr>
      <td style="padding:6px 8px;border:1px solid #333;">${esc(it.area)}</td>
      <td class="num" style="padding:6px 8px;border:1px solid #333;">${it.staffCount}</td>
      <td class="num" style="padding:6px 8px;border:1px solid #333;">${it.totalHours}</td>
      <td class="num" style="padding:6px 8px;border:1px solid #333;">${fmt(it.totalCost)}</td>
    </tr>`).join('');
    return `<div class="print-page page-break-after">
      <div class="form-title">
        <div class="main-title">Monthly Overtime Pre-Approval — Grand Summary</div>
        <div class="sub-title">King Abdulaziz Medical City<br>National Guard Health Affairs<br>Western Region</div>
      </div>
      <div style="margin:10px 0 14px;font-size:11px;color:#374151;">
        Period: <strong>${monthName} ${year}</strong> &nbsp;·&nbsp; All Selected Areas
      </div>
      <table class="ot-table">
        <thead><tr>
          <th style="text-align:left;padding:8px;width:40%;">Area</th>
          <th style="text-align:center;padding:8px;width:20%;">Staff Count</th>
          <th style="text-align:center;padding:8px;width:20%;">Total Hours</th>
          <th style="text-align:center;padding:8px;width:20%;">Total Cost (﷼)</th>
        </tr></thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row" style="background:#fef9c3;">
            <td style="padding:7px 8px;font-weight:900;border:1px solid #333;text-align:center;">Grand Total</td>
            <td class="num" style="padding:7px 8px;font-weight:900;border:1px solid #333;">${grandStaff}</td>
            <td class="num" style="padding:7px 8px;font-weight:900;border:1px solid #333;">${grandHours}</td>
            <td class="num" style="padding:7px 8px;font-weight:900;border:1px solid #333;">${fmt(grandCost)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  // ── All-Areas print orchestrator ──────────────────────────────────────────
  async function buildAndPrintAllAreas(selectedAreas, month, year, zeroAction) {
    const key = (window.BCOT_APP_KEY||'').trim();
    if (!key) { showStatus('config.js not found.', false); return; }

    const staffRecs = (() => { try{ return JSON.parse(localStorage.getItem(STAFF_KEY)||'[]')||[]; }catch{ return []; } })();
    const hrrByName = {};
    staffRecs.forEach(s => { if(s.name&&s.hrr) hrrByName[s.name.trim()]=Number(s.hrr)||0; });

    const baseMeta = {
      dept:     document.getElementById('deptName')?.value     || 'PHARMACEUTICAL CARE DEPARTMENT KASC 6755',
      period:   new Date(year,month-1,1).toLocaleString('default',{month:'long'}) + '-' + String(year).slice(-2),
      cost:     document.getElementById('costCenter')?.value   || '028498-7330',
      tel:      document.getElementById('inchargeTel')?.value  || '67845 / 67843',
      reqName:  document.getElementById('reqName')?.value      || 'Dr. Mohammed Aseeri',
      reqTitle: document.getElementById('reqTitle')?.value     || 'Director Pharmaceutical Care Services-WR',
      reqID:    document.getElementById('reqID')?.value        || '9146184',
      appName:  document.getElementById('appName')?.value      || 'RPh. Jabr AL Subaie',
      appTitle: document.getElementById('appTitle')?.value     || 'Executive Director, Operations, WR',
      appID:    document.getElementById('appID')?.value        || '3712312',
    };

    let fullHtml = '', summaryItems = [], noRelease = [], noOT = [];

    for (const area of selectedAreas) {
      showStatus(`Fetching ${area}…`);
      const result = await _fetchLatestRelease(key, area, month, year);
      if (!result) { noRelease.push(area); continue; }

      const extMap = await fetchGrantedExtensions(month, year, area);
      const rows   = _buildRowsFromPayload(result.payload, staffRecs, hrrByName, extMap);

      if (!rows.length) {
        if (zeroAction === 'zeros') {
          summaryItems.push({ area, staffCount:0, totalHours:0, totalCost:0 });
        } else {
          noOT.push(area);
        }
        continue;
      }

      const meta = { ...baseMeta };
      fullHtml += buildFormHtml(rows, area, meta, 'full', false);
      summaryItems.push({
        area,
        staffCount: rows.length,
        totalHours: rows.reduce((s,r) => s+r.otHours, 0),
        totalCost:  rows.reduce((s,r) => s+r.totalCost, 0),
      });
    }

    if (!summaryItems.length) {
      const why = noRelease.length ? ` No releases found for: ${noRelease.join(', ')}.` : '';
      showStatus('No data to print.' + why, false);
      return;
    }

    const wrapper = document.getElementById('formWrapper');
    const prevHtml = wrapper.innerHTML;
    wrapper.innerHTML = fullHtml + masterSummaryHtml(summaryItems, month, year) + formFooterHtml();
    window.print();
    wrapper.innerHTML = prevHtml;

    const parts = [
      `Printed ${summaryItems.filter(i=>i.staffCount>0).length} area(s) with OT`,
      zeroAction==='zeros' && summaryItems.some(i=>i.staffCount===0)
        ? `${summaryItems.filter(i=>i.staffCount===0).length} included as zeros`
        : null,
      noRelease.length  ? `No release: ${noRelease.join(', ')}`  : null,
      noOT.length       ? `Skipped (no OT): ${noOT.join(', ')}` : null,
    ].filter(Boolean);
    showStatus(parts.join(' · ') + ' ✅');
  }

  // ── All-Areas modal ───────────────────────────────────────────────────────
  function openAllAreasModal() {
    document.getElementById('_aaBd')?.remove();
    const areas = (() => { try{ return JSON.parse(localStorage.getItem(AREAS_LIST_KEY)||'[]')||[]; }catch{ return []; } })();
    if (!areas.length) { showStatus('No areas found. Add areas in the rota first.', false); return; }

    const month = Number(document.getElementById('monthSel').value);
    const year  = Number(document.getElementById('yearSel').value) || new Date().getFullYear();
    const monthName = new Date(year, month-1, 1).toLocaleString('default', {month:'long'});

    const chkHtml = areas.map(a => {
      const isBC = /bcot|^bc$/i.test(a.trim());
      return `<label style="display:flex;align-items:center;gap:9px;padding:5px 2px;cursor:pointer;user-select:none;">
        <input type="checkbox" class="_aChk" value="${esc(a)}" ${isBC?'':'checked'} style="width:15px;height:15px;cursor:pointer;accent-color:#1a4f8b;"/>
        <span style="font-size:13px;color:#1e293b;">${esc(a)}</span>
      </label>`;
    }).join('');

    const bd = document.createElement('div');
    bd.id = '_aaBd';
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.48);z-index:9800;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
    bd.innerHTML = `
      <div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:min(460px,96%);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="background:linear-gradient(135deg,#1a4f8b,#2e8b57);padding:13px 18px;display:flex;align-items:center;justify-content:space-between;">
          <span style="color:#fff;font-size:13px;font-weight:700;">🖨 Print All Areas — ${monthName} ${year}</span>
          <button id="_aaX" style="background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;">✕</button>
        </div>
        <div style="padding:16px 20px;overflow-y:auto;flex:1;">

          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;">Areas</span>
            <div style="display:flex;gap:6px;">
              <button id="_aaAll"  style="background:#e2e8f0;color:#374151;border:none;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;">All</button>
              <button id="_aaNone" style="background:#e2e8f0;color:#374151;border:none;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;">None</button>
            </div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;max-height:180px;overflow-y:auto;margin-bottom:14px;">
            ${chkHtml}
          </div>

          <div style="background:#f8fafc;border-radius:8px;padding:12px 14px;border:1px solid #e2e8f0;">
            <span style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:9px;">Areas with no overtime this month</span>
            <label style="display:flex;align-items:center;gap:9px;margin-bottom:7px;cursor:pointer;">
              <input type="radio" name="_zeroAct" value="skip" checked style="cursor:pointer;accent-color:#1a4f8b;"/>
              <span style="font-size:13px;">Skip</span>
            </label>
            <label style="display:flex;align-items:center;gap:9px;cursor:pointer;">
              <input type="radio" name="_zeroAct" value="zeros" style="cursor:pointer;accent-color:#1a4f8b;"/>
              <span style="font-size:13px;">Include with zeros</span>
            </label>
          </div>

        </div>
        <div style="padding:11px 20px 15px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end;">
          <button id="_aaCn" style="background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;font-weight:600;">Cancel</button>
          <button id="_aaBuild" style="background:#1a4f8b;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Build &amp; Print</button>
        </div>
      </div>`;
    document.body.appendChild(bd);

    const $ = id => bd.querySelector(id);
    const dismiss = () => bd.remove();
    bd.addEventListener('click', e => { if(e.target===bd) dismiss(); });
    $('#_aaX').addEventListener('click', dismiss);
    $('#_aaCn').addEventListener('click', dismiss);
    $('#_aaAll').addEventListener('click',  () => bd.querySelectorAll('._aChk').forEach(c => c.checked=true));
    $('#_aaNone').addEventListener('click', () => bd.querySelectorAll('._aChk').forEach(c => c.checked=false));

    $('#_aaBuild').addEventListener('click', async () => {
      const selected = [...bd.querySelectorAll('._aChk:checked')].map(c => c.value);
      if (!selected.length) { showStatus('Select at least one area.', false); return; }
      const zeroAction = bd.querySelector('input[name="_zeroAct"]:checked')?.value || 'skip';
      dismiss();
      await buildAndPrintAllAreas(selected, month, year, zeroAction);
    });
  }

  // Init
  (function init(){
    buildAreaSelect();
    document.getElementById("monthSel").value=String(new Date().getMonth()+1);
    document.getElementById("yearSel").value=String(new Date().getFullYear());

    document.getElementById('formWrapper').addEventListener('click', function(e) {
      const inp = e.target.closest('.picker-trigger');
      if (!inp || typeof PreApprovalPicker === 'undefined') return;
      const row = inp.closest('tr'); if (!row) return;
      const locInp  = row.querySelector('td.loc  .picker-trigger');
      const justInp = row.querySelector('td.just .picker-trigger');
      PreApprovalPicker.open({
        currentLoc:  locInp?.value  || '',
        currentJust: justInp?.value || '',
        onConfirm: (loc, just, applyAll) => {
          if (applyAll) {
            document.querySelectorAll('#formWrapper td.loc  .picker-trigger').forEach(i => { i.value = loc;  });
            document.querySelectorAll('#formWrapper td.just .picker-trigger').forEach(i => { i.value = just; });
          } else {
            if (locInp)  locInp.value  = loc;
            if (justInp) justInp.value = just;
          }
          // Recalculate Total Cost: ON-CALL DUTY → ×0.1, otherwise ×1.5
          _recalcAfterJust(applyAll ? null : row, just);
        }
      });
    });
  })();
