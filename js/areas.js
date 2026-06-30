// ═══════════════════════════════════════════════════════════════════════════
//  Cost Centers Manager with Hierarchy  •  js/areas.js
//  Supports parent→child hierarchies, sum-mode, distribute-mode allocations.
//  Data: localStorage (BCOT_COST_CENTERS_V1) + Firestore (cost_centers/LIST)
// ═══════════════════════════════════════════════════════════════════════════

const CC_LS_KEY       = 'BCOT_COST_CENTERS_V1';
const CC_FB_DOC       = 'LIST';
const CONSUMPTION_KEY = 'BCOT_AREA_CONSUMPTION_V1';

let _centers     = [];   // [{id,name,budget,areas,parentId,budgetMode,allocations}]
let _saveTimer   = null;
let _consumption = [];
let _viewMode    = 'hierarchy';   // 'hierarchy' | 'flat'

// ── Toast ─────────────────────────────────────────────────────────────────
function _ccStatus(msg, isErr) {
  const el = document.getElementById('statusBox');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'status-message ' + (isErr ? 'status-error' : 'status-success');
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 3600);
}

// ── App key ───────────────────────────────────────────────────────────────
function _ccKey() {
  const k = (window.BCOT_APP_KEY || '').trim();
  if (!k) _ccStatus('config.js not found — cloud sync disabled.', true);
  return k || null;
}

// ── Areas list ────────────────────────────────────────────────────────────
function _ccAreasList() {
  try { return JSON.parse(localStorage.getItem('BCOT_AREAS_LIST_V1') || '[]') || []; }
  catch { return []; }
}

async function _ccSyncAreasList() {
  const key = _ccKey(); if (!key) return;
  if (!await _waitFB()) return;
  try {
    const snap = await window.FB.getDoc(
      window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'staff_named', 'STAFF_POOL')
    );
    if (!snap.exists()) return;
    const cl = snap.data()?.areasList;
    if (Array.isArray(cl) && cl.length)
      localStorage.setItem('BCOT_AREAS_LIST_V1', JSON.stringify(cl.sort()));
  } catch (e) { console.warn('[CC] areas list sync:', e); }
}

// ── Firebase helpers ──────────────────────────────────────────────────────
function _ccDocRef(key) {
  return window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'cost_centers', CC_FB_DOC);
}
function _ccUID() {
  return 'cc_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
}
async function _waitFB() {
  let t = 0;
  while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
  return !!window.FB;
}

