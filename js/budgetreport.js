  const AREAS_LIST_KEY   = "BCOT_AREAS_LIST_V1";
  const AREA_BUDGETS_KEY = "BCOT_AREA_BUDGETS_V1";
  const STAFF_RECORDS_KEY= "BCOT_STAFF_RECORDS_V2";
  const DUTIES_ALL_KEY   = "BCOT_DUTIES_ALL_V1";

  // ── Status ─────────────────────────────────────────────────────────────────
  function showStatus(msg, type='success') {
    const el = document.getElementById("statusBox");
    el.textContent = msg;
    el.className = "status-message status-" + type;
    el.style.display = "block";
    setTimeout(() => el.style.display = "none", 4000);
  }

  function getKeyOrWarn() {
    const key = (window.BCOT_APP_KEY || "").trim();
    if (!key) { showStatus("config.js not found — cloud sync disabled.", 'error'); return null; }
    return key;
  }

  // ── Area select ─────────────────────────────────────────────────────────────
  function buildAreaSelect() {
    const sel = document.getElementById("areaSelect");
    const list = (() => { try { return JSON.parse(localStorage.getItem(AREAS_LIST_KEY)||"[]")||[]; } catch { return []; } })();
    sel.innerHTML = '<option value="ALL">All Areas</option>';
    list.forEach(a => { const o=document.createElement("option"); o.value=a; o.textContent=a; sel.appendChild(o); });
    const last = (localStorage.getItem("BCOT_CURRENT_AREA_V1")||"ALL").trim().toUpperCase();
    if (last==="ALL"||list.includes(last)) sel.value=last;
  }

  // ── OT calculation (mirrors index.html logic) ───────────────────────────────
  function getDaysInMonth(month, year) { return new Date(year, month, 0).getDate(); }

  function getEnabledHolidays(holidays) {
    return (holidays||[]).filter(h => h.enabled && h.fromDay && h.toDay && h.toDay >= h.fromDay);
  }

  function countSunThuInRange(month, year, fromDay, toDay) {
    const days = getDaysInMonth(month, year);
    const f = Math.max(1, fromDay), t = Math.min(days, toDay);
    let n = 0;
    for (let d=f; d<=t; d++) { const dow=new Date(year,month-1,d).getDay(); if(dow>=0&&dow<=4) n++; }
    return n;
  }

  function countHolidaySunThu(holidays, month, year) {
    let n=0;
    getEnabledHolidays(holidays).forEach(h => n += countSunThuInRange(month,year,h.fromDay,h.toDay));
    return n;
  }

  function countHolidayAllDays(holidays, month, year) {
    const days=getDaysInMonth(month,year); let n=0;
    getEnabledHolidays(holidays).forEach(h => {
      const f=Math.max(1,h.fromDay), t=Math.min(days,h.toDay); if(t>=f) n+=t-f+1;
    });
    return n;
  }

  function countLeaveDays(daysData, month, year, duties) {
    let all=0, sunThu=0;
    Object.entries(daysData||{}).forEach(([key,v]) => {
      const raw=(v||'').toUpperCase();
      const baseV=raw.endsWith('_O')?raw.slice(0,-2):raw;
      if (!baseV) return;
      const d=parseInt(key.replace('day',''),10);
      const isLeave = baseV==='L' ||
        (duties&&duties[baseV]&&Number(duties[baseV].hours)===0&&!duties[baseV].noLeaveCount);
      if (isLeave) {
        all++;
        const dow=new Date(year,month-1,d).getDay(); if(dow>=0&&dow<=4) sunThu++;
      }
    });
    return {all, sunThu};
  }

  function calcOTHours(rec, payload, duties) {
    // Use override if set
    if (rec.otOverride != null) {
      const v=parseFloat(String(rec.otOverride).replace('+',''));
      return Number.isFinite(v) ? Math.max(0,v) : 0;
    }
    const month=payload.month, year=payload.year||new Date().getFullYear();
    const holidays=payload.holidays||[];
    const mixedStdHours=Number(payload.mixedStdHours)||0;
    const totalHours=Number(rec.hours)||0;
    const schedType=rec.schedType||'';
    const leave=countLeaveDays(rec.daysData, month, year, duties);
    let standard=0;
    if (schedType==='Regular') {
      const totalWT=countSunThuInRange(month,year,1,getDaysInMonth(month,year));
      const net=Math.max(0, totalWT - countHolidaySunThu(holidays,month,year) - leave.sunThu);
      standard=net*9;
    } else if (schedType==='12 Hours') {
      const totalDays=getDaysInMonth(month,year);
      const rem=Math.max(0, totalDays - countHolidayAllDays(holidays,month,year) - leave.all);
      standard=(rem*15/28)*12;
    } else if (schedType==='Mixed') {
      const totalDays=getDaysInMonth(month,year);
      const denom=Math.max(1, totalDays - countHolidayAllDays(holidays,month,year));
      const rem=Math.max(0, denom - leave.all);
      standard=mixedStdHours*(rem/denom);
    }
    return Math.max(0, Math.round((totalHours-standard)*10)/10);
  }

  // ── OT cost split across areas ──────────────────────────────────────────────
  function splitOTCost(rec, otHours, hrr, DUTIES) {
    if (otHours <= 0 || hrr <= 0) return {};
    const otCost = otHours * hrr * 1.5;   // OT rate = HRR × 1.5 × hours

    const pureOTHByArea = {};   // from _O cells → charged directly
    const propHByArea   = {};   // from normal cells → proportional split

    Object.values(rec.daysData||{}).forEach(code => {
      const v=(code||'').toUpperCase(); if(!v||v==='L') return;
      const isOT=v.endsWith('_O');
      const baseCode=isOT?v.slice(0,-2):v;
      const duty=DUTIES[baseCode]; if(!duty) return;
      const area=(duty.area||'UNKNOWN').toUpperCase();
      const h=Number(duty.hours)||0;
      if (isOT) pureOTHByArea[area]=(pureOTHByArea[area]||0)+h;
      else       propHByArea[area]  =(propHByArea[area]  ||0)+h;
    });

    const totalPureH=Object.values(pureOTHByArea).reduce((s,v)=>s+v,0);
    // Scale factor: cap pure OT allocation if _O cell hours exceed total OT hours
    const scale=totalPureH>0 ? Math.min(1, otHours/totalPureH) : 0;

    const result={};
    let directTotal=0;
    Object.entries(pureOTHByArea).forEach(([area,h]) => {
      const cost=h*scale*hrr*1.5;   // direct OT cost for this area (×1.5 rate)
      result[area]=(result[area]||0)+cost;
      directTotal+=cost;
    });

    const remainingCost=Math.max(0, otCost-directTotal);
    const totalPropH=Object.values(propHByArea).reduce((s,v)=>s+v,0);
    if (totalPropH>0 && remainingCost>0) {
      Object.entries(propHByArea).forEach(([area,h]) => {
        result[area]=(result[area]||0)+remainingCost*(h/totalPropH);
      });
    }

    return result;
  }

  // ── Firestore paths ─────────────────────────────────────────────────────────
  function getMonthDocRef(key, area, monthDocId) {
    return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'months',monthDocId);
  }
  function getReleaseIndexRef(key, area, docId) {
    return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'release_index',docId);
  }
  function getReleaseDocRef(key, area, releaseId) {
    return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'releases',releaseId);
  }

  // ── Release picker ────────────────────────────────────────────────────────
  let _selectedReleaseId   = null;
  let _selectedReleaseArea = null;

  async function pickRelease() {
    const key   = getKeyOrWarn(); if (!key) return;
    const month = Number(document.getElementById("monthSelect").value);
    const year  = Number(document.getElementById("yearInput").value) || new Date().getFullYear();
    const area  = (document.getElementById("areaSelect").value || "ALL").trim().toUpperCase();
    const docId = `${year}-${String(month).padStart(2,'0')}`;

    showStatus("Fetching releases…", "info");
    let releases = [];
    try {
      const snap = await window.FB.getDoc(getReleaseIndexRef(key, area, docId));
      releases = snap.exists() ? (snap.data().releases || []) : [];
    } catch(e) { showStatus("Failed to load releases: "+(e?.message||e), 'error'); return; }

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

    if (releases.length) showStatus('', 'success');
    else showStatus(`No releases found for ${area} ${monthName} ${year}.`, 'error');
  }

  async function applyRelease(releaseId, area) {
    document.getElementById('relPickerBackdrop')?.remove();
    _selectedReleaseId   = releaseId;
    _selectedReleaseArea = area;
    await generateReport();
  }

  // ── Generate report ─────────────────────────────────────────────────────────
  async function generateReport() {
    const key=getKeyOrWarn(); if(!key) return;
    const month=Number(document.getElementById("monthSelect").value);
    const year =Number(document.getElementById("yearInput").value)||new Date().getFullYear();
    const area =(document.getElementById("areaSelect").value||"ALL").trim().toUpperCase();

    showStatus("Loading rota from cloud…","info");

    let payload;
    try {
      if (_selectedReleaseId) {
        const rArea = _selectedReleaseArea || area;
        const snap  = await window.FB.getDoc(getReleaseDocRef(key, rArea, _selectedReleaseId));
        if (!snap.exists()) { showStatus('Release not found in cloud.','error'); _selectedReleaseId=null; return; }
        payload = snap.data();
        _selectedReleaseId = null; _selectedReleaseArea = null;
      } else {
        const docId=`${year}-${String(month).padStart(2,'0')}`;
        const snap=await window.FB.getDoc(getMonthDocRef(key, area, docId));
        if (!snap.exists()) { showStatus(`No monthly rota saved for ${area} – ${year}/${String(month).padStart(2,'0')}.`,'error'); return; }
        payload=snap.data();
      }
    } catch(e) { console.error(e); showStatus("Failed to load rota: "+(e?.message||e),'error'); return; }

    showStatus("Calculating…","info");

    // Load support data from localStorage
    const DUTIES = (() => { try { return JSON.parse(localStorage.getItem(DUTIES_ALL_KEY)||"{}")||{}; } catch { return {}; } })();
    const staffRecs = (() => { try { return JSON.parse(localStorage.getItem(STAFF_RECORDS_KEY)||"[]")||[]; } catch { return []; } })();
    const budgets   = (() => { try { return JSON.parse(localStorage.getItem(AREA_BUDGETS_KEY)||"{}")||{}; } catch { return {}; } })();

    // Build HRR lookup by name
    const hrrByName = {};
    staffRecs.forEach(s => { if (s.name && s.hrr) hrrByName[s.name.trim()] = Number(s.hrr)||0; });

    // Per-area totals
    const areaCosts = {};    // area → total OT cost (SAR)
    const staffRows = [];    // for detail table

    const records = Array.isArray(payload.records) ? payload.records : [];
    records.forEach(rec => {
      const name = (rec.staffName||'').trim();
      if (!name) return;
      const hrr = hrrByName[name] || 0;
      const otHours = calcOTHours(rec, payload, DUTIES);
      const split = splitOTCost(rec, otHours, hrr, DUTIES);

      Object.entries(split).forEach(([ar, cost]) => {
        areaCosts[ar] = (areaCosts[ar]||0) + cost;
      });

      staffRows.push({ name, hrr, otHours, otCost: otHours*hrr*1.5, split });   // ×1.5 OT rate
    });

    renderReport({ payload, month, year, area, areaCosts, budgets, staffRows, DUTIES });
    showStatus("Report generated ✅");
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function sar(n) { return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR'; }

  function renderReport({ payload, month, year, area, areaCosts, budgets, staffRows, DUTIES }) {
    const allAreas = Array.from(new Set([
      ...Object.keys(budgets),
      ...Object.keys(areaCosts)
    ])).sort();

    let html = '';

    // Header info card
    const monthName = new Date(year,month-1,1).toLocaleString('default',{month:'long'});
    html += `<div class="card">
      <b>Report:</b> ${monthName} ${year} &nbsp;|&nbsp;
      <b>Rota Area:</b> ${area} &nbsp;|&nbsp;
      <b>Rota Title:</b> ${payload.rotaTitle||'—'} &nbsp;|&nbsp;
      <b>Staff Records:</b> ${staffRows.length}
    </div>`;

    // Per-area summary cards
    html += `<div class="area-grid">`;
    if (!allAreas.length) {
      html += `<div class="card"><div class="no-data">No area cost data. Make sure duties have area tags and staff have HRR values.</div></div>`;
    }
    allAreas.forEach(ar => {
      const budget    = Number(budgets[ar])||0;
      const consumed  = areaCosts[ar]||0;
      const remaining = budget - consumed;
      const remClass  = remaining > 0 ? 'positive' : remaining < 0 ? 'negative' : 'zero';
      html += `<div class="area-card">
        <h3>${ar}</h3>
        <div class="metric-row"><span class="metric-label">Budget Allocated</span><span class="metric-val">${sar(budget)}</span></div>
        <div class="metric-row"><span class="metric-label">OT Cost Consumed</span><span class="metric-val" style="color:#dc2626">${sar(consumed)}</span></div>
        <div class="metric-row"><span class="metric-label">Remaining</span><span class="metric-val remaining ${remClass}">${sar(remaining)}</span></div>
        ${budget>0?`<div style="margin-top:6px;background:#e2e8f0;border-radius:4px;height:6px;overflow:hidden;">
          <div style="background:${consumed>budget?'#dc2626':'#2e8b57'};height:6px;width:${Math.min(100,Math.round(consumed/budget*100))}%;"></div>
        </div><div class="hint" style="margin-top:3px;text-align:right;">${Math.round(consumed/budget*100)}% used</div>`:''}
      </div>`;
    });
    html += `</div>`;

    // Staff detail table
    html += `<div class="card" style="margin-top:12px;">
      <b>Staff OT Detail</b>
      <table class="detail-table">
        <thead>
          <tr>
            <th>#</th><th>Staff Name</th><th>HRR (SAR/h)</th>
            <th class="num">OT Hours</th><th class="num">OT Cost (SAR)</th>
            <th>Cost by Area</th>
          </tr>
        </thead>
        <tbody>`;

    if (!staffRows.length) {
      html += `<tr><td colspan="6" style="text-align:center;color:#888;">No staff records in rota.</td></tr>`;
    }
    staffRows.forEach((s, idx) => {
      const splitStr = Object.entries(s.split)
        .sort((a,b)=>b[1]-a[1])
        .map(([ar,c])=>`<span style="white-space:nowrap"><b>${ar}:</b> ${sar(c)}</span>`)
        .join(' &nbsp; ') || '—';
      const trClass = s.otHours > 0 ? ' class="ot-row"' : '';
      html += `<tr${trClass}>
        <td>${idx+1}</td>
        <td>${s.name}</td>
        <td class="num">${s.hrr.toFixed(2)}</td>
        <td class="num">${s.otHours > 0 ? '+'+s.otHours : s.otHours}</td>
        <td class="num">${s.otCost > 0 ? sar(s.otCost) : '—'}</td>
        <td style="font-size:11px;">${splitStr}</td>
      </tr>`;
    });

    // Totals row
    const totalOTCost = staffRows.reduce((s,r)=>s+r.otCost,0);
    html += `<tr style="background:#edf4fb;font-weight:700;">
      <td colspan="4" style="text-align:right;">Total OT Cost</td>
      <td class="num">${sar(totalOTCost)}</td>
      <td></td>
    </tr>`;

    html += `</tbody></table></div>`;

    // Legend note
    html += `<div class="card hint no-print">
      <b>How costs are split:</b>
      Duties ending in <code>_O</code> (e.g. <code>ACCN_O</code>) are charged 100% as direct OT to their duty's area.
      All remaining OT cost is split proportionally by scheduled hours per area (from DUTIES area tags).
    </div>`;

    document.getElementById("reportOutput").innerHTML = html;
  }

  // Init
  (function init() {
    buildAreaSelect();
    document.getElementById("monthSelect").value = String(new Date().getMonth()+1);
    document.getElementById("yearInput").value   = String(new Date().getFullYear());
  })();
