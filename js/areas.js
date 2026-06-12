// ═══════════════════════════════════════════════════════════════════════════
//  Cost Centers Manager  •  js/areas.js
//  Replaces old area-budgets system.
//  Cost centers group one or more areas together with a shared SAR budget.
//  Data lives in localStorage (BCOT_COST_CENTERS_V1) and Firestore
//  (bcot_overtime_secure/[KEY]/cost_centers/LIST).
// ═══════════════════════════════════════════════════════════════════════════

const CC_LS_KEY         = 'BCOT_COST_CENTERS_V1';    // localStorage key
const CC_FB_DOC         = 'LIST';                    // Firestore document id
const CONSUMPTION_KEY   = 'BCOT_AREA_CONSUMPTION_V1'; // consumption snapshots

let _centers   = [];       // in-memory array  [{id,name,budget,areas:[]}]
let _saveTimer = null;     // debounce handle for cloud save
let _consumption = [];     // cached consumption records

// ── Status toast ─────────────────────────────────────────────────────────────
function _ccStatus(msg, isErr) {
  const el = document.getElementById('statusBox');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'status-message ' + (isErr ? 'status-error' : 'status-success');
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 3400);
}

// ── App key ───────────────────────────────────────────────────────────────────
function _ccKey() {
  const k = (window.BCOT_APP_KEY || '').trim();
  if (!k) { _ccStatus('config.js not found — cloud sync disabled.', true); }
  return k || null;
}

// ── Areas list (from Staff pool metadata) ────────────────────────────────────
function _ccAreasList() {
  try { return JSON.parse(localStorage.getItem('BCOT_AREAS_LIST_V1') || '[]') || []; }
  catch { return []; }
}

/** Fetch areasList from the cloud staff document and cache it locally. */
async function _ccSyncAreasList() {
  const key = _ccKey(); if (!key) return;
  if (!await _waitFB()) return;
  try {
    const snap = await window.FB.getDoc(
      window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'staff_named', 'STAFF_POOL')
    );
    if (!snap.exists()) return;
    const cloudAreas = snap.data()?.areasList;
    if (Array.isArray(cloudAreas) && cloudAreas.length) {
      localStorage.setItem('BCOT_AREAS_LIST_V1', JSON.stringify(cloudAreas.sort()));
    }
  } catch (e) { console.warn('[CC] areas list sync:', e); }
}

// ── Firestore ref helper ─────────────────────────────────────────────────────
function _ccDocRef(key) {
  return window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'cost_centers', CC_FB_DOC);
}

// ── UID ──────────────────────────────────────────────────────────────────────
function _ccUID() {
  return 'cc_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
}

// ── Wait for Firebase ────────────────────────────────────────────────────────
async function _waitFB() {
  let t = 0;
  while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
  return !!window.FB;
}

// ── Consumption helpers ───────────────────────────────────────────────────────
function _loadConsumptionLocal() {
  try { return JSON.parse(localStorage.getItem(CONSUMPTION_KEY) || '[]') || []; }
  catch { return []; }
}

async function _loadConsumptionCloud() {
  const key = _ccKey(); if (!key) return null;
  if (!await _waitFB()) return null;
  try {
    const snap = await window.FB.getDoc(
      window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'area_consumption', 'RECORDS')
    );
    if (!snap.exists()) return null;
    const data = snap.data();
    return Array.isArray(data?.records) ? data.records : null;
  } catch (e) { console.warn('[CC] consumption load:', e); return null; }
}

/** Get the selected month+year from the filter selects (returns {month:'06', year:'2026'}). */
function _getMonthFilter() {
  const m = document.getElementById('ccMonthFilter')?.value || String(new Date().getMonth()+1);
  const y = document.getElementById('ccYearFilter')?.value  || String(new Date().getFullYear());
  return { month: m.padStart(2,'0'), year: y };
}

