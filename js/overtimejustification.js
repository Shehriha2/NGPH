  const AREAS_LIST_KEY = "BCOT_AREAS_LIST_V1";
  const STAFF_KEY      = "BCOT_STAFF_RECORDS_V2";
  const DUTIES_KEY     = "BCOT_DUTIES_ALL_V1";

  const DEFAULT_JUSTIFICATION = "Overtime required to cover departmental workload / staffing shortage.";
  const BCOT_JUSTIFICATION    = "Catering Business Center Prescriptions for business patients";

  // ── Status ────────────────────────────────────────────────────────────────
  function showStatus(msg, ok=true) {
    const el=document.getElementById("statusBox");
    el.textContent=msg; el.className="status-message "+(ok?"status-ok":"status-err");
    el.style.display="block"; setTimeout(()=>el.style.display="none",4000);
  }

  // ── HTML helpers ──────────────────────────────────────────────────────────
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function stripBadge(name){ return String(name||'').replace(/\s*\(\d+\)\s*$/, '').trim(); }

  // ── Time helpers ──────────────────────────────────────────────────────────
  // Duties only store a shift start time + duration (hours) — there is no
  // stored end time, so it's derived here. Wraps past midnight if needed.
  function calcEndTime(startTime, hours) {
    if (!startTime || startTime === 'Any' || !/^\d{1,2}:\d{2}$/.test(startTime)) return '';
    const h = Number(hours); if (!Number.isFinite(h) || h <= 0) return '';
    const [sh, sm] = startTime.split(':').map(Number);
    let total = sh * 60 + sm + Math.round(h * 60);
    total = ((total % 1440) + 1440) % 1440;
    const eh = Math.floor(total / 60), em = total % 60;
    return String(eh).padStart(2,'0') + ':' + String(em).padStart(2,'0');
  }

  // ── Firestore refs ────────────────────────────────────────────────────────
  function monthRef(key,area,docId){ return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'months',docId); }

  // ── Area select ───────────────────────────────────────────────────────────
  function buildAreaSelect() {
    const list = (() => { try{ return JSON.parse(localStorage.getItem(AREAS_LIST_KEY)||"[]")||[]; }catch{ return []; } })();
    const sel  = document.getElementById("areaSel");
    sel.innerHTML='<option value="ALL">All Areas</option>';
    list.forEach(a => { const o=document.createElement("option"); o.value=a; o.textContent=a; sel.appendChild(o); });
    const last=(localStorage.getItem("BCOT_CURRENT_AREA_V1")||"ALL").trim().toUpperCase();
    if (last==="ALL"||list.includes(last)) sel.value=last;
  }

  // ── Overtime day detection ───────────────────────────────────────────────
  // Convention used throughout the rota: a duty code ending in "_O" marks
  // that day as overtime for the assigned staff member.
  function hasOvertimeDay(daysData) {
    return Object.values(daysData||{}).some(v => String(v||'').toUpperCase().endsWith('_O'));
  }

  function buildDayRows(daysData, duties) {
    const rows = [];
    for (let d = 1; d <= 31; d++) {
      const raw = String((daysData||{})['day'+d] || '').toUpperCase();
      let timeIn='', timeOut='', hrsWorked='', otHome='';
      if (raw.endsWith('_O')) {
        const base = raw.slice(0, -2);
        const duty = duties[base];
        if (duty) {
          const hrs = Number(duty.hours) || 0;
          timeIn    = (duty.startTime && duty.startTime !== 'Any') ? duty.startTime : '';
          timeOut   = timeIn ? calcEndTime(timeIn, hrs) : '';
          hrsWorked = hrs || '';
          otHome    = hrs || '';
        }
      }
      rows.push({ day:d, timeIn, timeOut, hrsWorked, otHome });
    }
    return rows;
  }

  // ── BCOT-only rule: every assigned duty counts as overtime (no _O suffix needed) ──
  function isBCOTArea(area) { return (area||'').trim().toUpperCase() === 'BCOT'; }

  function hasAnyDutyDay(daysData, duties) {
    return Object.values(daysData||{}).some(v => {
      const code = String(v||'').toUpperCase().replace(/_O$/,'');
      return code && duties[code];
    });
  }

  function sumAnyDutyHours(daysData, duties) {
    let total = 0;
    Object.values(daysData||{}).forEach(v => {
      const code = String(v||'').toUpperCase().replace(/_O$/,'');
      const duty = duties[code];
      if (duty) total += Number(duty.hours) || 0;
    });
    return total;
  }

  // Distributed representation for BCOT: 3h blocks (17:00-20:00) placed on the
  // staff member's real rota-assigned days (Sun-Thu only, in date order) until
  // the true monthly total is used up — so the days shown here match the days
  // they're actually scheduled for in the rota.
  function buildDistributedDayRows(daysData, duties, totalHours, month, year) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = [];
    for (let d = 1; d <= 31; d++) rows.push({ day:d, timeIn:'', timeOut:'', hrsWorked:'', otHome:'', otherCode:'', otherHours:'' });

    const candidates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const code = String((daysData||{})['day'+d] || '').toUpperCase().replace(/_O$/,'');
      if (!code || !duties[code]) continue;
      const dow = new Date(year, month-1, d).getDay();
      if (dow >= 0 && dow <= 4) candidates.push(d);
    }

    let remaining = Math.max(0, Number(totalHours) || 0);
    for (const d of candidates) {
      if (remaining <= 0) break;
      const block = Math.min(3, remaining);
      const row = rows[d-1];
      // Home Department stays blank for BCOT — hours are charged to Other Dept (cost code 9040) instead.
      row.timeIn     = '17:00';
      row.timeOut    = calcEndTime('17:00', block);
      row.hrsWorked  = block;
      row.otherCode  = '9040';
      row.otherHours = block;
      remaining -= block;
    }
    return rows;
  }

  // ── Signature block (3 approvers, matches the paper form) ────────────────
  function sigHtml(meta, gi) {
    return `<div class="sig-wrapper">
      <div class="sig-row1">
        <div class="sig-block">
          <div class="sig-label">Director (or equivalent):<br>(Name and Signature)</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span>     <input type="text" ${gi===0?'id="dirName"':''} value="${esc(meta.dirName)}"/></div>
          <div class="sig-field"><span class="sf-key">Badge No:</span> <input type="text" ${gi===0?'id="dirBadge"':''} value="${esc(meta.dirBadge)}"/></div>
        </div>
        <div class="sig-block">
          <div class="sig-label">Executive Director (or equivalent):<br>(Name and Signature)</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span> <input type="text" ${gi===0?'id="exDirName"':''} value="${esc(meta.exDirName)}"/></div>
        </div>
      </div>
      <div class="sig-row2">
        <div class="sig-block">
          <div class="sig-label" style="text-align:center;">CEO/CMO/COO * :<br>(Name and Signature)</div>
          <div class="sig-line"></div>
          <div class="sig-field"><span class="sf-key">Name:</span> <input type="text" ${gi===0?'id="ceoName"':''} value="${esc(meta.ceoName)}"/></div>
        </div>
      </div>
      <div class="sig-footnote">* For employees reporting directly to Senior Executive Management, or for employees with overtime greater than 75 hours per month, not to exceed 128 hours in any given month.</div>
    </div>
    <div class="part-section">
      <div class="part-title">Part II - To be completed by Corporate Human Resources (or equivalent)</div>
      <table class="part-table">
        <tr>
          <td style="width:25%;"><b>Department OU No</b><input type="text"/></td>
          <td style="width:20%;"><b>Total Hours</b><input type="text"/></td>
          <td style="width:20%;"><b>Overtime Hours</b><input type="text"/></td>
          <td style="width:17.5%;"><b>Verified by</b><input type="text"/></td>
          <td style="width:17.5%;"><b>Approved by</b><input type="text"/></td>
        </tr>
        <tr><td colspan="5"><b>Remarks/Notes</b><input type="text"/></td></tr>
      </table>
    </div>
    <div class="part-section">
      <div class="part-title">Part III - To be completed by Corporate Payroll Services (or equivalent)</div>
      <table class="part-table">
        <tr>
          <td style="width:25%;"><b>Overtime hours</b><input type="text"/></td>
          <td style="width:25%;"><b>Basic salary</b><input type="text"/></td>
          <td style="width:25%;"><b>Amount of Overtime</b><input type="text"/></td>
          <td style="width:25%;"><b>Remarks/Notes</b><input type="text"/></td>
        </tr>
      </table>
    </div>`;
  }

  function formFooterHtml() {
    return `<div class="form-footer">
      <span class="ff-left">Non-Clinical Form Rev. 03/2025</span>
      <span class="ff-center">Ref# APP 1431-23 &nbsp;·&nbsp; Appendix F</span>
      <span class="ff-right">CPRA # 0602-0626</span>
    </div>`;
  }

  // ── Main builder — one full print page per staff member ─────────────────
  function buildForm(entries, meta) {
    const wrapper = document.getElementById('formWrapper');
    const totalPages = entries.length;
    let html = '';

    entries.forEach((entry, gi) => {
      const pgBadge = totalPages > 1
        ? `<div style="position:absolute;top:0;right:0;font-size:9px;color:#888;font-style:italic;">Page ${gi+1} / ${totalPages}</div>`
        : '';

      html += `<div class="print-page page-break-after">
        <div class="form-title" style="position:relative;">
          ${pgBadge}
          <div class="main-title">Overtime Justification (Non-Physicians)</div>
          <div class="sub-title">
            King Abdulaziz Medical City<br>
            National Guard Health Affairs<br>
            Western Region
          </div>
        </div>
        <div class="meta-section">
          <div class="meta-row3">
            <div class="meta-cell"><b>Employee Name:</b>
              <input type="text" class="meta-val" value="${esc(entry.name)}"/>
            </div>
            <div class="meta-cell"><span>Badge No.:</span>
              <input type="text" class="meta-val" value="${esc(entry.badge)}"/>
            </div>
            <div class="meta-cell"><span>Ext. No.:</span>
              <input type="text" class="meta-val" ${gi===0?'id="extNo"':''} value="${esc(meta.ext)}"/>
            </div>
          </div>
          <div class="meta-row">
            <div class="meta-cell"><b>Position:</b>
              <input type="text" class="meta-val" value="${esc(entry.position)}"/>
            </div>
            <div class="meta-cell"><span>Month of:</span>
              <input type="text" class="meta-val" ${gi===0?'id="periodCovered"':''} value="${esc(meta.period)}"/>
            </div>
          </div>
          <div class="meta-row">
            <div class="meta-cell"><b>Department:</b>
              <input type="text" class="meta-val" ${gi===0?'id="deptName"':''} value="${esc(meta.dept)}"/>
            </div>
            <div class="meta-cell"><span>Mail Code:</span>
              <input type="text" class="meta-val" ${gi===0?'id="mailCode"':''} value="${esc(meta.mail)}"/>
            </div>
          </div>
        </div>

        <table class="day-table">
          <thead>
            <tr>
              <th rowspan="2" style="width:4%;">Day</th>
              <th rowspan="2" style="width:7%;">Time In</th>
              <th rowspan="2" style="width:7%;">Time Out</th>
              <th rowspan="2" style="width:7%;">Hours<br>Worked</th>
              <th colspan="3">Overtime Hours</th>
              <th rowspan="2" style="width:8%;">Stand-By/<br>On-Call Hours</th>
              <th rowspan="2" style="width:37%;">Justification For Overtime/Stand-By</th>
            </tr>
            <tr>
              <th style="width:8%;">Home Department</th>
              <th style="width:8%;">Other Dept<br>Cost Code</th>
              <th style="width:8%;">Other Dept<br>Hours</th>
            </tr>
          </thead>
          <tbody>
            ${entry.days.map(r => `<tr>
              <td>${r.day}</td>
              <td><input class="cell-in" type="text" value="${esc(r.timeIn)}"/></td>
              <td><input class="cell-in" type="text" value="${esc(r.timeOut)}"/></td>
              <td><input class="cell-in" type="text" value="${esc(r.hrsWorked)}"/></td>
              <td><input class="cell-in" type="text" value="${esc(r.otHome)}"/></td>
              <td><input class="cell-in" type="text" value="${esc(r.otherCode||'')}"/></td>
              <td><input class="cell-in" type="text" value="${esc(r.otherHours||'')}"/></td>
              <td><input class="cell-in" type="text" value=""/></td>
              <td class="just"><input type="text" value="${r.hrsWorked !== '' ? esc(entry.isBCOT ? BCOT_JUSTIFICATION : DEFAULT_JUSTIFICATION) : ''}"/></td>
            </tr>`).join('')}
            <tr class="total-row">
              <td colspan="3" style="text-align:center;">Total</td>
              <td>${entry.totalHours || ''}</td>
              <td>${entry.totalHome || ''}</td>
              <td></td>
              <td>${entry.totalOther || ''}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>

        ${sigHtml(meta, gi)}
      </div>`;
    });

    html += formFooterHtml();
    wrapper.innerHTML = html;
  }

  // ── Load & Build ──────────────────────────────────────────────────────────
  async function loadAndBuild() {
    const key = (window.BCOT_APP_KEY||'').trim();
    if (!key) { showStatus("config.js not found.", false); return; }
    const month = Number(document.getElementById("monthSel").value);
    const year  = Number(document.getElementById("yearSel").value) || new Date().getFullYear();
    const areaSelVal = (document.getElementById("areaSel").value||'ALL').trim().toUpperCase();

    const meta = {
      dept:     document.getElementById('deptName')?.value      || 'PHARMACEUTICAL CARE SERVICES',
      period:   document.getElementById('periodCovered')?.value || '',
      ext:      document.getElementById('extNo')?.value         || '62998',
      mail:     document.getElementById('mailCode')?.value      || '7330',
      dirName:  document.getElementById('dirName')?.value       || 'Dr. Mohammed Aseeri',
      dirBadge: document.getElementById('dirBadge')?.value      || '',
      exDirName:document.getElementById('exDirName')?.value     || '',
      ceoName:  document.getElementById('ceoName')?.value       || '',
    };

    showStatus("Loading from cloud…");

    const areasToQuery = areaSelVal === 'ALL'
      ? (() => { try{ return JSON.parse(localStorage.getItem(AREAS_LIST_KEY)||'[]')||[]; }catch{ return []; } })()
      : [areaSelVal];

    if (!areasToQuery.length) { showStatus("No areas found to load.", false); return; }

    const docId = `${year}-${String(month).padStart(2,'0')}`;
    let allRecords = [];
    try {
      for (const area of areasToQuery) {
        const snap = await window.FB.getDoc(monthRef(key, area, docId));
        if (!snap.exists()) continue;
        const payload = snap.data();
        (Array.isArray(payload.records) ? payload.records : []).forEach(rec => allRecords.push({ ...rec, _srcArea: area }));
      }
    } catch(e) { console.error(e); showStatus("Load failed: "+(e?.message||e), false); return; }

    if (!allRecords.length) {
      showStatus(`No rota data found for ${areaSelVal} ${year}/${String(month).padStart(2,'0')}.`, false);
      return;
    }

    const monthName = new Date(year, month-1, 1).toLocaleString('default', {month:'long'});
    meta.period = `${monthName} ${year}`;

    const staffRecs = (() => { try{ return JSON.parse(localStorage.getItem(STAFF_KEY)||"[]")||[]; }catch{ return []; } })();
    const duties    = (() => { try{ return JSON.parse(localStorage.getItem(DUTIES_KEY)||"{}"); }catch{ return {}; } })();

    const entries = [];
    allRecords.forEach(rec => {
      const isBCOT   = isBCOTArea(rec._srcArea);
      const qualifies = isBCOT ? hasAnyDutyDay(rec.daysData, duties) : hasOvertimeDay(rec.daysData);
      if (!qualifies) return;
      const name = (rec.staffName||'').trim(); if (!name) return;
      const staffRec = staffRecs.find(s => s.name.trim() === name);
      const badge    = staffRec?.badge || '—';
      const position = staffRec?.role  || '';

      const days = isBCOT
        ? buildDistributedDayRows(rec.daysData, duties, sumAnyDutyHours(rec.daysData, duties), month, year)
        : buildDayRows(rec.daysData, duties);
      const totalHours = days.reduce((s,r) => s + (Number(r.hrsWorked)||0), 0);
      const totalHome  = days.reduce((s,r) => s + (Number(r.otHome)||0), 0);
      const totalOther = days.reduce((s,r) => s + (Number(r.otherHours)||0), 0);

      entries.push({ name: stripBadge(name), badge, position, days, totalHours, totalHome, totalOther, isBCOT });
    });

    if (!entries.length) {
      showStatus("No staff with overtime days (duty codes ending _O) found for this period.", false);
      return;
    }

    buildForm(entries, meta);
    showStatus(`Built ${entries.length} Overtime Justification form(s) ✅`);
  }

  // Init
  (function init(){
    document.getElementById("monthSel").value = String(new Date().getMonth()+1);
    document.getElementById("yearSel").value  = String(new Date().getFullYear());
    buildAreaSelect();
  })();
