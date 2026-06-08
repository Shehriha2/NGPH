  const STAFF_KEY  = "BCOT_STAFF_RECORDS_V2";
  const DUTIES_KEY = "BCOT_DUTIES_ALL_V1";

  // Fixed justification text for all BC OT rows
  const BC_JUSTIFICATION = "Catering Prescriptions for Business Center (Private Patients)";
  // Location options for BC OT
  const BC_LOCATIONS = ["Oncology", "NSTC", "ACC"];

  // Detect BC location(s) by scanning all assigned duty names.
  // Collects every matching location across all days, then joins with "/".
  // e.g. only Oncology duties → "Oncology"
  //      only NSTC duties    → "NSTC"
  //      both present        → "Oncology/NSTC"
  function detectLocation(daysData, duties) {
    const found = new Set();
    for (const val of Object.values(daysData || {})) {
      let code = (val || '').toUpperCase();
      if (code.endsWith('_O')) code = code.slice(0, -2);
      const dutyName = (duties[code]?.name || duties[code]?.label || '').toLowerCase();
      BC_LOCATIONS.forEach(l => { if (dutyName.includes(l.toLowerCase())) found.add(l); });
    }
    // Return in BC_LOCATIONS order, joined with "/"
    return BC_LOCATIONS.filter(l => found.has(l)).join('/');
  }

  // ── Status ────────────────────────────────────────────────────────────────
  function showStatus(msg, ok=true) {
    const el=document.getElementById("statusBox");
    el.textContent=msg; el.className="status-message "+(ok?"status-ok":"status-err");
    el.style.display="block"; setTimeout(()=>el.style.display="none",4000);
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
    const month = Number(document.getElementById("monthSel").value);
    const year  = Number(document.getElementById("yearSel").value) || new Date().getFullYear();
    const area  = 'BCOT';
    const docId = `${year}-${String(month).padStart(2,'0')}`;

    showStatus("Fetching releases…");
    let releases = [];
    try {
      const snap = await window.FB.getDoc(releaseIndexRef(key, area, docId));
      releases = snap.exists() ? (snap.data().releases || []) : [];
    } catch(e) { showStatus("Failed to load releases: "+(e?.message||e), false); return; }

    document.getElementById('relPickerBackdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'relPickerBackdrop';
    backdrop.className = 'rel-modal-backdrop';
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });

    const monthName = new Date(year, month-1, 1).toLocaleString('default', {month:'long'});
    let bodyHtml = '';
    if (!releases.length) {
      bodyHtml = `<div class="rel-empty">No releases saved for BCOT — ${monthName} ${year}.<br>Save a release from the Rota page first.</div>`;
    } else {
      [...releases].reverse().forEach(r => {
        const date = r.savedAt ? new Date(r.savedAt).toLocaleString() : '—';
        const note = r.note ? `<span style="color:#374151;"> — ${r.note}</span>` : '';
        bodyHtml += `<div class="rel-item" onclick="applyRelease('${r.id}')">
          <div>
            <div class="rel-item-name">Release #${r.releaseNum} — BCOT-${monthName.slice(0,3)}</div>
            <div class="rel-item-meta">${date}${note} &nbsp;·&nbsp; ${r.staffCount||'?'} staff</div>
          </div>
          <button class="rel-item-btn">Load</button>
        </div>`;
      });
    }

    backdrop.innerHTML = `<div class="rel-modal">
      <div class="rel-modal-head">
        <span>Pick Release — BCOT / ${monthName} ${year}</span>
        <button class="rel-modal-close" onclick="document.getElementById('relPickerBackdrop').remove()">✕</button>
      </div>
      <div class="rel-modal-body">${bodyHtml}</div>
    </div>`;
    document.body.appendChild(backdrop);

    if (releases.length) showStatus('');
    else showStatus(`No releases found for BCOT ${monthName} ${year}.`, false);
  }

  async function applyRelease(releaseId) {
    document.getElementById('relPickerBackdrop')?.remove();
    _selectedReleaseId = releaseId;
    await loadAndBuild();
  }

  // ── HTML helpers ──────────────────────────────────────────────────────────
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function stripBadge(name){ return String(name||'').replace(/\s*\(\d+\)\s*$/, '').trim(); }

  function locationInputHtml(detected='') {
    // Datalist gives quick-pick suggestions; text input allows combined values like "Oncology/NSTC"
    const opts = BC_LOCATIONS.map(l => `<option value="${esc(l)}"/>`).join('');
    return `<input type="text" value="${esc(detected)}" list="bcLocList" placeholder="—"
              style="width:100%;border:none;background:transparent;font-size:11px;
                     font-family:Arial,sans-serif;outline:none;padding:0;"/>
            <datalist id="bcLocList">${opts}</datalist>`;
  }

  function tableHeaderHtml() {
    return `<table class="ot-table">
      <thead><tr>
        <th style="width:5%;">SN</th>
        <th style="width:10%;">Badge no.</th>
        <th style="width:30%;">Name</th>
        <th style="width:10%;">No. of<br>Hours</th>
        <th style="width:14%;">Location</th>
        <th style="width:31%;">Justification</th>
      </tr></thead><tbody>`;
  }

  function sigHtml(meta) {
    return `<div class="sig-wrapper">
      <div class="sig-row1">
        <div class="sig-block">
          <div class="sig-label">Requested by:</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span>  <input type="text" value="${esc(meta.reqName)}"/></div>
          <div class="sig-field"><span class="sf-key">Title :</span><input type="text" value="${esc(meta.reqTitle)}"/></div>
        </div>
        <div class="sig-block">
          <div class="sig-label">Reviewed by:</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span>  <input type="text" value="${esc(meta.revName)}"/></div>
          <div class="sig-field"><span class="sf-key">Title :</span><input type="text" value="${esc(meta.revTitle)}"/></div>
        </div>
      </div>
      <div class="sig-row2">
        <div class="sig-block">
          <div class="sig-label" style="text-align:center;">Approved by:</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span>  <input type="text" value="${esc(meta.appName)}"/></div>
          <div class="sig-field"><span class="sf-key">Title :</span><input type="text" value="${esc(meta.appTitle)}"/></div>
        </div>
      </div>
    </div>`;
  }

  function formFooterHtml() {
    return `<div class="form-footer">
      <span class="ff-center" style="flex:1;text-align:center;">Pharmacy automated version — Business Center OT</span>
    </div>`;
  }

  // ── Main form builder with pagination ────────────────────────────────────
  function buildForm(rows, meta) {
    const wrapper = document.getElementById('formWrapper');
    const rp1 = Math.max(5, parseInt(document.getElementById('rowsPage1').value,10)||18);
    const rpN = Math.max(5, parseInt(document.getElementById('rowsPageN').value,10)||22);

    const groups = [];
    if (rows.length <= rp1) {
      groups.push(rows);
    } else {
      groups.push(rows.slice(0, rp1));
      let rem = rows.slice(rp1);
      while (rem.length) { groups.push(rem.slice(0, rpN)); rem = rem.slice(rpN); }
    }

    const grandTotalHours = rows.reduce((s,r) => s + r.hours, 0);
    const totalPages = groups.length;
    let seq = 1, html = '';

    groups.forEach((group, gi) => {
      const isLast = gi === totalPages - 1;
      const pageNum = gi + 1;

      html += `<div class="print-page${isLast ? '' : ' page-break-after'}">`;

      const pgBadge = totalPages > 1
        ? `<div style="position:absolute;top:0;right:0;font-size:9px;color:#888;font-style:italic;">Page ${pageNum} / ${totalPages}</div>`
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
            <input type="text" class="meta-val" ${gi===0?'id="deptName"':''} value="${esc(meta.dept)}"/>
          </div>
          <div class="meta-cell"><span>Period covered:</span>
            <input type="text" class="meta-val" ${gi===0?'id="periodCovered"':''} value="${esc(meta.period)}" style="max-width:160px;"/>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-cell"><b>Cost Center:</b>
            <input type="text" class="meta-val" ${gi===0?'id="costCenter"':''} value="${esc(meta.cost)}" style="max-width:180px;"/>
          </div>
          <div class="meta-cell"><span>Incharge Contact no:</span>
            <input type="text" class="meta-val" ${gi===0?'id="inchargeTel"':''} value="${esc(meta.tel)}" style="max-width:160px;"/>
          </div>
        </div>
      </div>`;

      html += tableHeaderHtml();

      group.forEach(r => {
        html += `<tr>
          <td class="num">${seq++}</td>
          <td class="num">${esc(r.badge)}</td>
          <td>${esc(stripBadge(r.name))}</td>
          <td class="num">${r.hours}</td>
          <td class="loc">${locationInputHtml(r.location)}</td>
          <td class="just">${esc(BC_JUSTIFICATION)}</td>
        </tr>`;
      });

      // Per-page subtotal (hours only — no cost)
      const pageHours = group.reduce((s,r) => s + r.hours, 0);
      html += `<tr class="total-row">
        <td colspan="3" style="text-align:center;font-weight:700;">Total Overtime Hours/ Cost</td>
        <td class="num">${pageHours}</td>
        <td colspan="2"></td>
      </tr>`;

      html += `</tbody></table>`;

      html += sigHtml(meta);
      html += `</div>`;  // end .print-page
    });

    html += formFooterHtml();
    wrapper.innerHTML = html;
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
    const key = (window.BCOT_APP_KEY||'').trim();
    if (!key) { showStatus("config.js not found.", false); return; }
    const month = Number(document.getElementById("monthSel").value);
    const year  = Number(document.getElementById("yearSel").value) || new Date().getFullYear();

    // Snapshot current meta/sig field values before rebuilding
    const meta = {
      dept:     document.getElementById('deptName')?.value    || 'PHARMACEUTICAL CARE SERVICES',
      period:   document.getElementById('periodCovered')?.value || '',
      cost:     document.getElementById('costCenter')?.value   || '7330',
      tel:      document.getElementById('inchargeTel')?.value  || '62998-62903',
      reqName:  document.getElementById('reqName')?.value      || 'Dr. Mohammed Aseeri',
      reqTitle: document.getElementById('reqTitle')?.value     || 'Director, Pharmaceutical Care Services',
      revName:  document.getElementById('revName')?.value      || 'Mr. Abdulaziz Alotaiby',
      revTitle: document.getElementById('revTitle')?.value     || 'Claim Section (IP.OP.ER), Business Center WR',
      appName:  document.getElementById('appName')?.value      || 'Mr. Saeed Al Muosa',
      appTitle: document.getElementById('appTitle')?.value     || 'Director, Operations, Business Center WR',
    };

    showStatus("Loading from cloud…");
    let payload;
    try {
      // BC rota is always saved under area "BCOT"
      const area = 'BCOT';
      if (_selectedReleaseId) {
        const snap = await window.FB.getDoc(releaseDocRef(key, area, _selectedReleaseId));
        if (!snap.exists()) { showStatus('Release not found in cloud.', false); _selectedReleaseId=null; return; }
        payload = snap.data();
        _selectedReleaseId = null;
      } else {
        const docId = `${year}-${String(month).padStart(2,'0')}`;
        const snap  = await window.FB.getDoc(monthRef(key, area, docId));
        if (!snap.exists()) { showStatus(`No monthly rota for BCOT ${year}/${String(month).padStart(2,'0')}.`, false); return; }
        payload = snap.data();
      }
    } catch(e) { console.error(e); showStatus("Load failed: "+(e?.message||e), false); return; }

    // Update period label
    const monthName = new Date(year, month-1, 1).toLocaleString('default', {month:'long'});
    meta.period = `${monthName}-${String(year).slice(-2)}`;

    // Load staff for badge lookup + duties for location detection
    const staffRecs = (() => { try{ return JSON.parse(localStorage.getItem(STAFF_KEY)||"[]")||[]; }catch{ return []; } })();
    const duties    = (() => { try{ return JSON.parse(localStorage.getItem(DUTIES_KEY)||"{}"); }catch{ return {}; } })();

    // Fetch approved extensions (Firebase-approved takes priority over manual entry)
    const extMap = await fetchGrantedExtensions(month, year, 'BCOT');

    // Filter to BC schedule rows only — for BC, all hours = overtime
    const records = Array.isArray(payload.records) ? payload.records : [];
    const rows = [];
    records.forEach(rec => {
      if ((rec.schedType||'') !== 'BC') return;  // only BC rows
      const name = (rec.staffName||'').trim(); if (!name) return;
      const hours = Number(rec.hours) || 0;
      if (hours <= 0) return;
      const staffRec = staffRecs.find(s => s.name.trim() === name);
      const badge    = staffRec?.badge || '—';
      // Auto-detect location from assigned duty names (e.g. "Oncology Pharmacist" → "Oncology")
      const location = detectLocation(rec.daysData, duties);
      // Firebase-approved extensions take priority; fall back to manually entered value
      const firebaseExt = extMap[name] || 0;
      const ext         = firebaseExt > 0 ? firebaseExt : (Number(rec.extension)||0);
      const combined    = ext > 0 ? Math.ceil(hours + ext) : hours;
      rows.push({ name, badge, hours: combined, location });
    });

    if (!rows.length) {
      showStatus("No BC staff with hours found. Make sure rows in the rota have schedule type set to BC.", false);
      return;
    }

    buildForm(rows, meta);
    showStatus(`BC OT form built — ${rows.length} staff | ${Math.ceil(rows.length / (parseInt(document.getElementById('rowsPage1').value,10)||18)) || 1} page(s) ✅`);
  }

  // Init
  (function init(){
    document.getElementById("monthSel").value = String(new Date().getMonth()+1);
    document.getElementById("yearSel").value  = String(new Date().getFullYear());
  })();