// ── Local storage ─────────────────────────────────────────────────────────────
function _ccLoadLocal() {
  try { return JSON.parse(localStorage.getItem(CC_LS_KEY) || '[]') || []; }
  catch { return []; }
}
function _ccSaveLocal(centers) {
  localStorage.setItem(CC_LS_KEY, JSON.stringify(centers));
}

// ── Cloud save ────────────────────────────────────────────────────────────────
async function _ccSaveCloud(centers) {
  const key = _ccKey(); if (!key) return;
  if (!await _waitFB()) { _ccStatus('Firebase not ready.', true); return; }
  await window.FB.setDoc(
    _ccDocRef(key),
    { centers, savedAt: new Date().toISOString() }
  );
}

// ── Cloud load ────────────────────────────────────────────────────────────────
async function _ccLoadCloud() {
  const key = _ccKey(); if (!key) return null;
  if (!await _waitFB()) return null;
  try {
    const snap = await window.FB.getDoc(_ccDocRef(key));
    if (!snap.exists()) return null;
    const data = snap.data();
    return Array.isArray(data?.centers) ? data.centers : null;
  } catch (e) {
    console.error('[CC] cloud load error:', e);
    return null;
  }
}

// ── Persist (local + debounced cloud) ────────────────────────────────────────
function _ccPersist(centers) {
  _centers = centers;
  _ccSaveLocal(centers);
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _ccSaveCloud(centers)
      .then(() => _ccStatus('Cost centers saved to cloud ✅'))
      .catch(e => _ccStatus('Cloud save failed: ' + (e?.message || e), true));
  }, 1500);
}

