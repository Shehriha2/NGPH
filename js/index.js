    // ── Auth Admin ────────────────────────────────────────────────────────────
    async function openAuthAdmin() {
      const pwd = (window.BCOT_OT_OVERRIDE_PASSWORD || '').trim();
      if (!pwd || typeof BCOT_AUTH === 'undefined') {
        showStatusMessage('Authentication module is not available.', 'error');
        return;
      }
      const entered = await BCOT_AUTH.prompt(
        'Enter the OT override password to access user management.',
        { title: '🔒 Admin Access', placeholder: 'Password', type: 'password', confirmLabel: 'Unlock' }
      );
      if (entered === null) return;
      if (entered.trim() !== pwd) {
        showStatusMessage('Incorrect password — access denied.', 'error');
        return;
      }
      closeSettingsModal();
      BCOT_AUTH.openUserManager();
    }

    async function openAreaAdmin() {
      const pwd = (window.BCOT_OT_OVERRIDE_PASSWORD || '').trim();
      if (!pwd || typeof BCOT_AUTH === 'undefined') {
        showStatusMessage('Authentication module is not available.', 'error');
        return;
      }
      const entered = await BCOT_AUTH.prompt(
        'Enter the OT override password to access area management.',
        { title: '🔒 Admin Access', placeholder: 'Password', type: 'password', confirmLabel: 'Unlock' }
      );
      if (entered === null) return;
      if (entered.trim() !== pwd) {
        showStatusMessage('Incorrect password — access denied.', 'error');
        return;
      }
      closeSettingsModal();
      BCOT_AUTH.openAreaManager();
    }

    async function openIPAdmin() {
      const pwd = (window.BCOT_OT_OVERRIDE_PASSWORD || '').trim();
      if (!pwd || typeof BCOT_AUTH === 'undefined') {
        showStatusMessage('Authentication module is not available.', 'error');
        return;
      }
      const entered = await BCOT_AUTH.prompt(
        'Enter the OT override password to access IP access control.',
        { title: '🔒 Admin Access', placeholder: 'Password', type: 'password', confirmLabel: 'Unlock' }
      );
      if (entered === null) return;
      if (entered.trim() !== pwd) {
        showStatusMessage('Incorrect password — access denied.', 'error');
        return;
      }
      closeSettingsModal();
      BCOT_AUTH.openIPManager();
    }

    // ── Storage keys ──────────────────────────────────────────────────────────
    const AREA_KEY           = "BCOT_CURRENT_AREA_V1";
    const AREAS_LIST_KEY     = "BCOT_AREAS_LIST_V1";
    const TARGET_STORAGE_KEY = "BCOT_MONTHLY_TARGET_V1";
    const STAFF_RECORDS_KEY  = "BCOT_STAFF_RECORDS_V2";   // unified pool
    const DUTIES_ALL_KEY     = "BCOT_DUTIES_ALL_V1";      // unified pool
    const COMP_TYPE_LS_KEY   = "BCOT_COMP_TYPE_V1";       // per-area comp type
    const CONSUMPTION_LS_KEY = "BCOT_AREA_CONSUMPTION_V1"; // saved monthly consumption

    // ── Per-area comp type helpers ────────────────────────────────────────────
    /** Returns 'OT' or 'COMP' for the given area (default: 'OT'). */
    function getAreaCompType(area) {
      if (!area || area === 'ALL') return 'OT';
      try {
        const map = JSON.parse(localStorage.getItem(COMP_TYPE_LS_KEY) || '{}') || {};
        return map[area.toUpperCase()] === 'COMP' ? 'COMP' : 'OT';
      } catch { return 'OT'; }
    }

    function setAreaCompType(area, type) {
      if (!area || area === 'ALL') return;
      try {
        const map = JSON.parse(localStorage.getItem(COMP_TYPE_LS_KEY) || '{}') || {};
        map[area.toUpperCase()] = (type === 'COMP') ? 'COMP' : 'OT';
        localStorage.setItem(COMP_TYPE_LS_KEY, JSON.stringify(map));
      } catch {}
    }

    /** Toggle the comp type for current area and update all row buttons. */
    function toggleCompType() {
      const area = getCurrentArea();
      if (!area || area === 'ALL') return;
      const cur = getAreaCompType(area);
      const nxt = cur === 'OT' ? 'COMP' : 'OT';
      setAreaCompType(area, nxt);
      // Update the banner toggle button
      const btn = document.getElementById('compTypeToggle');
      if (btn) btn.textContent = nxt === 'COMP' ? '📅 COMP Day' : '💰 OT Pay';
      // Update ALL rows that still match the old default (not individually overridden)
      // We consider a row as "using area default" if its compType matches the OLD default
      document.querySelectorAll('#rotaTable tbody tr').forEach(row => {
        if ((row.dataset.compType || 'OT') === cur) {
          row.dataset.compType = nxt;
          const ctBtn = row.querySelector('.comp-type-btn');
          if (ctBtn) {
            ctBtn.textContent = nxt === 'COMP' ? '📅' : '💰';
            ctBtn.title = nxt === 'COMP'
              ? '📅 COMP Day — click to switch to OT Pay'
              : '💰 OT Pay — click to switch to COMP Day';
          }
        }
      });
    }

    /** Update the consumption bar visibility and state for current area. */
    function updateConsumptionBar() {
      const bar   = document.getElementById('consumptionBar');
      const lbl   = document.getElementById('consumptionAreaLabel');
      const btn   = document.getElementById('compTypeToggle');
      const saved = document.getElementById('consumptionLastSaved');
      if (!bar) return;
      const area = getCurrentArea();
      if (!area || area === 'ALL') { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      if (lbl) lbl.textContent = area;
      // Refresh toggle button label
      const ct = getAreaCompType(area);
      if (btn) btn.textContent = ct === 'COMP' ? '📅 COMP Day' : '💰 OT Pay';
      // Show last saved info for this area+month+year
      const month = String(document.getElementById('monthSelect')?.value || '1').padStart(2,'0');
      const year  = String(document.getElementById('yearInput')?.value || new Date().getFullYear());
      let recs = [];
      try { recs = JSON.parse(localStorage.getItem(CONSUMPTION_LS_KEY) || '[]') || []; } catch {}
      const prev = recs.find(r => r.area === area && String(r.month).padStart(2,'0') === month && String(r.year) === year);
      if (saved) {
        if (prev) {
          const ts = prev.savedAt ? new Date(prev.savedAt).toLocaleString() : '';
          saved.textContent = `Last saved: OT ${prev.otAmount?.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} SAR  |  Comp ${prev.compHours?.toFixed(1)} hrs  —  ${ts}`;
          saved.style.display = 'block';
        } else {
          saved.style.display = 'none';
        }
      }
    }

    // ── Consumption records helpers ────────────────────────────────────────────
    function _loadConsumptionLocal() {
      try { return JSON.parse(localStorage.getItem(CONSUMPTION_LS_KEY) || '[]') || []; }
      catch { return []; }
    }

    function _upsertConsumptionLocal(record) {
      let recs = _loadConsumptionLocal();
      const idx = recs.findIndex(r =>
        r.area === record.area &&
        String(r.month).padStart(2,'0') === String(record.month).padStart(2,'0') &&
        String(r.year) === String(record.year)
      );
      if (idx >= 0) recs[idx] = record; else recs.push(record);
      localStorage.setItem(CONSUMPTION_LS_KEY, JSON.stringify(recs));
      return recs;
    }

    async function _saveConsumptionCloud(recs) {
      const key = (window.BCOT_APP_KEY || '').trim();
      if (!key) return;
      let t = 0;
      while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
      if (!window.FB) return;
      await window.FB.setDoc(
        window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'area_consumption', 'RECORDS'),
        { records: recs, updatedAt: new Date().toISOString() }
      );
    }

    async function loadConsumptionFromCloud() {
      const key = (window.BCOT_APP_KEY || '').trim();
      if (!key) return null;
      let t = 0;
      while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
      if (!window.FB) return null;
      try {
        const snap = await window.FB.getDoc(
          window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'area_consumption', 'RECORDS')
        );
        if (!snap.exists()) return null;
        const data = snap.data();
        return Array.isArray(data?.records) ? data.records : null;
      } catch (e) { console.warn('[Consumption] cloud load:', e); return null; }
    }

    // ── Real-time consumption listener (Option A) ──────────────────────────────
    let _consumptionUnsubscribe = null;

    async function _startConsumptionListener() {
      const key = (window.BCOT_APP_KEY || '').trim();
      if (!key) return;
      // Wait for Firebase bridge
      let t = 0;
      while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
      if (!window.FB?.onSnapshot) return;

      // Clean up any existing listener first
      if (_consumptionUnsubscribe) { _consumptionUnsubscribe(); _consumptionUnsubscribe = null; }

      const docRef = window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'area_consumption', 'RECORDS');
      _consumptionUnsubscribe = window.FB.onSnapshot(docRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (!Array.isArray(data?.records) || !data.records.length) return;
          localStorage.setItem(CONSUMPTION_LS_KEY, JSON.stringify(data.records));
          updateConsumptionBar();
          updateBannerBudget();
          updateCallCenterCards();
        },
        (err) => { console.warn('[Consumption] onSnapshot error:', err); }
      );
    }

    /** Calculate and save area consumption for current area+month+year. */
    async function saveAreaConsumption() {
      const area = getCurrentArea();
      if (!area || area === 'ALL') {
        showStatusMessage('Select a specific area first.', 'error'); return;
      }
      const monthEl = document.getElementById('monthSelect');
      const yearEl  = document.getElementById('yearInput');
      const month   = String(monthEl?.value || '1').padStart(2,'0');
      const year    = String(yearEl?.value || new Date().getFullYear());

      // Build staff lookup
      let staffRecs = [];
      try { staffRecs = JSON.parse(localStorage.getItem(STAFF_RECORDS_KEY) || '[]') || []; } catch {}
      const hrrByName = {};
      staffRecs.forEach(s => { if (s.name) hrrByName[s.name.trim()] = Number(s.hrr) || 0; });

      let otAmount  = 0;
      let compHours = 0;

      document.querySelectorAll('#rotaTable tbody tr').forEach(row => {
        const name = row.cells[0]?.querySelector('input')?.value?.trim();
        if (!name) return;
        const otText = row.querySelector('.ot-val')?.textContent || '—';
        const ot = parseFloat(otText.replace('+', ''));
        if (!Number.isFinite(ot) || ot <= 0) return;
        const ct = row.dataset.compType || 'OT';
        if (ct === 'COMP') {
          compHours += ot;
        } else {
          const hrr = hrrByName[name] || 0;
          if (hrr) otAmount += ot * hrr * 1.5;
        }
      });

      const record = { area, month, year, otAmount, compHours, savedAt: new Date().toISOString() };
      const allRecs = _upsertConsumptionLocal(record);
      showStatusMessage('Saving consumption…', 'info');
      try {
        await _saveConsumptionCloud(allRecs);
        showStatusMessage(`Saved: ${area} ${year}-${month} — OT ${otAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} SAR, Comp ${compHours.toFixed(1)} hrs ✅`);
      } catch (e) {
        showStatusMessage('Saved locally. Cloud save failed: ' + (e?.message || e), 'error');
      }
      updateConsumptionBar();
      updateCallCenterCards();
    }

    // Rota index is still area-scoped (ACC rota list ≠ ICU rota list)
    function rotaIndexLocalKey() { return `BCOT_NAMED_ROTAS_LOCAL_V1_${getCurrentArea()}`; }

    let patternStartCell = null;
    let patternModeArmed = false;
    let holidays      = [];
    let mixedStdHours = 0;
    let releaseNum    = 1;

    // ── Release number helpers ─────────────────────────────────────────────────
    const MONTH_NAMES_SHORT = ["","January","February","March","April","May","June",
                               "July","August","September","October","November","December"];

    function releaseKey(area){ return `BCOT_RELEASE_NUM_${area}`; }

    function loadReleaseNum(area){
      if (!area || area === "ALL") return 1;
      return parseInt(localStorage.getItem(releaseKey(area)) || "1", 10) || 1;
    }

    function saveReleaseNum(area, n){
      if (!area || area === "ALL") return;
      localStorage.setItem(releaseKey(area), String(n));
    }

    function getRotaDisplayName(){
      const area  = getCurrentArea();
      const month = parseInt(document.getElementById("monthSelect")?.value || "1", 10);
      if (!area || area === "ALL") return "All Areas";
      return `${area}-${MONTH_NAMES_SHORT[month]}-R${releaseNum}`;
    }

    function updateRotaLabel(){
      const name = getRotaDisplayName();
      const el   = document.getElementById("rotaNameLabel");
      if (el) el.textContent = name;
      const pel  = document.getElementById("printRotaName");
      if (pel) pel.textContent = name;
    }

    async function newRelease(){
      const area = getCurrentArea();
      if (!area || area === "ALL"){ showStatusMessage("Select a specific area first.", "error"); return; }

      const current = getRotaDisplayName();
      const next    = `${area}-${MONTH_NAMES_SHORT[parseInt(document.getElementById("monthSelect")?.value||"1",10)]}-R${loadReleaseNum(area)+1}`;

      const choice = await showNewReleaseModal({ current, next });
      if (!choice) return;

      releaseNum = loadReleaseNum(area) + 1;
      saveReleaseNum(area, releaseNum);
      updateRotaLabel();

      if (choice === 'fresh') {
        await onAreaChanged(area);
        showStatusMessage(`New release: ${getRotaDisplayName()} — grid cleared, staff loaded from cloud ✅`);
        return;
      }

      // Continue: reset OT overrides back to auto-calculated
      let resetCount = 0;
      document.querySelectorAll('#rotaTable tbody tr').forEach(row => {
        const otCell = row.querySelector('.ot-cell');
        if (!otCell || otCell.dataset.override !== 'true') return;
        delete otCell.dataset.override;
        const btn = otCell.querySelector('.ot-lock-btn');
        if (btn){ btn.textContent='🔒'; btn.title='Override manually'; }
        const val = otCell.querySelector('.ot-val');
        if (val) val.className = 'ot-val';
        calcOT(row);
        resetCount++;
      });

      const msg = resetCount
        ? `New release: ${getRotaDisplayName()} — ${resetCount} OT override(s) reset to auto ✅`
        : `New release: ${getRotaDisplayName()} ✅`;
      showStatusMessage(msg);
    }

    // ── Holiday helpers ───────────────────────────────────────────────────────
    function getEnabledHolidays() {
      return holidays.filter(h => h.enabled && h.fromDay && h.toDay && h.toDay >= h.fromDay);
    }
    function countSunThuInMonth(month, year) {
      const days = getDaysInMonth(month); let n = 0;
      for (let d=1;d<=days;d++) { const dow=new Date(year,month-1,d).getDay(); if(dow>=0&&dow<=4) n++; }
      return n;
    }
    function countHolidaySunThu(month, year) {
      const days = getDaysInMonth(month); let n = 0;
      getEnabledHolidays().forEach(h => {
        const from=Math.max(1,h.fromDay), to=Math.min(days,h.toDay);
        for (let d=from;d<=to;d++) { const dow=new Date(year,month-1,d).getDay(); if(dow>=0&&dow<=4) n++; }
      });
      return n;
    }
    function countHolidayAllDays(month, year) {
      const days = getDaysInMonth(month); let n = 0;
      getEnabledHolidays().forEach(h => {
        const from=Math.max(1,h.fromDay), to=Math.min(days,h.toDay);
        if (to>=from) n += (to-from+1);
      });
      return n;
    }
    // Returns true if calendar day `day` (1-based) falls within any enabled holiday range
    function isInHolidayRange(day) {
      return getEnabledHolidays().some(h => day >= h.fromDay && day <= h.toDay);
    }
    // Count off-days for OT standard deduction.
    // Rules:
    //  • A day counts as "off" when its duty has 0 hours (L, SL, H, HOL, etc.) —
    //    OR the cell contains the literal code "L" even if not in the duties list.
    //  • Days that already fall inside a configured holiday range are EXCLUDED
    //    (the holiday deduction handles them; counting twice would inflate OT).
    //  • Completely empty cells are ignored (rota not yet filled).
    function countLeaveDays(row, month, year) {
      const hIdx    = Array.from(row.cells).indexOf(row.querySelector('.hours-cell'));
      const maxDay  = getDaysInMonth(month);
      let all=0, sunThu=0;
      // Tracks Fri/Sat days added via the 12H leave-extension rule (avoids double-counting)
      const extendedDays = new Set();

      for (let i=1;i<hIdx;i++) {
        const v = row.cells[i].textContent.trim().toUpperCase();
        if (!v) continue;                   // empty cell — ignore
        if (isInHolidayRange(i)) continue;  // holiday range already covers this day
        const baseV = v.endsWith('_O') ? v.slice(0,-2) : v;
        // Off-day = 'L' (always) OR any defined duty with hours===0 UNLESS it has
        // noLeaveCount:true (e.g. SL — sick leave is transparent to OT standard)
        const isOff = (baseV === 'L') ||
          (DUTIES[baseV] && Number(DUTIES[baseV].hours) === 0 && !DUTIES[baseV].noLeaveCount);
        if (isOff) {
          all++;
          const dow = new Date(year, month-1, i).getDay();
          if (dow>=0&&dow<=4) sunThu++;
          // 12H extension: leave on Thu(4) → extend to following Fri/Sat
          //                leave on Sun(0) → extend to preceding Fri/Sat
          const candidates = dow===4 ? [i+1, i+2] : dow===0 ? [i-2, i-1] : [];
          candidates.forEach(d => {
            if (d < 1 || d > maxDay) return;           // outside month
            if (extendedDays.has(d)) return;           // already counted
            if (isInHolidayRange(d)) return;           // public holiday — skip
            if (row.cells[d]?.textContent.trim()) return; // has an assignment — skip
            extendedDays.add(d);
          });
        }
      }
      all += extendedDays.size;   // extended Fri/Sat added to leave.all only (12H uses this)
      return {all, sunThu};
    }

    // ── OT calculation ────────────────────────────────────────────────────────
    function calcOT(row) {
      const otCell = row.querySelector('.ot-cell');
      if (!otCell) return;
      if (otCell.dataset.override==='true') return;
      const schedType = row.querySelector('.sched-cell select')?.value||'';
      const val = otCell.querySelector('.ot-val');
      if (!schedType) { val.textContent='—'; val.className='ot-val'; otCell.title=''; return; }
      const totalHours = Number(row.querySelector('.hours-cell')?.textContent)||0;
      const month = Number(document.getElementById('monthSelect').value);
      const year  = Number(document.getElementById('yearInput')?.value) || new Date().getFullYear();
      const leave = countLeaveDays(row, month, year);
      let standard = 0;
      let tipDetail = '';
      if (schedType==='Regular') {
        const totalWT   = countSunThuInMonth(month, year);
        const holWT     = countHolidaySunThu(month, year);
        const net       = Math.max(0, totalWT - holWT - leave.sunThu);
        standard        = net * 9;
        tipDetail = `Sun–Thu days: ${totalWT} | Holidays: ${holWT} | Off-days: ${leave.sunThu} | Net: ${net} × 9h = ${standard}h`;
      } else if (schedType==='12 Hours') {
        const totalDays = getDaysInMonth(month);
        const holDays   = countHolidayAllDays(month, year);
        const rem       = Math.max(0, totalDays - holDays - leave.all);
        standard        = Math.round((rem * 15 / 28) * 12 * 10) / 10;
        tipDetail = `Total days: ${totalDays} | Holidays: ${holDays} | Off-days: ${leave.all} | Rem: ${rem} × (15/28×12) = ${standard}h`;
      } else if (schedType==='Mixed') {
        const mStd      = Number(document.getElementById('mixedStdHours').value)||0;
        const totalDays = getDaysInMonth(month);
        const holDays   = countHolidayAllDays(month, year);
        const denom     = Math.max(1, totalDays - holDays);
        const rem       = Math.max(0, denom - leave.all);
        standard        = Math.round(mStd * (rem / denom) * 10) / 10;
        tipDetail = `Std: ${mStd}h | Holidays: ${holDays} | Off-days: ${leave.all} | Ratio: ${rem}/${denom} = ${standard}h`;
      } else if (schedType==='BC') {
        // Business Center — all hours are overtime, no standard deduction
        val.textContent = (totalHours>0?'+':'')+totalHours;
        val.className   = 'ot-val'+(totalHours>0?' ot-positive':'');
        otCell.title    = `BC — all ${totalHours}h are overtime (charged to Business Center)`;
        return;
      }
      const rawOT = totalHours - standard;
      const ot = Math.max(0, schedType === '12 Hours' ? Math.ceil(rawOT) : Math.round(rawOT * 10) / 10);
      val.textContent = ot > 0 ? '+' + ot : '0';
      val.className = 'ot-val' + (ot > 0 ? ' ot-positive' : '');
      otCell.title = `Actual: ${totalHours}h | Standard: ${standard}h | OT: ${ot > 0 ? '+' : ''}${ot}h\n${tipDetail}`;
    }
    function recalculateAllOT() {
      document.querySelectorAll('#rotaTable tbody tr').forEach(row => calcOT(row));
    }

    // ── OT Password modal ─────────────────────────────────────────────────────
    // _otUnlocked = true means password was entered once this session —
    // all OT overrides are allowed without re-entering until lockOTOverride() is called.
    let _otUnlocked = false;
    let _otPwdCB    = null;

    function _setOTUnlocked(state) {
      _otUnlocked = state;
      const bar = document.getElementById('otUnlockBar');
      if (bar) bar.style.display = state ? 'flex' : 'none';
    }

    function lockOTOverride() {
      _setOTUnlocked(false);
      showStatusMessage('OT override locked 🔒');
    }

    function _askOTPwd(onOK, onFail) {
      // Already unlocked this session — skip the modal entirely
      if (_otUnlocked) { onOK?.(); return; }
      _otPwdCB = { onOK, onFail };
      document.getElementById('otPwdInput').value = '';
      document.getElementById('otPwdModal').classList.add('show');
      setTimeout(() => document.getElementById('otPwdInput').focus(), 80);
    }

    function _submitOTPwd() {
      const entered = document.getElementById('otPwdInput').value;
      const pwd = (window.BCOT_OT_OVERRIDE_PASSWORD||'').trim();
      document.getElementById('otPwdModal').classList.remove('show');
      if (entered === pwd) {
        _setOTUnlocked(true);   // unlock for the rest of the session
        showStatusMessage('OT override unlocked — click 🔒 Lock OT when done.', 'info');
        _otPwdCB?.onOK?.();
      } else {
        showStatusMessage('Incorrect password — override cancelled.','error');
        _otPwdCB?.onFail?.();
      }
      _otPwdCB = null;
    }

    function _cancelOTPwd() {
      document.getElementById('otPwdModal').classList.remove('show');
      _otPwdCB?.onFail?.();
      _otPwdCB = null;
    }

    // ── OT cell builder ───────────────────────────────────────────────────────
    function buildOTCell(overrideVal=null, isOverride=false) {
      const td  = document.createElement('td');
      td.className = 'ot-cell';
      if (isOverride) td.dataset.override = 'true';

      const span = document.createElement('span');
      span.className = 'ot-val' + (isOverride?' ot-override':'');
      span.textContent = overrideVal !== null ? overrideVal : '—';
      span.contentEditable = 'true';
      span.tabIndex = -1;   // skip via Tab — click or use lock button to override
      span.spellcheck = false;
      span.title = 'Type a number to override, or type "auto" to reset';
      span.style.cssText = 'min-width:28px;display:inline-block;outline:none;cursor:text;border-radius:3px;padding:0 2px;';

      span.addEventListener('focus', () => {
        span.style.background = '#fffde7';
        span.style.outline = '1px solid #d97706';
      });
      span.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); span.textContent = td.dataset.savedVal || '—'; span.blur(); }
      });
      span.addEventListener('focus', () => { td.dataset.savedVal = span.textContent; });
      span.addEventListener('blur', () => {
        span.style.background = '';
        span.style.outline = '';
        const raw = span.textContent.trim();
        const saved = (td.dataset.savedVal || '').trim();
        // If nothing changed and not already 'auto', do nothing — prevents accidental overrides
        if (raw === saved && raw.toLowerCase() !== 'auto') return;
        if (raw.toLowerCase() === 'auto' || raw === '') {
          // Reset to calculated
          delete td.dataset.override;
          span.className = 'ot-val';
          btn.textContent = '🔒'; btn.title = 'Override manually';
          calcOT(td.parentElement);
          showStatusMessage('OT reset to auto-calculated ✅');
        } else {
          const parsed = parseFloat(raw.replace('+',''));
          if (!Number.isFinite(parsed)) {
            // Invalid — restore saved value
            span.textContent = saved || '—';
            showStatusMessage('Invalid OT value — restored previous.', 'error');
            return;
          }
          // Set manual override — password required (shows masked modal)
          const pwd = (window.BCOT_OT_OVERRIDE_PASSWORD||'').trim();
          if (pwd && td.dataset.override !== 'true') {
            span.textContent = saved || '—';  // restore while modal is open
            _askOTPwd(
              () => {
                td.dataset.override = 'true';
                span.textContent = (parsed>0?'+':'')+parsed;
                span.className = 'ot-val ot-override'+(parsed>0?' ot-positive':parsed<0?' ot-negative':'');
                btn.textContent = '🔓'; btn.title = 'Reset to calculated';
                td.dataset.savedVal = span.textContent;
              },
              () => { span.textContent = saved || '—'; }
            );
            return;
          }
          td.dataset.override = 'true';
          span.textContent = (parsed>0?'+':'')+parsed;
          span.className = 'ot-val ot-override'+(parsed>0?' ot-positive':parsed<0?' ot-negative':'');
          btn.textContent = '🔓'; btn.title = 'Reset to calculated';
        }
      });

      const btn = document.createElement('button');
      btn.className = 'ot-lock-btn'; btn.type='button';
      btn.textContent = isOverride ? '🔓' : '🔒';
      btn.title = isOverride ? 'Reset to calculated' : 'Override manually';
      btn.onclick = () => handleOTLock(td);

      // Comp-type toggle button (💰 OT vs 📅 COMP) — inherits area default when row created
      const ctBtn = document.createElement('button');
      ctBtn.type = 'button';
      ctBtn.className = 'comp-type-btn';
      ctBtn.title = 'Click to toggle: 💰 OT Pay vs 📅 COMP Day';
      ctBtn.style.cssText =
        'background:none;border:none;cursor:pointer;font-size:13px;padding:0 1px;' +
        'line-height:1;vertical-align:middle;opacity:.75;transition:opacity .15s;';
      ctBtn.textContent = '💰'; // default; overridden after row is added to DOM
      ctBtn.onmouseenter = () => { ctBtn.style.opacity='1'; };
      ctBtn.onmouseleave = () => { ctBtn.style.opacity='.75'; };
      ctBtn.onclick = () => {
        const row = ctBtn.closest('tr');
        if (!row) return;
        const cur = row.dataset.compType || 'OT';
        const nxt = cur === 'OT' ? 'COMP' : 'OT';
        row.dataset.compType = nxt;
        ctBtn.textContent = nxt === 'OT' ? '💰' : '📅';
        ctBtn.title = nxt === 'OT'
          ? '💰 OT Pay — click to switch to COMP Day'
          : '📅 COMP Day — click to switch to OT Pay';
      };

      td.appendChild(span); td.appendChild(btn); td.appendChild(ctBtn);
      return td;
    }

    // ── Extension hours cell builder ──────────────────────────────────────────
    // Shows as "E{n}" — manually editable, saved separately, combined at pre-approval time.
    function buildExtCell(value=0) {
      const td = document.createElement('td');
      td.className = 'ext-cell';
      const prefix = document.createElement('span');
      prefix.className = 'ext-prefix';
      prefix.textContent = 'E';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = '0.5';
      inp.value = String(Number(value)||0);
      inp.title = 'Extension hours — added to OT on the pre-approval form';
      td.appendChild(prefix); td.appendChild(inp);
      return td;
    }

    function handleOTLock(otCell) {
      const pwd = (window.BCOT_OT_OVERRIDE_PASSWORD||'').trim();
      if (!pwd) { showStatusMessage('OT password not set in config.js','error'); return; }
      if (otCell.dataset.override==='true') {
        // Reset to calculated — no password needed (user can always type "auto" too)
        delete otCell.dataset.override;
        otCell.querySelector('.ot-lock-btn').textContent='🔒';
        otCell.querySelector('.ot-lock-btn').title='Override manually';
        calcOT(otCell.parentElement);
        showStatusMessage('OT reset to auto-calculated ✅');
      } else {
        // Ask password → on success, focus the OT span for direct editing
        _askOTPwd(() => {
          const span = otCell.querySelector('.ot-val');
          otCell.dataset.override = 'true';
          otCell.querySelector('.ot-lock-btn').textContent = '🔓';
          otCell.querySelector('.ot-lock-btn').title = 'Reset to calculated';
          span.className = 'ot-val ot-override';
          // Select all text so user can type the new value immediately
          span.focus();
          const sel=window.getSelection(), rng=document.createRange();
          rng.selectNodeContents(span); sel.removeAllRanges(); sel.addRange(rng);
        });
      }
    }

    // ── Holiday UI ────────────────────────────────────────────────────────────
    function renderHolidayList() {
      const container = document.getElementById('holidayList');
      if (!container) return;
      container.innerHTML='';
      if (!holidays.length) {
        container.innerHTML='<span style="color:#9ca3af;font-size:11px;font-style:italic;">No holidays — click + Add Holiday</span>';
        return;
      }
      holidays.forEach((h, idx) => {
        const chip = document.createElement('div');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:999px;padding:3px 10px 3px 8px;font-size:11px;';
        chip.innerHTML=`
          <input type="checkbox" ${h.enabled?'checked':''} title="Enable/disable this holiday"
            style="cursor:pointer;width:13px;height:13px;"
            onchange="holidays[${idx}].enabled=this.checked;recalculateAllOT();renderHolidayList();">
          <input type="text" value="${h.label||''}" placeholder="Label"
            title="Holiday name"
            style="border:none;background:transparent;width:70px;font-size:11px;font-weight:700;color:#1e40af;padding:0;outline:none;"
            oninput="holidays[${idx}].label=this.value;">
          <span style="color:#6b7280;">Days</span>
          <input type="number" min="1" max="31" value="${h.fromDay||''}" placeholder="From"
            title="From day"
            style="border:1px solid #d1d5db;border-radius:4px;width:38px;font-size:11px;padding:1px 3px;text-align:center;"
            onchange="holidays[${idx}].fromDay=Number(this.value);recalculateAllOT();">
          <span style="color:#6b7280;">–</span>
          <input type="number" min="1" max="31" value="${h.toDay||''}" placeholder="To"
            title="To day"
            style="border:1px solid #d1d5db;border-radius:4px;width:38px;font-size:11px;padding:1px 3px;text-align:center;"
            onchange="holidays[${idx}].toDay=Number(this.value);recalculateAllOT();">
          <button type="button"
            style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:0 0 0 2px;line-height:1;"
            title="Remove"
            onclick="removeHoliday(${idx})">✕</button>`;
        container.appendChild(chip);
      });
    }
    function addHoliday() {
      holidays.push({enabled:true, label:'', fromDay:null, toDay:null});
      renderHolidayList();
    }
    function removeHoliday(idx) {
      holidays.splice(idx,1); renderHolidayList(); recalculateAllOT();
    }

    // ── Area helpers ──────────────────────────────────────────────────────────
    function getCurrentArea() {
      // prefer live select, fall back to localStorage
      return (document.getElementById("areaFilter")?.value
        || localStorage.getItem(AREA_KEY)
        || "ALL").toUpperCase();
    }

    function getAreasList() {
      try {
        const all     = JSON.parse(localStorage.getItem(AREAS_LIST_KEY) || "[]") || [];
        const allowed = window.BCOT_AUTH_ALLOWED_AREAS;
        if (!allowed || allowed === 'ALL') return all;
        if (Array.isArray(allowed)) return all.filter(a => allowed.includes(a));
        return all;
      } catch { return []; }
    }

    function saveAreaToList(area) {
      const list = getAreasList();
      if (area && area !== "ALL" && !list.includes(area)) {
        list.push(area); list.sort();
        localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(list));
      }
    }

    function rebuildAreaSelect() {
      // Keep the hidden input value valid; update the visible button label
      const inp  = document.getElementById("areaFilter");
      const prev = inp?.value || "ALL";
      const list = getAreasList();
      const valid = (prev === "ALL" || list.includes(prev)) ? prev : "ALL";
      if (inp) inp.value = valid;
      const lbl = document.getElementById("areaPickerLabel");
      if (lbl) lbl.textContent = valid === "ALL" ? "All Areas" : valid;
    }

    // ── Custom confirmation modal ─────────────────────────────────────────────
    function showConfirmModal({ title, message, confirmLabel='Confirm', cancelLabel='Cancel', danger=false }) {
      return new Promise(resolve => {
        const existing = document.getElementById('appConfirmModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'appConfirmModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,8,23,.82);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(8px);';
        const accent  = danger ? '#f87171' : '#60a5fa';
        const okBg    = danger ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#1d4ed8,#1e40af)';
        const okShadow= danger ? '0 4px 18px rgba(220,38,38,.45)' : '0 4px 18px rgba(29,78,216,.45)';
        modal.innerHTML = `
          <div style="
            background:linear-gradient(145deg,#0f172a 0%,#1e293b 60%,#0f172a 100%);
            border:1px solid rgba(148,163,184,.18);
            border-radius:22px;padding:34px 36px;
            min-width:360px;max-width:480px;width:92%;
            box-shadow:0 40px 100px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.06);">
            <!-- accent top bar -->
            <div style="height:3px;border-radius:99px;background:${danger?'linear-gradient(90deg,#dc2626,#f97316)':'linear-gradient(90deg,#1d4ed8,#06b6d4)'};margin-bottom:26px;"></div>
            <!-- icon + text -->
            <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:24px;">
              <div style="flex-shrink:0;width:44px;height:44px;border-radius:14px;display:flex;align-items:center;
                justify-content:center;font-size:22px;
                background:${danger?'rgba(220,38,38,.15)':'rgba(29,78,216,.15)'};
                border:1px solid ${danger?'rgba(248,113,113,.3)':'rgba(96,165,250,.3)'};">
                ${danger ? '⚠️' : 'ℹ️'}
              </div>
              <div style="flex:1;">
                <div style="font-size:16px;font-weight:800;color:#f8fafc;margin-bottom:9px;letter-spacing:.1px;line-height:1.3;">${title}</div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.75;font-weight:400;">${message}</div>
              </div>
            </div>
            <!-- divider -->
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(148,163,184,.2),transparent);margin-bottom:24px;"></div>
            <!-- buttons -->
            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button id="confirmModalCancel"
                style="background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.25);
                border-radius:11px;padding:11px 24px;font-size:13px;font-weight:600;cursor:pointer;"
                onmouseover="this.style.background='rgba(148,163,184,.1)';this.style.color='#e2e8f0'"
                onmouseout="this.style.background='transparent';this.style.color='#94a3b8'">
                ${cancelLabel}
              </button>
              <button id="confirmModalOk"
                style="background:${okBg};color:#fff;border:none;border-radius:11px;
                padding:11px 28px;font-size:13px;font-weight:800;cursor:pointer;
                box-shadow:${okShadow};letter-spacing:.3px;"
                onmouseover="this.style.opacity='.88'"
                onmouseout="this.style.opacity='1'">
                ${confirmLabel}
              </button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const cleanup = ok => { modal.remove(); resolve(ok); };
        document.getElementById('confirmModalOk').onclick     = () => cleanup(true);
        document.getElementById('confirmModalCancel').onclick = () => cleanup(false);
        modal.addEventListener('click', e => { if (e.target === modal) cleanup(false); });
      });
    }

    function showNewReleaseModal({ current, next }) {
      return new Promise(resolve => {
        document.getElementById('newReleaseModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'newReleaseModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,8,23,.82);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(8px);';
        modal.innerHTML = `
          <div style="background:linear-gradient(145deg,#0f172a 0%,#1e293b 60%,#0f172a 100%);
            border:1px solid rgba(148,163,184,.18);border-radius:22px;padding:34px 36px;
            min-width:360px;max-width:500px;width:92%;
            box-shadow:0 40px 100px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.06);">
            <div style="height:3px;border-radius:99px;background:linear-gradient(90deg,#1d4ed8,#06b6d4);margin-bottom:26px;"></div>
            <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:24px;">
              <div style="flex-shrink:0;width:44px;height:44px;border-radius:14px;display:flex;align-items:center;
                justify-content:center;font-size:22px;background:rgba(29,78,216,.15);border:1px solid rgba(96,165,250,.3);">🔄</div>
              <div style="flex:1;">
                <div style="font-size:16px;font-weight:800;color:#f8fafc;margin-bottom:9px;letter-spacing:.1px;">Create New Release?</div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.75;">
                  Current: <b style="color:#93c5fd;">${current}</b><br>
                  New: <b style="color:#86efac;">${next}</b><br>
                  <span style="color:#94a3b8;font-size:12px;">Current release stays safely in the cloud.</span>
                </div>
              </div>
            </div>
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(148,163,184,.2),transparent);margin-bottom:20px;"></div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <button id="nrm-continue" style="background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#fff;border:none;
                border-radius:11px;padding:12px 20px;font-size:13px;font-weight:800;cursor:pointer;text-align:left;">
                ▶ Continue current work
                <div style="font-size:11px;font-weight:400;color:#bfdbfe;margin-top:2px;">Keep all duties &amp; OT — save as new release when ready</div>
              </button>
              <button id="nrm-fresh" style="background:linear-gradient(135deg,#0f766e,#065f46);color:#fff;border:none;
                border-radius:11px;padding:12px 20px;font-size:13px;font-weight:800;cursor:pointer;text-align:left;">
                🗑 Start fresh
                <div style="font-size:11px;font-weight:400;color:#a7f3d0;margin-top:2px;">Clear grid, load staff from cloud — save when ready</div>
              </button>
              <button id="nrm-cancel" style="background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.25);
                border-radius:11px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const cleanup = val => { modal.remove(); resolve(val); };
        document.getElementById('nrm-continue').onclick = () => cleanup('continue');
        document.getElementById('nrm-fresh').onclick    = () => cleanup('fresh');
        document.getElementById('nrm-cancel').onclick   = () => cleanup(null);
        modal.addEventListener('click', e => { if (e.target === modal) cleanup(null); });
      });
    }

    // ── Area selector modal (radio buttons) ──────────────────────────────────
    function openAreaSelectorModal() {
      const existing = document.getElementById("areaSelectorModal");
      if (existing) existing.remove();
      const areas   = getAreasList();
      const current = getCurrentArea();
      const modal   = document.createElement("div");
      modal.id = "areaSelectorModal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:5000;";
      const options = [{ value:"ALL", label:"All Areas" }, ...areas.map(a => ({ value:a, label:a }))];
      modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:22px 26px;min-width:260px;max-width:340px;
          width:90%;box-shadow:0 10px 40px rgba(0,0,0,.3);">
          <h3 style="margin:0 0 16px;font-size:13px;color:#1a4f8b;font-weight:800;">Select Area</h3>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;margin-bottom:18px;">
            ${options.map(o => `
              <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;
                border:1.5px solid ${o.value===current?'#818cf8':'#e5e7eb'};
                background:${o.value===current?'#eef2ff':'#fff'};cursor:pointer;font-size:12px;font-weight:${o.value===current?'700':'400'};">
                <input type="radio" name="areaPick" value="${o.value}" ${o.value===current?'checked':''}
                  style="accent-color:#3730a3;width:14px;height:14px;cursor:pointer;"/>
                ${o.label}
              </label>`).join("")}
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="areaSelApply"  style="background:#1a4f8b;color:#fff;border:none;border-radius:8px;padding:8px 22px;font-size:12px;font-weight:700;cursor:pointer;">Select</button>
            <button id="areaSelCancel" style="background:#6b7280;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;cursor:pointer;">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      document.getElementById("areaSelCancel").onclick = () => modal.remove();
      modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
      document.getElementById("areaSelApply").onclick = () => {
        const picked = modal.querySelector('input[name="areaPick"]:checked')?.value || "ALL";
        modal.remove();
        if (picked === current) return;  // no change
        document.getElementById("areaFilter").value = picked;
        const lbl = document.getElementById("areaPickerLabel");
        if (lbl) lbl.textContent = picked === "ALL" ? "All Areas" : picked;
        setArea();
      };
    }

    function addNewArea() {
      const raw = (document.getElementById("newAreaInput").value || "")
        .trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,20);
      if (!raw) { showStatusMessage("Enter a valid area name.", 'error'); return; }
      saveAreaToList(raw);
      document.getElementById("areaFilter").value = raw;
      const lbl = document.getElementById("areaPickerLabel");
      if (lbl) lbl.textContent = raw;
      document.getElementById("newAreaInput").value = "";
      rebuildAreaSelect();
      setArea();
    }

    async function deleteCurrentArea() {
      const area = getCurrentArea();
      if (!area || area === "ALL") { showStatusMessage("Select a specific area to delete.", "error"); return; }
      const ok = await showConfirmModal({
        title: `Delete area "${area}"?`,
        message: `This will remove <b>${area}</b> from the area list.<br>Staff assigned only to this area will have it cleared from their record.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;

      // Remove from areas list
      const list = getAreasList().filter(a => a !== area);
      localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(list));

      // Remove staff records tagged to this area
      try {
        const raw = localStorage.getItem(STAFF_RECORDS_KEY);
        if (raw) {
          const all = JSON.parse(raw);
          if (Array.isArray(all)) {
            const kept = all.map(s => {
            const areas = (s.area || "").toUpperCase().split(",").map(x => x.trim()).filter(Boolean);
            if (!areas.includes(area.toUpperCase())) return s;  // not in this area — untouched
            const remaining = areas.filter(a => a !== area.toUpperCase()).join(",");
            return { ...s, area: remaining };  // strip the deleted area (may become empty → appears in ALL)
          });
            localStorage.setItem(STAFF_RECORDS_KEY, JSON.stringify(kept));
          }
        }
      } catch(e) { console.warn("Could not trim staff records:", e); }

      // Clean up release num key
      localStorage.removeItem(releaseKey(area));

      // Reset filter to ALL
      document.getElementById("areaFilter").value = "ALL";
      const lbl = document.getElementById("areaPickerLabel");
      if (lbl) lbl.textContent = "All Areas";
      rebuildAreaSelect();
      setArea();
      showStatusMessage(`Area "${area}" and its staff records deleted ✅`);
    }

    async function setArea() {
      const area  = getCurrentArea();
      const label = area === "ALL" ? "All Areas" : area;
      // Confirm before clearing rota
      const hadRows = Array.from(document.querySelectorAll('#rotaTable tbody tr'))
        .some(r => r.cells[0]?.querySelector('input')?.value?.trim());
      if (hadRows) {
        const ok = await showConfirmModal({
          title: `Switch to "${label}"?`,
          message: `The current rota will be cleared and staff &amp; duties for <b>${label}</b> will be loaded from cloud.`,
          confirmLabel: 'Switch Area',
          danger: false
        });
        if (!ok) {
          const prev = localStorage.getItem(AREA_KEY) || "ALL";
          document.getElementById("areaFilter").value = prev;
          const lbl2 = document.getElementById("areaPickerLabel");
          if (lbl2) lbl2.textContent = prev === "ALL" ? "All Areas" : prev;
          return;
        }
      }
      localStorage.setItem(AREA_KEY, area);
      const hdr = document.getElementById("headerAreaLabel");
      if (hdr) hdr.textContent = label;
      const pal = document.getElementById("printAreaLabel");
      if (pal) pal.textContent = label;
      releaseNum = loadReleaseNum(area);
      updateRotaLabel();
      await onAreaChanged(area);
    }

    async function onAreaChanged(area) {
      // Clear the rota table
      document.querySelector('#rotaTable tbody').innerHTML = '';
      // Load duties then staff from cloud for the new area
      await reloadDutiesFromStorage();
      await populateStaff();
      updateDashboard();
    }

    function getAreaOrWarn() {
      const a = getCurrentArea();
      if (!a) { showStatusMessage("Select an Area filter first.", 'error'); return null; }
      return a; // "ALL" is valid — saves under "ALL" namespace in Firestore
    }

    // ── Core helpers ──────────────────────────────────────────────────────────
    function showStatusMessage(message, type = 'success') {
      const el = document.querySelector('.status-message');
      el.textContent = message;
      el.className = 'status-message status-' + (type === 'error' ? 'error' : type === 'info' ? 'info' : 'success');
      el.style.display = 'block';
      setTimeout(() => el.style.display = 'none', 3600);
    }

    function getMonthlyTarget() {
      const raw = Number(document.getElementById('monthlyTarget').value || 0);
      return Number.isFinite(raw) && raw >= 0 ? raw : 180;
    }
    function persistMonthlyTarget() { localStorage.setItem(TARGET_STORAGE_KEY, String(getMonthlyTarget())); updateDashboard(); }

    function getKeyOrWarn() {
      const key = (window.BCOT_APP_KEY || "").trim();
      if (!key) { showStatusMessage("config.js not found — cloud sync disabled.", 'error'); return null; }
      return key;
    }
    function setKeyFieldFromStorage() {
      const t = Number(localStorage.getItem(TARGET_STORAGE_KEY) || 180);
      if (Number.isFinite(t) && t >= 0) document.getElementById('monthlyTarget').value = String(t);
    }

    // ── Staff (unified pool, filtered by area) ────────────────────────────────
    function loadStaffList() {
      try {
        const all  = JSON.parse(localStorage.getItem(STAFF_RECORDS_KEY) || "[]") || [];
        const area = getCurrentArea();
        // When ALL: return everyone.
        // When a specific area: return only staff explicitly tagged to that area
        // (staff with no area assignment are excluded — they appear in ALL only).
        const filtered = (area === "ALL")
          ? all
          : all.filter(s => (s.area || '').toUpperCase().split(',').map(x => x.trim()).includes(area));
        return filtered.map(s => s.name).filter(Boolean);
      } catch { return []; }
    }
    let staffList = loadStaffList();

    // ── Fixed leave / holiday duties (all areas, always present) ─────────────
    // SL has noLeaveCount:true → its days are NOT deducted from the OT standard.
    // All others count as off-days (reduce the OT standard like a leave day).
    const FIXED_LEAVE_DUTIES = {
      OFF: { label:'Day Off',         hours:0, color:'#64748b', area:'', assignedSt:0, noLeaveCount:true  },
      SL:  { label:'Sick Leave',      hours:0, color:'#94a3b8', area:'', assignedSt:0, noLeaveCount:true  },
      AL:  { label:'Annual Leave',    hours:0, color:'#c084fc', area:'', assignedSt:0, noLeaveCount:false },
      HL:  { label:'Holiday Leave',   hours:0, color:'#a855f7', area:'', assignedSt:0, noLeaveCount:false },
      ADL: { label:'Admin Leave',     hours:0, color:'#9333ea', area:'', assignedSt:0, noLeaveCount:false },
      H:   { label:'Public Holiday',  hours:0, color:'#4ade80', area:'', assignedSt:0, noLeaveCount:false },
      ND:  { label:'National Day',    hours:0, color:'#22c55e', area:'', assignedSt:0, noLeaveCount:false },
      FD:  { label:'Founding Day',    hours:0, color:'#16a34a', area:'', assignedSt:0, noLeaveCount:false },
    };

    // ── Duties (unified pool, filtered by area) ───────────────────────────────
    function loadDuties() {
      try {
        const all = JSON.parse(localStorage.getItem(DUTIES_ALL_KEY) || "{}") || {};
        const area = getCurrentArea();
        let filtered = {};
        if (all && typeof all === "object" && Object.keys(all).length) {
          if (area === "ALL") {
            filtered = all;
          } else {
            Object.entries(all).forEach(([code, meta]) => {
              const areas = (meta.area || "").split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
              if (!areas.length || areas.includes(area)) filtered[code] = meta;
            });
          }
        }
        // Fixed leave duties are always merged in (user definitions take precedence
        // for label/color, but OFF and SL's noLeaveCount flags are always enforced)
        const result = { ...FIXED_LEAVE_DUTIES, ...filtered };
        if (result['OFF']) result['OFF'] = { ...result['OFF'], noLeaveCount: true };
        if (result['SL'])  result['SL']  = { ...result['SL'],  noLeaveCount: true };
        return result;
      } catch { return { ...FIXED_LEAVE_DUTIES }; }
    }
    let DUTIES = loadDuties() || {};

    // ── Duty styles & legend ──────────────────────────────────────────────────
    // Produce a CSS-safe class token for any duty code.
    // Replaces every character that is not alphanumeric, hyphen, or underscore
    // with an underscore, preventing invalid CSS selectors and DOMException
    // from classList when codes contain spaces, dots, slashes, etc.
    function dutyCls(code) {
      return 'D_' + String(code).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function injectDutyStyles() {
      const old = document.getElementById("dutiesStyleTag");
      if (old) old.remove();
      const style = document.createElement("style");
      style.id = "dutiesStyleTag";
      let css = "";
      Object.entries(DUTIES).forEach(([code, meta]) => {
        const color = (meta?.color && meta.color !== 'undefined') ? meta.color : "#1a4f8b";
        const cls   = dutyCls(code);
        css += `.${cls}{background:${color}!important;color:#fff!important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}` +
               `.weekend.${cls}{filter:brightness(0.92);}`;
      });
      style.textContent = css;
      document.head.appendChild(style);
    }

    function buildLegend() {
      const box = document.getElementById("legendBox");
      if (!box) return;
      box.innerHTML = "";
      if (!Object.keys(DUTIES).length) {
        box.innerHTML = '<span style="color:#6b7280;font-size:11px;">No duties for this filter. Open Duties.html to add duties.</span>';
        renderAbbreviationsTable(); return;
      }
      // Collect every duty code actually present in the rota right now
      const used = new Set();
      document.querySelectorAll('#rotaTable tbody tr').forEach(row => {
        const hIdx = Array.from(row.cells).indexOf(row.querySelector('.hours-cell'));
        for (let i = 1; i < hIdx; i++) {
          const v = row.cells[i].textContent.trim().toUpperCase();
          if (v) used.add(v.endsWith('_O') ? v.slice(0, -2) : v);
        }
      });
      Object.entries(DUTIES).forEach(([code, meta]) => {
        // Skip duties not used in the rota — legend stays empty until something is typed
        if (!used.has(code)) return;
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `<div class="legend-color" style="background:${meta.color}"></div>` +
          `<span>${meta.label} (${code}) ${meta.area ? '['+meta.area+']' : ''} — ${Number(meta.hours)||0}h</span>`;
        box.appendChild(item);
      });
      renderAbbreviationsTable();
    }

    async function reloadDutiesFromStorage() {
      try {
        const key = (window.BCOT_APP_KEY || "").trim();
        if (!key) { showStatusMessage("config.js not found — cannot load duties.", "error"); return; }
        showStatusMessage("Loading duties from cloud…", "info");
        const ref  = window.FB.doc(window.FB.db, "bcot_overtime_secure", key, "duties_named", "DUTIES_POOL");
        const snap = await window.FB.getDoc(ref);
        if (!snap.exists() || !Object.keys(snap.data()?.duties||{}).length) {
          showStatusMessage("No duties in cloud — loaded from local cache.", "info");
        } else {
          const dutiesObj = snap.data().duties;
          localStorage.setItem(DUTIES_ALL_KEY, JSON.stringify(dutiesObj));
        }
      } catch(e) { console.error(e); showStatusMessage("Cloud unavailable — duties loaded from local cache.", "info"); }
      DUTIES = loadDuties() || {};
      injectDutyStyles();
      buildLegend();
      document.querySelectorAll("#rotaTable tbody tr").forEach(updateHours);
      updateDashboard();
      if (Object.keys(DUTIES).length) showStatusMessage("Duties loaded ✅");
      else showStatusMessage("No duties found. Open Duties.html to add duties.", "error");
    }

    function renderAbbreviationsTable() {
      const tbody = document.getElementById('abbreviationsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';
      Object.entries(DUTIES).forEach(([code, meta]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><b>${code}</b></td><td>${meta.label||''}</td><td>${meta.area||'—'}</td><td>${Number(meta.hours)||0}</td>`;
        tbody.appendChild(tr);
      });
    }

    // ── Statistics ────────────────────────────────────────────────────────────
    function getRowHoursStatus(hours) {
      const t = getMonthlyTarget();
      return hours > t ? 'over' : hours < t ? 'under' : 'target';
    }
    function renderStatisticsTable() {
      const tbody = document.getElementById('statisticsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';
      Array.from(document.querySelectorAll('#rotaTable tbody tr')).forEach(row => {
        const name = row.cells[0]?.querySelector('input')?.value?.trim();
        if (!name) return;
        const hours = Number(row.querySelector('.hours-cell')?.textContent || 0);
        const diff  = hours - getMonthlyTarget();
        const label = hours > getMonthlyTarget() ? 'Over Target' : hours < getMonthlyTarget() ? 'Under Target' : 'Balanced';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${name}</td><td>${hours}</td><td>${diff>0?'+':''}${diff}</td><td>${label}</td>`;
        tbody.appendChild(tr);
      });
    }
    function openAbbreviationsPage()  { renderAbbreviationsTable(); document.getElementById('abbreviationsModal').classList.add('show'); }
    function closeAbbreviationsPage() { document.getElementById('abbreviationsModal').classList.remove('show'); }
    function openStatisticsPage()     { renderStatisticsTable();    document.getElementById('statisticsModal').classList.add('show'); }
    function closeStatisticsPage()    { document.getElementById('statisticsModal').classList.remove('show'); }
    function openSettingsModal()      { document.getElementById('settingsModal').classList.add('show'); try{ updateDashboard(); }catch(e){ console.warn('dashboard update:',e); } }
    function closeSettingsModal()     { document.getElementById('settingsModal').classList.remove('show'); }

    // ── Calendar ──────────────────────────────────────────────────────────────
    function getDaysInMonth(month) { return new Date(new Date().getFullYear(), month, 0).getDate(); }
    function isWeekend(year, month, day) { const d = new Date(year, month-1, day).getDay(); return d===5||d===6; }

    // ── Table ─────────────────────────────────────────────────────────────────
    function updateTable() {
      const month = parseInt(document.getElementById('monthSelect').value, 10);
      const year  = new Date().getFullYear();
      const days  = getDaysInMonth(month);
      const headerRow = document.querySelector('#rotaTable thead tr');
      headerRow.innerHTML = '';
      const nameTh = document.createElement('th'); nameTh.textContent = 'Staff Name (Badge No)'; headerRow.appendChild(nameTh);
      for (let i=1; i<=days; i++) {
        const th = document.createElement('th'); th.textContent = i;
        if (isWeekend(year,month,i)) th.classList.add('weekend');
        headerRow.appendChild(th);
      }
      const hTh  = document.createElement('th'); hTh.textContent  = 'Hours';       headerRow.appendChild(hTh);
      const sTh  = document.createElement('th'); sTh.className='sched-th'; sTh.textContent  = 'Sched. Type'; headerRow.appendChild(sTh);
      const otTh = document.createElement('th'); otTh.className='ot-th';   otTh.textContent = 'OT';          headerRow.appendChild(otTh);
      const exTh = document.createElement('th'); exTh.className='ext-th';  exTh.textContent = 'Ext.';        headerRow.appendChild(exTh);

      document.querySelectorAll('#rotaTable tbody tr').forEach(row => {
        const name          = row.cells[0]?.querySelector('input')?.value || '';
        const schedVal      = row.querySelector('.sched-cell select')?.value || '';
        const otIsOverride  = row.querySelector('.ot-cell')?.dataset?.override === 'true';
        const otOverrideVal = otIsOverride ? (row.querySelector('.ot-val')?.textContent || null) : null;
        const extVal        = Number(row.querySelector('.ext-cell input')?.value) || 0;
        const hIdx = Array.from(row.cells).indexOf(row.querySelector('.hours-cell'));
        const codes = [];
        for (let i=1; i<hIdx; i++) codes.push(row.cells[i].textContent.trim());
        row.innerHTML = '';
        row.appendChild(buildNameCell(row, name));
        for (let i=1; i<=days; i++) {
          const td = createDayCell();
          if (isWeekend(year,month,i)) td.classList.add('weekend');
          const code = (codes[i-1]||'').toUpperCase();
          if (DUTIES[code]) applyDutyToCell(td, code);
          row.appendChild(td);
        }
        const hc = document.createElement('td'); hc.className='hours-cell'; hc.textContent = '0'; row.appendChild(hc);
        row.appendChild(buildSchedCell(schedVal));
        row.appendChild(buildOTCell(otOverrideVal, otIsOverride));
        row.appendChild(buildExtCell(extVal));
        updateHours(row);
      });
      applyColumnWidths();
      updateDashboard();
    }

    function buildNameCell(rowRef, existingValue='') {
      const nameCell = document.createElement('td');
      const input    = document.createElement('input');
      input.type  = 'text';
      input.className = 'staff-input';
      input.placeholder = 'Type to search staff...';

      const datalist = document.createElement('datalist');
      const dlId = 'staff-list-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      datalist.id = dlId;
      input.setAttribute('list', dlId);

      staffList = loadStaffList();
      staffList.forEach(s => { const o = document.createElement('option'); o.value = s; datalist.appendChild(o); });

      input.value = existingValue;
      input.addEventListener('change', function() {
        staffList = loadStaffList();
        const v = this.value.trim();
        if (v && staffList.length && !staffList.includes(v)) {
          this.value = '';
          showStatusMessage('Please select a valid staff member from Staff.html', 'error');
          return;
        }
        if (v) {
          const allInputs = document.querySelectorAll('#rotaTable tbody tr td:first-child input');
          let dupCount = 0;
          allInputs.forEach(inp => { if (inp !== this && inp.value.trim() === v) dupCount++; });
          if (dupCount > 0) {
            this.value = '';
            showStatusMessage(`"${v}" is already in this rota — no duplicates allowed.`, 'error');
            return;
          }
        }
        updateDashboard();
      });

      const del = document.createElement('button');
      del.textContent = 'X'; del.className = 'delete-btn'; del.type = 'button';
      del.onclick = async () => {
        const ok = await showConfirmModal({ title:'Delete this record?', message:'This staff row will be removed from the rota.', confirmLabel:'Delete', danger:true });
        if (ok) { rowRef.remove(); updateDashboard(); }
      };

      nameCell.appendChild(input); nameCell.appendChild(datalist); nameCell.appendChild(del);
      return nameCell;
    }

    function addNewRow() {
      const tbody = document.querySelector('#rotaTable tbody');
      const tr    = document.createElement('tr');
      tr.appendChild(buildNameCell(tr,''));
      const month = parseInt(document.getElementById('monthSelect').value,10);
      const year  = Number(document.getElementById('yearInput')?.value) || new Date().getFullYear();
      const days  = getDaysInMonth(month);
      for (let i=1; i<=days; i++) {
        const td = createDayCell();
        if (isWeekend(year,month,i)) td.classList.add('weekend');
        tr.appendChild(td);
      }
      const hc = document.createElement('td'); hc.className='hours-cell'; hc.textContent='0'; tr.appendChild(hc);
      tr.appendChild(buildSchedCell());
      tr.appendChild(buildOTCell());
      tr.appendChild(buildExtCell());
      // Inherit comp type from area default
      const areaDefault = getAreaCompType(getCurrentArea());
      tr.dataset.compType = areaDefault;
      const ctBtn = tr.querySelector('.comp-type-btn');
      if (ctBtn) {
        ctBtn.textContent = areaDefault === 'COMP' ? '📅' : '💰';
        ctBtn.title = areaDefault === 'COMP'
          ? '📅 COMP Day — click to switch to OT Pay'
          : '💰 OT Pay — click to switch to COMP Day';
      }
      tbody.appendChild(tr);
      applyColumnWidths(); updateDashboard(); filterRota();
    }

    function openOTPreApproval() {
      // Route to BC-specific form when the active area is BCOT
      window.location.href = getCurrentArea() === 'BCOT' ? 'BCOTPreApproval.html' : 'OTPreApproval.html';
    }

    async function populateStaff() {
      const area    = getCurrentArea();
      const areaTag = area === 'ALL' ? 'All Areas' : area;
      try {
        const key = (window.BCOT_APP_KEY || "").trim();
        if (!key) { showStatusMessage("config.js not found — cannot load staff.", "error"); return; }
        showStatusMessage("Loading staff from cloud…", "info");
        const ref  = window.FB.doc(window.FB.db, "bcot_overtime_secure", key, "staff_named", "STAFF_POOL");
        const snap = await window.FB.getDoc(ref);
        if (!snap.exists()) { showStatusMessage("No staff found in cloud. Save staff from Staff.html first.", "info"); return; }
        const records = snap.data()?.records || [];
        const filtered = area === "ALL"
          ? records
          : records.filter(s => (s.area||'').toUpperCase().split(',').map(x=>x.trim()).includes(area));
        if (!filtered.length) { showStatusMessage(`No staff found for "${areaTag}" in cloud.`, "info"); return; }
        // Update local cache + staffList
        localStorage.setItem(STAFF_RECORDS_KEY, JSON.stringify(records));
        // Also sync areas list from cloud so the area filter is populated
        const cloudAreas = Array.isArray(snap.data()?.areasList) ? snap.data().areasList : [];
        if (cloudAreas.length) {
          localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(cloudAreas));
        } else {
          // Derive areas from staff records if areasList not stored yet
          const derived = [...new Set(
            records.flatMap(s => (s.area||'').split(',').map(x => x.trim().toUpperCase()).filter(Boolean))
          )].sort();
          if (derived.length) localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(derived));
        }
        rebuildAreaSelect();
        staffList = filtered.map(s => s.name).filter(Boolean);
        // Only add staff not already present — preserve existing rows and their duties
        const tbody = document.querySelector('#rotaTable tbody');
        const existingNames = new Set(
          Array.from(tbody.querySelectorAll('tr')).map(row => {
            const inp = row.cells[0]?.querySelector('input');
            return (inp?.value || '').trim();
          }).filter(Boolean)
        );
        let addedCount = 0;
        staffList.forEach(name => {
          if (!existingNames.has(name)) {
            addNewRow();
            tbody.lastElementChild.cells[0].querySelector('input').value = name;
            addedCount++;
          }
        });
        updateDashboard();
        if (addedCount === 0) {
          showStatusMessage(`All staff for "${areaTag}" are already loaded ✅`, 'info');
        } else {
          showStatusMessage(`Added ${addedCount} new staff for "${areaTag}"${existingNames.size ? ` (${existingNames.size} already present)` : ''} ✅`, 'success');
        }
      } catch(e) { console.error(e); showStatusMessage("Load staff failed: " + (e?.message||e), "error"); }
    }

    // ── Cell editing ──────────────────────────────────────────────────────────
    const _cellTimers = new WeakMap();
    function scheduleCellProcess(cell) {
      const old = _cellTimers.get(cell); if (old) clearTimeout(old);
      _cellTimers.set(cell, setTimeout(() => processCellCommand(cell), 220));
    }

    function applyDutyToCell(cell, code) {
      if (!cell) return;
      const isOT = code.endsWith('_O');
      const baseCode = isOT ? code.slice(0, -2) : code;
      if (!DUTIES[baseCode]) return;
      const wknd = cell.classList.contains('weekend');
      cell.textContent = code;
      Object.keys(DUTIES).forEach(c => cell.classList.remove(dutyCls(c)));
      cell.classList.add(dutyCls(baseCode));
      if (wknd) cell.classList.add('weekend');
      // Font scaling for long codes
      const len = code.length;
      if (len > 3) cell.setAttribute('data-dlen', String(Math.min(len, 8)));
      else cell.removeAttribute('data-dlen');
    }

    function parsePatternSequence(raw) {
      const cleaned = (raw||'').toUpperCase().replace(/\s+/g,'');
      if (!cleaned) return [];
      const parts=[]; let i=0;
      while (i<cleaned.length) {
        let num=''; while (i<cleaned.length&&/\d/.test(cleaned[i])) num+=cleaned[i++];
        let code=''; while (i<cleaned.length&&/[A-Z]/.test(cleaned[i])) code+=cleaned[i++];
        // Support _O suffix: consume _O if followed by digit or end of string
        if (i<cleaned.length && cleaned[i]==='_' && i+1<cleaned.length && cleaned[i+1]==='O') {
          const after=i+2;
          if (after>=cleaned.length||/\d/.test(cleaned[after])) { code+='_O'; i+=2; }
        }
        if (!num||!code) return null;
        const baseCode=code.endsWith('_O')?code.slice(0,-2):code;
        if (!DUTIES[baseCode]) return null;
        const count=parseInt(num,10);
        if (!Number.isFinite(count)||count<1) return null;
        parts.push({count,code});
      }
      return parts;
    }

    function applyPatternMode(startCell, patternText, reps=0) {
      if (!startCell) return false;
      const row=startCell.parentElement; if (!row) return false;
      const parsed=parsePatternSequence(patternText); if (parsed===null) return false;
      const seq=[]; parsed.forEach(p=>{ for(let i=0;i<p.count;i++) seq.push(p.code); });
      if (!seq.length) return false;
      const maxCells = (reps>0) ? reps*seq.length : Infinity;
      let cell=startCell, idx=0;
      const hCell=row.querySelector('.hours-cell');
      // Stop at hours cell AND guard against sched/OT cells in case hCell is null
      while (cell && cell!==hCell && idx<maxCells &&
             !cell.classList.contains('hours-cell') &&
             !cell.classList.contains('sched-cell') &&
             !cell.classList.contains('ot-cell')) {
        applyDutyToCell(cell,seq[idx%seq.length]); idx++; cell=cell.nextElementSibling;
      }
      updateHours(row); return true;
    }

    function processCellCommand(cell) {
      const row=cell.parentElement;
      const raw=cell.textContent.trim().toUpperCase().replace(/\s+/g,'');
      if (!raw) { updateHours(row); return; }
      // Support CODE_O suffix: strip _O, validate base, reattach for display
      const isOT=raw.endsWith('_O');
      const baseRaw=isOT?raw.slice(0,-2):raw;
      const m=baseRaw.match(/^([A-Z]{1,8})(\d+)?$|^(\d+)([A-Z]{1,8})$/);
      if (m) {
        const code=(m[1]||m[4]||'').toUpperCase();
        const numStr=m[2]||m[3];
        if (!DUTIES[code]) { updateHours(row); return; }
        const displayCode=isOT?code+'_O':code;
        let count=parseInt(numStr||'1',10);
        if (!Number.isFinite(count)||count<1) count=1; if (count>31) count=31;
        const hCellRef=row.querySelector('.hours-cell');
        let cur=cell;
        // Stop strictly at the hours cell — never touch hours, schedule or OT columns
        for (let i=0;i<count&&cur&&cur!==hCellRef;i++) { applyDutyToCell(cur,displayCode); cur=cur.nextElementSibling; }
        updateHours(row); return;
      }
      updateHours(row);
    }

    function buildSchedCell(value='') {
      const td  = document.createElement('td');
      td.className = 'sched-cell';
      const sel = document.createElement('select');
      sel.tabIndex = -1;   // skip via Tab — click to change schedule type
      sel.innerHTML = '<option value="">—</option>'
        + '<option value="Regular">Regular</option>'
        + '<option value="12 Hours">12 Hours</option>'
        + '<option value="Mixed">Mixed</option>'
        + '<option value="BC">BC</option>';
      sel.value = value;
      sel.addEventListener('change', () => calcOT(td.parentElement));
      td.appendChild(sel);
      return td;
    }

    let _legendTimer = null;
    function updateHours(row) {
      const hCell = row.querySelector('.hours-cell');
      if (!hCell) return;
      const hIdx = Array.from(row.cells).indexOf(hCell);
      let hours=0;
      for (let i=1;i<hIdx;i++) { let v=row.cells[i].textContent.trim().toUpperCase(); if(v.endsWith('_O'))v=v.slice(0,-2); if(DUTIES[v]) hours+=Number(DUTIES[v].hours)||0; }
      hCell.textContent=hours;
      row.classList.remove('row-over','row-under','row-target');
      hCell.classList.remove('hours-ok','hours-warn','hours-over');
      if (row.querySelector('.sched-cell select')?.value !== 'BC') {
        // BC rows have no monthly target — skip colour coding
        const s=getRowHoursStatus(hours);
        row.classList.add(s==='over'?'row-over':s==='under'?'row-under':'row-target');
        hCell.classList.add(s==='over'?'hours-over':s==='under'?'hours-warn':'hours-ok');
      }
      calcOT(row);
      autoDetectSchedType(row);  // may update sched type + re-run calcOT internally
      updateDashboard();
      // Refresh banner hours, OT and duty chip if this is the active row
      if (_activeEditRow === row) {
        _refreshBannerStats(row);
        if (_activeDutyCell) _refreshBannerDuty(_activeDutyCell);
      }
      // Debounced legend refresh so it stays in sync with actual rota content
      if (_legendTimer) clearTimeout(_legendTimer);
      _legendTimer = setTimeout(buildLegend, 400);
    }

    // ── Auto-detect schedule type ─────────────────────────────────────────────
    // Scans filled day cells (skips empty + zero-hour duties).
    // All 12h → "12 Hours" | All <12h → "Regular" | Mix or nothing → leave as-is
    function autoDetectSchedType(row) {
      const hIdx = Array.from(row.cells).indexOf(row.querySelector('.hours-cell'));
      if (hIdx <= 0) return;
      let has12 = false, hasUnder12 = false;
      for (let i = 1; i < hIdx; i++) {
        const v = row.cells[i].textContent.trim().toUpperCase();
        if (!v) continue;
        const baseV = v.endsWith('_O') ? v.slice(0,-2) : v;
        if (!DUTIES[baseV]) continue;
        const h = Number(DUTIES[baseV].hours) || 0;
        if (h === 0) continue;           // zero-hour (leave) — ignore
        if (h === 12) has12 = true;
        else if (h < 12) hasUnder12 = true;
        if (has12 && hasUnder12) break;  // mix found early — stop
      }
      if (!has12 && !hasUnder12) return; // nothing to judge by
      if (has12 && hasUnder12) return;   // mixed — don't touch
      const sel = row.querySelector('.sched-cell select');
      if (!sel) return;
      if (sel.value === 'BC') return;    // never auto-override BC schedule type
      const newType = has12 ? '12 Hours' : 'Regular';
      if (sel.value === newType) return; // already correct — no-op
      sel.value = newType;
      calcOT(row);                       // recalculate OT with the new type
    }

    function clearSingleCell(cell) {
      const wknd=cell.classList.contains('weekend'); cell.textContent='';
      Object.keys(DUTIES).forEach(c=>cell.classList.remove(dutyCls(c)));
      if (wknd) cell.classList.add('weekend');
      cell.removeAttribute('data-dlen');
    }
    function clearCellsFromHere(cell, count) {
      const row=cell.parentElement; let cur=cell; const n=Math.max(1,Math.min(31,count));
      const hCell=row.querySelector('.hours-cell');
      for (let i=0;i<n&&cur;i++) { if(cur===hCell) break; clearSingleCell(cur); cur=cur.nextElementSibling; }
      updateHours(row);
    }

    let pendingDelete=null;
    function setPendingDelete(cell,defaultCount=5) {
      pendingDelete={cell,expiresAt:Date.now()+1200,count:defaultCount};
      showStatusMessage(`Delete mode: press 1–9 (0=10), Esc to cancel. Default: ${defaultCount} cells`,'info');
      setTimeout(()=>{ if(pendingDelete&&Date.now()>=pendingDelete.expiresAt){ clearCellsFromHere(pendingDelete.cell,pendingDelete.count); pendingDelete=null; } },1250);
    }

    function setPatternIndicator(on,msg='') {
      document.getElementById('patternIndicator').textContent=on?('Pattern mode: READY'+(msg?' • '+msg:'')):'Pattern mode: OFF';
    }
    function activatePatternMode() { patternModeArmed=true; setPatternIndicator(true,'click a day cell'); showStatusMessage('Pattern mode armed. Click a day cell.','info'); }

    function startSimplePatternFill(cell) {
      if (!cell) return;
      const userInput=window.prompt('Enter pattern. E.g.: 4NC2L  or  4NC2L(3) to repeat 3×',cell.textContent.trim()||'');
      if (userInput===null) { patternModeArmed=false; setPatternIndicator(false); showStatusMessage('Pattern cancelled','info'); return; }
      let cleaned=(userInput||'').toUpperCase().replace(/\s+/g,'');
      let reps=0;
      const repMatch=cleaned.match(/^(.*)\((\d+)\)$/);
      if (repMatch) { cleaned=repMatch[1]; reps=parseInt(repMatch[2],10); }
      const parsed=parsePatternSequence(cleaned);
      if (!parsed||!parsed.length) { patternModeArmed=false; setPatternIndicator(false); showStatusMessage('Invalid pattern or unknown duty code','error'); return; }
      const ok=applyPatternMode(cell,cleaned,reps);
      patternModeArmed=false; setPatternIndicator(false);
      showStatusMessage(ok?'Pattern applied ✅':'Pattern failed',ok?'success':'error');
    }

    document.addEventListener('keydown',(e)=>{
      if (e.key==='Escape'&&patternModeArmed) { patternModeArmed=false; setPatternIndicator(false); showStatusMessage('Pattern mode cancelled','info'); return; }
      if (!pendingDelete) return;
      if (Date.now()>pendingDelete.expiresAt) { pendingDelete=null; return; }
      const k=e.key;
      if (k>='1'&&k<='9') { e.preventDefault(); clearCellsFromHere(pendingDelete.cell,parseInt(k,10)); pendingDelete=null; return; }
      if (k==='0') { e.preventDefault(); clearCellsFromHere(pendingDelete.cell,10); pendingDelete=null; return; }
      if (k==='Escape') { e.preventDefault(); pendingDelete=null; showStatusMessage('Delete mode cancelled','info'); }
    });

    function createDayCell() {
      const td=document.createElement('td'); td.contentEditable=true;
      td.addEventListener('focus',function(){ patternStartCell=this; });
      td.addEventListener('click',function(){ patternStartCell=this; if(patternModeArmed) startSimplePatternFill(this); });
      td.addEventListener('input',function(e){ scheduleCellProcess(e.target); });
      td.addEventListener('keydown',function(e){
        // Tab on last day cell → jump to next row's first day cell (skip hours/sched/OT)
        if (e.key==='Tab' && !e.shiftKey) {
          const hCell=this.parentElement?.querySelector('.hours-cell');
          if (hCell && this.nextElementSibling===hCell) {
            e.preventDefault();
            const nextRow=this.parentElement?.nextElementSibling;
            const target=nextRow
              ? nextRow.cells[1]   // first day cell of next row
              : document.querySelector('#rotaTable tbody tr:first-child')?.cells[1];
            target?.focus();
            return;
          }
        }
        if (e.shiftKey&&!e.altKey&&e.key==='D') { e.preventDefault(); clearCellsFromHere(this,1); return; }
        if (e.shiftKey&&e.altKey&&e.key==='D')  { e.preventDefault(); setPendingDelete(this,5); return; }
        if (e.ctrlKey&&e.altKey&&(e.key==='d'||e.key==='D')) {
          e.preventDefault();
          const row=this.parentElement; let cnt=0,cur=this;
          while(cur&&cur!==row.lastElementChild){cnt++;cur=cur.nextElementSibling;}
          clearCellsFromHere(this,cnt);
        }
      });
      return td;
    }

    // ── Firestore paths (area-scoped for rotas) ───────────────────────────────
    function monthDocId() {
      const month=Number(document.getElementById('monthSelect').value);
      return `${new Date().getFullYear()}-${String(month).padStart(2,'0')}`;
    }
    function getMonthDocRef(key,docId)    { return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',getCurrentArea(),'months',docId); }
    function getNamedDocRef(key,saveName) { return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',getCurrentArea(),'named',saveName); }
    function getNamedIndexRef(key)        { return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',getCurrentArea(),'named_index','list'); }

    function getLocalRotaIndex() {
      try { const raw=localStorage.getItem(rotaIndexLocalKey()); const arr=raw?JSON.parse(raw):[]; return Array.isArray(arr)?arr:[]; } catch { return []; }
    }
    function saveLocalRotaIndex(items) { localStorage.setItem(rotaIndexLocalKey(),JSON.stringify(Array.isArray(items)?items:[])); }
    function addToLocalRotaIndex(name) { const items=getLocalRotaIndex(); if(!items.includes(name)){items.push(name);saveLocalRotaIndex(items);} }

    function renderRotaList(items) {
      const sel=document.getElementById('rotaList'); const cur=sel.value;
      sel.innerHTML='<option value="">-- Select Rota --</option>';
      items.filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b))).forEach(name=>{
        const o=document.createElement('option'); o.value=name; o.textContent=name; sel.appendChild(o);
      });
      if (cur&&items.includes(cur)) sel.value=cur;
    }

    // ── Excel export ──────────────────────────────────────────────────────────
    function exportToExcel() {
      try {
        const table=document.getElementById('rotaTable');
        const month=Number(document.getElementById('monthSelect').value);
        const year=new Date().getFullYear();
        const area=getCurrentArea();
        const defaultName=`Rota_${area}_${year}_${String(month).padStart(2,'0')}`;
        const rotaName=(document.getElementById('saveName').value||defaultName).trim();
        const safeFile=rotaName.replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_')||defaultName;
        const monthNames=['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const titleText=document.getElementById('rotaTitleInput').value||'Pharmacy Management';

        // ── Build styled HTML table for Excel ──────────────────────────────────
        const hdrCells=table.tHead.rows[0].cells;
        let thHtml='';
        for(let i=0;i<hdrCells.length;i++){
          const w=i===0?'180pt':i===hdrCells.length-1||i===hdrCells.length-2?'36pt':'18pt';
          thHtml+=`<th style="background:#1f4e79;color:#fff;font-weight:bold;border:1pt solid #aaa;padding:3pt 4pt;white-space:nowrap;min-width:${w};">${hdrCells[i].textContent.trim()}</th>`;
        }

        let tbodyHtml='';
        const bRows=table.tBodies[0].rows;
        for(let r=0;r<bRows.length;r++){
          const inp=bRows[r].cells[0].querySelector('input');
          const name=(inp?.value||'').trim(); if(!name) continue;
          let rowHtml=`<td style="border:1pt solid #ccc;padding:3pt 4pt;font-weight:bold;">${name}</td>`;
          const hIdx=Array.from(bRows[r].cells).indexOf(bRows[r].querySelector('.hours-cell'));
          for(let c=1;c<bRows[r].cells.length;c++){
            const cell=bRows[r].cells[c];
            if(cell.classList.contains('sched-cell')||cell.classList.contains('ot-cell')){
              // skip schedule/OT cells from export
              continue;
            }
            if(cell.classList.contains('hours-cell')){
              rowHtml+=`<td style="border:1pt solid #ccc;padding:3pt 4pt;text-align:center;font-weight:bold;">${cell.textContent.trim()}</td>`;
              continue;
            }
            const raw=cell.textContent.trim().toUpperCase();
            const base=raw.endsWith('_O')?raw.slice(0,-2):raw;
            const duty=DUTIES[base];
            if(duty){
              const bg=duty.color||'#1a4f8b';
              const label=raw; // show full code including _O suffix
              const desc=duty.label?` (${duty.label})`:'';
              rowHtml+=`<td style="background:${bg};color:#fff;font-weight:bold;border:1pt solid #aaa;padding:2pt 3pt;text-align:center;font-size:8pt;" title="${desc}">${label}</td>`;
            } else {
              const isWE=cell.classList.contains('weekend');
              rowHtml+=`<td style="background:${isWE?'#f0f0f0':'#fff'};border:1pt solid #ddd;padding:2pt 3pt;text-align:center;font-size:8pt;"></td>`;
            }
          }
          tbodyHtml+=`<tr>${rowHtml}</tr>`;
        }

        // ── Legend rows ────────────────────────────────────────────────────────
        let legendHtml='';
        Object.entries(DUTIES).forEach(([code,meta])=>{
          const bg=meta.color||'#1a4f8b';
          legendHtml+=`<tr>
            <td style="background:${bg};color:#fff;font-weight:bold;border:1pt solid #aaa;padding:2pt 6pt;text-align:center;">${code}</td>
            <td style="border:1pt solid #ddd;padding:2pt 6pt;">${meta.label||''}</td>
            <td style="border:1pt solid #ddd;padding:2pt 6pt;text-align:center;">${meta.hours||''} hrs</td>
            <td style="border:1pt solid #ddd;padding:2pt 6pt;">${meta.area||'All'}</td>
          </tr>`;
        });

        const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
          <head><meta charset="utf-8">
          <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
            <x:ExcelWorksheet><x:Name>Rota</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
            <x:ExcelWorksheet><x:Name>Legend</x:Name><x:WorksheetOptions/></x:ExcelWorksheet>
          </x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
          <style>
            body{font-family:Arial;font-size:10pt;}
            table{border-collapse:collapse;}
          </style></head>
          <body>
          <h2 style="font-size:13pt;color:#1f4e79;">${titleText}</h2>
          <p style="font-size:10pt;color:#555;">${monthNames[month]} ${year} &nbsp;|&nbsp; Area: ${area} &nbsp;|&nbsp; Target: ${getMonthlyTarget()} hrs</p>
          <table><thead><tr>${thHtml}</tr></thead><tbody>${tbodyHtml}</tbody></table>

          <br><br>
          <h3 style="font-size:11pt;color:#1f4e79;">Duty Abbreviations</h3>
          <table>
            <thead><tr>
              <th style="background:#1f4e79;color:#fff;padding:3pt 6pt;">Code</th>
              <th style="background:#1f4e79;color:#fff;padding:3pt 6pt;">Label</th>
              <th style="background:#1f4e79;color:#fff;padding:3pt 6pt;">Hours</th>
              <th style="background:#1f4e79;color:#fff;padding:3pt 6pt;">Area</th>
            </tr></thead>
            <tbody>${legendHtml}</tbody>
          </table>
          </body></html>`;

        const blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=safeFile+'.xls'; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        showStatusMessage('Excel exported with colors ✅');
      } catch(err){ console.error(err); showStatusMessage('Excel export failed: '+(err?.message||err),'error'); }
    }

    // ── Firestore rota list ───────────────────────────────────────────────────
    async function loadRotaList() {
      const key=getKeyOrWarn(); if (!key) return;
      const area=getAreaOrWarn(); if (!area) return;
      try {
        const local=getLocalRotaIndex();
        const snap=await window.FB.getDoc(getNamedIndexRef(key));
        const cloud=snap.exists()&&Array.isArray(snap.data().items)?snap.data().items:[];
        const merged=Array.from(new Set([...cloud,...local]));
        renderRotaList(merged);
        if (merged.length&&JSON.stringify(merged)!==JSON.stringify(local)) saveLocalRotaIndex(merged);
        if (!merged.length) showStatusMessage('No saved rotas for this filter yet.','info');
      } catch(err){
        console.error(err);
        const local=getLocalRotaIndex(); renderRotaList(local);
        showStatusMessage(local.length?'Loaded local rota list only.':'Could not load rota list.','info');
      }
    }

    function selectRotaFromList() {
      const v=document.getElementById('rotaList').value; if(v) document.getElementById('saveName').value=v;
    }

    async function addNameToRotaIndex(key,safeName) {
      addToLocalRotaIndex(safeName);
      const ref=getNamedIndexRef(key); const snap=await window.FB.getDoc(ref);
      let items=snap.exists()&&Array.isArray(snap.data().items)?snap.data().items:[];
      if (!items.includes(safeName)) { items.push(safeName); await window.FB.setDoc(ref,{items},{merge:true}); }
    }

    // ── Payload helpers ───────────────────────────────────────────────────────
    function tableToPayload() {
      const table=document.getElementById('rotaTable');
      const rows=Array.from(table.tBodies[0].rows);
      const month=Number(document.getElementById('monthSelect').value);
      const year=Number(document.getElementById('yearInput')?.value)||new Date().getFullYear();
      const area=getCurrentArea();
      const payload={ area, month, year, savedAt:new Date().toISOString(),
        rotaTitle:(document.getElementById('rotaTitleInput').value||'').trim(),
        monthlyTarget:getMonthlyTarget(),
        mixedStdHours: Number(document.getElementById('mixedStdHours').value)||0,
        holidays: holidays.map(h=>({...h})),
        records:[] };
      staffList=loadStaffList();
      for (const row of rows) {
        const inp=row.cells[0].querySelector('input');
        const name=(inp?.value||'').trim(); if (!name) continue;
        if (staffList.length&&!staffList.includes(name)) throw new Error(`Invalid staff: "${name}"`);
        const hIdx=Array.from(row.cells).indexOf(row.querySelector('.hours-cell'));
        const days={};
        for (let i=1;i<hIdx;i++) { const v=row.cells[i].textContent.trim().toUpperCase(); const bv=v.endsWith('_O')?v.slice(0,-2):v; if(DUTIES[bv]) days[`day${i}`]=v; }
        const schedType=row.querySelector('.sched-cell select')?.value||'';
        const otCell=row.querySelector('.ot-cell');
        const otOverride=otCell?.dataset?.override==='true' ? (otCell.querySelector('.ot-val')?.textContent||null) : null;
        const extension=Number(row.querySelector('.ext-cell input')?.value)||0;
        const compType=row.dataset.compType||'OT';
        payload.records.push({staffName:name, hours:Number(row.querySelector('.hours-cell').textContent)||0, daysData:days, schedType, otOverride, extension, compType});
      }
      return payload;
    }

    function applyPayloadToTable(payload, fromDraft=false) {
      if (!fromDraft) clearDraft();  // loading from cloud/file clears the draft
      const records=Array.isArray(payload?.records)?payload.records:[];
      if (payload?.month) document.getElementById('monthSelect').value=String(payload.month);
      if (payload?.year) { const yi=document.getElementById('yearInput'); if(yi) yi.value=String(payload.year); }
      document.getElementById('rotaTitleInput').value=(payload?.rotaTitle||'').trim();
      if (payload?.monthlyTarget!=null) document.getElementById('monthlyTarget').value=String(payload.monthlyTarget);
      if (payload?.mixedStdHours!=null) {
        mixedStdHours=Number(payload.mixedStdHours)||0;
        document.getElementById('mixedStdHours').value=String(mixedStdHours);
      }
      if (Array.isArray(payload?.holidays)) { holidays=payload.holidays.map(h=>({...h})); renderHolidayList(); }
      document.querySelector('#rotaTable tbody').innerHTML='';
      updateTable();
      for (const rec of records) {
        addNewRow();
        const row=document.querySelector('#rotaTable tbody').lastElementChild;
        row.cells[0].querySelector('input').value=rec.staffName||'';
        const days=rec.daysData||{};
        const hIdx=Array.from(row.cells).indexOf(row.querySelector('.hours-cell'));
        for (let i=1;i<hIdx;i++) { const v=(days[`day${i}`]||'').toUpperCase(); const bv=v.endsWith('_O')?v.slice(0,-2):v; if(DUTIES[bv]) applyDutyToCell(row.cells[i],v); }
        const sel=row.querySelector('.sched-cell select'); if(sel&&rec.schedType) sel.value=rec.schedType;
        if (rec.extension!=null) { const ei=row.querySelector('.ext-cell input'); if(ei) ei.value=String(Number(rec.extension)||0); }
        updateHours(row);
        if (rec.otOverride!=null) {
          const otCell=row.querySelector('.ot-cell');
          otCell.dataset.override='true';
          const v=otCell.querySelector('.ot-val');
          v.textContent=rec.otOverride; v.className='ot-val ot-override';
          otCell.querySelector('.ot-lock-btn').textContent='🔓';
          otCell.querySelector('.ot-lock-btn').title='Reset to calculated';
        }
        // Restore per-row comp type
        if (rec.compType) {
          row.dataset.compType = rec.compType;
          const ctBtn = row.querySelector('.comp-type-btn');
          if (ctBtn) {
            ctBtn.textContent = rec.compType === 'COMP' ? '📅' : '💰';
            ctBtn.title = rec.compType === 'COMP'
              ? '📅 COMP Day — click to switch to OT Pay'
              : '💰 OT Pay — click to switch to COMP Day';
          }
        }
      }
      if (!records.length) addNewRow();
      persistMonthlyTarget(); updateDashboard();
    }

    // ── Cloud Save / Load (primary workflow) ─────────────────────────────────
    function getReleasesIndexRef(key,area,docId){ return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'release_index',docId); }
    function getReleaseDocRef(key,area,releaseId){ return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'releases',releaseId); }

    // Open save-note modal
    function saveToCloud() {
      const key=getKeyOrWarn(); if (!key) return;
      const area=getCurrentArea();
      if (!area||area==='ALL'){ showStatusMessage('Select a specific area first.','error'); return; }
      const payload=tableToPayload();
      if (!payload.records.length){ showStatusMessage('Nothing to save (no valid rows).','error'); return; }
      document.getElementById('saveModalLabel').textContent=getRotaDisplayName();
      document.getElementById('saveReleaseNote').value='';
      document.getElementById('saveReleaseModal').classList.add('show');
      setTimeout(()=>document.getElementById('saveReleaseNote').focus(),120);
    }
    function closeSaveModal(){ document.getElementById('saveReleaseModal').classList.remove('show'); }

    // Perform the actual cloud save after note is entered
    async function confirmSaveToCloud() {
      const key=getKeyOrWarn(); if (!key) return;
      const area=getCurrentArea();
      const note=document.getElementById('saveReleaseNote').value.trim();
      closeSaveModal();
      const payload=tableToPayload();
      const docId=monthDocId();
      const releaseId=`${docId}-R${releaseNum}`;
      showStatusMessage('Saving to cloud…','info');
      try {
        // 1. Monthly working copy (backward compat)
        await window.FB.setDoc(getMonthDocRef(key,docId),payload,{merge:true});
        // 2. Release snapshot
        await window.FB.setDoc(getReleaseDocRef(key,area,releaseId),{...payload,releaseNum,note,savedAt:new Date().toISOString()},{merge:true});
        // 3. Update release index
        const idxRef=getReleasesIndexRef(key,area,docId);
        const idxSnap=await window.FB.getDoc(idxRef);
        let rels=idxSnap.exists()?(idxSnap.data().releases||[]):[];
        const entry={id:releaseId,releaseNum,savedAt:new Date().toISOString(),note,staffCount:payload.records.length};
        const ei=rels.findIndex(r=>r.id===releaseId);
        if(ei>=0) rels[ei]=entry; else rels.push(entry);
        rels.sort((a,b)=>a.releaseNum-b.releaseNum);
        await window.FB.setDoc(idxRef,{releases:rels},{merge:true});
        showStatusMessage(`${getRotaDisplayName()} saved ✅`);
      } catch(err){ console.error(err); showStatusMessage('Save failed: '+(err?.message||err),'error'); }
    }

    // Open load-picker modal
    async function openLoadPicker() {
      const key=getKeyOrWarn(); if (!key) return;
      const area=getAreaOrWarn(); if (!area) return;
      document.getElementById('loadPickerModal').classList.add('show');
      document.getElementById('loadPickerContent').innerHTML='<div style="padding:20px;text-align:center;color:#888;">Loading…</div>';
      document.getElementById('loadPickerBtn').disabled=true;
      try {
        const docId=monthDocId();
        const month=Number(document.getElementById('monthSelect').value);
        const year=new Date().getFullYear();
        const mName=new Date(year,month-1,1).toLocaleString('default',{month:'long'});
        const idxSnap=await window.FB.getDoc(getReleasesIndexRef(key,area,docId));
        let rels=idxSnap.exists()?[...(idxSnap.data().releases||[])].reverse():[];
        const mSnap=await window.FB.getDoc(getMonthDocRef(key,docId));
        const hasMonthly=mSnap.exists();
        let html=`<p style="font-size:12px;color:#374151;margin:0 0 10px;"><b>${area}</b> · ${mName} ${year}</p>`;
        if (!rels.length&&!hasMonthly){
          html+='<p style="color:#888;text-align:center;padding:16px 0;">No saved rotas found for this area &amp; month.</p>';
        } else {
          html+='<div style="display:flex;flex-direction:column;gap:6px;">';
          rels.forEach((r,i)=>{
            const dt=new Date(r.savedAt);
            const ds=dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' '+dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
            const latest=i===0;
            html+=`<label style="display:flex;gap:10px;align-items:center;cursor:pointer;padding:9px 12px;border-radius:8px;
              border:1px solid ${latest?'#86efac':'#e5e7eb'};background:${latest?'#f0fdf4':'#fafafa'};">
              <input type="radio" name="releaseChoice" value="${r.id}" ${latest?'checked':''}/>
              <span style="flex:1;font-size:12px;">
                <b style="color:#1f4e79;">R${r.releaseNum}</b>
                <span style="color:#6b7280;"> · ${ds} · ${r.staffCount} staff</span>
                ${r.note?`<span style="color:#374151;"> · "<i>${r.note}</i>"</span>`:''}
                ${latest?'<span style="font-size:10px;font-weight:700;color:#16a34a;margin-left:6px;">● LATEST</span>':''}
              </span></label>`;
          });
          if(hasMonthly&&!rels.length){
            html+=`<label style="display:flex;gap:10px;align-items:center;cursor:pointer;padding:9px 12px;border-radius:8px;
              border:1px solid #86efac;background:#f0fdf4;">
              <input type="radio" name="releaseChoice" value="_monthly" checked/>
              <span style="font-size:12px;"><b style="color:#1f4e79;">Monthly save</b>
              <span style="color:#6b7280;font-size:11px;"> (legacy — no release number)</span></span></label>`;
          }
          html+='</div>';
        }
        document.getElementById('loadPickerContent').innerHTML=html;
        document.getElementById('loadPickerBtn').disabled=(!rels.length&&!hasMonthly);
        document.querySelectorAll('#loadPickerContent input[type="radio"]').forEach(r=>
          r.addEventListener('change',()=>document.getElementById('loadPickerBtn').disabled=false));
      } catch(err){ console.error(err); document.getElementById('loadPickerContent').innerHTML=`<p style="color:#dc2626;padding:12px;">Error: ${err?.message||err}</p>`; }
    }
    function closeLoadPicker(){ document.getElementById('loadPickerModal').classList.remove('show'); }

    async function loadSelectedRelease() {
      const key=getKeyOrWarn(); if (!key) return;
      const area=getCurrentArea();
      const chosen=document.querySelector('#loadPickerContent input[name="releaseChoice"]:checked')?.value;
      if (!chosen){ showStatusMessage('Select a release first.','error'); return; }
      closeLoadPicker();
      showStatusMessage('Loading…','info');
      try {
        const snap=chosen==='_monthly'
          ? await window.FB.getDoc(getMonthDocRef(key,monthDocId()))
          : await window.FB.getDoc(getReleaseDocRef(key,area,chosen));
        if (!snap.exists()){ showStatusMessage('Release not found in cloud.','error'); return; }
        const data=snap.data();
        if (data.releaseNum&&area!=='ALL'){ releaseNum=Number(data.releaseNum); saveReleaseNum(area,releaseNum); }
        applyPayloadToTable(data);
        updateRotaLabel();
        showStatusMessage(`Loaded ${chosen==='_monthly'?'monthly save':chosen} ✅`);
      } catch(err){ console.error(err); showStatusMessage('Load failed: '+(err?.message||err),'error'); }
    }

    // ── Legacy Save / Load (kept for Settings → Local Storage section) ────────
    async function saveToDatabase() {
      try {
        const key=getKeyOrWarn(); if (!key) return;
        const area=getAreaOrWarn(); if (!area) return;
        const payload=tableToPayload();
        if (!payload.records.length) { showStatusMessage('Nothing to save (no valid rows).','error'); return; }
        await window.FB.setDoc(getMonthDocRef(key,monthDocId()),payload,{merge:true});
        showStatusMessage(`Saved month ✅ (filter: ${area})`);
      } catch(err){ console.error(err); showStatusMessage('Save failed: '+(err?.message||err),'error'); }
    }

    async function loadFromDatabase() {
      try {
        const key=getKeyOrWarn(); if (!key) return;
        const area=getAreaOrWarn(); if (!area) return;
        const snap=await window.FB.getDoc(getMonthDocRef(key,monthDocId()));
        if (!snap.exists()) { document.querySelector('#rotaTable tbody').innerHTML=''; updateTable(); addNewRow(); showStatusMessage('No saved month data for this filter.','info'); return; }
        applyPayloadToTable(snap.data());
        showStatusMessage(`Loaded month ✅ (filter: ${area})`);
      } catch(err){ console.error(err); showStatusMessage('Load failed: '+(err?.message||err),'error'); }
    }

    async function saveAsToDatabase() {
      try {
        const key=getKeyOrWarn(); if (!key) return;
        const area=getAreaOrWarn(); if (!area) return;
        const name=(document.getElementById('saveName').value||'').trim();
        if (!name) { showStatusMessage('Enter Rota Name first.','error'); return; }
        const safe=name.replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_');
        if (!safe) { showStatusMessage('Rota Name invalid.','error'); return; }
        const payload=tableToPayload();
        if (!payload.records.length) { showStatusMessage('Nothing to save.','error'); return; }
        payload.saveName=name; payload.safeName=safe; payload.monthDocId=monthDocId();
        await window.FB.setDoc(getNamedDocRef(key,safe),payload,{merge:true});
        await addNameToRotaIndex(key,safe);
        await loadRotaList();
        document.getElementById('rotaList').value=safe;
        document.getElementById('saveName').value=safe;
        showStatusMessage(`Saved rota "${safe}" ✅ (filter: ${area})`);
      } catch(err){ console.error(err); showStatusMessage('Save Rota failed: '+(err?.message||err),'error'); }
    }

    async function loadNamedFromDatabase() {
      try {
        const key=getKeyOrWarn(); if (!key) return;
        const area=getAreaOrWarn(); if (!area) return;
        const raw=(document.getElementById('saveName').value||document.getElementById('rotaList').value||'').trim();
        if (!raw) { showStatusMessage('Select or enter a Rota Name.','error'); return; }
        const safe=raw.replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_');
        if (!safe) { showStatusMessage('Rota Name invalid.','error'); return; }
        const snap=await window.FB.getDoc(getNamedDocRef(key,safe));
        if (!snap.exists()) { showStatusMessage(`No saved rota: ${safe} (filter: ${area})`,'error'); return; }
        applyPayloadToTable(snap.data());
        document.getElementById('saveName').value=safe;
        document.getElementById('rotaList').value=safe;
        showStatusMessage(`Opened rota "${safe}" ✅`);
      } catch(err){ console.error(err); showStatusMessage('Open rota failed: '+(err?.message||err),'error'); }
    }

    // ── Column widths ─────────────────────────────────────────────────────────
    function applyColumnWidths() {
      const nw=Number(document.getElementById('nameWidth').value||220);
      const dw=Math.max(10,Number(document.getElementById('dayWidth').value||34));
      document.querySelectorAll('#rotaTable tr td:first-child,#rotaTable th:first-child').forEach(c=>c.style.minWidth=nw+'px');
      document.querySelectorAll('#rotaTable td:not(:first-child):not(:last-child),#rotaTable th:not(:first-child):not(:last-child)').forEach(c=>c.style.minWidth=dw+'px');
      // Keep coverage table columns in sync with main table widths
      if (_covExpanded) _buildCoverageTable();
    }

    // ── Coverage Panel ───────────────────────────────────────────────────────
    let _covExpanded = false;
    let _covTimer    = null;

    function toggleCoverageDetail() {
      _covExpanded = !_covExpanded;
      document.getElementById('coverageDetail').style.display = _covExpanded ? 'block' : 'none';
      document.getElementById('coverageToggleBtn').textContent = _covExpanded ? '▼ Hide' : '▶ Details';
      if (_covExpanded) {
        _buildCoverageTable();
        // Sync to current main-table scroll position
        document.getElementById('coverageScrollWrap').scrollLeft =
          document.querySelector('.table-container').scrollLeft;
      }
    }

    function _scheduleCoverage() {
      if (_covTimer) clearTimeout(_covTimer);
      _covTimer = setTimeout(() => { _covTimer = null; _rebuildCoverage(); }, 280);
    }

    function _getCovStatus(actual, req) {
      if (req <= 0)         return 'none';
      if (actual === req)   return 'exact';
      if (actual > req)     return 'over';
      if (actual === req-1) return 'short1';
      return 'critical';
    }

    // Duties that have a staffing target (assignedSt > 0) for the current area
    function _getCovDuties() {
      const area = getCurrentArea();
      return Object.entries(DUTIES)
        .filter(([, d]) => {
          if (Number(d.assignedSt || 0) <= 0) return false;
          if (area !== 'ALL') {
            const das = (d.area || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
            if (das.length && !das.includes(area)) return false;
          }
          return true;
        })
        .map(([code, d]) => ({ code, req: Number(d.assignedSt) }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }

    // Count how many staff are assigned to each tracked duty per day
    function _countCoverage(covDuties) {
      const month = parseInt(document.getElementById('monthSelect').value, 10);
      const days  = getDaysInMonth(month);
      const rows  = Array.from(document.querySelectorAll('#rotaTable tbody tr'));
      const counts = {};
      covDuties.forEach(d => { counts[d.code] = {}; });
      rows.forEach(row => {
        const hCell = row.querySelector('.hours-cell');
        if (!hCell) return;
        const hIdx = Array.from(row.cells).indexOf(hCell);
        for (let i = 1; i < hIdx; i++) {
          let v = row.cells[i].textContent.trim().toUpperCase();
          if (v.endsWith('_O')) v = v.slice(0, -2);
          if (counts[v] !== undefined) counts[v][i] = (counts[v][i] || 0) + 1;
        }
      });
      return { counts, days };
    }

    function _rebuildCoverage() {
      const covDuties = _getCovDuties();
      const wrap = document.getElementById('coverageWrap');
      if (!wrap) return;
      wrap.style.display = 'block';   // always visible

      // No duties configured yet — show a hint and stop
      if (!covDuties.length) {
        const chipsEl = document.getElementById('coverageSummaryChips');
        if (chipsEl) chipsEl.innerHTML =
          '<span style="font-size:11px;color:#6b7280;font-style:italic;">No duty targets set — open Duties.html and fill the <b>Assigned St</b> column to enable coverage tracking.</span>';
        return;
      }

      const { counts, days } = _countCoverage(covDuties);
      const month = parseInt(document.getElementById('monthSelect').value, 10);
      const year  = new Date().getFullYear();

      // Tally all day×duty combinations for the summary bar
      let nExact = 0, nOver = 0, nShort1 = 0, nCritical = 0;
      covDuties.forEach(d => {
        for (let day = 1; day <= days; day++) {
          const st = _getCovStatus((counts[d.code][day] || 0), d.req);
          if      (st === 'exact')    nExact++;
          else if (st === 'over')     nOver++;
          else if (st === 'short1')   nShort1++;
          else if (st === 'critical') nCritical++;
        }
      });

      // Update summary chips
      const chipsEl = document.getElementById('coverageSummaryChips');
      if (chipsEl) {
        const allOK = !nShort1 && !nCritical;
        chipsEl.innerHTML = [
          nExact    ? `<span class="cov-chip exact">● ${nExact} exact</span>` : '',
          nOver     ? `<span class="cov-chip over">▲ ${nOver} over</span>` : '',
          nShort1   ? `<span class="cov-chip short1">⚠ ${nShort1} −1</span>` : '',
          nCritical ? `<span class="cov-chip critical">! ${nCritical} critical</span>` : '',
          allOK     ? '<span style="font-size:11px;font-weight:700;color:#16a34a;">✅ All duties fully covered</span>' : '',
        ].join('');
      }

      if (_covExpanded) _buildCoverageTable(covDuties, counts, days, month, year);
    }

    function _buildCoverageTable(covDuties, counts, days, month, year) {
      // When called from toggleCoverageDetail without pre-computed args, recalculate
      if (!covDuties) {
        const cd = _getCovDuties(); if (!cd.length) return;
        const { counts: c, days: d } = _countCoverage(cd);
        const mo = parseInt(document.getElementById('monthSelect').value, 10);
        _buildCoverageTable(cd, c, d, mo, new Date().getFullYear());
        return;
      }
      const nw = Math.max(80,  Number(document.getElementById('nameWidth').value || 220));
      const dw = Math.max(10, Number(document.getElementById('dayWidth').value  || 34));
      const SYM = { exact:'●', over:'▲', short1:'⚠', critical:'!', none:'–' };

      let html = `<thead><tr>
        <th class="cov-th-lbl" style="min-width:${nw}px;width:${nw}px;">
          Duty <span style="font-weight:400;opacity:.7;">(need)</span></th>`;
      for (let d = 1; d <= days; d++) {
        const wk = isWeekend(year, month, d);
        html += `<th style="min-width:${dw}px;width:${dw}px;${wk?'background:#374151;':''};">${d}</th>`;
      }
      html += '</tr></thead><tbody>';

      covDuties.forEach(duty => {
        html += `<tr><td class="cov-td-lbl" style="min-width:${nw}px;width:${nw}px;">
          ${duty.code} <span style="font-weight:400;color:#6b7280;">(${duty.req})</span></td>`;
        for (let d = 1; d <= days; d++) {
          const actual = (counts[duty.code] || {})[d] || 0;
          const st     = _getCovStatus(actual, duty.req);
          const tip    = `${duty.code} · Day ${d}: ${actual} assigned, ${duty.req} required`;
          html += `<td class="cov-${st}" style="min-width:${dw}px;width:${dw}px;" title="${tip}">${SYM[st]}${actual}</td>`;
        }
        html += '</tr>';
      });
      html += '</tbody>';
      const tbl = document.getElementById('coverageTable');
      if (tbl) tbl.innerHTML = html;
    }

    // ── Dashboard ─────────────────────────────────────────────────────────────
    function updateDashboard() {
      const rows=Array.from(document.querySelectorAll('#rotaTable tbody tr'));
      const target=getMonthlyTarget();
      const days=getDaysInMonth(Number(document.getElementById('monthSelect').value));
      let assigned=0,over=0,under=0,balanced=0,filled=0,count=0;
      rows.forEach(row=>{
        const name=row.cells[0]?.querySelector('input')?.value?.trim(); if(!name) return;
        count++;
        const h=Number(row.querySelector('.hours-cell')?.textContent||0); assigned+=h;
        const isBc=row.querySelector('.sched-cell select')?.value==='BC';
        if(!isBc){
          // BC rows have no monthly target — exclude from over/under/balanced counts
          const s=getRowHoursStatus(h);
          if(s==='over')over++; else if(s==='under')under++; else balanced++;
        }
        for(let i=1;i<row.cells.length-1;i++){ let v=row.cells[i].textContent.trim().toUpperCase(); if(v.endsWith('_O'))v=v.slice(0,-2); if(DUTIES[v]) filled++; }
      });
      const total=count*days;
      const cov=total?Math.round((filled/total)*100):0;
      document.getElementById('summaryRows').textContent=String(count);
      document.getElementById('summaryTarget').textContent=String(target);
      document.getElementById('summaryAssigned').textContent=String(assigned);
      document.getElementById('summaryBalanced').textContent=String(balanced);
      document.getElementById('metricCoverage').textContent=cov+'%';
      document.getElementById('metricOverTarget').textContent=String(over);
      document.getElementById('metricUnderTarget').textContent=String(under);
      document.getElementById('pageMainTitle').textContent=document.getElementById('rotaTitleInput').value.trim()||'Pharmacy Management';
      _scheduleCoverage();  // rebuild coverage panel
      updateBannerBudget();
      updateCallCenterCards();
      updateConsumptionBar();
      scheduleDraftSave();
    }

    // ── Draft auto-save (localStorage) ───────────────────────────────────────
    // Preserves rota work across page navigations (e.g. going to Duties.html and back)
    const DRAFT_KEY = 'BCOT_ROTA_DRAFT_V1';
    let _draftTimer = null;
    function scheduleDraftSave() {
      clearTimeout(_draftTimer);
      _draftTimer = setTimeout(() => {
        try {
          const payload = tableToPayload();
          if (payload.records.length) localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        } catch(e) { console.warn('Draft save failed:', e); }
      }, 800);
    }
    function restoreDraft() {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!Array.isArray(payload?.records) || !payload.records.length) return false;
        applyPayloadToTable(payload, true);
        return true;
      } catch(e) { return false; }
    }
    function clearDraft() {
      localStorage.removeItem(DRAFT_KEY);
    }

    // ── Clear All ─────────────────────────────────────────────────────────────
    async function clearAllTable() {
      const ok = await showConfirmModal({
        title: 'Clear all rota data?',
        message: 'All rows, staff names and duty assignments will be removed. This cannot be undone.',
        confirmLabel: 'Clear All',
        danger: true
      });
      if (!ok) return;
      document.querySelector('#rotaTable tbody').innerHTML = '';
      clearDraft();
      updateDashboard();
      showStatusMessage('Table cleared.', 'info');
    }

    // ── Banner budget indicator (cost-center aware) ───────────────────────────
    // Shows two figures: current area (live) + full cost center (live + saved snapshots).
    function updateBannerBudget() {
      const el = document.getElementById('bannerBudget');
      if (!el) return;
      const area = getCurrentArea();
      if (!area || area === 'ALL') { el.style.display = 'none'; return; }

      // Find the cost center that contains the current area
      let centers = [];
      try { centers = JSON.parse(localStorage.getItem('BCOT_COST_CENTERS_V1') || '[]') || []; } catch {}
      const center = centers.find(c =>
        (c.areas || []).map(a => a.toUpperCase()).includes(area.toUpperCase())
      );
      if (!center || !Number(center.budget)) { el.style.display = 'none'; return; }

      const budget   = Number(center.budget);
      const cAreaSet = new Set((center.areas || []).map(a => a.toUpperCase()));
      const fmt = v => Number(v||0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});

      // Staff HRR + area lookup
      let staffRecs = [];
      try { staffRecs = JSON.parse(localStorage.getItem('BCOT_STAFF_RECORDS_V2') || '[]') || []; } catch {}
      const hrrByName   = {};
      const areasByName = {};
      staffRecs.forEach(s => {
        if (!s.name) return;
        const n = s.name.trim();
        hrrByName[n]   = Number(s.hrr) || 0;
        areasByName[n] = (s.area || '').split(',').map(a => a.trim().toUpperCase()).filter(Boolean);
      });

      // Live OT SAR for current area only (what's in the visible rota rows)
      let areaLive = 0;
      document.querySelectorAll('#rotaTable tbody tr').forEach(row => {
        const name = row.cells[0]?.querySelector('input')?.value?.trim();
        if (!name) return;
        if ((row.dataset.compType || 'OT') !== 'OT') return;
        const hrr = hrrByName[name] || 0;
        if (!hrr) return;
        const staffAreas = areasByName[name] || [];
        if (!staffAreas.some(a => a === area.toUpperCase())) return;
        const ot = parseFloat((row.querySelector('.ot-val')?.textContent || '').replace('+', ''));
        if (Number.isFinite(ot) && ot > 0) areaLive += ot * hrr * 1.5;
      });

      // Cost center total = current area live + other areas from saved snapshots
      const month = String(document.getElementById('monthSelect')?.value || '1').padStart(2,'0');
      const year  = String(document.getElementById('yearInput')?.value || new Date().getFullYear());
      let savedRecs = [];
      try { savedRecs = _loadConsumptionLocal(); } catch {}
      let ccTotal = areaLive;
      cAreaSet.forEach(a => {
        if (a === area.toUpperCase()) return; // already counted via live
        const rec = savedRecs.find(r =>
          r.area === a &&
          String(r.year) === year &&
          String(r.month).padStart(2,'0') === month
        );
        if (rec) ccTotal += Number(rec.otAmount) || 0;
      });

      const pctArea = (areaLive / budget) * 100;
      const pctCC   = (ccTotal  / budget) * 100;
      const dot     = pctCC >= 100 ? '🔴' : pctCC >= 75 ? '🟡' : '🟢';
      const cls     = pctCC >= 100 ? 'over' : pctCC >= 75 ? 'warn' : 'ok';

      const multiArea = cAreaSet.size > 1;

      el.innerHTML = multiArea
        ? `<span class="budget-tag ${cls}" title="Cost center budget: ${fmt(budget)} SAR">` +
          `${dot} ${area}: ${fmt(areaLive)} SAR` +
          ` &nbsp;|&nbsp; ${center.name}: ${fmt(ccTotal)} / ${fmt(budget)} SAR` +
          `</span>`
        : `<span class="budget-tag ${cls}">${dot} ${center.name}: ${fmt(areaLive)} / ${fmt(budget)} SAR</span>`;
      el.style.display = 'inline';
    }

    // ── Cost-center consumption cards ─────────────────────────────────────────
    // Hybrid: current area = live calculation; other areas = last saved snapshot.
    function updateCallCenterCards() {
      const el = document.getElementById('callCenterSection');
      if (!el) return;

      let centers = [];
      try { centers = JSON.parse(localStorage.getItem('BCOT_COST_CENTERS_V1') || '[]') || []; } catch {}
      if (!centers.length) { el.style.display = 'none'; return; }

      const currentArea = getCurrentArea(); // 'ALL' or specific area
      const month = String(document.getElementById('monthSelect')?.value || '1').padStart(2,'0');
      const year  = String(document.getElementById('yearInput')?.value || new Date().getFullYear());

      // Build staff lookup
      let staffRecs = [];
      try { staffRecs = JSON.parse(localStorage.getItem('BCOT_STAFF_RECORDS_V2') || '[]') || []; } catch {}
      const hrrByName   = {};
      const areasByName = {};
      staffRecs.forEach(s => {
        if (!s.name) return;
        const n = s.name.trim();
        hrrByName[n]   = Number(s.hrr) || 0;
        areasByName[n] = (s.area || '').split(',').map(a => a.trim().toUpperCase()).filter(Boolean);
      });

      // Live calculation for all areas currently visible in rota (split by comp type)
      const liveOT    = {};  // area -> SAR
      const liveComp  = {};  // area -> hours
      document.querySelectorAll('#rotaTable tbody tr').forEach(row => {
        const name = row.cells[0]?.querySelector('input')?.value?.trim();
        if (!name) return;
        const staffAreas = areasByName[name] || [];
        const otText = row.querySelector('.ot-val')?.textContent || '';
        const ot = parseFloat(otText.replace('+', ''));
        if (!Number.isFinite(ot) || ot <= 0) return;
        const ct = row.dataset.compType || 'OT';
        staffAreas.forEach(a => {
          if (ct === 'COMP') {
            liveComp[a] = (liveComp[a] || 0) + ot;
          } else {
            const hrr = hrrByName[name] || 0;
            if (hrr) liveOT[a] = (liveOT[a] || 0) + ot * hrr * 1.5;
          }
        });
      });

      // Saved snapshots
      let savedRecs = [];
      try { savedRecs = _loadConsumptionLocal(); } catch {}
      const savedMap = {}; // "AREA|YYYY|MM" -> record
      savedRecs.forEach(r => {
        const k = `${r.area}|${r.year}|${String(r.month).padStart(2,'0')}`;
        savedMap[k] = r;
      });

      const fmt = v => Number(v||0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});

      let html = `
        <div style="margin-top:16px;">
          <div style="font-size:12px;font-weight:700;color:#1a4f8b;text-transform:uppercase;
                      letter-spacing:.5px;margin-bottom:10px;">
            💰 Cost Centers — OT Budget &nbsp;<span style="font-size:10px;color:#9ca3af;
            text-transform:none;letter-spacing:0;font-weight:400;">${month}/${year}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">`;

      centers.forEach(c => {
        const budget     = Number(c.budget) || 0;
        const cAreas     = (c.areas || []).map(a => a.toUpperCase());

        // Total OT SAR for this center: live for current area, saved for others
        let totalUsedOT   = 0;
        let totalCompHrs  = 0;
        const areaRows    = [];

        cAreas.forEach(a => {
          const isLive = (currentArea === 'ALL') || (a === currentArea.toUpperCase());
          let otAmt = 0, compHrs = 0, ts = '', source = '';
          if (isLive) {
            otAmt   = liveOT[a]   || 0;
            compHrs = liveComp[a] || 0;
            source  = 'live';
          } else {
            const rec = savedMap[`${a}|${year}|${month}`];
            if (rec) {
              otAmt   = Number(rec.otAmount)  || 0;
              compHrs = Number(rec.compHours) || 0;
              ts      = rec.savedAt ? new Date(rec.savedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
              source  = 'saved';
            } else {
              source = 'none';
            }
          }
          totalUsedOT  += otAmt;
          totalCompHrs += compHrs;
          areaRows.push({ a, otAmt, compHrs, ts, source });
        });

        const remaining = budget - totalUsedOT;
        const pct       = budget > 0 ? Math.min((totalUsedOT / budget) * 100, 100) : 0;
        const isOver    = budget > 0 && totalUsedOT > budget;
        const isWarn    = !isOver && pct >= 75;
        const barClr    = isOver ? '#dc2626' : isWarn ? '#d97706' : '#2e8b57';
        const dot       = isOver ? '🔴' : isWarn ? '🟡' : '🟢';

        // Per-area breakdown rows
        let areaBreakdown = '';
        areaRows.forEach(({ a, otAmt, compHrs, ts, source }) => {
          let badge = '';
          let rowColor = '#374151';
          if (source === 'live') {
            badge = `<span style="background:#dcfce7;color:#16a34a;border-radius:3px;
                       padding:1px 5px;font-size:9px;font-weight:700;margin-left:4px;">LIVE</span>`;
            rowColor = '#0f172a';
          } else if (source === 'saved') {
            badge = `<span style="background:#e0f2fe;color:#0369a1;border-radius:3px;
                       padding:1px 5px;font-size:9px;font-weight:700;margin-left:4px;" title="Saved ${ts}">⏱ ${ts}</span>`;
          } else {
            badge = `<span style="color:#9ca3af;font-size:10px;margin-left:4px;">not saved</span>`;
          }
          const compPart = compHrs > 0 ? ` &nbsp;📅 ${compHrs.toFixed(1)} hrs` : '';
          areaBreakdown += `
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:3px;
                        padding:3px 0;border-top:1px solid #f1f5f9;font-size:10px;color:${rowColor};">
              <span style="font-weight:700;min-width:38px;">${a}</span>
              <span>💰 ${fmt(otAmt)} SAR${compPart}</span>
              ${badge}
            </div>`;
        });

        html += `
          <div style="background:#f9fbfd;border:1px solid #e2e8f0;border-radius:12px;padding:13px;">
            <div style="font-weight:800;font-size:13px;color:#0f172a;margin-bottom:5px;">
              ${dot} ${c.name}
            </div>
            <div style="background:#e2e8f0;border-radius:4px;height:7px;margin-bottom:8px;overflow:hidden;">
              <div style="background:${barClr};height:100%;border-radius:4px;
                          width:${pct}%;transition:width .4s;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;
                        font-size:11px;margin-bottom:6px;">
              <span style="font-weight:700;color:${barClr};">💰 ${fmt(totalUsedOT)} SAR</span>
              <span style="color:#6b7280;">of ${budget > 0 ? fmt(budget) : '—'} SAR</span>
            </div>
            ${totalCompHrs > 0 ? `<div style="font-size:10px;color:#0369a1;margin-bottom:5px;font-weight:700;">📅 ${totalCompHrs.toFixed(1)} comp hrs total</div>` : ''}
            ${areaBreakdown}
            <div style="font-size:11px;font-weight:700;color:${isOver ? '#dc2626' : '#2e8b57'};margin-top:6px;">
              ${isOver
                ? '⚠️ Over budget by ' + fmt(totalUsedOT - budget) + ' SAR'
                : (budget > 0 ? fmt(remaining) + ' SAR remaining' : 'No budget set')}
            </div>
          </div>`;
      });

      html += `</div></div>`;
      el.innerHTML = html;
      el.style.display = 'block';
    }

    // ── Auto balance ──────────────────────────────────────────────────────────
    function autoBalanceEmptyRows() {
      const rows=Array.from(document.querySelectorAll('#rotaTable tbody tr'));
      const target=getMonthlyTarget();
      const codes=Object.entries(DUTIES).filter(([,m])=>Number(m.hours)>0).sort((a,b)=>Number(b[1].hours)-Number(a[1].hours));
      if (!codes.length) { showStatusMessage('No positive-hour duties for this filter.','error'); return; }
      let changed=0;
      rows.forEach(row=>{
        const name=row.cells[0]?.querySelector('input')?.value?.trim(); if(!name) return;
        const hCell=row.querySelector('.hours-cell');
        const hIdx=Array.from(row.cells).indexOf(hCell);
        let h=Number(hCell?.textContent||0); if(h>=target) return;
        for (let i=1;i<hIdx&&h<target;i++) {
          const cell=row.cells[i]; if(cell.textContent.trim()) continue;
          const best=codes.find(([,m])=>h+Number(m.hours)<=target); if(!best) continue;
          applyDutyToCell(cell,best[0]); h+=Number(best[1].hours); changed++;
        }
        updateHours(row);
      });
      updateDashboard();
      showStatusMessage(changed?`Auto balance filled ${changed} cells ✅`:'No empty cells could be balanced.',changed?'success':'info');
    }

    // ── Rota search / filter ──────────────────────────────────────────────────
    function filterRota() {
      const raw   = document.getElementById('rotaSearchInput')?.value || '';
      const query = raw.trim().toLowerCase();
      const clearBtn = document.getElementById('rotaSearchClear');
      const countEl  = document.getElementById('rotaFilterCount');
      if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

      // Build badge lookup from the staff pool (badge may not be in the name string)
      const badgeOf = {};
      try {
        const recs = JSON.parse(localStorage.getItem(STAFF_RECORDS_KEY) || '[]');
        recs.forEach(s => {
          if (s.name) {
            const k = s.name.trim().toLowerCase();
            badgeOf[k] = String(s.badge || '').toLowerCase();
            // Also index by stripped name (without trailing badge)
            const stripped = k.replace(/\s*\(\d+\)\s*$/, '').trim();
            if (stripped !== k) badgeOf[stripped] = badgeOf[k];
          }
        });
      } catch {}

      const rows = Array.from(document.querySelectorAll('#rotaTable tbody tr'));
      let visible = 0, total = 0;

      rows.forEach(row => {
        const rawName = (row.cells[0]?.querySelector('input')?.value || '').trim();
        const hasName = rawName.length > 0;
        if (hasName) total++;

        if (!query) {
          row.style.display = '';
          if (hasName) visible++;
          return;
        }

        if (!hasName) { row.style.display = 'none'; return; }

        const nameLower   = rawName.toLowerCase();
        const nameStripped = nameLower.replace(/\s*\(\d+\)\s*$/, '').trim();
        // Badge: from staff pool lookup OR extracted from "(digits)" in stored name
        const badgeLookup = badgeOf[nameLower] || badgeOf[nameStripped] || '';
        const badgeInName = (nameLower.match(/\((\d+)\)/) || [])[1] || '';
        const badge = badgeLookup || badgeInName;

        const match = nameStripped.includes(query) ||
                      nameLower.includes(query)    ||
                      (badge && badge.includes(query));

        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });

      if (countEl) {
        countEl.textContent = query
          ? (visible === 0 ? 'No match' : `${visible} / ${total} staff`)
          : '';
        countEl.style.color = visible === 0 ? '#dc2626' : '#1f4e79';
      }
    }

    function clearRotaFilter() {
      const inp = document.getElementById('rotaSearchInput');
      if (inp) inp.value = '';
      filterRota();
      inp?.focus();
    }

    // ── Active row highlight + staff name banner ──────────────────────────────
    let _activeEditRow   = null;
    let _clearRowTimer   = null;
    let _activeDutyCell  = null;   // the specific day cell currently focused

    // Update hours + OT chips in the active banner
    function _refreshBannerStats(row) {
      if (!row) return;
      const hoursEl = document.getElementById('activeStaffHours');
      const otEl    = document.getElementById('activeStaffOT');
      if (hoursEl) {
        const h = row.querySelector('.hours-cell')?.textContent?.trim() || '0';
        hoursEl.textContent = h + 'h';
      }
      if (otEl) {
        const rawOT = row.querySelector('.ot-val')?.textContent?.trim() || '';
        const otNum = parseFloat(rawOT.replace('+', ''));
        const show  = Number.isFinite(otNum) && otNum > 0;
        otEl.textContent   = show ? ' · ' + rawOT + ' OT' : '';
        otEl.style.display = show ? '' : 'none';
      }
    }

    // ── Duties / Leave help popup ─────────────────────────────────────────────
    function toggleDutiesHelp(e) {
      e && e.stopPropagation();
      const popup = document.getElementById('dutiesHelpPopup');
      if (!popup) return;
      if (popup.style.display === 'block') { popup.style.display = 'none'; return; }
      // Rebuild list each open so it stays current
      const list = document.getElementById('dutiesHelpList');
      if (list) {
        list.innerHTML = '';
        Object.entries(DUTIES).forEach(([code, meta]) => {
          const item = document.createElement('div');
          item.className = 'dhp-item';
          item.innerHTML =
            `<div class="dhp-swatch" style="background:${meta.color}"></div>`
            + `<span class="dhp-code">${code}</span>`
            + `<span class="dhp-label">${meta.label||''}${meta.area?' ['+meta.area+']':''}</span>`
            + `<span class="dhp-hrs">${Number(meta.hours)||0}h</span>`;
          list.appendChild(item);
        });
      }
      popup.style.display = 'block';
    }
    // Close popup on Escape key or any click outside it
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { const p=document.getElementById('dutiesHelpPopup'); if(p) p.style.display='none'; }
    });
    document.addEventListener('click', e => {
      const popup = document.getElementById('dutiesHelpPopup');
      const btn   = document.getElementById('dutiesHelpBtn');
      if (popup && popup.style.display==='block' && !popup.contains(e.target) && e.target!==btn)
        popup.style.display = 'none';
    });

    function setActiveRow(row) {
      if (_activeEditRow === row) return;   // already set — nothing to do
      // Remove from previous row
      if (_activeEditRow) _activeEditRow.classList.remove('active-editing-row');
      _activeEditRow = row;
      const banner  = document.getElementById('activeStaffBanner');
      const nameEl  = document.getElementById('activeStaffName');
      if (row) {
        row.classList.add('active-editing-row');
        // Strip trailing "(badge)" from stored name for display
        const raw  = row.cells[0]?.querySelector('input')?.value?.trim() || '—';
        const name = raw.replace(/\s*\(\d+\)\s*$/, '').trim() || raw;
        if (nameEl)  nameEl.textContent  = name;
        if (banner)  banner.style.display = 'flex';
        _refreshBannerStats(row);
        updateBannerBudget();
      } else {
        if (banner) banner.style.display = 'none';
        const budgetEl = document.getElementById('bannerBudget');
        if (budgetEl) budgetEl.style.display = 'none';
      }
    }

    // ── Duty count chip in banner ─────────────────────────────────────────────
    function _refreshBannerDuty(cell) {
      const dutyEl = document.getElementById('activeStaffDuty');
      if (!dutyEl) return;
      if (!cell) { dutyEl.style.display = 'none'; return; }

      const row = cell.parentElement;
      if (!row) { dutyEl.style.display = 'none'; return; }
      const hCell = row.querySelector('.hours-cell');
      if (!hCell) { dutyEl.style.display = 'none'; return; }

      const rowCells = Array.from(row.cells);
      const hIdx     = rowCells.indexOf(hCell);
      const cellIdx  = rowCells.indexOf(cell);
      if (cellIdx <= 0 || cellIdx >= hIdx) { dutyEl.style.display = 'none'; return; }

      let code = cell.textContent.trim().toUpperCase();
      if (code.endsWith('_O')) code = code.slice(0, -2);
      if (!code || !DUTIES[code]) { dutyEl.style.display = 'none'; return; }

      const req = Number(DUTIES[code].assignedSt || 0);

      // Count staff assigned to this duty on this day across the whole rota
      let count = 0;
      document.querySelectorAll('#rotaTable tbody tr').forEach(r => {
        const rH = r.querySelector('.hours-cell');
        if (!rH) return;
        const rHIdx = Array.from(r.cells).indexOf(rH);
        if (cellIdx >= rHIdx) return;
        let v = (r.cells[cellIdx]?.textContent || '').trim().toUpperCase();
        if (v.endsWith('_O')) v = v.slice(0, -2);
        if (v === code) count++;
      });

      // Colour and symbol based on coverage rules
      const SYM_COL = {
        exact:    { sym:'●', col:'#4ade80' },
        over:     { sym:'▲', col:'#93c5fd' },
        short1:   { sym:'⚠', col:'#fbbf24' },
        critical: { sym:'!', col:'#f87171' },
        none:     { sym:'' , col:'#cbd5e1' }
      };
      const st = req > 0 ? _getCovStatus(count, req) : 'none';
      const { sym, col } = SYM_COL[st];
      const label = req > 0 ? `${sym} ${count}/${req} ${code}` : `${count}× ${code}`;
      dutyEl.innerHTML = ` · <span style="color:${col};font-weight:800;">${label}</span>`;
      dutyEl.style.display = '';
    }

    // ── Coverage matrix modal ─────────────────────────────────────────────────
    function openCoverageModal() {
      document.getElementById('coverageModal').classList.add('show');
      _buildCoverageModalContent();
    }
    function closeCoverageModal() {
      document.getElementById('coverageModal').classList.remove('show');
    }
    function _buildCoverageModalContent() {
      const el = document.getElementById('coverageModalContent');
      if (!el) return;
      const covDuties = _getCovDuties();
      if (!covDuties.length) {
        el.innerHTML = '<p style="padding:20px;text-align:center;color:#888;">No duty targets set. Add <b>Assigned St</b> values in Duties.html.</p>';
        return;
      }
      const { counts, days } = _countCoverage(covDuties);
      const month = parseInt(document.getElementById('monthSelect').value, 10);
      const year  = new Date().getFullYear();
      const SYM   = { exact:'●', over:'▲', short1:'⚠', critical:'!', none:'–' };
      const STYLE = {
        exact:    'background:#16a34a;color:#fff;',
        over:     'background:#1d4ed8;color:#fff;',
        short1:   'background:#f59e0b;color:#1c1917;',
        critical: 'background:#dc2626;color:#fff;',
        none:     'background:#f1f5f9;color:#94a3b8;'
      };

      let html = `<table style="border-collapse:collapse;width:max-content;min-width:100%;">
        <thead><tr>
          <th style="position:sticky;left:0;z-index:3;background:#1f4e79;color:#fff;
            padding:6px 12px;text-align:left;font-size:11px;border:1px solid #2d6098;
            min-width:130px;white-space:nowrap;">Duty &nbsp;<span style="font-weight:400;opacity:.7;">(need)</span></th>`;

      for (let d = 1; d <= days; d++) {
        const wk = isWeekend(year, month, d);
        html += `<th style="background:${wk?'#374151':'#1f4e79'};color:#fff;padding:4px 5px;
          text-align:center;font-size:10px;border:1px solid #2d6098;min-width:30px;">${d}</th>`;
      }
      html += '</tr></thead><tbody>';

      covDuties.forEach((duty, ri) => {
        const rowBg = ri % 2 === 0 ? '#fff' : '#f8fafc';
        html += `<tr>
          <td style="position:sticky;left:0;z-index:2;background:${rowBg};
            padding:4px 12px;font-size:11px;font-weight:700;color:#1f4e79;
            border:1px solid #e5e7eb;border-right:2px solid #c7d2fe;white-space:nowrap;">
            ${duty.code} <span style="font-weight:400;color:#6b7280;">(${duty.req})</span></td>`;
        for (let d = 1; d <= days; d++) {
          const actual = (counts[duty.code] || {})[d] || 0;
          const st     = _getCovStatus(actual, duty.req);
          const tip    = `${duty.code} · Day ${d}: ${actual} assigned, ${duty.req} required`;
          html += `<td title="${tip}" style="${STYLE[st]}text-align:center;font-size:10px;
            font-weight:700;padding:3px 2px;border:1px solid rgba(0,0,0,.07);">${SYM[st]}${actual}</td>`;
        }
        html += '</tr>';
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    }

    // ── Wire focusin / focusout — tracks row AND specific day cell ────────────
    (function wireActiveRow() {
      const tbl = document.getElementById('rotaTable');

      tbl.addEventListener('focusin', function(e) {
        const row = e.target.closest('tbody tr');
        if (!row) return;
        clearTimeout(_clearRowTimer);
        setActiveRow(row);

        // Identify whether focused element is a day cell
        const cell = e.target.closest('td');
        if (cell) {
          const hCell = row.querySelector('.hours-cell');
          const rc    = Array.from(row.cells);
          const hIdx  = rc.indexOf(hCell);
          const ci    = rc.indexOf(cell);
          if (ci > 0 && ci < hIdx) {
            _activeDutyCell = cell;
            _refreshBannerDuty(cell);
          } else {
            _activeDutyCell = null;
            const dutyEl = document.getElementById('activeStaffDuty');
            if (dutyEl) dutyEl.style.display = 'none';
          }
        }
      });

      tbl.addEventListener('focusout', function() {
        clearTimeout(_clearRowTimer);
        _clearRowTimer = setTimeout(() => {
          const active = document.activeElement;
          if (!tbl.querySelector('tbody')?.contains(active)) {
            setActiveRow(null);
            _activeDutyCell = null;
            const dutyEl = document.getElementById('activeStaffDuty');
            if (dutyEl) dutyEl.style.display = 'none';
          }
        }, 120);
      });
    })();

    // ── Event listeners ───────────────────────────────────────────────────────
    document.getElementById('nameWidth').addEventListener('input',applyColumnWidths);
    document.getElementById('dayWidth').addEventListener('input',applyColumnWidths);
    document.getElementById('monthSelect').addEventListener('change',()=>{ updateTable(); updateRotaLabel(); });
    document.getElementById('monthlyTarget').addEventListener('input',persistMonthlyTarget);
    document.getElementById('rotaTitleInput').addEventListener('input',updateDashboard);
    document.getElementById('newAreaInput').addEventListener('keydown',e=>{ if(e.key==='Enter') addNewArea(); });
    document.getElementById('abbreviationsModal').addEventListener('click',function(e){ if(e.target===this) closeAbbreviationsPage(); });
    document.getElementById('statisticsModal').addEventListener('click',function(e){ if(e.target===this) closeStatisticsPage(); });
    document.getElementById('settingsModal').addEventListener('click',function(e){ if(e.target===this) closeSettingsModal(); });
    document.getElementById('mixedStdHours').addEventListener('input',()=>{ mixedStdHours=Number(document.getElementById('mixedStdHours').value)||0; recalculateAllOT(); });

    // Scroll sync: coverage panel ↔ main table
    (function(){
      const mainEl = document.querySelector('.table-container');
      let _syncing = false;
      mainEl.addEventListener('scroll', () => {
        if (_syncing) return;
        const covEl = document.getElementById('coverageScrollWrap');
        if (covEl && _covExpanded) { _syncing=true; covEl.scrollLeft=mainEl.scrollLeft; _syncing=false; }
      });
      // Also sync from coverage back to main when user scrolls coverage panel directly
      document.addEventListener('scroll', e => {
        if (!_covExpanded) return;
        const covEl = document.getElementById('coverageScrollWrap');
        if (e.target === covEl) { _syncing=true; mainEl.scrollLeft=covEl.scrollLeft; _syncing=false; }
      }, true);
    })();

    // ══════════════════════════════════════════════════════════════════════════
    // DUTIES MODAL  (DM namespace)
    // ══════════════════════════════════════════════════════════════════════════
    const DM = (() => {
      const CLOUD_DOC = "DUTIES_POOL";
      const DAYS = ["Any","Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const PALETTE = ["#1a4f8b","#2e8b57","#dc3545","#d97706","#6f42c1","#0f766e","#7c2d12","#c93c5d","#2563eb","#b8860b","#0284c7","#16a34a","#9333ea","#ea580c","#0891b2","#be185d","#4f46e5","#65a30d","#6b7280","#374151"];

      function getFilter() { return (document.getElementById("dm-areaFilter")?.value||"ALL").toUpperCase(); }

      function rebuildUI() {
        const list = getAreasList();
        const sel = document.getElementById("dm-areaFilter"), prev = sel?.value||"ALL";
        if (sel) { sel.innerHTML='<option value="ALL">All Areas</option>'; list.forEach(a=>{const o=document.createElement("option");o.value=a;o.textContent=a;sel.appendChild(o);}); if(prev&&(prev==="ALL"||list.includes(prev)))sel.value=prev; }
        const dl = document.getElementById("dm-areasDatalist");
        if (dl) { dl.innerHTML=""; list.forEach(a=>{const o=document.createElement("option");o.value=a;dl.appendChild(o);}); }
        const imp = document.getElementById("dm-importSourceArea");
        if (imp) { const cur=getFilter(); imp.innerHTML='<option value="">-- Source area --</option>'; list.filter(a=>a!==cur).forEach(a=>{const o=document.createElement("option");o.value=a;o.textContent=a;imp.appendChild(o);}); }
        const ct = document.getElementById("sm-copyTarget");
        if (ct) { const pv=ct.value; ct.innerHTML='<option value="">— Target Area —</option>'; list.forEach(a=>{const o=document.createElement("option");o.value=a;o.textContent=a;ct.appendChild(o);}); if(pv&&list.includes(pv))ct.value=pv; }
      }

      function applyAreaFilter() {
        const f = getFilter();
        Array.from(document.querySelectorAll("#dm-dutiesBody tr")).forEach(tr => {
          if (f==="ALL"){tr.classList.remove("hidden-row");return;}
          const ra=(tr.querySelector(".dm-area-cell")?.value||"").trim().toUpperCase();
          const ar=ra.split(",").map(x=>x.trim()).filter(Boolean);
          tr.classList.toggle("hidden-row", !(!ra||ar.includes(f)));
        });
      }

      function addNewArea() {
        const raw=(document.getElementById("dm-newAreaInput").value||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,20);
        if(!raw){showStatusMessage("Enter a valid area name.","error");return;}
        saveAreaToList(raw); rebuildUI();
        document.getElementById("dm-areaFilter").value=raw;
        document.getElementById("dm-newAreaInput").value="";
        applyAreaFilter();
      }

      function ptm(t){const m=/^(\d{2}):(\d{2})$/.exec((t||"").trim());if(!m)return null;const hh=Number(m[1]),mm=Number(m[2]);if(hh<0||hh>23||mm<0||mm>59)return null;return hh*60+mm;}
      function mtt(min){min=((min%1440)+1440)%1440;return String(Math.floor(min/60)).padStart(2,"0")+":"+String(min%60).padStart(2,"0");}
      function calcEnd(st,h){const s=(st||"Any").toString().trim();if(s.toUpperCase()==="ANY")return"Any";const sm=ptm(s);if(sm===null)return"Any";return mtt(sm+Math.round((Number(h)||0)*60));}
      function buildTOpts(){const o=[];for(let h=0;h<24;h++)for(let m=0;m<60;m+=30){const t=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");o.push(`<option value="${t}">${t}</option>`);}return o.join("");}
      function buildDOpts(){return Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join("");}
      function nextColor(){const used=new Set(Array.from(document.querySelectorAll('#dm-dutiesBody input[type="color"]')).map(e=>e.value.toLowerCase()));return PALETTE.find(c=>!used.has(c.toLowerCase()))||PALETTE[used.size%PALETTE.length];}

      function addDutyRow(data) {
        const tbody=document.getElementById("dm-dutiesBody");
        const tr=document.createElement("tr");
        const code=(data?.code||data?.dutyCode||"").toString().trim().toUpperCase();
        const color=data?.color?data.color.toString():nextColor();
        const f=getFilter(), defArea=f==="ALL"?"":f;
        const area=(data?.area||defArea||"").toString().toUpperCase();
        tr.innerHTML=`
          <td style="padding:3px;"><input placeholder="CODE" value="${code}" style="width:64px;text-transform:uppercase;font-size:11px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;"/></td>
          <td style="padding:3px;"><input placeholder="Label" value="${(data?.label||"").toString()}" style="width:130px;font-size:11px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;"/></td>
          <td style="padding:3px;"><input type="number" min="0" step="0.25" value="${Number(data?.hours??0)}" style="width:54px;font-size:11px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;"/></td>
          <td style="padding:3px;text-align:center;">
            <input type="color" value="${color}" style="width:36px;height:24px;padding:0;border:none;background:transparent;cursor:pointer;"/>
            <div class="dm-sw" style="background:${color};width:12px;height:12px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,.15);vertical-align:middle;"></div>
          </td>
          <td style="padding:3px;"><input class="dm-area-cell" type="text" list="dm-areasDatalist" value="${area}" style="width:66px;text-transform:uppercase;font-size:11px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;" placeholder="Area"/></td>
          <td style="padding:3px;"><input type="number" min="0" step="1" value="${Number(data?.assignedSt??0)}" style="width:52px;font-size:11px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;"/></td>
          <td style="padding:3px;"><select style="width:76px;font-size:11px;">${DAYS.map(d=>`<option value="${d}">${d}</option>`).join("")}</select></td>
          <td style="padding:3px;"><select style="width:76px;font-size:11px;"><option value="Any">Any</option>${buildTOpts()}</select></td>
          <td class="dm-et" style="padding:3px;font-size:11px;text-align:center;">Any</td>
          <td style="padding:3px;"><select style="width:76px;font-size:11px;"><option value="Any">Any</option>${buildDOpts()}</select></td>
          <td style="padding:3px;text-align:center;"><button style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;">✕</button></td>`;
        tr.cells[6].querySelector("select").value=(data?.startDay||"Any").toString();
        tr.cells[7].querySelector("select").value=(data?.startTime||"Any").toString();
        tr.cells[9].querySelector("select").value=(data?.defaultDays??"Any").toString();
        const ci=tr.cells[3].querySelector('input[type="color"]'), sw=tr.cells[3].querySelector(".dm-sw");
        ci.addEventListener("input",()=>sw.style.background=ci.value);
        tr.cells[4].querySelector(".dm-area-cell").addEventListener("change",function(){
          const v=this.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,20);
          this.value=v; if(v){saveAreaToList(v);rebuildUI();} applyAreaFilter();
        });
        function re(){const h=Number(tr.cells[2].querySelector("input").value||0)||0;const s=tr.cells[7].querySelector("select").value;tr.querySelector(".dm-et").textContent=calcEnd(s,h);}
        tr.cells[2].querySelector("input").addEventListener("input",re);
        tr.cells[7].querySelector("select").addEventListener("change",re); re();
        tr.querySelector("button").addEventListener("click",async()=>{
          const ok=await showConfirmModal({title:"Delete this duty?",message:"This duty will be removed from the list.",confirmLabel:"Delete",danger:true});
          if(ok)tr.remove();
        });
        tbody.appendChild(tr);
        if(f!=="ALL"&&area&&area!==f)tr.classList.add("hidden-row");
      }

      function readTable() {
        const out={};
        for(const tr of Array.from(document.querySelectorAll("#dm-dutiesBody tr"))){
          const code=(tr.cells[0].querySelector("input").value||"").toString().trim().toUpperCase();
          if(!code)continue;
          if(!/^[A-Z0-9_]{1,6}$/.test(code))throw new Error(`Invalid code: "${code}"`);
          out[code]={label:(tr.cells[1].querySelector("input").value||code).toString().trim(),hours:Number(tr.cells[2].querySelector("input").value||0)||0,color:(tr.cells[3].querySelector('input[type="color"]').value||"#111827").toString(),area:(tr.cells[4].querySelector(".dm-area-cell").value||"").toString().toUpperCase(),assignedSt:Number(tr.cells[5].querySelector("input").value||0)||0,startDay:(tr.cells[6].querySelector("select").value||"Any").toString(),startTime:(tr.cells[7].querySelector("select").value||"Any").toString(),defaultDays:(tr.cells[9].querySelector("select").value||"Any").toString()};
        }
        return out;
      }

      function loadLocal() {
        const raw=localStorage.getItem(DUTIES_ALL_KEY);
        document.getElementById("dm-dutiesBody").innerHTML="";
        if(!raw)return;
        let data=null; try{data=JSON.parse(raw);}catch{data=null;}
        if(!data||!Object.keys(data).length)return;
        for(const[code,meta]of Object.entries(data))addDutyRow({code,...meta});
        applyAreaFilter();
      }

      async function saveToCloud() {
        try {
          const key=(window.BCOT_APP_KEY||"").trim(); if(!key){showStatusMessage("config.js not found.","error");return;}
          const obj=readTable(); if(!Object.keys(obj).length){showStatusMessage("No duties to save.","error");return;}
          localStorage.setItem(DUTIES_ALL_KEY,JSON.stringify(obj));
          await window.FB.setDoc(window.FB.doc(window.FB.db,"bcot_overtime_secure",key,"duties_named",CLOUD_DOC),{savedAt:new Date().toISOString(),duties:obj},{merge:true});
          showStatusMessage(`${Object.keys(obj).length} duties saved to cloud ✅`);
        }catch(e){console.error(e);showStatusMessage("Save duties failed: "+(e?.message||e),"error");}
      }

      async function loadFromCloud() {
        try {
          const key=(window.BCOT_APP_KEY||"").trim(); if(!key){showStatusMessage("config.js not found.","error");return;}
          showStatusMessage("Loading duties from cloud…","info");
          const snap=await window.FB.getDoc(window.FB.doc(window.FB.db,"bcot_overtime_secure",key,"duties_named",CLOUD_DOC));
          if(!snap.exists()||!Object.keys(snap.data()?.duties||{}).length){showStatusMessage("No duties in cloud yet.","info");return;}
          const duties=snap.data().duties;
          document.getElementById("dm-dutiesBody").innerHTML="";
          for(const[code,meta]of Object.entries(duties))addDutyRow({code,...meta});
          localStorage.setItem(DUTIES_ALL_KEY,JSON.stringify(duties));
          rebuildUI(); applyAreaFilter();
          showStatusMessage(`Loaded ${Object.keys(duties).length} duties from cloud ✅`);
        }catch(e){console.error(e);showStatusMessage("Load duties failed: "+(e?.message||e),"error");}
      }

      async function clearFiltered() {
        const f=getFilter();
        const ok=await showConfirmModal({title:"Clear duties?",message:f==="ALL"?"Clear ALL duties for all areas?": `Clear all duties tagged with area "${f}"?`,confirmLabel:"Clear",danger:true});
        if(!ok)return;
        if(f==="ALL"){localStorage.removeItem(DUTIES_ALL_KEY);document.getElementById("dm-dutiesBody").innerHTML="";}
        else{Array.from(document.querySelectorAll("#dm-dutiesBody tr")).forEach(tr=>{const ra=(tr.querySelector(".dm-area-cell")?.value||"").trim().toUpperCase();if(ra===f)tr.remove();});
          try{localStorage.setItem(DUTIES_ALL_KEY,JSON.stringify(readTable()));}catch{localStorage.removeItem(DUTIES_ALL_KEY);}}
        showStatusMessage("Duties cleared ✅");
      }

      function previewImport() {
        const src=document.getElementById("dm-importSourceArea").value, cur=getFilter();
        if(!src){showStatusMessage("Select a source area first.","error");return;}
        if(cur==="ALL"){showStatusMessage("Set a specific area filter first.","error");return;}
        let all={}; try{all=JSON.parse(localStorage.getItem(DUTIES_ALL_KEY)||"{}")||{};}catch{}
        const srcD=Object.entries(all).filter(([,m])=>{const ar=(m.area||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);return ar.includes(src.toUpperCase())||(!ar.length&&src==="ALL");});
        const curC=new Set(Object.entries(all).filter(([,m])=>{const ar=(m.area||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);return ar.includes(cur)||!ar.length;}).map(([c])=>c));
        const avail=srcD.filter(([c])=>!curC.has(c));
        const hint=document.getElementById("dm-importHint");
        if(!avail.length){document.getElementById("dm-importPreview").style.display="none";if(hint)hint.textContent="No new duties found in that area.";return;}
        if(hint)hint.textContent=`${avail.length} duties available from ${src}.`;
        const list=document.getElementById("dm-importList"); list.innerHTML="";
        avail.forEach(([code,meta])=>{const bg=meta.color||"#1a4f8b";const item=document.createElement("label");item.style.cssText=`display:inline-flex;align-items:center;gap:5px;background:${bg};color:#fff;font-weight:700;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;`;item.innerHTML=`<input type="checkbox" data-code="${code}" style="accent-color:#fff;width:13px;height:13px;" checked>${code}${meta.label?` — ${meta.label}`:''}`;list.appendChild(item);});
        document.getElementById("dm-importPreview").style.display="block";
      }
      function selectAllImport(){document.querySelectorAll("#dm-importList input[type=checkbox]").forEach(cb=>cb.checked=true);}
      function cancelImport(){document.getElementById("dm-importPreview").style.display="none";const h=document.getElementById("dm-importHint");if(h)h.textContent="Select a source area and click Preview.";}
      function doImportDuties() {
        const cur=getFilter(); if(cur==="ALL"){showStatusMessage("Set a specific area filter first.","error");return;}
        const sel=[...document.querySelectorAll("#dm-importList input[type=checkbox]:checked")].map(cb=>cb.dataset.code);
        if(!sel.length){showStatusMessage("No duties selected.","error");return;}
        let all={}; try{all=JSON.parse(localStorage.getItem(DUTIES_ALL_KEY)||"{}")||{};}catch{}
        let imp=0;
        sel.forEach(code=>{if(!all[code])return;const ex=(all[code].area||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);if(!ex.includes(cur.toUpperCase())){ex.push(cur.toUpperCase());all[code].area=ex.join(",");imp++;}});
        if(!imp){showStatusMessage("All selected duties already in this area.","info");return;}
        localStorage.setItem(DUTIES_ALL_KEY,JSON.stringify(all));
        document.getElementById("dm-dutiesBody").innerHTML="";
        for(const[code,meta]of Object.entries(all))addDutyRow({code,...meta});
        applyAreaFilter(); cancelImport();
        showStatusMessage(`Imported ${imp} duties into ${cur} ✅`);
      }

      async function saveAndClose() { await saveToCloud(); await reloadDutiesFromStorage(); close(); }

      function open() {
        document.getElementById("dutiesModal").style.display="block";
        loadLocal(); rebuildUI();
        const area=getCurrentArea(), sel=document.getElementById("dm-areaFilter");
        if(sel&&area&&(area==="ALL"||getAreasList().includes(area)))sel.value=area;
        applyAreaFilter();
      }
      function close() { document.getElementById("dutiesModal").style.display="none"; }

      return {open,close,addDutyRow,saveToCloud,loadFromCloud,clearFiltered,applyAreaFilter,rebuildUI,addNewArea,previewImport,selectAllImport,cancelImport,doImportDuties,saveAndClose};
    })();

    // ══════════════════════════════════════════════════════════════════════════
    // STAFF MODAL  (SM namespace)
    // ══════════════════════════════════════════════════════════════════════════
    const SM = (() => {
      const CLOUD_DOC = "STAFF_POOL";
      let records = [];
      let _saveTimer = null;

      function getDocRef(key) { return window.FB.doc(window.FB.db,"bcot_overtime_secure",key,"staff_named",CLOUD_DOC); }

      function setStatus(status) {
        const el=document.getElementById("sm-cloudStatus"); if(!el)return;
        const s={pending:{text:"⏳ Pending…",color:"#d97706",bg:"#fefce8"},saving:{text:"☁ Saving…",color:"#2563eb",bg:"#eff6ff"},saved:{text:"✅ Saved",color:"#16a34a",bg:"#f0fdf4"},error:{text:"❌ Failed",color:"#dc2626",bg:"#fef2f2"}}[status];
        if(!s)return; el.textContent=s.text;el.style.color=s.color;el.style.background=s.bg;
        if(status==="saved")setTimeout(()=>{el.textContent="";el.style.background="transparent";},3000);
      }
      function schedSave() {
        if (!records.length) return;   // never overwrite cloud with an empty list
        clearTimeout(_saveTimer); setStatus("pending");
        _saveTimer=setTimeout(async()=>{
          setStatus("saving");
          try{
            const key=(window.BCOT_APP_KEY||"").trim(); if(!key){setStatus("error");return;}
            // Wait for Firebase if not yet ready (ES module loads async)
            let t=0; while(!window.FB&&t++<40) await new Promise(r=>setTimeout(r,50));
            if(!window.FB){setStatus("error");return;}
            await window.FB.setDoc(getDocRef(key),{savedAt:new Date().toISOString(),records},{merge:true});
            setStatus("saved");}
          catch(e){console.error(e);setStatus("error");}
        },1500);
      }

      function normalize(r) { return {name:String(r?.name||"").trim(),badge:String(r?.badge||"").trim(),role:String(r?.role||"Pharmacist").trim()||"Pharmacist",hrr:Number(r?.hrr??0)||0,area:String(r?.area||"").trim().toUpperCase()}; }

      function rebuildUI() {
        const list=getAreasList();
        const af=document.getElementById("sm-areaFilter"),pv=af?.value||"ALL";
        if(af){af.innerHTML='<option value="ALL">All Areas</option>';list.forEach(a=>{const o=document.createElement("option");o.value=a;o.textContent=a;af.appendChild(o);});if(pv&&(pv==="ALL"||list.includes(pv)))af.value=pv;}
        const dl=document.getElementById("sm-areasDatalist");
        if(dl){dl.innerHTML="";list.forEach(a=>{const o=document.createElement("option");o.value=a;dl.appendChild(o);});}
        const ct=document.getElementById("sm-copyTarget");
        if(ct){const p=ct.value;ct.innerHTML='<option value="">— Target Area —</option>';list.forEach(a=>{const o=document.createElement("option");o.value=a;o.textContent=a;ct.appendChild(o);});if(p&&list.includes(p))ct.value=p;}
        // also update DM import source
        const di=document.getElementById("dm-importSourceArea");
        if(di){const cur=(document.getElementById("dm-areaFilter")?.value||"ALL").toUpperCase();di.innerHTML='<option value="">-- Source area --</option>';list.filter(a=>a!==cur).forEach(a=>{const o=document.createElement("option");o.value=a;o.textContent=a;di.appendChild(o);});}
      }

      function applyFilter() {
        const filter=(document.getElementById("sm-areaFilter")?.value||"ALL").toUpperCase();
        const query=(document.getElementById("sm-search")?.value||"").trim().toLowerCase();
        let vis=0;
        Array.from(document.querySelectorAll("#sm-tbody tr")).forEach(tr=>{
          const ra=(tr.querySelector(".sm-area-btn")?.dataset?.areas||"").trim().toUpperCase();
          const ars=ra.split(",").map(x=>x.trim()).filter(Boolean);
          const aok=filter==="ALL"||ars.includes(filter);
          let sok=true; if(query){const n=(tr.cells[1]?.textContent||"").toLowerCase(),b=(tr.cells[2]?.textContent||"").toLowerCase();sok=n.includes(query)||b.includes(query);}
          const hide=!(aok&&sok); tr.classList.toggle("hidden-row",hide); if(!hide)vis++;
        });
        const total=document.querySelectorAll("#sm-tbody tr").length;
        const ce=document.getElementById("sm-searchCount");
        if(ce)ce.textContent=(query||filter!=="ALL")?`${vis} of ${total} shown`:`${total} staff total`;
      }
      function clearSearch(){document.getElementById("sm-search").value="";applyFilter();}

      function writeLocal() {
        localStorage.setItem(STAFF_RECORDS_KEY,JSON.stringify(records));
        schedSave();
      }

      function renderTable() {
        const tbody=document.getElementById("sm-tbody"); tbody.innerHTML="";
        records.forEach((s,idx)=>{
          const tr=document.createElement("tr");
          tr.innerHTML=`
            <td style="padding:4px;text-align:center;">${idx+1}</td>
            <td style="padding:4px;">${s.name.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</td>
            <td style="padding:4px;text-align:center;">${s.badge}</td>
            <td style="padding:4px;">${s.role}</td>
            <td style="padding:4px;text-align:center;">${Number(s.hrr||0).toFixed(2)}</td>
            <td style="padding:4px;">
              <button type="button" class="sm-area-btn" data-i="${idx}" data-areas="${s.area}"
                style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;color:#0369a1;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">
                ${s.area||"— Select —"}
              </button>
            </td>
            <td style="padding:4px;white-space:nowrap;">
              <button type="button" data-edit="${idx}" style="background:#0f766e;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">Edit</button>
              <button type="button" data-del="${idx}"  style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;margin-left:3px;">Del</button>
              <button type="button" data-copy="${idx}" style="background:#0284c7;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;margin-left:3px;">Copy→</button>
            </td>`;
          tr.querySelector(".sm-area-btn").addEventListener("click",function(){
            const i=Number(this.dataset.i), btn=this;
            openAreaPicker("sm-area-inline-"+i, null, "Assign Areas — "+records[i].name, records[i].area||"", newAreas=>{
              records[i].area=newAreas; btn.textContent=newAreas||"— Select —"; btn.dataset.areas=newAreas;
              if(newAreas)newAreas.split(",").forEach(a=>{if(a.trim())saveAreaToList(a.trim());}); rebuildUI(); writeLocal(); applyFilter();
            });
          });
          tr.querySelector("[data-edit]").addEventListener("click",()=>openEditModal(idx));
          tr.querySelector("[data-del]").addEventListener("click",async()=>{
            const ok=await showConfirmModal({title:"Delete staff member?",message:`Remove "${s.name}" from the staff pool?`,confirmLabel:"Delete",danger:true});
            if(ok){records.splice(idx,1);renderTable();writeLocal();applyFilter();}
          });
          tr.querySelector("[data-copy]").addEventListener("click",()=>{
            const areas=getAreasList().filter(a=>!s.area.split(",").includes(a));
            if(!areas.length){showStatusMessage("No other areas available.","error");return;}
            openAreaPicker("sm-copy-"+idx,null,"Copy "+s.name+" to area","",(newAreas)=>{
              if(!newAreas)return;
              newAreas.split(",").forEach(ta=>{ta=ta.trim();if(!ta)return;
                const dup=s.badge?records.some(x=>x.badge&&x.badge===s.badge&&x.area===ta):records.some(x=>x.name.toLowerCase()===s.name.toLowerCase()&&x.area===ta);
                if(dup){showStatusMessage(`"${s.name}" already in ${ta}.`,"error");return;}
                records.push({name:s.name,badge:s.badge,role:s.role,hrr:s.hrr,area:ta});
              });
              renderTable(); writeLocal(); showStatusMessage("Copied ✅");
            });
          });
          tbody.appendChild(tr);
        });
        applyFilter();
      }

      function openAreaPicker(id, hiddenInputId, title, currentAreas, callback) {
        const modal=document.getElementById("areaPickerModal2");
        const titleEl=document.getElementById("apm2-title");
        const listEl=document.getElementById("apm2-list");
        if(!modal)return;
        titleEl.textContent=title;
        const areas=getAreasList();
        const sel=new Set((currentAreas||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean));
        listEl.innerHTML=areas.map(a=>`
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:7px 10px;border-radius:6px;border:1.5px solid ${sel.has(a)?"#bfdbfe":"#e5e7eb"};background:${sel.has(a)?"#eff6ff":"#fff"};">
            <input type="checkbox" value="${a}" ${sel.has(a)?"checked":""} style="width:14px;height:14px;cursor:pointer;accent-color:#1a4f8b;"/>
            <span style="font-weight:${sel.has(a)?"700":"400"};color:#1f2937;">${a}</span>
          </label>`).join("");
        modal.style.display="flex";
        const cleanup=(ok)=>{
          modal.style.display="none";
          document.getElementById("apm2-apply").onclick=null;
          document.getElementById("apm2-cancel").onclick=null;
          if(ok){
            const checked=Array.from(modal.querySelectorAll("#apm2-list input:checked")).map(cb=>cb.value.trim().toUpperCase()).filter(Boolean);
            const val=checked.join(",");
            if(hiddenInputId){const h=document.getElementById(hiddenInputId);if(h)h.value=val;}
            callback(val);
          }
        };
        document.getElementById("apm2-apply").onclick=()=>cleanup(true);
        document.getElementById("apm2-cancel").onclick=()=>cleanup(false);
        modal.addEventListener("click",function handler(e){if(e.target===modal){modal.style.display="none";modal.removeEventListener("click",handler);}});
      }

      function openEditModal(idx) {
        const rec=records[idx]; if(!rec)return;
        const ex=document.getElementById("sm-editModal"); if(ex)ex.remove();
        let _editAreas=rec.area||"";
        const modal=document.createElement("div");
        modal.id="sm-editModal";
        modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9600;";
        modal.innerHTML=`<div style="background:#fff;border-radius:12px;padding:22px 24px;min-width:360px;max-width:460px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.25);">
          <h3 style="margin:0 0 16px;font-size:13px;color:#1a4f8b;">Edit Staff Record</h3>
          <div style="display:grid;gap:10px;">
            <label style="font-size:11px;font-weight:700;color:#374151;">Name<input id="sm-eName" type="text" value="${rec.name.replace(/"/g,"&quot;")}" style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"/></label>
            <label style="font-size:11px;font-weight:700;color:#374151;">Badge<input id="sm-eBadge" type="text" value="${rec.badge}" style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"/></label>
            <label style="font-size:11px;font-weight:700;color:#374151;">Role<select id="sm-eRole" style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"><option${rec.role==="Pharmacist"?" selected":""}>Pharmacist</option><option${rec.role==="Technician"?" selected":""}>Technician</option><option${rec.role==="Pharmacy Aide"?" selected":""}>Pharmacy Aide</option></select></label>
            <label style="font-size:11px;font-weight:700;color:#374151;">HRR<input id="sm-eHRR" type="number" step="0.01" value="${rec.hrr||0}" style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"/></label>
            <label style="font-size:11px;font-weight:700;color:#374151;">Areas
              <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
                <div id="sm-eAreaDisplay" style="flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;background:#f9fafb;min-height:32px;color:#374151;">${rec.area||"—"}</div>
                <button type="button" id="sm-eAreaBtn" style="background:#1a4f8b;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;flex-shrink:0;">Edit Areas</button>
              </div>
            </label>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
            <button id="sm-eSave" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:12px;cursor:pointer;font-weight:700;">Save</button>
            <button id="sm-eCancel" style="background:#6b7280;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;">Cancel</button>
          </div>
        </div>`;
        document.body.appendChild(modal);
        document.getElementById("sm-eCancel").onclick=()=>modal.remove();
        modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
        document.getElementById("sm-eAreaBtn").onclick=()=>{
          openAreaPicker("sm-edit-area",null,"Edit Areas — "+rec.name,_editAreas,(v)=>{_editAreas=v;document.getElementById("sm-eAreaDisplay").textContent=v||"—";});
        };
        document.getElementById("sm-eSave").onclick=()=>{
          const newName=document.getElementById("sm-eName").value.trim();
          const newBadge=document.getElementById("sm-eBadge").value.trim();
          const newRole=document.getElementById("sm-eRole").value;
          const newHRR=parseFloat(document.getElementById("sm-eHRR").value)||0;
          const newArea=_editAreas.toUpperCase();
          if(!newName){alert("Name is required.");return;}
          const oldBadge=rec.badge;
          records.forEach(r=>{if(oldBadge&&r.badge===oldBadge){r.name=newName;r.badge=newBadge;r.role=newRole;r.hrr=newHRR;}});
          records[idx].area=newArea;
          if(newArea)newArea.split(",").forEach(a=>{if(a.trim())saveAreaToList(a.trim());});
          renderTable(); writeLocal(); rebuildUI(); applyFilter(); modal.remove();
          showStatusMessage("Staff updated ✅");
        };
      }

      function addNewArea() {
        const raw=(document.getElementById("sm-newAreaInput").value||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,20);
        if(!raw){showStatusMessage("Enter a valid area name.","error");return;}
        saveAreaToList(raw); rebuildUI();
        document.getElementById("sm-areaFilter").value=raw;
        document.getElementById("sm-newAreaInput").value="";
        applyFilter();
      }

      function addStaff() {
        const name=(document.getElementById("sm-stName").value||"").trim();
        const badge=(document.getElementById("sm-stBadge").value||"").trim();
        const role=document.getElementById("sm-stRole").value||"Pharmacist";
        const hrr=Number(document.getElementById("sm-stHRR").value||0)||0;
        const area=(document.getElementById("sm-stAreaValue").value||"").trim().toUpperCase();
        if(!name){showStatusMessage("Name is required.","error");return;}
        if(badge&&records.some(x=>x.badge&&x.badge===badge&&x.area===area)){showStatusMessage(`Badge "${badge}" already exists in that area.`,"error");return;}
        if(!badge&&records.some(x=>x.name.toLowerCase()===name.toLowerCase()&&x.area===area)){showStatusMessage("Name already exists in this area.","error");return;}
        if(area)saveAreaToList(area);
        records.push({name,badge,role,hrr,area});
        renderTable(); writeLocal(); rebuildUI();
        document.getElementById("sm-stName").value="";
        document.getElementById("sm-stBadge").value="";
        document.getElementById("sm-stHRR").value="";
        document.getElementById("sm-stAreaValue").value="";
        const btn=document.getElementById("sm-stAreaBtn");
        if(btn){btn.textContent="— Area —";}
        showStatusMessage("Staff added ✅");
      }

      async function saveNow() {
        clearTimeout(_saveTimer); setStatus("saving");
        try{const key=(window.BCOT_APP_KEY||"").trim();if(!key){setStatus("error");return;}
          if(!records.length){showStatusMessage("No staff to save.","error");setStatus("error");return;}
          await window.FB.setDoc(getDocRef(key),{savedAt:new Date().toISOString(),records},{merge:true});
          setStatus("saved"); showStatusMessage(`${records.length} staff saved to cloud ✅`);}
        catch(e){console.error(e);setStatus("error");showStatusMessage("Save failed: "+(e?.message||e),"error");}
      }

      async function loadFromCloud() {
        try{const key=(window.BCOT_APP_KEY||"").trim();if(!key){showStatusMessage("config.js not found.","error");return;}
          showStatusMessage("Loading staff from cloud…","info");
          const snap=await window.FB.getDoc(getDocRef(key));
          if(!snap.exists()){showStatusMessage("No staff in cloud yet.","info");return;}
          records=(Array.isArray(snap.data()?.records)?snap.data().records:[]).map(normalize).filter(s=>s.name);
          localStorage.setItem(STAFF_RECORDS_KEY,JSON.stringify(records));
          records.forEach(s=>{if(s.area)s.area.split(",").forEach(a=>{if(a.trim())saveAreaToList(a.trim());});});
          rebuildUI(); renderTable();
          showStatusMessage(`Loaded ${records.length} staff from cloud ✅`);}
        catch(e){console.error(e);showStatusMessage("Load failed: "+(e?.message||e),"error");}
      }

      function importFromExcel(input) {
        const file=input.files[0]; if(!file)return; input.value="";
        const role=document.getElementById("sm-importRole").value||"Pharmacist";
        const area=(document.getElementById("sm-importAreaValue").value||"").trim();
        const hrr=parseFloat(document.getElementById("sm-importHRR").value)||0;
        const reader=new FileReader();
        reader.onload=function(e){
          try{const wb=XLSX.read(e.target.result,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
            const exBadges=new Set(records.map(s=>(s.badge||"").toString().trim()));
            let added=0,skipped=0,invalid=0; const toAdd=[];
            rows.forEach(row=>{const raw=String(row[0]||"").replace(/ /g," ").trim();if(!raw)return;const m=raw.match(/^(.+?)\s*\((\d+)\)\s*$/);if(!m){invalid++;return;}const name=m[1].trim(),badge=m[2].trim();if(!name||!badge){invalid++;return;}if(exBadges.has(badge)){skipped++;return;}exBadges.add(badge);toAdd.push({name:raw,badge,role,hrr,area:area||""});added++;});
            toAdd.forEach(r=>{records.push(normalize(r));if(r.area)saveAreaToList(r.area);});
            if(added){writeLocal();renderTable();rebuildUI();}
            showStatusMessage(`Import: ${added} added, ${skipped} dup(s) skipped${invalid?", "+invalid+" invalid":""}`);}
          catch(err){console.error(err);showStatusMessage("Import failed: "+(err?.message||err),"error");}
        };
        reader.readAsArrayBuffer(file);
      }

      function importHRR(input) {
        const file=input.files[0]; if(!file)return; input.value="";
        const reader=new FileReader();
        reader.onload=function(e){
          try{const wb=XLSX.read(e.target.result,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
            if(rows.length<2){showStatusMessage("File empty.","error");return;}
            const header=rows[0].map(h=>String(h||"").trim().toLowerCase());
            let bC=-1,nC=-1,hC=-1;
            header.forEach((h,i)=>{if(/badge/i.test(h))bC=i;else if(/name/i.test(h))nC=i;else if(/hrr|rate|hourly/i.test(h))hC=i;});
            if(bC<0&&hC<0){bC=0;nC=1;hC=2;}
            if(hC<0){showStatusMessage("Could not find HRR column.","error");return;}
            let upd=0,notF=[];
            rows.slice(1).forEach(row=>{const rb=String(row[bC]??"").trim(),rn=String(row[nC]??"").trim().toUpperCase(),rh=parseFloat(row[hC]);if(!Number.isFinite(rh)||rh<=0)return;let idx=rb?records.findIndex(s=>String(s.badge).trim()===rb):-1;if(idx<0&&rn)idx=records.findIndex(s=>s.name.replace(/\s*\(\d+\)\s*$/,"").trim().toUpperCase()===rn);if(idx<0){notF.push(rn||rb);return;}records[idx].hrr=rh;upd++;});
            if(upd){writeLocal();renderTable();}
            let msg=`HRR updated: ${upd} staff`;if(notF.length)msg+=` · ${notF.length} not found`;showStatusMessage(msg+(upd?"":" — nothing updated"),"error");}
          catch(err){console.error(err);showStatusMessage("HRR import failed: "+(err?.message||err),"error");}
        };
        reader.readAsArrayBuffer(file);
      }

      function doCopyToArea(sourceRecs, targetArea) {
        if(!targetArea){showStatusMessage("Select a target area.","error");return;}
        let copied=0,skipped=0;
        sourceRecs.forEach(src=>{const dup=src.badge?records.some(x=>x.badge&&x.badge===src.badge&&x.area===targetArea):records.some(x=>x.name.toLowerCase()===src.name.toLowerCase()&&x.area===targetArea);if(dup){skipped++;return;}records.push({name:src.name,badge:src.badge,role:src.role,hrr:src.hrr,area:targetArea});copied++;});
        if(copied){renderTable();writeLocal();applyFilter();}
        showStatusMessage(`Copied ${copied} to ${targetArea}${skipped?`, ${skipped} skipped`:""}`,copied===0);
      }
      function copyVisible(){const ta=(document.getElementById("sm-copyTarget").value||"").trim();const f=(document.getElementById("sm-areaFilter")?.value||"ALL").toUpperCase();const src=f==="ALL"?[...records]:records.filter(s=>(s.area||"").toUpperCase().split(",").map(x=>x.trim()).includes(f));doCopyToArea(src,ta);}
      function copyAll(){const ta=(document.getElementById("sm-copyTarget").value||"").trim();doCopyToArea([...records],ta);}

      function open() {
        document.getElementById("staffModal").style.display="block";
        records=(()=>{try{const r=JSON.parse(localStorage.getItem(STAFF_RECORDS_KEY)||"[]");return Array.isArray(r)?r.map(normalize).filter(s=>s.name):[];}catch{return [];}})();
        rebuildUI(); renderTable();
        // Set area filter to match rota
        const area=getCurrentArea(), sel=document.getElementById("sm-areaFilter");
        if(sel&&area&&(area==="ALL"||getAreasList().includes(area)))sel.value=area;
        applyFilter();
        // Auto-load from cloud when no local data (e.g. first visit on new domain)
        if(!records.length) loadFromCloud();
      }
      function close() { document.getElementById("staffModal").style.display="none"; }

      return {open,close,addStaff,saveNow,loadFromCloud,importFromExcel,importHRR,addNewArea,applyFilter,clearSearch,copyVisible,copyAll,renderTable,openAreaPicker,openEditModal};
    })();

    // ── Init ──────────────────────────────────────────────────────────────────
    (function init() {
      setKeyFieldFromStorage();

      // Build area picker and restore last filter
      const lastArea=(localStorage.getItem(AREA_KEY)||"ALL").trim().toUpperCase();
      const inp=document.getElementById("areaFilter");
      const validLast = (lastArea==="ALL"||getAreasList().includes(lastArea)) ? lastArea : "ALL";
      if (inp) inp.value = validLast;
      const areaLabel = validLast==="ALL" ? "All Areas" : validLast;
      const lbl = document.getElementById("areaPickerLabel");
      if (lbl) lbl.textContent = areaLabel;
      rebuildAreaSelect();
      const hdr=document.getElementById("headerAreaLabel");
      if (hdr) hdr.textContent=areaLabel;
      const pal=document.getElementById("printAreaLabel");
      if (pal) pal.textContent=areaLabel;

      const m=new Date().getMonth()+1;
      document.getElementById('monthSelect').value=String(m);
      const yi=document.getElementById('yearInput');
      if (yi) yi.value=String(new Date().getFullYear());

      renderHolidayList();
      staffList=loadStaffList();
      // Auto-load staff + areas from cloud when localStorage is empty (e.g. first visit on new domain)
      if (!staffList.length && window.BCOT_APP_KEY) {
        (async () => {
          let t = 0;
          while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
          if (window.FB) populateStaff();  // populateStaff also syncs areas
        })();
      } else if (!getAreasList().length && window.BCOT_APP_KEY) {
        // Staff is cached but areas list is missing — sync areas from cloud only
        (async () => {
          let t = 0;
          while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
          if (!window.FB) return;
          try {
            const key = (window.BCOT_APP_KEY || '').trim(); if (!key) return;
            const snap = await window.FB.getDoc(
              window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'staff_named', 'STAFF_POOL')
            );
            if (!snap.exists()) return;
            const cloudAreas = snap.data()?.areasList;
            if (Array.isArray(cloudAreas) && cloudAreas.length) {
              localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(cloudAreas));
              rebuildAreaSelect();
            }
          } catch(e) { console.warn('[init] areas sync:', e); }
        })();
      }
      DUTIES=loadDuties()||{};
      injectDutyStyles();
      buildLegend();
      updateTable();

      // Restore any unsaved rota work from the draft (e.g. after navigating to Duties.html and back)
      const restored = restoreDraft();
      if (!restored) addNewRow();
      applyColumnWidths();
      setPatternIndicator(false);

      if (!Object.keys(DUTIES).length) showStatusMessage('No duties found. Open Duties.html to add duties.','error');
      else if (restored)               showStatusMessage('Your previous rota work has been restored ✅');
      else if (!staffList.length)      showStatusMessage('No staff for this filter. Open Staff.html to add staff.','error');

      // Load release number for current area and show rota label
      releaseNum = loadReleaseNum(getCurrentArea());
      updateRotaLabel();

      // Populate print footer from logged-in session
      try {
        const _sess = JSON.parse(localStorage.getItem('BCOT_AUTH_SESSION_V1') || 'null');
        if (_sess) {
          const nameEl  = document.getElementById('printPreparedByName');
          const titleEl = document.getElementById('printPreparedByTitle');
          const dateEl  = document.getElementById('printDate');
          const fullName = [_sess.nameTitle, _sess.name].filter(Boolean).join(' ') || '—';
          const pos      = _sess.position || _sess.title || '';  // backward compat
          const now      = new Date();
          const dateStr  = now.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
          const timeStr  = now.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
          if (nameEl)  nameEl.textContent  = fullName;
          if (titleEl) titleEl.textContent = pos;
          if (dateEl)  dateEl.textContent  = dateStr + '  ·  ' + timeStr;
        }
      } catch(e) { console.warn('Print footer session read failed:', e); }

      updateDashboard();

      // Real-time consumption sync: onSnapshot (A) + tab-focus refresh (C)
      if (window.BCOT_APP_KEY) {
        _startConsumptionListener();

        // Option C — when tab comes back into focus, refresh UI from latest data
        // (handles edge cases where the onSnapshot listener lagged while tab was hidden)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            updateConsumptionBar();
            updateBannerBudget();
            updateCallCenterCards();
          }
        });
      }
    })();
  