// ── Consumption helpers ───────────────────────────────────────────────────
function _loadConsumptionLocal() {
  try { return JSON.parse(localStorage.getItem(CONSUMPTION_KEY) || '[]') || []; }
  catch { return []; }
}
function _saveConsumptionLocal(recs) {
  localStorage.setItem(CONSUMPTION_KEY, JSON.stringify(recs));
}
async function _saveConsumptionCloud(recs) {
  const key = _ccKey(); if (!key) return;
  if (!await _waitFB()) return;
  await window.FB.setDoc(
    window.FB.doc(window.FB.db, 'bcot_overtime_secure', key, 'area_consumption', 'RECORDS'),
    { records: recs, savedAt: new Date().toISOString() }
  );
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
function _getMonthFilter() {
  const m = document.getElementById('ccMonthFilter')?.value || String(new Date().getMonth()+1);
  const y = document.getElementById('ccYearFilter')?.value  || String(new Date().getFullYear());
  return { month: m.padStart(2,'0'), year: y };
}

// ── Local / Cloud storage ─────────────────────────────────────────────────
function _ccLoadLocal()         { try { return JSON.parse(localStorage.getItem(CC_LS_KEY) || '[]') || []; } catch { return []; } }
function _ccSaveLocal(centers)  { localStorage.setItem(CC_LS_KEY, JSON.stringify(centers)); }
async function _ccSaveCloud(centers) {
  const key = _ccKey(); if (!key) return;
  if (!await _waitFB()) { _ccStatus('Firebase not ready.', true); return; }
  await window.FB.setDoc(_ccDocRef(key), { centers, savedAt: new Date().toISOString() });
}
async function _ccLoadCloud() {
  const key = _ccKey(); if (!key) return null;
  if (!await _waitFB()) return null;
  try {
    const snap = await window.FB.getDoc(_ccDocRef(key));
    if (!snap.exists()) return null;
    const data = snap.data();
    return Array.isArray(data?.centers) ? data.centers : null;
  } catch (e) { console.error('[CC] cloud load:', e); return null; }
}
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
function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Hierarchy helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Returns Set of all descendant IDs (not including id itself). */
function _getDescendants(id, visited = new Set()) {
  _centers.filter(c => c.parentId === id).forEach(child => {
    if (!visited.has(child.id)) {
      visited.add(child.id);
      _getDescendants(child.id, visited);
    }
  });
  return visited;
}

/** True if assigning newParentId as parent of ccId would create a cycle. */
function _isCircular(ccId, newParentId) {
  if (!newParentId) return false;
  if (ccId === newParentId) return true;
  return _getDescendants(ccId).has(newParentId);
}

/** Effective (displayed) budget for a CC, respecting budgetMode and parent allocations. */
function _effectiveBudget(cc) {
  const mode = cc.budgetMode || 'own';
  if (mode === 'sum') {
    return _centers
      .filter(c => c.parentId === cc.id)
      .reduce((s, c) => s + _effectiveBudget(c), 0);
  }
  // Check if a parent is distributing a budget to this CC
  if (cc.parentId) {
    const parent = _centers.find(p => p.id === cc.parentId);
    if (parent && (parent.budgetMode || 'own') === 'distribute') {
      const alloc = (parent.allocations || {})[cc.id];
      if (alloc) {
        if (alloc.type === 'fixed') return Number(alloc.value) || 0;
        if (alloc.type === 'pct')   return (Number(parent.budget) || 0) * (Number(alloc.value) || 0) / 100;
      }
      return 0;  // child has no allocation yet
    }
  }
  return Number(cc.budget) || 0;
}

/** Returns a short label describing how a child gets its budget from a parent. */
function _allocLabel(cc) {
  if (!cc.parentId) return null;
  const parent = _centers.find(p => p.id === cc.parentId);
  if (!parent || (parent.budgetMode || 'own') !== 'distribute') return null;
  const alloc = (parent.allocations || {})[cc.id];
  if (!alloc) return '(unallocated)';
  const eff = _effectiveBudget(cc);
  if (alloc.type === 'pct')
    return `${Number(alloc.value||0).toLocaleString(undefined,{maximumFractionDigits:2})}% of parent (${eff.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})} SAR)`;
  return `fixed ${eff.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})} SAR`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Render helpers
// ═══════════════════════════════════════════════════════════════════════════

function _buildSavedMap() {
  const map = {};
  _consumption.forEach(r => {
    map[r.area + '|' + r.year + '|' + String(r.month).padStart(2,'0')] = r;
  });
  return map;
}

/** Compute OT for a flat list of areas given the savedMap. */
function _otForAreas(areas, savedMap, month, year) {
  let totalOT = 0, totalComp = 0;
  const rows = [];
  const fmt2 = v => Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  (areas || []).forEach(a => {
    const rec = savedMap[`${a}|${year}|${month}`];
    const editBtn = `<button onclick="ccManualEntry('${_esc(a)}','${month}','${year}')"
      title="Enter amount manually"
      style="margin-left:auto;padding:1px 7px;font-size:9px;border:1px solid #cbd5e1;border-radius:4px;
             background:#f8fafc;color:#475569;cursor:pointer;line-height:1.6;">✏️</button>`;
    if (rec) {
      const ot = Number(rec.otAmount) || 0, comp = Number(rec.compHours) || 0;
      totalOT += ot; totalComp += comp;
      const ts = rec.savedAt
        ? new Date(rec.savedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
        : '';
      const isManual = rec.manual ? `<span style="background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;">Manual</span>` : '';
      rows.push(`<div style="display:flex;flex-wrap:wrap;gap:4px;padding:4px 0;border-top:1px solid #f1f5f9;font-size:10px;align-items:center;">
        <span style="font-weight:700;min-width:40px;color:#0f172a;">${_esc(a)}</span>
        <span style="color:#1a4f8b;">💰 ${fmt2(ot)} SAR${comp>0?` &nbsp;📅 ${comp.toFixed(1)} hrs`:''}</span>
        ${isManual}
        ${ts?`<span style="color:#9ca3af;font-size:9px;">⏱ ${ts}</span>`:''}
        ${editBtn}
      </div>`);
    } else {
      rows.push(`<div style="display:flex;gap:4px;padding:4px 0;border-top:1px solid #f1f5f9;font-size:10px;align-items:center;">
        <span style="font-weight:700;min-width:40px;color:#9ca3af;">${_esc(a)}</span>
        <span style="color:#d1d5db;">— no data for ${month}/${year}</span>
        ${editBtn}
      </div>`);
    }
  });
  return { totalOT, totalComp, rows };
}

// ── Manual amount entry ───────────────────────────────────────────────────
let _manualEntryCtx = null;

function ccManualEntry(area, month, year) {
  _manualEntryCtx = { area, month, year };
  const rec = _consumption.find(r =>
    r.area === area &&
    String(r.year) === String(year) &&
    String(r.month).padStart(2,'0') === String(month).padStart(2,'0')
  );
  document.getElementById('meArea').textContent  = area;
  document.getElementById('mePeriod').textContent = `${month}/${year}`;
  document.getElementById('meAmount').value = rec ? (Number(rec.otAmount)||0) : '';
  document.getElementById('meComp').value   = rec ? (Number(rec.compHours)||0) : '';
  document.getElementById('meModal').style.display = 'flex';
  setTimeout(() => document.getElementById('meAmount').focus(), 30);
}

function meClose() {
  document.getElementById('meModal').style.display = 'none';
  _manualEntryCtx = null;
}

async function meSave() {
  const { area, month, year } = _manualEntryCtx || {};
  if (!area) return;
  const ot   = parseFloat(document.getElementById('meAmount').value) || 0;
  const comp = parseFloat(document.getElementById('meComp').value)   || 0;

  const recs = _consumption.filter(r => !(
    r.area === area &&
    String(r.year) === String(year) &&
    String(r.month).padStart(2,'0') === String(month).padStart(2,'0')
  ));
  const newRec = { area, month: String(month).padStart(2,'0'), year: String(year),
                   otAmount: ot, compHours: comp, savedAt: new Date().toISOString(), manual: true };
  recs.push(newRec);

  _consumption = recs;
  _saveConsumptionLocal(recs);
  meClose();
  _ccStatus('Saving…');
  try {
    await _saveConsumptionCloud(recs);
    _ccStatus(`${area} ${month}/${year} — manually set to ${ot.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} SAR ✅`);
  } catch(e) {
    _ccStatus('Saved locally. Cloud sync failed: ' + (e?.message||e), true);
  }
  _ccRender();
}

/** Recursively accumulate OT from a CC and all its descendants. */
function _totalOTForTree(cc, savedMap, month, year) {
  const own = _otForAreas(cc.areas || [], savedMap, month, year);
  let ot = own.totalOT, comp = own.totalComp;
  _centers.filter(c => c.parentId === cc.id).forEach(child => {
    const sub = _totalOTForTree(child, savedMap, month, year);
    ot += sub.totalOT; comp += sub.totalComp;
  });
  return { totalOT: ot, totalComp: comp };
}

/** Build the HTML for one CC card. isChild controls indented styling. */
function _buildCardHtml(cc, isChild, savedMap, month, year) {
  const budget   = _effectiveBudget(cc);
  const areas    = Array.isArray(cc.areas) ? cc.areas : [];
  const children = _centers.filter(c => c.parentId === cc.id);
  const mode     = cc.budgetMode || 'own';
  const fmt2     = v => Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

  const chips = areas.length
    ? areas.map(a => `<span class="area-chip">${_esc(a)}</span>`).join('')
    : '<em style="color:#9ca3af;font-size:11px;">No areas assigned</em>';

  // For display: own-area OT shown in rows; total OT for budget bar includes children
  const own = _otForAreas(areas, savedMap, month, year);
  const { totalOT: displayOT, totalComp: displayComp } = (mode === 'sum')
    ? _totalOTForTree(cc, savedMap, month, year)
    : own;

  const pct    = budget > 0 ? Math.min((displayOT / budget) * 100, 100) : 0;
  const isOver = budget > 0 && displayOT > budget;
  const isWarn = !isOver && pct >= 75;
  const barClr = isOver ? '#dc2626' : isWarn ? '#d97706' : '#2e8b57';
  const dot    = isOver ? '🔴' : isWarn ? '🟡' : '🟢';
  const hasData = displayOT > 0 || displayComp > 0;

  const modeBadge = mode === 'sum'
    ? '<span class="mode-badge mode-sum">Σ Sum</span>'
    : mode === 'distribute'
      ? '<span class="mode-badge mode-dist">⇒ Dist</span>'
      : '';

  const typeIcon = children.length > 0 ? '💼' : (isChild ? '📁' : '🗂️');
  const al = _allocLabel(cc);

  // Show parent name in flat view
  const parentNote = (!isChild && cc.parentId)
    ? (() => { const p = _centers.find(x => x.id === cc.parentId); return p ? `<div style="font-size:9px;color:#7c3aed;margin-bottom:4px;">↳ under ${_esc(p.name)}</div>` : ''; })()
    : '';

  // Child count badge
  const childBadge = children.length
    ? `<span style="font-size:9px;background:#e0e7ff;color:#3730a3;padding:1px 6px;border-radius:10px;margin-left:4px;">${children.length} child${children.length>1?'ren':''}</span>`
    : '';

  return `
    <div class="cc-card${isChild?' cc-child-card':children.length?' cc-parent-card':''}">
      <div class="cc-card-header">
        <div class="cc-card-name">${dot} ${typeIcon} ${_esc(cc.name)}${modeBadge}${childBadge}</div>
        <div class="cc-card-btns">
          ${children.length && mode==='distribute'
            ? `<button class="cc-alloc-btn" onclick="openAllocModal('${cc.id}')" title="Distribute budget">⚖️</button>`
            : ''}
          <button class="cc-edit-btn" onclick="ccEdit('${cc.id}')">✏️</button>
          <button class="cc-del-btn"  onclick="ccDelete('${cc.id}')">🗑️</button>
        </div>
      </div>
      ${parentNote}
      <div class="cc-card-areas">${chips}</div>
      ${al ? `<div style="font-size:10px;color:#7c3aed;margin-bottom:4px;">🔗 ${_esc(al)}</div>` : ''}
      <div class="cc-card-budget">
        Budget: <strong>${fmt2(budget)} SAR</strong>
        ${mode==='sum' ? ' <span style="color:#9ca3af;font-size:10px;">(auto)</span>' : ''}
      </div>
      ${hasData ? `
        <div style="background:#e2e8f0;border-radius:4px;height:6px;margin:8px 0 5px;overflow:hidden;">
          <div style="background:${barClr};height:100%;border-radius:4px;width:${pct.toFixed(1)}%;transition:width .3s;"></div>
        </div>
        <div style="font-size:10px;font-weight:700;color:${barClr};margin-bottom:3px;">
          💰 ${fmt2(displayOT)} SAR used${displayComp>0?` &nbsp;📅 ${displayComp.toFixed(1)} comp hrs`:''}
        </div>
        <div style="font-size:10px;color:${isOver?'#dc2626':'#16a34a'};font-weight:700;margin-bottom:5px;">
          ${isOver ? '⚠️ Over by '+fmt2(displayOT-budget)+' SAR' : (budget>0?fmt2(budget-displayOT)+' SAR remaining':'')}
        </div>` : `<div style="font-size:10px;color:#9ca3af;margin:5px 0;">No data for ${month}/${year}</div>`}
      ${areas.length ? `<div style="margin-top:4px;">${own.rows.join('')}</div>` : ''}
    </div>`;
}

// ── Tree renderer ─────────────────────────────────────────────────────────

function _renderTree(cc, depth, savedMap, month, year) {
  const children = _centers.filter(c => c.parentId === cc.id);
  const card = _buildCardHtml(cc, depth > 0, savedMap, month, year);
  if (!children.length) return `<div style="margin-bottom:10px;">${card}</div>`;
  const childHtml = children.map(ch => `
    <div class="cc-child-row">${_renderTree(ch, depth+1, savedMap, month, year)}</div>
  `).join('');
  return `
    <div style="margin-bottom:14px;">
      ${card}
      <div class="cc-children-list">${childHtml}</div>
    </div>`;
}

function _renderHierarchy(wrapper) {
  const { month, year } = _getMonthFilter();
  const savedMap = _buildSavedMap();
  const validIds = new Set(_centers.map(c => c.id));
  const roots    = _centers.filter(c => !c.parentId);
  const orphans  = _centers.filter(c => c.parentId && !validIds.has(c.parentId));

  if (!roots.length && !orphans.length) { _renderEmpty(wrapper); return; }

  wrapper.style.cssText = 'padding:8px 0;';
  let html = '<div class="cc-hierarchy-container">';
  roots.forEach(c => { html += _renderTree(c, 0, savedMap, month, year); });
  if (orphans.length) {
    html += `<div style="margin-top:12px;padding:10px;background:#fef3c7;border-radius:8px;border:1px solid #fbbf24;">
      <div style="font-weight:700;color:#92400e;margin-bottom:8px;font-size:12px;">⚠️ Orphaned (parent deleted)</div>`;
    orphans.forEach(c => { html += `<div style="margin-bottom:8px;">${_buildCardHtml(c,false,savedMap,month,year)}</div>`; });
    html += '</div>';
  }
  html += '</div>';
  wrapper.innerHTML = html;
}

function _renderFlat(wrapper) {
  const { month, year } = _getMonthFilter();
  const savedMap = _buildSavedMap();
  wrapper.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:0;margin-top:8px;';
  wrapper.innerHTML = _centers.map(c => _buildCardHtml(c, false, savedMap, month, year)).join('');
}

function _renderEmpty(wrapper) {
  wrapper.style.cssText = 'padding:32px;text-align:center;color:#6b7280;font-size:13px;';
  wrapper.innerHTML = `No cost centers yet.<br>
    <button onclick="ccNew()" style="margin-top:12px;background:#1a4f8b;color:#fff;border:none;
            border-radius:8px;padding:8px 18px;font-size:12px;cursor:pointer;font-weight:700;">
      + Create First Cost Center</button>`;
}

function _ccRender() {
  const wrapper = document.getElementById('ccList');
  if (!wrapper) return;
  if (!_centers.length) { _renderEmpty(wrapper); return; }
  if (_viewMode === 'hierarchy') _renderHierarchy(wrapper);
  else _renderFlat(wrapper);
}

function ccFilterChanged() { _ccRender(); }

function ccToggleView() {
  _viewMode = _viewMode === 'hierarchy' ? 'flat' : 'hierarchy';
  const btn = document.getElementById('ccViewToggleBtn');
  if (btn) btn.textContent = _viewMode === 'hierarchy' ? '📋 Flat View' : '🌳 Hierarchy View';
  _ccRender();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Create / Edit Modal
// ═══════════════════════════════════════════════════════════════════════════

function ccNew()    { _openModal(null); }
function ccEdit(id) { const c = _centers.find(x => x.id === id); if (c) _openModal(c); }

function _openModal(existing) {
  const areas = _ccAreasList();
  document.getElementById('ccModalTitle').textContent = existing ? 'Edit Cost Center' : 'New Cost Center';
  document.getElementById('ccEditId').value  = existing ? existing.id   : '';
  document.getElementById('ccName').value    = existing ? (existing.name   || '') : '';

  // Budget mode
  const modeEl = document.getElementById('ccBudgetMode');
  const mode   = existing?.budgetMode || 'own';
  if (modeEl) modeEl.value = mode;

  // Budget input (disable when mode=sum)
  const budgetEl = document.getElementById('ccBudget');
  if (budgetEl) {
    budgetEl.disabled    = mode === 'sum';
    budgetEl.placeholder = mode === 'sum' ? 'Auto-calculated from children' : 'e.g. 50000';
    budgetEl.value       = mode === 'sum' ? '' : (Number(existing?.budget)||0 ? String(Number(existing?.budget)||0) : '');
  }

  // Parent picker — exclude self and own descendants
  const parentSel = document.getElementById('ccParentSel');
  if (parentSel) {
    parentSel.innerHTML = '<option value="">— None (root) —</option>';
    const forbidden = existing
      ? new Set([existing.id, ..._getDescendants(existing.id)])
      : new Set();
    _centers.forEach(c => {
      if (forbidden.has(c.id)) return;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (existing && existing.parentId === c.id) opt.selected = true;
      parentSel.appendChild(opt);
    });
  }

  // Area checkboxes
  const box = document.getElementById('ccAreaChecks');
  if (!areas.length) {
    box.innerHTML = '<div style="color:#9ca3af;padding:6px 0;font-size:11px;">No areas found.</div>';
  } else {
    const sel = new Set(existing ? (existing.areas || []) : []);
    box.innerHTML = areas.map(a => `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;">
        <input type="checkbox" value="${_esc(a)}" ${sel.has(a)?'checked':''}
               style="width:15px;height:15px;cursor:pointer;accent-color:#1a4f8b;">
        <span style="font-size:12px;">${_esc(a)}</span>
      </label>`).join('');
  }

  _updateModeHint();
  document.getElementById('ccModal').style.display = 'flex';
  setTimeout(() => document.getElementById('ccName').focus(), 30);
}

function _updateModeHint() {
  const mode = document.getElementById('ccBudgetMode')?.value || 'own';
  const hint = document.getElementById('ccModeHint');
  const budgetEl = document.getElementById('ccBudget');
  if (hint) {
    const msgs = {
      own:       'Budget is a fixed amount you set directly on this cost center.',
      sum:       'Budget is auto-calculated as the sum of all child cost centers (field disabled).',
      distribute:'Budget is assigned here and distributed to children — use ⚖️ after saving.'
    };
    hint.textContent = msgs[mode] || '';
  }
  if (budgetEl) {
    budgetEl.disabled    = mode === 'sum';
    budgetEl.placeholder = mode === 'sum' ? 'Auto-calculated from children' : 'e.g. 50000';
    if (mode === 'sum') budgetEl.value = '';
  }
}

function ccModalClose() {
  document.getElementById('ccModal').style.display = 'none';
}

function ccModalSave() {
  const nameEl    = document.getElementById('ccName');
  const budgetEl  = document.getElementById('ccBudget');
  const editId    = document.getElementById('ccEditId').value.trim();
  const parentVal = document.getElementById('ccParentSel')?.value || '';
  const modeVal   = document.getElementById('ccBudgetMode')?.value || 'own';

  const name     = nameEl.value.trim();
  const budget   = parseFloat(budgetEl.value) || 0;
  const parentId = parentVal || null;
  const areas    = Array.from(
    document.querySelectorAll('#ccAreaChecks input[type=checkbox]:checked')
  ).map(cb => cb.value);

  if (!name) { nameEl.style.borderColor = '#dc2626'; nameEl.focus(); return; }
  nameEl.style.borderColor = '';

  // Circular reference guard
  if (editId && parentId && _isCircular(editId, parentId)) {
    _ccStatus('Cannot set parent: would create a circular reference.', true);
    return;
  }

  // Duplicate name guard
  const dup = _centers.find(c => c.name.trim().toLowerCase() === name.toLowerCase() && c.id !== editId);
  if (dup) {
    nameEl.style.borderColor = '#d97706';
    _ccStatus(`A cost center named "${name}" already exists.`, true);
    return;
  }

  const updated = _centers.slice();
  if (editId) {
    const idx = updated.findIndex(c => c.id === editId);
    if (idx >= 0) {
      updated[idx] = {
        ...updated[idx],
        name,
        budget: modeVal === 'sum' ? 0 : budget,
        areas,
        parentId,
        budgetMode:  modeVal,
        allocations: updated[idx].allocations || {}
      };
    } else {
      updated.push({ id: _ccUID(), name, budget: modeVal === 'sum' ? 0 : budget, areas, parentId, budgetMode: modeVal, allocations: {} });
    }
  } else {
    updated.push({ id: _ccUID(), name, budget: modeVal === 'sum' ? 0 : budget, areas, parentId, budgetMode: modeVal, allocations: {} });
  }

  _ccPersist(updated);
  _ccRender();
  ccModalClose();
  _ccStatus(editId ? `"${name}" updated ✅` : `"${name}" created ✅`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Allocation Modal  (distribute parent budget → children)
// ═══════════════════════════════════════════════════════════════════════════

let _allocParentId = null;

function openAllocModal(parentId) {
  const parent = _centers.find(c => c.id === parentId);
  if (!parent) return;
  _allocParentId = parentId;

  document.getElementById('allocParentName').textContent  = parent.name;
  document.getElementById('allocParentTotal').textContent =
    Number(parent.budget||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) + ' SAR';

  const children = _centers.filter(c => c.parentId === parentId);
  const allocs   = parent.allocations || {};

  document.getElementById('allocBody').innerHTML = children.map(child => {
    const a = allocs[child.id] || { type: 'pct', value: '' };
    return `
      <tr data-child-id="${child.id}">
        <td style="padding:8px;font-size:12px;font-weight:700;">${_esc(child.name)}</td>
        <td style="padding:8px;">
          <select class="alloc-type" style="font-size:11px;padding:3px 6px;" onchange="allocCalc()">
            <option value="pct"   ${a.type==='pct'  ?'selected':''}>%</option>
            <option value="fixed" ${a.type==='fixed'?'selected':''}>SAR</option>
          </select>
        </td>
        <td style="padding:8px;">
          <input type="number" class="alloc-value" min="0" step="0.01"
                 value="${_esc(String(a.value||''))}"
                 style="width:90px;font-size:11px;padding:3px 6px;"
                 oninput="allocCalc()"/>
        </td>
        <td style="padding:8px;font-size:11px;font-weight:700;" class="alloc-amount">—</td>
      </tr>`;
  }).join('') || '<tr><td colspan="4" style="padding:12px;color:#9ca3af;font-size:12px;text-align:center;">No child cost centers found. Assign children via Edit.</td></tr>';

  allocCalc();
  document.getElementById('allocModal').style.display = 'flex';
}

function allocCalc() {
  const parent = _centers.find(c => c.id === _allocParentId);
  if (!parent) return;
  const total  = Number(parent.budget) || 0;
  const fmt2   = v => v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

  let grandTotal = 0;
  document.querySelectorAll('#allocBody tr[data-child-id]').forEach(row => {
    const type = row.querySelector('.alloc-type')?.value  || 'pct';
    const val  = parseFloat(row.querySelector('.alloc-value')?.value) || 0;
    const amt  = type === 'pct' ? total * val / 100 : val;
    grandTotal += amt;
    const amtCell = row.querySelector('.alloc-amount');
    if (amtCell) amtCell.textContent = fmt2(amt) + ' SAR';
  });

  const isOver    = grandTotal > total + 0.01;
  const remaining = total - grandTotal;
  const sumEl     = document.getElementById('allocSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;padding:8px 12px;
                  background:${isOver?'#fee2e2':'#f0fdf4'};border-radius:6px;
                  border:1px solid ${isOver?'#fca5a5':'#bbf7d0'};">
        <span style="font-size:11px;">Total: <strong>${fmt2(total)} SAR</strong></span>
        <span style="font-size:11px;color:${isOver?'#dc2626':'#16a34a'};">
          Allocated: <strong>${fmt2(grandTotal)} SAR</strong>
        </span>
        <span style="font-size:11px;color:${isOver?'#dc2626':'#6b7280'};">
          ${isOver
            ? '⚠️ Over by '+fmt2(Math.abs(remaining))+' SAR'
            : fmt2(remaining)+' SAR unallocated'}
        </span>
      </div>`;
  }
  const saveBtn = document.getElementById('allocSaveBtn');
  if (saveBtn) saveBtn.disabled = isOver;
}

function allocClose() {
  document.getElementById('allocModal').style.display = 'none';
  _allocParentId = null;
}

function allocSave() {
  const parent = _centers.find(c => c.id === _allocParentId);
  if (!parent) { allocClose(); return; }

  const total    = Number(parent.budget) || 0;
  const newAlloc = {};
  let   grand    = 0;
  document.querySelectorAll('#allocBody tr[data-child-id]').forEach(row => {
    const childId = row.dataset.childId;
    const type    = row.querySelector('.alloc-type')?.value  || 'pct';
    const value   = parseFloat(row.querySelector('.alloc-value')?.value) || 0;
    newAlloc[childId] = { type, value };
    grand += type === 'pct' ? total * value / 100 : value;
  });

  if (grand > total + 0.01) {
    _ccStatus('Allocations exceed parent budget. Reduce values.', true);
    return;
  }

  // Validate child budgets don't exceed parent allocation
  for (const [childId, alloc] of Object.entries(newAlloc)) {
    const childEff = alloc.type === 'pct' ? total * alloc.value / 100 : alloc.value;
    const child    = _centers.find(c => c.id === childId);
    if (child && (child.budgetMode || 'own') !== 'sum' && child.budget > childEff + 0.01) {
      _ccStatus(`Child "${child.name}" has own budget (${child.budget}) exceeding its allocation (${childEff.toFixed(2)}). Update the child first.`, true);
      return;
    }
  }

  const updated = _centers.map(c => c.id === _allocParentId ? { ...c, allocations: newAlloc } : c);
  _ccPersist(updated);
  _ccRender();
  allocClose();
  _ccStatus('Budget allocations saved ✅');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Delete
// ═══════════════════════════════════════════════════════════════════════════

function ccDelete(id) {
  const c = _centers.find(x => x.id === id);
  if (!c) return;
  const childCount = _centers.filter(x => x.parentId === id).length;
  const msg = childCount
    ? `Delete "${c.name}"?\n\n⚠️ This has ${childCount} child cost center${childCount>1?'s':''}.\nChildren will become root-level (no parent).`
    : `Delete "${c.name}"?\nThis cannot be undone.`;
  if (!confirm(msg)) return;
  const updated = _centers
    .filter(x => x.id !== id)
    .map(x => x.parentId === id ? { ...x, parentId: null } : x);
  _ccPersist(updated);
  _ccRender();
  _ccStatus(`"${c.name}" deleted.`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Manual cloud toolbar buttons
// ═══════════════════════════════════════════════════════════════════════════

async function ccSaveCloud() {
  if (!_ccKey()) return;
  _ccStatus('Saving to cloud…');
  try   { await _ccSaveCloud(_centers); _ccStatus('Saved to cloud ✅'); }
  catch (e) { _ccStatus('Save failed: '+(e?.message||e), true); }
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

// ═══════════════════════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════════════════════

(async function ccInit() {
  const now = new Date();
  const mf = document.getElementById('ccMonthFilter');
  const yf = document.getElementById('ccYearFilter');
  if (mf) mf.value = String(now.getMonth() + 1);
  if (yf) yf.value = String(now.getFullYear());

  _centers     = _ccLoadLocal();
  _consumption = _loadConsumptionLocal();
  _ccRender();

  const [cloudData, , cloudCons] = await Promise.all([
    _ccLoadCloud(),
    _ccAreasList().length ? Promise.resolve() : _ccSyncAreasList(),
    _loadConsumptionCloud()
  ]);

  if (Array.isArray(cloudData)) { _centers = cloudData; _ccSaveLocal(cloudData); }
  if (Array.isArray(cloudCons) && cloudCons.length) {
    _consumption = cloudCons;
    localStorage.setItem(CONSUMPTION_KEY, JSON.stringify(cloudCons));
  }

  _ccRender();
  if (!_ccAreasList().length)
    _ccStatus('No areas found — add areas via Staff Management first.', true);
})();