// ── Render list ───────────────────────────────────────────────────────────────
function _ccRender() {
  const wrapper = document.getElementById('ccList');
  if (!wrapper) return;

  if (!_centers.length) {
    wrapper.style.cssText = 'padding:32px;text-align:center;color:#6b7280;font-size:13px;';
    wrapper.innerHTML = `
      No cost centers yet.<br>
      <button onclick="ccNew()" style="margin-top:12px;background:#1a4f8b;color:#fff;border:none;
              border-radius:8px;padding:8px 18px;font-size:12px;cursor:pointer;font-weight:700;">
        + Create First Cost Center
      </button>`;
    return;
  }

  // Make ccList the grid container
  wrapper.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px;padding:0;';

  const { month, year } = _getMonthFilter();
  const fmt = v => Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

  // Build a lookup: area -> consumption record for selected month+year
  const savedMap = {};
  _consumption.forEach(r => {
    const k = r.area + '|' + r.year + '|' + String(r.month).padStart(2,'0');
    savedMap[k] = r;
  });

  let html = '';
  _centers.forEach(c => {
    const areas  = Array.isArray(c.areas) ? c.areas : [];
    const budget = Number(c.budget) || 0;
    const chips  = areas.length
      ? areas.map(a => `<span class="area-chip">${a}</span>`).join('')
      : '<em style="color:#9ca3af;font-size:11px;">No areas assigned</em>';

    // Per-area consumption for selected month
    let totalOT   = 0;
    let totalComp = 0;
    let areaRows  = '';
    areas.forEach(a => {
      const rec = savedMap[`${a}|${year}|${month}`];
      if (rec) {
        const ot   = Number(rec.otAmount)  || 0;
        const comp = Number(rec.compHours) || 0;
        totalOT   += ot;
        totalComp += comp;
        const ts = rec.savedAt
          ? new Date(rec.savedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
          : '';
        const compPart = comp > 0 ? ` &nbsp; 📅 ${comp.toFixed(1)} hrs` : '';
        areaRows += `
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;
                      padding:4px 0;border-top:1px solid #f1f5f9;font-size:10px;">
            <span style="font-weight:700;min-width:40px;color:#0f172a;">${a}</span>
            <span style="color:#1a4f8b;">💰 ${fmt(ot)} SAR${compPart}</span>
            ${ts ? `<span style="color:#9ca3af;font-size:9px;">⏱ ${ts}</span>` : ''}
          </div>`;
      } else {
        areaRows += `
          <div style="display:flex;align-items:center;gap:4px;
                      padding:4px 0;border-top:1px solid #f1f5f9;font-size:10px;">
            <span style="font-weight:700;min-width:40px;color:#9ca3af;">${a}</span>
            <span style="color:#d1d5db;">— not saved for ${month}/${year}</span>
          </div>`;
      }
    });

    const remaining = budget - totalOT;
    const pct       = budget > 0 ? Math.min((totalOT / budget) * 100, 100) : 0;
    const isOver    = budget > 0 && totalOT > budget;
    const isWarn    = !isOver && pct >= 75;
    const barClr    = isOver ? '#dc2626' : isWarn ? '#d97706' : '#2e8b57';
    const dot       = isOver ? '🔴' : isWarn ? '🟡' : '🟢';

    const hasData = totalOT > 0 || totalComp > 0;

    html += `
      <div class="cc-card">
        <div class="cc-card-header">
          <div class="cc-card-name">${dot} ${_esc(c.name)}</div>
          <div class="cc-card-btns">
            <button class="cc-edit-btn" onclick="ccEdit('${c.id}')">✏️ Edit</button>
            <button class="cc-del-btn"  onclick="ccDelete('${c.id}')">🗑️</button>
          </div>
        </div>
        <div class="cc-card-areas">${chips}</div>
        <div class="cc-card-budget">
          Budget: <strong>${budget.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} SAR</strong>
        </div>
        ${hasData ? `
        <div style="background:#e2e8f0;border-radius:4px;height:6px;margin:8px 0 6px;overflow:hidden;">
          <div style="background:${barClr};height:100%;border-radius:4px;width:${pct}%;"></div>
        </div>
        <div style="font-size:10px;font-weight:700;color:${barClr};margin-bottom:4px;">
          💰 ${fmt(totalOT)} SAR used
          ${totalComp > 0 ? `&nbsp;&nbsp;📅 ${totalComp.toFixed(1)} comp hrs` : ''}
        </div>
        <div style="font-size:10px;color:${isOver?'#dc2626':'#16a34a'};font-weight:700;margin-bottom:6px;">
          ${isOver ? '⚠️ Over by '+fmt(totalOT-budget)+' SAR' : (budget>0?fmt(remaining)+' SAR remaining':'')}
        </div>` : `<div style="font-size:10px;color:#9ca3af;margin:6px 0;">No data saved for ${month}/${year}</div>`}
        <div style="margin-top:4px;">${areaRows}</div>
      </div>`;
  });

  wrapper.innerHTML = html;
}

/** Re-render with latest filter (called by month/year select onchange). */
function ccFilterChanged() {
  _ccRender();
}

// ── Safe HTML escape ──────────────────────────────────────────────────────────
function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Modal open (create or edit) ───────────────────────────────────────────────
function ccNew() { _openModal(null); }

function ccEdit(id) {
  const c = _centers.find(x => x.id === id);
  if (c) _openModal(c);
}

function _openModal(existing) {
  const areas = _ccAreasList();

  document.getElementById('ccModalTitle').textContent = existing ? 'Edit Cost Center' : 'New Cost Center';
  document.getElementById('ccEditId').value  = existing ? existing.id : '';
  document.getElementById('ccName').value    = existing ? (existing.name   || '') : '';
  document.getElementById('ccBudget').value  = existing ? (existing.budget || '') : '';

  // Area checkboxes
  const box = document.getElementById('ccAreaChecks');
  if (!areas.length) {
    box.innerHTML = '<div style="color:#9ca3af;padding:6px 0;font-size:11px;">No areas found. Add areas in Staff.html first.</div>';
  } else {
    const sel = new Set(existing ? (existing.areas || []) : []);
    box.innerHTML = areas.map(a => `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;">
        <input type="checkbox" value="${_esc(a)}" ${sel.has(a) ? 'checked' : ''}
               style="width:15px;height:15px;cursor:pointer;accent-color:#1a4f8b;">
        <span style="font-size:12px;">${_esc(a)}</span>
      </label>`).join('');
  }

  document.getElementById('ccModal').style.display = 'flex';
  document.getElementById('ccName').focus();
}

// ── Modal close ───────────────────────────────────────────────────────────────
function ccModalClose() {
  document.getElementById('ccModal').style.display = 'none';
}

// ── Modal save ────────────────────────────────────────────────────────────────
function ccModalSave() {
  const nameEl   = document.getElementById('ccName');
  const budgetEl = document.getElementById('ccBudget');
  const editId   = document.getElementById('ccEditId').value.trim();

  const name   = nameEl.value.trim();
  const budget = parseFloat(budgetEl.value) || 0;
  const areas  = Array.from(
    document.querySelectorAll('#ccAreaChecks input[type=checkbox]:checked')
  ).map(cb => cb.value);

  if (!name) {
    nameEl.style.borderColor = '#dc2626';
    nameEl.focus();
    return;
  }
  nameEl.style.borderColor = '';

  const updated = _centers.slice();
  if (editId) {
    const idx = updated.findIndex(c => c.id === editId);
    if (idx >= 0) updated[idx] = { ...updated[idx], name, budget, areas };
    else           updated.push({ id: _ccUID(), name, budget, areas });
  } else {
    updated.push({ id: _ccUID(), name, budget, areas });
  }

  _ccPersist(updated);
  _ccRender();
  ccModalClose();
  _ccStatus(editId ? `"${name}" updated ✅` : `"${name}" created ✅`);
}

// ── Delete ────────────────────────────────────────────────────────────────────
function ccDelete(id) {
  const c = _centers.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Delete "${c.name}"?\nThis cannot be undone.`)) return;
  _ccPersist(_centers.filter(x => x.id !== id));
  _ccRender();
  _ccStatus(`"${c.name}" deleted.`);
}

// ── Manual cloud buttons (in toolbar) ────────────────────────────────────────
async function ccSaveCloud() {
  if (!_ccKey()) return;
  _ccStatus('Saving to cloud…');
  try {
    await _ccSaveCloud(_centers);
    _ccStatus('Saved to cloud ✅');
  } catch (e) {
    _ccStatus('Save failed: ' + (e?.message || e), true);
  }
}

async function ccLoadCloud() {
  _ccStatus('Loading from cloud…');
  const data = await _ccLoadCloud();
  if (!Array.isArray(data)) { _ccStatus('No cost centers found in cloud.', true); return; }
  _centers = data;
  _ccSaveLocal(data);
  _ccRender();
  _ccStatus(`Loaded ${data.length} cost center(s) from cloud ✅`);
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async function ccInit() {
  // Set default month+year filter to current month
  const now = new Date();
  const mf = document.getElementById('ccMonthFilter');
  const yf = document.getElementById('ccYearFilter');
  if (mf) mf.value = String(now.getMonth() + 1);
  if (yf) yf.value = String(now.getFullYear());

  // 1. Show local data immediately (with local consumption data)
  _centers     = _ccLoadLocal();
  _consumption = _loadConsumptionLocal();
  _ccRender();

  // 2. Load cost centers, areas list, and consumption from cloud in parallel
  const [cloudData, , cloudConsumption] = await Promise.all([
    _ccLoadCloud(),
    _ccAreasList().length ? Promise.resolve() : _ccSyncAreasList(),
    _loadConsumptionCloud()
  ]);

  if (Array.isArray(cloudData)) {
    _centers = cloudData;
    _ccSaveLocal(cloudData);
  }

  if (Array.isArray(cloudConsumption) && cloudConsumption.length) {
    _consumption = cloudConsumption;
    localStorage.setItem(CONSUMPTION_KEY, JSON.stringify(cloudConsumption));
  }

  _ccRender();

  // Warn only if areas are still missing after the cloud fetch
  if (!_ccAreasList().length) {
    _ccStatus('No areas found yet — add areas in Staff.html first.', true);
  }
})();
