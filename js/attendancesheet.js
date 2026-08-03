  const AREAS_LIST_KEY = "BCOT_AREAS_LIST_V1";
  const STAFF_KEY      = "BCOT_STAFF_RECORDS_V2";
  const DUTIES_KEY     = "BCOT_DUTIES_ALL_V1";
  const DAY_LABELS     = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const REMARK_LEGEND  = [
    { code:'1', label:'Absent' }, { code:'2', label:'Late' }, { code:'3', label:'Permission' },
    { code:'4', label:'Sick' },   { code:'5', label:'Leave' },{ code:'6', label:'Off' },
  ];

  // ── Status ────────────────────────────────────────────────────────────────
  function showStatus(msg, ok=true) {
    const el=document.getElementById("statusBox");
    el.textContent=msg; el.className="status-message "+(ok?"status-ok":"status-err");
    el.style.display="block"; setTimeout(()=>el.style.display="none",4000);
  }

  // ── HTML helpers ──────────────────────────────────────────────────────────
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function stripBadge(name){ return String(name||'').replace(/\s*\(\d+\)\s*$/, '').trim(); }

  // ── Time helpers (see js/overtimejustification.js for the same logic) ────
  function calcEndTime(startTime, hours) {
    if (!startTime || startTime === 'Any' || !/^\d{1,2}:\d{2}$/.test(startTime)) return '';
    const h = Number(hours); if (!Number.isFinite(h) || h <= 0) return '';
    const [sh, sm] = startTime.split(':').map(Number);
    let total = sh * 60 + sm + Math.round(h * 60);
    total = ((total % 1440) + 1440) % 1440;
    const eh = Math.floor(total / 60), em = total % 60;
    return String(eh).padStart(2,'0') + ':' + String(em).padStart(2,'0');
  }

  // ── BCOT-only rule (see js/overtimejustification.js for the same logic) ──
  // Any assigned duty counts as overtime, distributed as 3h blocks (17:00-20:00)
  // placed on the staff member's real rota-assigned days (Sun-Thu only, in date
  // order) — so a staff member's Attendance Sheet lands on the exact same days
  // and times as their Overtime Justification sheet.
  function isBCOTArea(area) { return (area||'').trim().toUpperCase() === 'BCOT'; }

  function sumAnyDutyHours(daysData, duties) {
    let total = 0;
    Object.values(daysData||{}).forEach(v => {
      const code = String(v||'').toUpperCase().replace(/_O$/,'');
      const duty = duties[code];
      if (duty) total += Number(duty.hours) || 0;
    });
    return total;
  }

  function buildDistributedDayRows(daysData, duties, totalHours, month, year) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = [];
    for (let d = 1; d <= 31; d++) rows.push({ day:d, timeIn:'', timeOut:'', hrsWorked:'' });

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
      row.timeIn    = '17:00';
      row.timeOut   = calcEndTime('17:00', block);
      row.hrsWorked = block;
      remaining -= block;
    }
    return rows;
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

  // ── Calendar weeks (Sun–Sat) within the month ────────────────────────────
  // Boundary weeks are clipped to the month — a week starting mid-month
  // still shows all 7 day columns, with out-of-month columns left blank.
  function getMonthWeeks(month, year) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const weeks = []; let current = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month-1, d).getDay();
      if (dow === 0 && current.length) { weeks.push(current); current = []; }
      current.push(d);
    }
    if (current.length) weeks.push(current);
    return weeks;
  }

  function weekToColumns(weekDays, month, year) {
    const cols = new Array(7).fill(null);
    weekDays.forEach(d => { cols[new Date(year, month-1, d).getDay()] = d; });
    return cols;
  }

  function weekRangeLabel(weekDays, month, year) {
    if (!weekDays.length) return '';
    const monthName = new Date(year, month-1, 1).toLocaleString('default', {month:'short'});
    const first = weekDays[0], last = weekDays[weekDays.length-1];
    return first === last ? `${monthName} ${first}, ${year}` : `${monthName} ${first} – ${last}, ${year}`;
  }

  // ── Per-day cell data (time in/out + remark code) ────────────────────────
  // Remark codes only cover what's actually derivable from a duty code:
  // a leave-listed code → Leave (5). Absent/Late/Permission/Sick require
  // manual entry — there's no duty-level field for them. BCOT staff have a
  // separate primary job, so a day with no BC block is NOT marked Off (6) —
  // it just means no BC overtime that day, not that they're absent.
  function dayCell(s, day, duties, leaveSet) {
    if (!day) return null;
    if (s.isBCOT) {
      const dd = s.distDays && s.distDays[day-1];
      if (!dd || dd.hrsWorked === '') return { timeIn:'', timeOut:'', rem:'' };
      return { timeIn: dd.timeIn, timeOut: dd.timeOut, rem:'' };
    }
    const raw = String((s.daysData||{})['day'+day] || '').trim();
    if (!raw) return { timeIn:'', timeOut:'', rem:'6' };
    const base = raw.toUpperCase().replace(/_O$/, '');
    if (base === 'L' || leaveSet.has(base)) return { timeIn:'', timeOut:'', rem:'5' };
    const duty = duties[base];
    if (!duty) return { timeIn:'', timeOut:'', rem:'' };
    const hrs = Number(duty.hours) || 0;
    const timeIn  = (duty.startTime && duty.startTime !== 'Any') ? duty.startTime : '';
    const timeOut = timeIn ? calcEndTime(timeIn, hrs) : '';
    return { timeIn, timeOut, rem:'' };
  }

  function formFooterHtml() {
    return `<div class="form-footer">
      <span class="ff-left">Non-Clinical Form Rev. 06/2013</span>
      <span class="ff-center">Ref#: APP 1428-08 &nbsp;·&nbsp; Appendix A</span>
      <span class="ff-right">O&amp;M # 0501-0037</span>
    </div>`;
  }

  // ── Main builder — one page per (week, staff group) ──────────────────────
  function buildForm(staffRows, weeks, month, year, meta) {
    const wrapper = document.getElementById('formWrapper');
    const rowsPerPage = Math.max(2, parseInt(document.getElementById('rowsPage').value,10) || 8);

    const pages = [];
    weeks.forEach(weekDays => {
      const cols = weekToColumns(weekDays, month, year);
      for (let i = 0; i < staffRows.length; i += rowsPerPage) {
        pages.push({ weekDays, cols, group: staffRows.slice(i, i + rowsPerPage) });
      }
    });
    const totalPages = pages.length;

    let html = '';
    pages.forEach((page, gi) => {
      const pgBadge = totalPages > 1
        ? `<div style="position:absolute;top:0;right:0;font-size:9px;color:#888;font-style:italic;">Page ${gi+1} / ${totalPages}</div>`
        : '';

      const dayHeaders = DAY_LABELS.map((lbl,i) => `<th colspan="3">${lbl}${page.cols[i]?` <span style="font-weight:400;">(${page.cols[i]})</span>`:''}</th>`).join('');
      const subHeaders  = DAY_LABELS.map(() => `<th style="width:3.2%;">Time In</th><th style="width:3.2%;">Time Out</th><th style="width:2.2%;">Rem*</th>`).join('');

      const bodyRows = page.group.map(s => {
        const dayCells = page.cols.map(day => {
          const c = dayCell(s, day, meta.duties, meta.leaveSet) || { timeIn:'', timeOut:'', rem:'' };
          const onCls = c.timeIn ? ' class="day-on"' : '';
          return `<td${onCls}><input type="text" value="${esc(c.timeIn)}"/></td><td${onCls}><input type="text" value="${esc(c.timeOut)}"/></td><td${onCls}><input type="text" value="${esc(c.rem)}"/></td>`;
        }).join('');
        const initCells  = page.cols.map(() => `<td><input type="text"/></td><td><input type="text"/></td><td></td>`).join('');
        const notedCells = page.cols.map(() => `<td colspan="3"><input type="text" placeholder="Noted by:"/></td>`).join('');
        return `<tr>
            <td class="name-cell" rowspan="3"><input type="text" value="${esc(s.name)}"/></td>
            <td rowspan="3"><input type="text" value="${esc(s.badge)}"/></td>
            ${dayCells}
          </tr>
          <tr>${initCells}</tr>
          <tr>${notedCells}</tr>`;
      }).join('');

      html += `<div class="print-page page-break-after">
        <div class="form-title" style="position:relative;">
          ${pgBadge}
          <div class="main-title">Attendance Sheet</div>
          <div class="sub-title">
            Kingdom of Saudi Arabia<br>
            Ministry of National Guard - Health Affairs
          </div>
        </div>
        <div class="meta-section">
          <div class="meta-row">
            <div class="meta-cell"><span>For the Month of:</span>
              <input type="text" class="meta-val" ${gi===0?'id="monthLabel"':''} value="${esc(meta.monthLabel)}"/>
            </div>
            <div class="meta-cell"><span>Section:</span>
              <input type="text" class="meta-val" ${gi===0?'id="sectionVal"':''} value="${esc(meta.section)}"/>
            </div>
            <div class="meta-cell"><span>Division:</span>
              <input type="text" class="meta-val" ${gi===0?'id="divisionVal"':''} value="${esc(meta.division)}"/>
            </div>
            <div class="meta-cell"><span>Year:</span>
              <input type="text" class="meta-val" value="${esc(String(year))}"/>
            </div>
          </div>
          <div class="meta-row">
            <div class="meta-cell" style="grid-column:1 / span 4;"><b>Department:</b>
              <input type="text" class="meta-val" ${gi===0?'id="deptVal"':''} value="${esc(meta.dept)}"/>
            </div>
          </div>
        </div>
        <div class="week-label">Week of ${weekRangeLabel(page.weekDays, month, year)}</div>

        <table class="att-table">
          <thead>
            <tr><th rowspan="2" style="width:14%;">Employee Name</th><th rowspan="2" style="width:6%;">Badge No.</th>${dayHeaders}</tr>
            <tr>${subHeaders}</tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>

        <div class="legend-bar">
          ${REMARK_LEGEND.map(r => `<span><b>${r.code}</b> ${r.label}</span>`).join('')}
        </div>
        <div class="submit-note">Note: This sheet must be submitted to Internal Audit and Organizational Development on a monthly basis, within the first 10 days of the following month.</div>
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

    const monthName = new Date(year, month-1, 1).toLocaleString('default', {month:'long'});
    const meta = {
      monthLabel: document.getElementById('monthLabel')?.value || monthName,
      section:    document.getElementById('sectionVal')?.value || '',
      division:   document.getElementById('divisionVal')?.value || 'OPERATIONS',
      dept:       document.getElementById('deptVal')?.value     || 'PHARMACEUTICAL CARE SERVICES',
    };

    showStatus("Loading from cloud…");

    const areasToQuery = areaSelVal === 'ALL'
      ? (() => { try{ return JSON.parse(localStorage.getItem(AREAS_LIST_KEY)||'[]')||[]; }catch{ return []; } })()
      : [areaSelVal];

    if (!areasToQuery.length) { showStatus("No areas found to load.", false); return; }

    const docId = `${year}-${String(month).padStart(2,'0')}`;
    let allRecords = [], leaveCodes = ['AL'];
    try {
      for (const area of areasToQuery) {
        const snap = await window.FB.getDoc(monthRef(key, area, docId));
        if (!snap.exists()) continue;
        const payload = snap.data();
        if (Array.isArray(payload.leaveCodes) && payload.leaveCodes.length) leaveCodes = payload.leaveCodes;
        (Array.isArray(payload.records) ? payload.records : []).forEach(rec => allRecords.push({ ...rec, _srcArea: area }));
      }
    } catch(e) { console.error(e); showStatus("Load failed: "+(e?.message||e), false); return; }

    if (!allRecords.length) {
      showStatus(`No rota data found for ${areaSelVal} ${year}/${String(month).padStart(2,'0')}.`, false);
      return;
    }

    const staffRecs = (() => { try{ return JSON.parse(localStorage.getItem(STAFF_KEY)||"[]")||[]; }catch{ return []; } })();
    const duties    = (() => { try{ return JSON.parse(localStorage.getItem(DUTIES_KEY)||"{}"); }catch{ return {}; } })();
    meta.duties   = duties;
    meta.leaveSet = new Set(leaveCodes.map(c => String(c).toUpperCase()));

    const staffRows = allRecords
      .filter(rec => (rec.staffName||'').trim())
      .map(rec => {
        const name     = stripBadge(rec.staffName);
        const staff    = staffRecs.find(s => s.name.trim() === rec.staffName.trim());
        const daysData = rec.daysData || {};
        const isBCOT   = isBCOTArea(rec._srcArea);
        const distDays = isBCOT ? buildDistributedDayRows(daysData, duties, sumAnyDutyHours(daysData, duties), month, year) : null;
        return { name, badge: staff?.badge || '—', daysData, isBCOT, distDays };
      });

    if (!staffRows.length) {
      showStatus("No staff found for this period.", false);
      return;
    }

    const weeks = getMonthWeeks(month, year);
    buildForm(staffRows, weeks, month, year, meta);
    showStatus(`Built ${weeks.length} week(s) × ${staffRows.length} staff ✅`);
  }

  // Init
  (function init(){
    document.getElementById("monthSel").value = String(new Date().getMonth()+1);
    document.getElementById("yearSel").value  = String(new Date().getFullYear());
    buildAreaSelect();
  })();
