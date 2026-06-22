/* ══════════════════════════════════════════════════════════════════════
   Pre-Approval Location & Justification Picker  (shared by OT + BCOT)
   Custom entries are persisted alongside baked-in defaults.

   API:
     PreApprovalPicker.open({ currentLoc, currentJust, onConfirm })
     onConfirm(loc, just, applyAll) — applyAll=true means "all rows"
══════════════════════════════════════════════════════════════════════ */
window.PreApprovalPicker = (() => {
  'use strict';

  const LOC_KEY  = 'BCOT_PREAP_LOCS_V1';
  const JUST_KEY = 'BCOT_PREAP_JUSTS_V1';

  const DEFAULT_LOCS = [
    'KASCH', 'KAMC-WR', 'IP', 'OP', 'ER', 'ICU',
    'Oncology', 'NSTC', 'ACC', 'OB/GYN', 'Pediatrics',
  ];

  const DEFAULT_JUSTS = [
    'WEEKEND DUTY',
    'HOLIDAY DUTY',
    'ON-CALL DUTY',
    'EMERGENCY COVERAGE',
    'STAFF SHORTAGE COVERAGE',
    'EXTENDED SHIFT',
    'RELIEF DUTY',
    'CATERING PRESCRIPTIONS FOR BUSINESS CENTER (PRIVATE PATIENTS)',
  ];

  function _e(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                          .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _get(key, defs) {
    try {
      const custom = JSON.parse(localStorage.getItem(key) || '[]') || [];
      const list   = [...defs];
      custom.forEach(v => { if (v && !list.includes(v)) list.push(v); });
      return list;
    } catch { return [...defs]; }
  }

  function _save(key, defs, list) {
    localStorage.setItem(key, JSON.stringify(list.filter(v => !defs.includes(v))));
  }

  function getLocs()  { return _get(LOC_KEY,  DEFAULT_LOCS);  }
  function getJusts() { return _get(JUST_KEY, DEFAULT_JUSTS); }

  function addLoc(v) {
    v = v.trim(); if (!v) return;
    const list = getLocs();
    if (!list.includes(v)) { list.push(v); _save(LOC_KEY, DEFAULT_LOCS, list); }
  }
  function addJust(v) {
    v = v.trim(); if (!v) return;
    const list = getJusts();
    if (!list.includes(v)) { list.push(v); _save(JUST_KEY, DEFAULT_JUSTS, list); }
  }

  function _opts(items, cur) {
    return items.map(it =>
      `<option value="${_e(it)}"${it === cur ? ' selected' : ''}>${_e(it)}</option>`
    ).join('');
  }

  function open({ currentLoc = '', currentJust = '', onConfirm }) {
    document.getElementById('_papBd')?.remove();

    const bd = document.createElement('div');
    bd.id = '_papBd';
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.48);z-index:9900;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';

    bd.innerHTML = `
      <div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.32);width:min(500px,96%);overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1a4f8b,#2e8b57);padding:13px 18px;display:flex;align-items:center;justify-content:space-between;">
          <span style="color:#fff;font-size:13px;font-weight:700;letter-spacing:.3px;">📍 Location &amp; Justification</span>
          <button id="_papX" style="background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;">✕</button>
        </div>
        <div style="padding:18px 20px;">

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Location</label>
            <select id="_papLS" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:12px;background:#f9fafb;outline:none;cursor:pointer;">
              <option value="">— Select location —</option>
              ${_opts(getLocs(), currentLoc)}
            </select>
            <div style="margin-top:7px;display:flex;gap:6px;">
              <input id="_papLN" type="text" placeholder="Add new location…" maxlength="60"
                style="flex:1;border:1.5px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:11px;outline:none;"/>
              <button id="_papLA" style="background:#1a4f8b;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">+ Add</button>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Justification</label>
            <select id="_papJS" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:12px;background:#f9fafb;outline:none;cursor:pointer;">
              <option value="">— Select justification —</option>
              ${_opts(getJusts(), currentJust)}
            </select>
            <div style="margin-top:7px;display:flex;gap:6px;">
              <input id="_papJN" type="text" placeholder="Add new justification…" maxlength="140"
                style="flex:1;border:1.5px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:11px;outline:none;"/>
              <button id="_papJA" style="background:#1a4f8b;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">+ Add</button>
            </div>
          </div>

        </div>
        <div style="padding:10px 20px 16px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button id="_papCn" style="background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:8px 18px;font-size:12px;cursor:pointer;font-weight:600;">Cancel</button>
          <button id="_papAA" style="background:#0f766e;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">✓ Apply to all rows</button>
          <button id="_papAR" style="background:#1a4f8b;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">✓ This row</button>
        </div>
      </div>`;

    document.body.appendChild(bd);

    const $ = id => bd.querySelector(id);
    const dismiss = () => bd.remove();

    bd.addEventListener('click', e => { if (e.target === bd) dismiss(); });
    $('#_papX').addEventListener('click', dismiss);
    $('#_papCn').addEventListener('click', dismiss);

    function doAddLoc() {
      const v = $('#_papLN').value.trim(); if (!v) return;
      addLoc(v);
      const sel = $('#_papLS');
      if (!Array.from(sel.options).some(o => o.value === v)) sel.appendChild(new Option(v, v));
      sel.value = v;
      $('#_papLN').value = '';
    }
    $('#_papLA').addEventListener('click', doAddLoc);
    $('#_papLN').addEventListener('keydown', e => { if (e.key === 'Enter') doAddLoc(); });

    function doAddJust() {
      const v = $('#_papJN').value.trim(); if (!v) return;
      addJust(v);
      const sel = $('#_papJS');
      if (!Array.from(sel.options).some(o => o.value === v)) sel.appendChild(new Option(v, v));
      sel.value = v;
      $('#_papJN').value = '';
    }
    $('#_papJA').addEventListener('click', doAddJust);
    $('#_papJN').addEventListener('keydown', e => { if (e.key === 'Enter') doAddJust(); });

    function apply(all) {
      const loc  = $('#_papLS').value;
      const just = $('#_papJS').value;
      onConfirm(loc, just, all);
      dismiss();
    }
    $('#_papAR').addEventListener('click', () => apply(false));
    $('#_papAA').addEventListener('click', () => apply(true));
  }

  return { open, getLocs, getJusts, addLoc, addJust };
})();
