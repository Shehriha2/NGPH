    const AREAS_LIST_KEY     = "BCOT_AREAS_LIST_V1";
    const STAFF_RECORDS_KEY  = "BCOT_STAFF_RECORDS_V2";   // unified pool
    const ROLES_KEY          = "BCOT_ROLES_LIST";
    const DEFAULT_ROLES      = ["Pharmacist", "Technician", "Pharmacy Aide",
      "Admin Assistant", "Associate Clinical Pharmacist", "Clinical Pharmacist",
      "Clinical Pharmacy Specialist", "Manager", "Supervisor", "Assistant Director", "Director"];

    let staffRecords = [];   // full in-memory list (all areas)

    // ── Status ─────────────────────────────────────────────────────────────────
    function showStatusMessage(msg, isError = false) {
      const el = document.querySelector(".status-message");
      el.textContent = msg;
      el.className = "status-message " + (isError ? "status-error" : "status-success");
      el.style.display = "block";
      setTimeout(() => el.style.display = "none", 3200);
    }

    // ── Key helpers ────────────────────────────────────────────────────────────
    function getKeyOrWarn() {
      const key = (window.BCOT_APP_KEY || "").trim();
      if (!key) { showStatusMessage("config.js not found — cloud sync disabled.", true); return null; }
      return key;
    }

    // ── Area helpers ───────────────────────────────────────────────────────────
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
      if (area && !list.includes(area)) {
        list.push(area); list.sort();
        localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(list));
      }
    }
    function getCurrentFilter() {
      return (document.getElementById("areaFilter")?.value || "ALL").toUpperCase();
    }

    // ── Role helpers ───────────────────────────────────────────────────────────
    function getRolesList() {
      try {
        const r = JSON.parse(localStorage.getItem(ROLES_KEY) || "[]");
        return (Array.isArray(r) && r.length) ? r : [...DEFAULT_ROLES];
      } catch { return [...DEFAULT_ROLES]; }
    }

    function saveRoleToList(role) {
      role = role.trim();
      if (!role) return;
      const list = getRolesList();
      if (!list.includes(role)) {
        list.push(role);
        localStorage.setItem(ROLES_KEY, JSON.stringify(list));
      }
    }

    function rebuildRoleSelects() {
      const roles = getRolesList();
      ["stRole", "importRole"].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = roles.map(r => `<option${r === cur ? " selected" : ""}>${escapeHtml(r)}</option>`).join("");
      });
      renderRoleTags();
    }

    function renderRoleTags() {
      const container = document.getElementById("roleTagsContainer");
      if (!container) return;
      const roles = getRolesList();
      container.innerHTML = roles.map(r => {
        const isDef = DEFAULT_ROLES.includes(r);
        return `<span style="display:inline-flex;align-items:center;gap:3px;background:#dbeafe;color:#1e40af;
          font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;white-space:nowrap;">
          ${escapeHtml(r)}${isDef ? "" : `<button type="button" onclick="removeRole('${escapeHtml(r)}')"
            style="background:none;border:none;cursor:pointer;color:#1e40af;padding:0 0 0 2px;font-size:12px;line-height:1;"
            title="Remove">✕</button>`}
        </span>`;
      }).join("");
    }

    function addCustomRole() {
      const input = document.getElementById("newRoleInput");
      const val = (input?.value || "").trim();
      if (!val) return;
      if (getRolesList().includes(val)) { showStatusMessage(`"${val}" already exists.`, true); return; }
      saveRoleToList(val);
      rebuildRoleSelects();
      ["stRole", "importRole"].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) sel.value = val;
      });
      if (input) input.value = "";
      showStatusMessage(`Role "${val}" added ✅`);
    }

    function removeRole(role) {
      if (DEFAULT_ROLES.includes(role)) return;
      const list = getRolesList().filter(r => r !== role);
      localStorage.setItem(ROLES_KEY, JSON.stringify(list));
      rebuildRoleSelects();
      showStatusMessage(`Role "${role}" removed.`);
    }

    function rebuildAreaUI() {
      const list = getAreasList();

      // filter select
      const sel  = document.getElementById("areaFilter");
      const prev = sel.value;
      sel.innerHTML = '<option value="ALL">All Areas</option>';
      list.forEach(a => { const o = document.createElement("option"); o.value = a; o.textContent = a; sel.appendChild(o); });
      if (prev && (prev === "ALL" || list.includes(prev))) sel.value = prev;

      // add-form area button — pre-fill with current filter if specific area
      const stAreaBtn = document.getElementById("stAreaBtn");
      if (stAreaBtn && prev !== "ALL" && list.includes(prev) && !document.getElementById("stAreaValue")?.value) {
        document.getElementById("stAreaValue").value = prev;
        stAreaBtn.textContent = prev;
        stAreaBtn.classList.remove("empty");
      }

      // shared datalist for row area inputs
      const dl = document.getElementById("areasDatalist");
      dl.innerHTML = "";
      list.forEach(a => { const o = document.createElement("option"); o.value = a; dl.appendChild(o); });

      // Copy-to-area bulk dropdown
      const bulkSel = document.getElementById("copyTargetAreaBulk");
      if (bulkSel) {
        const bulkPrev = bulkSel.value;
        bulkSel.innerHTML = '<option value="">— Target Area —</option>';
        list.forEach(a => { const o = document.createElement("option"); o.value = a; o.textContent = a; bulkSel.appendChild(o); });
        if (bulkPrev && list.includes(bulkPrev)) bulkSel.value = bulkPrev;
      }

      // Import-from-Excel area dropdown
      const impArea = document.getElementById("importArea");
      if (impArea) {
        const impPrev = impArea.value;
        impArea.innerHTML = '<option value="">— Area —</option>';
        list.forEach(a => { const o = document.createElement("option"); o.value = a; o.textContent = a; impArea.appendChild(o); });
        if (impPrev && list.includes(impPrev)) impArea.value = impPrev;
        // default to current filter
        if (!impArea.value && prev !== "ALL" && list.includes(prev)) impArea.value = prev;
      }
    }

    function addNewArea() {
      const raw = (document.getElementById("newAreaInput").value || "")
        .trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,20);
      if (!raw) { showStatusMessage("Enter a valid area name.", true); return; }
      saveAreaToList(raw);
      rebuildAreaUI();
      document.getElementById("areaFilter").value = raw;
      document.getElementById("newAreaInput").value = "";
      applyAreaFilter();
      showStatusMessage(`Area "${raw}" added ✅`);
    }

    function clearSearch() {
      document.getElementById("staffSearch").value = "";
      applyAreaFilter();
    }

    function applyAreaFilter() {
      const filter = getCurrentFilter();
      if (filter !== "ALL") localStorage.setItem("BCOT_CURRENT_AREA_V1", filter);

      const query = (document.getElementById("staffSearch")?.value || "").trim().toLowerCase();
      let visible = 0;

      Array.from(document.querySelectorAll("#tbody tr")).forEach(tr => {
        const rowArea   = (tr.querySelector(".area-pick-btn")?.dataset?.areas || "").trim().toUpperCase();
        const staffAreas = rowArea.split(",").map(x => x.trim()).filter(Boolean);
        const areaOk    = filter === "ALL" || staffAreas.includes(filter);

        let searchOk = true;
        if (query) {
          const name  = (tr.cells[1]?.textContent || "").toLowerCase();
          const badge = (tr.cells[2]?.textContent || "").toLowerCase();
          searchOk = name.includes(query) || badge.includes(query);
        }

        const hide = !(areaOk && searchOk);
        tr.classList.toggle("hidden-row", hide);
        if (!hide) visible++;
      });

      // Update result count
      const total   = document.querySelectorAll("#tbody tr").length;
      const countEl = document.getElementById("searchResultCount");
      if (countEl) {
        countEl.textContent = (query || filter !== "ALL")
          ? `${visible} of ${total} staff shown`
          : `${total} staff total`;
      }
    }

    // ── Record helpers ─────────────────────────────────────────────────────────
    function normalizeRecord(r) {
      return {
        name:         String(r?.name         || "").trim(),
        badge:        String(r?.badge        || "").trim(),
        role:         String(r?.role         || "Pharmacist").trim() || "Pharmacist",
        hrr:          Number(r?.hrr         ?? 0) || 0,
        area:         String(r?.area         || "").trim().toUpperCase(),
        contractDate: String(r?.contractDate || "").trim(),
      };
    }

    // ── Auto-save to cloud ────────────────────────────────────────────────────
    let _cloudSaveTimer = null;
    function setCloudSaveStatus(status) {
      const el = document.getElementById('cloudSaveStatus');
      if (!el) return;
      const s = {
        pending: { text:'⏳ Pending…',          color:'#d97706', bg:'#fefce8' },
        saving:  { text:'☁ Saving to cloud…',  color:'#2563eb', bg:'#eff6ff' },
        saved:   { text:'✅ Saved to cloud',    color:'#16a34a', bg:'#f0fdf4' },
        error:   { text:'❌ Save failed',        color:'#dc2626', bg:'#fef2f2' },
      }[status];
      if (!s) return;
      el.textContent = s.text; el.style.color = s.color; el.style.background = s.bg;
      if (status === 'saved') setTimeout(() => { el.textContent=''; el.style.background='transparent'; }, 3000);
    }
    function scheduleCloudSave() {
      if (!staffRecords.length) return;   // never overwrite cloud with an empty list
      clearTimeout(_cloudSaveTimer);
      setCloudSaveStatus('pending');
      _cloudSaveTimer = setTimeout(async () => {
        setCloudSaveStatus('saving');
        try {
          const key = getKeyOrWarn(); if (!key) { setCloudSaveStatus('error'); return; }
          await window.FB.setDoc(getStaffDocRef(key, STAFF_CLOUD_DOC), {
            savedAt: new Date().toISOString(), records: staffRecords, areasList: getAreasList()
          }, { merge: true });
          setCloudSaveStatus('saved');
        } catch(e) { console.error(e); setCloudSaveStatus('error'); }
      }, 1500);
    }

    function writeLocalKeys() {
      localStorage.setItem(STAFF_RECORDS_KEY, JSON.stringify(staffRecords));

      // Also write per-area derived keys — split comma-separated areas so each area gets its own key
      const byArea = {};
      staffRecords.forEach(s => {
        const areas = (s.area || "").split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
        const targets = areas.length ? areas : ["ALL"];
        targets.forEach(a => {
          if (!byArea[a]) byArea[a] = [];
          byArea[a].push(s);
        });
      });
      const allNames = staffRecords.map(s => s.name).filter(Boolean);
      localStorage.setItem("BCOT_STAFF_LIST_ALL", JSON.stringify(allNames));
      Object.entries(byArea).forEach(([area, recs]) => {
        localStorage.setItem(`BCOT_STAFF_LIST_${area}`, JSON.stringify(recs.map(s => s.name)));
        const hrrMap = {};
        recs.forEach(s => { if (s.name) hrrMap[s.name] = s.hrr; });
        localStorage.setItem(`BCOT_STAFF_HRR_MAP_${area}`, JSON.stringify(hrrMap));
      });
      scheduleCloudSave();  // auto-save to cloud after every data change
    }

    function readRecordsFromLocal() {
      try {
        const raw = localStorage.getItem(STAFF_RECORDS_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) return arr.map(normalizeRecord).filter(s => s.name);
        }
      } catch {}
      return [];
    }

    function escapeHtml(str) {
      return String(str ?? "")
        .replaceAll("&","&amp;").replaceAll("<","&lt;")
        .replaceAll(">","&gt;").replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

    // ── Render table ───────────────────────────────────────────────────────────
    function renderTable() {
      const tbody = document.getElementById("tbody");
      tbody.innerHTML = "";
      staffRecords.forEach((s, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.badge)}</td>
          <td>${escapeHtml(s.role)}</td>
          <td>${escapeHtml(s.contractDate || '—')}</td>
          <td>${Number(s.hrr || 0).toFixed(2)}</td>
          <td>
            <button type="button" class="area-pick-btn ${s.area ? '' : 'empty'}" data-i="${idx}" data-areas="${escapeHtml(s.area)}">
              ${escapeHtml(s.area || '— Select —')}
            </button>
          </td>
          <td style="white-space:nowrap;">
            <button type="button" class="edit-btn" data-i="${idx}" style="background:#0f766e;color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;">Edit</button>
            <button type="button" class="delete-btn" data-i="${idx}" style="margin-left:4px;">Delete</button>
            <button type="button" class="copy-btn" data-i="${idx}" style="background:#0284c7;color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;margin-left:4px;">Copy→Area</button>
          </td>
        `;

        // open area picker when clicking the area button
        tr.querySelector(".area-pick-btn").addEventListener("click", function() {
          const i = Number(this.getAttribute("data-i"));
          const btn = this;
          openAreaPickerModal("Assign Areas — " + escapeHtml(staffRecords[i].name), staffRecords[i].area || "", newAreas => {
            staffRecords[i].area = newAreas;
            btn.textContent = newAreas || "— Select —";
            btn.dataset.areas = newAreas;
            btn.classList.toggle("empty", !newAreas);
            if (newAreas) { newAreas.split(",").forEach(a => { if (a.trim()) saveAreaToList(a.trim()); }); rebuildAreaUI(); }
            writeLocalKeys();
            applyAreaFilter();
          });
        });

        tbody.appendChild(tr);
      });

      tbody.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-i"));
          if (!Number.isFinite(i)) return;
          openEditModal(i);
        });
      });

      tbody.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-i"));
          if (!Number.isFinite(i)) return;
          if (!confirm("Delete this staff member?")) return;
          staffRecords.splice(i, 1);
          renderTable();
          writeLocalKeys();
          applyAreaFilter();
          showStatusMessage("Deleted ✅");
        });
      });

      tbody.querySelectorAll(".copy-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-i"));
          if (!Number.isFinite(i)) return;
          const src = staffRecords[i];
          const areas = getAreasList().filter(a => a !== src.area);
          if (!areas.length) { showStatusMessage("No other areas available. Add an area first.", true); return; }

          // Build a small popup modal for area selection
          const existing = document.getElementById("copyAreaModal");
          if (existing) existing.remove();

          const modal = document.createElement("div");
          modal.id = "copyAreaModal";
          modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:3000;";
          modal.innerHTML = `
            <div style="background:#fff;border-radius:10px;padding:20px;min-width:280px;box-shadow:0 8px 30px rgba(0,0,0,.2);">
              <h3 style="margin:0 0 12px;font-size:13px;color:#1a4f8b;">Copy <b>${escapeHtml(src.name)}</b> to area:</h3>
              <select id="copyTargetArea" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;font-size:12px;margin-bottom:14px;">
                ${areas.map(a => `<option value="${a}">${a}</option>`).join("")}
              </select>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="copyConfirmBtn" style="background:#0284c7;color:#fff;border:none;border-radius:6px;padding:7px 16px;font-size:12px;cursor:pointer;font-weight:700;">Copy</button>
                <button id="copyCancelBtn" style="background:#6b7280;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;">Cancel</button>
              </div>
            </div>
          `;
          document.body.appendChild(modal);

          document.getElementById("copyCancelBtn").onclick = () => modal.remove();
          modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

          document.getElementById("copyConfirmBtn").onclick = () => {
            const targetArea = document.getElementById("copyTargetArea").value;
            if (!targetArea) { modal.remove(); return; }
            // Duplicate check by badge number (fall back to name if no badge)
            const dupInTarget = src.badge
              ? staffRecords.some(x => x.badge && x.badge === src.badge && x.area === targetArea)
              : staffRecords.some(x => x.name.toLowerCase() === src.name.toLowerCase() && x.area === targetArea);
            if (dupInTarget) {
              showStatusMessage(`"${src.name}" (badge: ${src.badge||'N/A'}) already exists in area ${targetArea}.`, true);
              modal.remove(); return;
            }
            staffRecords.push({ name: src.name, badge: src.badge, role: src.role, hrr: src.hrr, area: targetArea });
            renderTable();
            writeLocalKeys();
            modal.remove();
            showStatusMessage(`Copied "${src.name}" to area ${targetArea} ✅`);
          };
        });
      });

      applyAreaFilter();
    }

    // ── Area picker modal ─────────────────────────────────────────────────────
    function openAreaPickerModal(title, currentAreas, callback) {
      const existing = document.getElementById("areaPickerModal");
      if (existing) existing.remove();
      const areas = getAreasList();
      if (!areas.length) { showStatusMessage("No areas defined yet. Add an area first.", true); return; }
      const selected = new Set((currentAreas || "").split(",").map(x => x.trim().toUpperCase()).filter(Boolean));
      const modal = document.createElement("div");
      modal.id = "areaPickerModal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:4000;";
      modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:20px 24px;min-width:260px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.25);">
          <h3 style="margin:0 0 14px;font-size:13px;color:#1a4f8b;">${title}</h3>
          <div id="areaCheckList" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;margin-bottom:16px;">
            ${areas.map(a => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:7px 10px;border-radius:6px;border:1px solid ${selected.has(a)?'#bfdbfe':'#e5e7eb'};background:${selected.has(a)?'#eff6ff':'#fff'};">
                <input type="checkbox" value="${a}" ${selected.has(a)?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:#1a4f8b;"/>
                <span style="font-weight:${selected.has(a)?'700':'400'};color:#1f2937;">${a}</span>
              </label>`).join("")}
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="areaPickApply" style="background:#1a4f8b;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:12px;cursor:pointer;font-weight:700;">Apply</button>
            <button id="areaPickCancel" style="background:#6b7280;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      document.getElementById("areaPickCancel").onclick = () => modal.remove();
      modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
      document.getElementById("areaPickApply").onclick = () => {
        const checked = Array.from(modal.querySelectorAll("#areaCheckList input:checked"))
          .map(cb => cb.value.trim().toUpperCase()).filter(Boolean);
        callback(checked.join(","));
        modal.remove();
      };
    }

    // ── Add staff ──────────────────────────────────────────────────────────────
    function addStaff() {
      const name  = (document.getElementById("stName").value  || "").trim();
      const badge = (document.getElementById("stBadge").value || "").trim();
      const role  = document.getElementById("stRole").value  || "Pharmacist";
      const hrr   = Number(document.getElementById("stHRR").value  || 0) || 0;
      const area  = (document.getElementById("stAreaValue").value || "").trim().toUpperCase();

      if (!name) { showStatusMessage("Name is required.", true); return; }
      if (badge && staffRecords.some(x => x.badge && x.badge === badge && x.area === area))
        { showStatusMessage(`Badge "${badge}" already exists in area ${area||'(none)'}.`, true); return; }
      if (!badge && staffRecords.some(x => x.name.toLowerCase() === name.toLowerCase() && x.area === area))
        { showStatusMessage("This staff name already exists in this area.", true); return; }

      if (area) saveAreaToList(area);
      staffRecords.push({ name, badge, role, hrr, area });
      renderTable();
      writeLocalKeys();
      rebuildAreaUI();
      showStatusMessage("Added ✅");

      document.getElementById("stName").value  = "";
      document.getElementById("stBadge").value = "";
      document.getElementById("stHRR").value   = "";
      document.getElementById("stAreaValue").value = "";
      const stBtn = document.getElementById("stAreaBtn");
      if (stBtn) { stBtn.textContent = "— Area —"; stBtn.classList.add("empty"); }
      document.getElementById("stName").focus();
    }

    function saveStaffLocal() {
      writeLocalKeys();
      showStatusMessage(`Saved ${staffRecords.length} staff locally ✅`);
    }

    function loadStaffLocal() {
      staffRecords = readRecordsFromLocal();
      renderTable();
      writeLocalKeys();
      showStatusMessage(`Loaded ${staffRecords.length} staff ✅`);
    }

    function clearStaffLocal() {
      if (!confirm("Clear the COMPLETE staff pool? This removes all staff across all areas and cannot be undone.")) return;
      localStorage.removeItem(STAFF_RECORDS_KEY);
      staffRecords = [];
      renderTable();
      writeLocalKeys();
      showStatusMessage("Complete staff pool cleared ✅");
    }

    // ── Bulk copy to area ──────────────────────────────────────────────────────
    function doCopyToArea(sourceRecords, targetArea) {
      if (!targetArea) { showStatusMessage("Select a target area first.", true); return; }
      let copied = 0, skipped = 0;
      sourceRecords.forEach(src => {
        const dup = src.badge
          ? staffRecords.some(x => x.badge && x.badge === src.badge && x.area === targetArea)
          : staffRecords.some(x => x.name.toLowerCase() === src.name.toLowerCase() && x.area === targetArea);
        if (dup) { skipped++; return; }
        staffRecords.push({ name: src.name, badge: src.badge, role: src.role, hrr: src.hrr, area: targetArea });
        copied++;
      });
      if (copied) { renderTable(); writeLocalKeys(); applyAreaFilter(); }
      const msg = `Copied ${copied} to ${targetArea}${skipped ? `, skipped ${skipped} duplicate(s) (badge check)` : ''} ✅`;
      showStatusMessage(msg, copied === 0);
    }

    function copyVisibleToArea() {
      const targetArea = (document.getElementById("copyTargetAreaBulk").value || "").trim();
      if (!targetArea) { showStatusMessage("Select a target area first.", true); return; }
      const filter = getCurrentFilter();
      const source = filter === "ALL" ? [...staffRecords] : staffRecords.filter(s => (s.area||"").toUpperCase().split(",").map(x=>x.trim()).includes(filter));
      if (!source.length) { showStatusMessage("No visible staff to copy.", true); return; }
      doCopyToArea(source, targetArea);
    }

    function copyAllToArea() {
      const targetArea = (document.getElementById("copyTargetAreaBulk").value || "").trim();
      if (!targetArea) { showStatusMessage("Select a target area first.", true); return; }
      if (!staffRecords.length) { showStatusMessage("No staff to copy.", true); return; }
      doCopyToArea([...staffRecords], targetArea);
    }

    // ── Edit staff record (reflects across all areas by badge match) ───────────
    function openEditModal(idx) {
      const rec = staffRecords[idx];
      if (!rec) return;

      const existing = document.getElementById("editStaffModal");
      if (existing) existing.remove();

      let _editAreas = rec.area || "";

      const modal = document.createElement("div");
      modal.id = "editStaffModal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:3000;";
      modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:22px 24px;min-width:360px;max-width:540px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.25);max-height:92vh;overflow-y:auto;">
          <h3 style="margin:0 0 16px;font-size:13px;color:#1a4f8b;">Edit Staff Record</h3>
          <div style="display:grid;gap:10px;">
            <label style="font-size:11px;font-weight:700;color:#374151;">Name
              <input id="editName" type="text" value="${escapeHtml(rec.name)}"
                style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"/>
            </label>
            <label style="font-size:11px;font-weight:700;color:#374151;">Badge No.
              <input id="editBadge" type="text" value="${escapeHtml(rec.badge)}"
                style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"/>
            </label>
            <label style="font-size:11px;font-weight:700;color:#374151;">Role
              <select id="editRole" style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;">
                ${getRolesList().map(r => `<option${r===rec.role?' selected':''}>${escapeHtml(r)}</option>`).join('')}
              </select>
            </label>
            <label style="font-size:11px;font-weight:700;color:#374151;">HRR
              <input id="editHRR" type="number" step="0.01" value="${rec.hrr||0}"
                style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"/>
            </label>
            <label style="font-size:11px;font-weight:700;color:#374151;">Contract Date
              <input id="editContractDate" type="date" value="${escapeHtml(rec.contractDate||'')}"
                style="display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;"/>
            </label>
            <label style="font-size:11px;font-weight:700;color:#374151;">Areas (this record only)
              <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
                <div id="editAreaDisplay" style="flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;background:#f9fafb;min-height:32px;color:#374151;word-break:break-all;">
                  ${escapeHtml(rec.area || '—')}
                </div>
                <button type="button" id="editAreaBtn" style="background:#1a4f8b;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0;">Edit Areas</button>
              </div>
            </label>
            <div style="font-size:10px;color:#6b7280;background:#f9fbfd;border-radius:6px;padding:6px 8px;">
              ℹ️ Name, Badge, Role, HRR and Contract Date changes apply to <b>all area copies</b> of this staff member (matched by badge). Area change applies only to this record.
            </div>
            <!-- Lieu days balance (read-only, fetched from Firestore) -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;">
              <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:5px;">Lieu Days Balance</div>
              <div id="editLieuBalance" style="font-size:12px;color:#374151;">Loading…</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
            <button id="editSaveBtn"   style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:12px;cursor:pointer;font-weight:700;">Save Changes</button>
            <button id="editCancelBtn" style="background:#6b7280;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      // ── Fetch lieu balance asynchronously ────────────────────────────────────
      (async () => {
        const balEl = document.getElementById("editLieuBalance");
        if (!balEl || !window.FB || !rec.badge) {
          if (balEl) balEl.textContent = rec.badge ? "Firebase not ready." : "No badge — save a badge to track lieu days.";
          return;
        }
        const k = (window.BCOT_APP_KEY || "").trim();
        if (!k) { balEl.textContent = "App key missing."; return; }
        try {
          const snap = await window.FB.getDoc(
            window.FB.doc(window.FB.db, "bcot_overtime_secure", k, "lieu_days", rec.badge)
          );
          if (!snap.exists()) {
            balEl.innerHTML = `Not set up yet. <a href="LieuDays.html" target="_blank"
              style="color:#0f766e;font-weight:700;">Set up in Lieu Days page ↗</a>`;
            return;
          }
          const lieu = snap.data() || {};
          const starting = Number(lieu.startingBalance) || 0;
          let earned = 0, used = 0, adjusted = 0;
          (lieu.transactions || []).forEach(t => {
            const d = Number(t.days) || 0;
            if (t.type === "earn")   earned   += d;
            if (t.type === "use")    used     += d;
            if (t.type === "adjust") adjusted += d;
          });
          const current = starting + earned - used + adjusted;
          const clr = current > 0 ? "#166534" : current < 0 ? "#dc2626" : "#64748b";
          const fmt = n => (n === Math.floor(n) ? String(n) : n.toFixed(1));
          balEl.innerHTML =
            `<span style="color:#64748b;">${fmt(starting)} starting + ${fmt(earned)} earned − ${fmt(used)} used`
            + ` + ${adjusted >= 0 ? '' : '−'}${fmt(Math.abs(adjusted))} adj =</span>`
            + ` <strong style="color:${clr};font-size:14px;">${fmt(current)} days</strong>`
            + ` <a href="LieuDays.html" target="_blank" style="margin-left:8px;font-size:11px;color:#0f766e;">Manage ↗</a>`;
        } catch (e) {
          if (balEl) balEl.textContent = "Could not load lieu balance.";
        }
      })();

      document.getElementById("editCancelBtn").onclick = () => modal.remove();
      modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

      document.getElementById("editAreaBtn").onclick = () => {
        openAreaPickerModal("Edit Areas — " + escapeHtml(rec.name), _editAreas, newAreas => {
          _editAreas = newAreas;
          document.getElementById("editAreaDisplay").textContent = newAreas || "—";
        });
      };

      document.getElementById("editSaveBtn").onclick = () => {
        const newName         = document.getElementById("editName").value.trim();
        const newBadge        = document.getElementById("editBadge").value.trim();
        const newRole         = document.getElementById("editRole").value;
        const newHRR          = parseFloat(document.getElementById("editHRR").value) || 0;
        const newContractDate = (document.getElementById("editContractDate").value || "").trim();
        const newArea         = _editAreas.toUpperCase();

        if (!newName) { alert("Name is required."); return; }

        const oldBadge = rec.badge;

        // Update ALL records with same badge (across all areas) — name, badge, role, HRR, contractDate
        staffRecords.forEach(r => {
          if (oldBadge && r.badge === oldBadge) {
            r.name         = newName;
            r.badge        = newBadge;
            r.role         = newRole;
            r.hrr          = newHRR;
            r.contractDate = newContractDate;
          }
        });
        // Area change only for this specific record
        staffRecords[idx].area = newArea;
        if (newArea) newArea.split(",").forEach(a => { if (a.trim()) saveAreaToList(a.trim()); });

        renderTable();
        writeLocalKeys();
        rebuildAreaUI();
        applyAreaFilter();
        modal.remove();
        showStatusMessage("Staff record updated across all areas ✅");
      };
    }

    // ── Import from Excel ──────────────────────────────────────────────────────
    function importFromExcel(input) {
      const file = input.files[0];
      if (!file) return;
      // Reset so same file can be re-selected if needed
      input.value = "";

      const role   = document.getElementById("importRole").value  || "Pharmacist";
      const area   = (document.getElementById("importArea").value || "").trim();
      const hrr    = parseFloat(document.getElementById("importHRR").value) || 0;

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const wb   = XLSX.read(e.target.result, { type: "array" });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

          // Build badge set for duplicate check
          const existingBadges = new Set(staffRecords.map(s => (s.badge || "").toString().trim()));

          let added = 0, skipped = 0, invalid = 0;
          const toAdd = [];

          rows.forEach(row => {
            // Cell may be in column A (index 0)
            const raw = String(row[0] || "")
              .replace(/ /g, " ")   // non-breaking spaces → normal space
              .trim();
            if (!raw) return;

            // Match: "Name (Badge)" — badge is digits inside last parentheses
            const match = raw.match(/^(.+?)\s*\((\d+)\)\s*$/);
            if (!match) { invalid++; return; }

            const name  = match[1].trim();
            const badge = match[2].trim();
            if (!name || !badge) { invalid++; return; }

            // Badge-based duplicate check
            if (existingBadges.has(badge)) { skipped++; return; }

            existingBadges.add(badge);
            // Store full "Name (Badge)" string as the name, badge extracted separately
          toAdd.push({ name: raw, badge, role, hrr, area: area || "" });
            added++;
          });

          // Add all new records
          toAdd.forEach(rec => {
            staffRecords.push(normalizeRecord(rec));
            if (rec.area) saveAreaToList(rec.area);
          });

          if (added) {
            writeLocalKeys();
            renderTable();
            rebuildAreaUI();
          }

          showStatusMessage(
            `Excel import: ${added} added, ${skipped} duplicate(s) skipped${invalid ? ", " + invalid + " unrecognised row(s)" : ""} ✅`,
            added === 0
          );
        } catch(err) {
          console.error(err);
          showStatusMessage("Excel import failed: " + (err?.message || err), true);
        }
      };
      reader.readAsArrayBuffer(file);
    }

    // ── Firestore ──────────────────────────────────────────────────────────────
    function getStaffDocRef(key, saveName) {
      return window.FB.doc(window.FB.db, "bcot_overtime_secure", key, "staff_named", saveName);
    }

    const STAFF_CLOUD_DOC = "STAFF_POOL";   // fixed doc name — no user input needed

    async function saveStaffToCloud() {
      clearTimeout(_cloudSaveTimer);  // cancel any pending auto-save
      setCloudSaveStatus('saving');
      try {
        const key = getKeyOrWarn(); if (!key) { setCloudSaveStatus('error'); return; }
        if (!staffRecords.length) { showStatusMessage("No staff to save.", true); setCloudSaveStatus('error'); return; }
        await window.FB.setDoc(getStaffDocRef(key, STAFF_CLOUD_DOC), {
          savedAt: new Date().toISOString(), records: staffRecords, areasList: getAreasList()
        }, { merge: true });
        setCloudSaveStatus('saved');
        showStatusMessage(`${staffRecords.length} staff saved to cloud ✅`);
      } catch(e) { console.error(e); setCloudSaveStatus('error'); showStatusMessage("Save failed: " + (e?.message||e), true); }
    }

    async function loadStaffFromCloud() {
      try {
        const key = getKeyOrWarn(); if (!key) return;
        showStatusMessage("Loading staff from cloud…");
        const snap = await window.FB.getDoc(getStaffDocRef(key, STAFF_CLOUD_DOC));
        if (!snap.exists()) { showStatusMessage("No staff found in cloud. Save first.", true); return; }
        const data = snap.data() || {};
        staffRecords = (Array.isArray(data.records) ? data.records : []).map(normalizeRecord).filter(s => s.name);
        renderTable();
        writeLocalKeys();
        const cloudAreas = Array.isArray(data.areasList) ? data.areasList : [];
        if (cloudAreas.length) {
          localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(cloudAreas));
        } else {
          staffRecords.forEach(s => { if (s.area) s.area.split(",").forEach(a => { if (a.trim()) saveAreaToList(a.trim()); }); });
        }
        rebuildAreaUI();
        showStatusMessage(`Loaded ${staffRecords.length} staff from cloud ✅`);
      } catch(e) { console.error(e); showStatusMessage("Load failed: " + (e?.message||e), true); }
    }

    // Legacy named functions kept for backward compatibility
    async function saveStaffNamedToFirestore() { await saveStaffToCloud(); }
    async function loadStaffNamedFromFirestore() { await loadStaffFromCloud(); }

    // ── HRR Import ─────────────────────────────────────────────────────────────
    function importHRRFromExcel(input) {
      const file = input.files[0];
      if (!file) return;
      input.value = "";   // allow re-selecting same file

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const wb   = XLSX.read(e.target.result, { type: "array" });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

          if (rows.length < 2) { showStatusMessage("File is empty or has no data rows.", true); return; }

          // Detect header row — look for Badge / Name / HRR columns (case-insensitive)
          const header = rows[0].map(h => String(h||'').trim().toLowerCase());
          let badgeCol = -1, nameCol = -1, hrrCol = -1;

          header.forEach((h, i) => {
            if (/badge/i.test(h))                badgeCol = i;
            else if (/name/i.test(h))            nameCol  = i;
            else if (/hrr|rate|hourly/i.test(h)) hrrCol   = i;
          });

          // Fallback: assume columns A=Badge, B=Name, C=HRR if header detection fails
          if (badgeCol < 0 && hrrCol < 0) { badgeCol=0; nameCol=1; hrrCol=2; }

          if (hrrCol < 0) { showStatusMessage("Could not find HRR column in file.", true); return; }

          let updated=0, byBadge=0, byName=0, notFound=[], skipped=0;

          rows.slice(1).forEach(row => {
            const rawBadge = String(row[badgeCol] ?? '').trim();
            const rawName  = String(row[nameCol]  ?? '').trim().toUpperCase();
            const rawHRR   = parseFloat(row[hrrCol]);

            if (!Number.isFinite(rawHRR) || rawHRR <= 0) { skipped++; return; }

            // 1 — Match by badge number (exact)
            let idx = rawBadge
              ? staffRecords.findIndex(s => String(s.badge).trim() === rawBadge)
              : -1;

            // 2 — Fallback: match by name (strip trailing badge from stored name)
            if (idx < 0 && rawName) {
              idx = staffRecords.findIndex(s => {
                const storedName = s.name.replace(/\s*\(\d+\)\s*$/, '').trim().toUpperCase();
                return storedName === rawName;
              });
              if (idx >= 0) byName++;
            } else if (idx >= 0) {
              byBadge++;
            }

            if (idx < 0) {
              notFound.push(rawName || rawBadge);
              return;
            }

            staffRecords[idx].hrr = rawHRR;
            updated++;
          });

          if (updated) {
            renderTable();
            writeLocalKeys();
            applyAreaFilter();
          }

          let msg = `HRR updated: ${updated} staff`;
          if (byBadge || byName) msg += ` (${byBadge} by badge, ${byName} by name)`;
          if (notFound.length)   msg += ` · ${notFound.length} not found: ${notFound.slice(0,5).join(', ')}${notFound.length>5?'…':''}`;
          if (skipped)           msg += ` · ${skipped} rows skipped (no HRR)`;
          showStatusMessage(msg + ' ✅', updated === 0);

        } catch(err) {
          console.error(err);
          showStatusMessage("HRR import failed: " + (err?.message || err), true);
        }
      };
      reader.readAsArrayBuffer(file);
    }

    // ── Manpower Report Import (Role + Contract Date, existing staff only) ─────
    // Raw "Position Title" text (as it appears in the report) → this app's role.
    // Titles not listed here are left unmapped: contract date still updates,
    // but the person's existing role is not touched.
    const MANPOWER_ROLE_MAP = {
      'ADMINISTRATIVE ASSISTANT II':                    'Admin Assistant',
      'ADMINISTRATIVE ASSISTANT III':                   'Admin Assistant',
      'ASSISTANT DIRECTOR CLINICAL PHARMACY SERVICES':  'Assistant Director',
      'ASSISTANT DIRECTOR PHARMACY SERVICES':           'Assistant Director',
      'ASSOCIATE CLINICAL PHARMACIST':                  'Associate Clinical Pharmacist',
      'CLINICAL PHARMACIST':                            'Clinical Pharmacist',
      'CLINICAL PHARMACY SPECIALIST':                   'Clinical Pharmacy Specialist',
      'DIRECTOR PHARMACEUTICAL CARE SERVICES':          'Director',
      'MANAGER PHARMACY SERVICES':                      'Manager',
      'SUPERVISOR PHARMACY SERVICES':                   'Supervisor',
      'PHARMACIST I':                                   'Pharmacist',
      'PHARMACIST II':                                  'Pharmacist',
      'PHARMACY TECHNICIAN I':                           'Technician',
      'PHARMACY TECHNICIAN II':                          'Technician',
      'PHARMACY TECHNICIAN III':                         'Technician',
      'PHARMACY AIDE':                                   'Pharmacy Aide',
    };

    // Excel dates come through as JS Date objects (cellDates:true) or, rarely,
    // as raw serial numbers if a cell is formatted as text — handle both.
    // Uses UTC getters throughout so the date can't shift a day off in local time.
    function _manpowerDateToISO(v) {
      if (v instanceof Date && !isNaN(v.getTime())) {
        return `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${String(v.getUTCDate()).padStart(2,'0')}`;
      }
      if (typeof v === 'number' && v > 0) {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      }
      return '';
    }

    function importManpowerReport(input) {
      const file = input.files[0];
      if (!file) return;
      input.value = "";   // allow re-selecting same file

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const wb     = XLSX.read(e.target.result, { type: "array", cellDates: true });
          const wsName = wb.SheetNames.find(n => /employee/i.test(n)) || wb.SheetNames[0];
          const ws     = wb.Sheets[wsName];
          const rows   = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

          if (rows.length < 2) { showStatusMessage("File is empty or has no data rows.", true); return; }

          // Detect columns by header text (case-insensitive) rather than fixed
          // positions, so the report's exact column order doesn't matter.
          const header = rows[0].map(h => String(h||'').trim().toLowerCase());
          let badgeCol = -1, titleCol = -1, dateCol = -1;
          header.forEach((h, i) => {
            // "^employee" (not just "employee") so "Dept Code (Employee)" doesn't
            // get mistaken for the "Employee #" badge column.
            if (/^employee/.test(h))  badgeCol = i;
            else if (/title/.test(h)) titleCol = i;
            else if (/hire/.test(h))  dateCol  = i;
          });
          if (badgeCol < 0 || titleCol < 0) {
            showStatusMessage('Could not find "Employee #" / "Position Title" columns — expected the Manpower report\'s Employees sheet.', true);
            return;
          }

          let roleUpdates = 0, dateOnlyUpdates = 0, notFound = 0;
          const plan = [];   // { badge, role|null, date }

          rows.slice(1).forEach(row => {
            const badge = String(row[badgeCol] ?? '').trim();
            if (!badge) return;
            if (!staffRecords.some(s => String(s.badge).trim() === badge)) { notFound++; return; }

            const titleRaw = String(row[titleCol] ?? '').trim().toUpperCase();
            const role = MANPOWER_ROLE_MAP[titleRaw] || null;
            const date = dateCol >= 0 ? _manpowerDateToISO(row[dateCol]) : '';

            plan.push({ badge, role, date });
            if (role) roleUpdates++; else dateOnlyUpdates++;
          });

          if (!plan.length) {
            showStatusMessage("No matching staff found (matched by Employee # / Badge No.).", true);
            return;
          }

          const dateNote = dateCol < 0 ? '\n(No hire-date column found — contract dates will not be updated.)' : '';
          const ok = confirm(
            `Manpower report import:\n\n` +
            `${roleUpdates} staff — role + contract date will update\n` +
            `${dateOnlyUpdates} staff — contract date only (title not recognized, role left as-is)\n` +
            `${notFound} row(s) skipped — not in your current staff list${dateNote}\n\n` +
            `Continue?`
          );
          if (!ok) { showStatusMessage("Import cancelled."); return; }

          // Update ALL records sharing this badge (across all areas) — same
          // rule the manual Edit form uses for role/contractDate.
          plan.forEach(({ badge, role, date }) => {
            staffRecords.forEach(r => {
              if (String(r.badge).trim() === badge) {
                if (role) r.role = role;
                if (date) r.contractDate = date;
              }
            });
          });

          renderTable();
          writeLocalKeys();
          applyAreaFilter();
          showStatusMessage(`Manpower import: ${plan.length} staff updated (${roleUpdates} role+date, ${dateOnlyUpdates} date-only) ✅`);
        } catch(err) {
          console.error(err);
          showStatusMessage("Manpower import failed: " + (err?.message || err), true);
        }
      };
      reader.readAsArrayBuffer(file);
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    (function init() {
      rebuildRoleSelects();
      rebuildAreaUI();

      // Restore last used filter
      const lastArea = (localStorage.getItem("BCOT_CURRENT_AREA_V1") || "ALL").trim().toUpperCase();
      const sel = document.getElementById("areaFilter");
      if (lastArea === "ALL" || getAreasList().includes(lastArea)) sel.value = lastArea;
      if (lastArea !== "ALL" && getAreasList().includes(lastArea)) {
        document.getElementById("stAreaValue").value = lastArea;
        const btn = document.getElementById("stAreaBtn");
        if (btn) { btn.textContent = lastArea; btn.classList.remove("empty"); }
      }

      staffRecords = readRecordsFromLocal();
      renderTable();

      if (staffRecords.length) {
        writeLocalKeys();   // has data — safe to write + schedule cloud save
      } else {
        // Empty localStorage (e.g. first visit on pharmacywr.com).
        // Do NOT call writeLocalKeys() here — that would trigger scheduleCloudSave()
        // with an empty array and wipe any existing cloud data.
        showStatusMessage("No local data — loading from cloud…");
        (async () => {
          let t = 0;
          while (!window.FB && t++ < 80) await new Promise(r => setTimeout(r, 50));
          if (window.FB) {
            await loadStaffFromCloud();
          } else {
            showStatusMessage("No staff yet. Add staff using the form above.", true);
          }
        })();
      }

      // Wire up area picker button for new-staff form
      document.getElementById("stAreaBtn").addEventListener("click", () => {
        const cur = document.getElementById("stAreaValue").value || "";
        openAreaPickerModal("Select Areas for New Staff", cur, newAreas => {
          document.getElementById("stAreaValue").value = newAreas;
          const btn = document.getElementById("stAreaBtn");
          btn.textContent = newAreas || "— Area —";
          btn.classList.toggle("empty", !newAreas);
        });
      });

      document.getElementById("stName").addEventListener("keydown", e => { if (e.key === "Enter") addStaff(); });
      document.getElementById("newAreaInput").addEventListener("keydown", e => { if (e.key === "Enter") addNewArea(); });

      document.getElementById("areaFilter").addEventListener("change", () => {
        const v = document.getElementById("areaFilter").value;
        // Always persist the selected area so the rota page picks it up on return
        localStorage.setItem("BCOT_CURRENT_AREA_V1", v);
        // Auto-fill the new-staff area field when a specific area is selected
        if (v !== "ALL") document.getElementById("stArea").value = v;
        applyAreaFilter();
      });
    })();
  