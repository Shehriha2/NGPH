    const AREAS_LIST_KEY  = "BCOT_AREAS_LIST_V1";
    const DUTIES_ALL_KEY  = "BCOT_DUTIES_ALL_V1";   // unified, all areas

    const DAYS = ["Any","Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    const COLOR_PALETTE = [
      "#1a4f8b","#2e8b57","#dc3545","#d97706","#6f42c1",
      "#0f766e","#7c2d12","#c93c5d","#2563eb","#b8860b",
      "#0284c7","#16a34a","#9333ea","#ea580c","#0891b2",
      "#be185d","#4f46e5","#65a30d","#6b7280","#374151"
    ];

    // ── Adobe Color import ────────────────────────────────────────────────────
    let _stagedColor = null;

    function clearStaged() {
      _stagedColor = null;
      document.querySelectorAll('.eyedropper-btn').forEach(b => {
        b.style.background=''; b.style.color=''; b.style.borderColor='#d1d5db';
        b.title = 'Pick color from screen';
      });
      const inf = document.getElementById('adobe-info');
      if (inf) inf.style.display = 'none';
    }

    function stageColor(hex) {
      _stagedColor = hex;
      document.querySelectorAll('.eyedropper-btn').forEach(b => {
        b.style.background = hex; b.style.color = '#fff'; b.style.borderColor = hex;
        b.title = `Apply ${hex.toUpperCase()} — click 🔬 on any duty row`;
      });
      const inf = document.getElementById('adobe-info');
      if (inf) { inf.textContent = `✅ ${hex.toUpperCase()} staged — click 🔬 on any duty row to apply`; inf.style.display = 'block'; }
    }

    function extractAdobeColors() {
      const urlVal = (document.getElementById('adobe-url')?.value || '').trim();
      const out = document.getElementById('adobe-swatches');
      if (!out) return;
      try {
        const p = new URL(urlVal).searchParams;
        const raw = p.get('rgbvalues');
        if (!raw) { out.innerHTML = '<span style="color:#dc2626;font-size:11px;">No color data found. Copy the URL from the browser address bar while on the color wheel page.</span>'; return; }
        const v = raw.split(',').map(Number);
        if (v.length < 15) { out.innerHTML = '<span style="color:#dc2626;font-size:11px;">Unexpected URL format.</span>'; return; }
        const cols = [];
        for (let i=0; i<5; i++) {
          const r=Math.round(v[i*3]*255).toString(16).padStart(2,'0');
          const g=Math.round(v[i*3+1]*255).toString(16).padStart(2,'0');
          const b=Math.round(v[i*3+2]*255).toString(16).padStart(2,'0');
          cols.push('#'+r+g+b);
        }
        out.innerHTML = cols.map(c=>`
          <div onclick="stageColor('${c}')" title="Use ${c.toUpperCase()}" style="cursor:pointer;text-align:center;">
            <div style="width:44px;height:44px;border-radius:8px;background:${c};border:2px solid #e5e7eb;margin-bottom:3px;transition:transform .1s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform=''"></div>
            <span style="font-size:9px;font-family:monospace;color:#374151;">${c.toUpperCase()}</span>
          </div>`).join('');
      } catch {
        out.innerHTML = '<span style="color:#dc2626;font-size:11px;">Invalid URL. Paste the full URL from Adobe Color.</span>';
      }
    }

    function openAdobeColorPanel() {
      let panel = document.getElementById('adobe-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'adobe-panel';
        panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;padding:18px 20px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:10000;min-width:340px;max-width:480px;width:92%;';
        panel.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <b style="font-size:13px;color:#1a4f8b;">🎨 Adobe Color Import</b>
            <button onclick="document.getElementById('adobe-panel').style.display='none';clearStaged();" style="background:none;border:none;font-size:16px;cursor:pointer;color:#6b7280;line-height:1;">✕</button>
          </div>
          <ol style="font-size:11px;color:#6b7280;margin:0 0 10px 18px;line-height:2;">
            <li><a href="https://color.adobe.com/create/color-wheel" target="_blank" style="color:#1a4f8b;font-weight:700;">Open Adobe Color →</a></li>
            <li>Design your palette on the color wheel</li>
            <li>Copy the URL from your browser address bar</li>
            <li>Paste it below and click Extract</li>
            <li>Click a color swatch to stage it, then click 🔬 on any duty row</li>
          </ol>
          <div style="display:flex;gap:6px;margin-bottom:10px;">
            <input id="adobe-url" type="text" placeholder="https://color.adobe.com/create/color-wheel?…"
              style="flex:1;padding:6px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:11px;min-width:0;"/>
            <button onclick="extractAdobeColors()" style="background:#1a4f8b;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:700;white-space:nowrap;">Extract</button>
          </div>
          <div id="adobe-swatches" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;min-height:60px;align-items:center;padding:10px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">Paste a URL and click Extract</span>
          </div>
          <div id="adobe-info" style="display:none;font-size:11px;color:#16a34a;font-weight:700;margin-top:8px;text-align:center;"></div>`;
        document.body.appendChild(panel);
      } else {
        panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
      }
    }

    // ── Area helpers ──────────────────────────────────────────────────────────
    function getAreasList() {
      try { return JSON.parse(localStorage.getItem(AREAS_LIST_KEY) || "[]") || []; }
      catch { return []; }
    }

    function saveAreaToList(area) {
      const list = getAreasList();
      if (area && !list.includes(area)) { list.push(area); list.sort(); localStorage.setItem(AREAS_LIST_KEY, JSON.stringify(list)); }
    }

    function getCurrentFilter() {
      return (document.getElementById("areaFilter")?.value || "ALL").toUpperCase();
    }

    function rebuildAreaUI() {
      const list = getAreasList();
      // filter select
      const sel = document.getElementById("areaFilter");
      const prev = sel.value;
      sel.innerHTML = '<option value="ALL">All Areas</option>';
      list.forEach(a => { const o = document.createElement("option"); o.value = a; o.textContent = a; sel.appendChild(o); });
      if (prev && (prev === "ALL" || list.includes(prev))) sel.value = prev;
      // shared datalist
      const dl = document.getElementById("areasDatalist");
      dl.innerHTML = "";
      list.forEach(a => { const o = document.createElement("option"); o.value = a; dl.appendChild(o); });
      // import source select
      rebuildImportSourceSelect();
    }

    function addNewArea() {
      const raw = (document.getElementById("newAreaInput").value || "")
        .trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
      if (!raw) { showStatus("Enter a valid area name.", true); return; }
      saveAreaToList(raw);
      rebuildAreaUI();
      document.getElementById("areaFilter").value = raw;
      document.getElementById("newAreaInput").value = "";
      applyAreaFilter();
      showStatus(`Area "${raw}" added ✅`);
    }

    function applyAreaFilter() {
      const filter = getCurrentFilter();
      Array.from(document.querySelectorAll("#dutiesBody tr")).forEach(tr => {
        if (filter === "ALL") { tr.classList.remove("hidden-row"); return; }
        const rowArea = (tr.querySelector(".area-cell")?.value || "").trim().toUpperCase();
        // support comma-separated multi-area values
        const areas = rowArea.split(",").map(x => x.trim()).filter(Boolean);
        const visible = !rowArea || areas.includes(filter);
        tr.classList.toggle("hidden-row", !visible);
      });
      rebuildImportSourceSelect();
    }

    // ── Status ─────────────────────────────────────────────────────────────────
    function showStatus(msg, isErr = false) {
      const el = document.getElementById("statusBox");
      el.textContent = msg;
      el.className = "status " + (isErr ? "err" : "ok");
      el.style.display = "block";
      setTimeout(() => el.style.display = "none", 2800);
    }

    // ── Key helpers ────────────────────────────────────────────────────────────
    function getKeyOrWarn() {
      const key = (window.BCOT_APP_KEY || "").trim();
      if (!key) { showStatus("config.js not found — cloud sync disabled.", true); return null; }
      return key;
    }

    // ── Time helpers ───────────────────────────────────────────────────────────
    function parseTimeToMinutes(t) {
      const m = /^(\d{2}):(\d{2})$/.exec((t || "").toString().trim());
      if (!m) return null;
      const hh = Number(m[1]), mm = Number(m[2]);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
      return hh * 60 + mm;
    }
    function minutesToTime(min) {
      min = ((min % 1440) + 1440) % 1440;
      return String(Math.floor(min / 60)).padStart(2,"0") + ":" + String(min % 60).padStart(2,"0");
    }
    function calcEndTime(startTime, hours) {
      const st = (startTime || "Any").toString().trim();
      if (st.toUpperCase() === "ANY") return "Any";
      const sm = parseTimeToMinutes(st);
      if (sm === null) return "Any";
      return minutesToTime(sm + Math.round((Number(hours) || 0) * 60));
    }

    // ── Option builders ────────────────────────────────────────────────────────
    function buildTimeOptions() {
      const opts = [];
      for (let h = 0; h < 24; h++)
        for (let m = 0; m < 60; m += 30) {
          const t = String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
          opts.push(`<option value="${t}">${t}</option>`);
        }
      return opts.join("");
    }
    function buildDayCountOptions() {
      return Array.from({length:31}, (_,i) => `<option value="${i+1}">${i+1}</option>`).join("");
    }

    // ── Auto color ─────────────────────────────────────────────────────────────
    function pickNextColor() {
      const used = new Set(
        Array.from(document.querySelectorAll('#dutiesBody input[type="color"]'))
          .map(el => el.value.toLowerCase())
      );
      return COLOR_PALETTE.find(c => !used.has(c.toLowerCase()))
        || COLOR_PALETTE[used.size % COLOR_PALETTE.length];
    }

    // ── Add duty row ───────────────────────────────────────────────────────────
    function addDutyRow(data) {
      const tbody = document.getElementById("dutiesBody");
      const tr    = document.createElement("tr");

      const code         = (data?.code || data?.dutyCode || "").toString().trim().toUpperCase();
      const chosenColor  = data?.color ? data.color.toString() : pickNextColor();
      // area: use saved value, or fall back to current filter (but not ALL)
      const filter       = getCurrentFilter();
      const defaultArea  = filter === "ALL" ? "" : filter;
      const chosenArea   = (data?.area || defaultArea || "").toString().toUpperCase();

      tr.innerHTML = `
        <td><input class="nowrap" placeholder="e.g. OP" value="${code}"
          style="width:68px;text-transform:uppercase"/></td>
        <td><input placeholder="Label" value="${(data?.label||"").toString()}" style="width:160px"/></td>
        <td><input type="number" min="0" step="0.25" value="${Number(data?.hours??0)}" style="width:64px"/></td>
        <td>
          <input type="color" value="${chosenColor}"
            style="width:46px;height:28px;padding:0;border:none;background:transparent"/>
          <div class="swatch" style="background:${chosenColor}"></div>
          <button type="button" class="eyedropper-btn" title="Pick color from screen"
            style="background:none;border:1px solid #d1d5db;border-radius:4px;padding:2px 5px;cursor:pointer;font-size:13px;line-height:1;vertical-align:middle;">🔬</button>
        </td>
        <td><input class="area-cell" type="text" list="areasDatalist" value="${chosenArea}"
          style="width:80px;text-transform:uppercase" placeholder="Area"/></td>
        <td><input type="number" min="0" step="1" value="${Number(data?.assignedSt??0)}" style="width:70px"/></td>
        <td>
          <select style="width:88px">
            ${DAYS.map(d=>`<option value="${d}">${d}</option>`).join("")}
          </select>
        </td>
        <td>
          <select style="width:88px">
            <option value="Any">Any</option>
            ${buildTimeOptions()}
          </select>
        </td>
        <td class="endTime">Any</td>
        <td>
          <select style="width:88px">
            <option value="Any">Any</option>
            ${buildDayCountOptions()}
          </select>
        </td>
        <td class="no-print"><button class="btn-danger" type="button">X</button></td>
      `;

      // column indices shifted by 1 (area now col 4, rest shift right)
      tr.cells[6].querySelector("select").value  = (data?.startDay    || "Any").toString();
      tr.cells[7].querySelector("select").value  = (data?.startTime   || "Any").toString();
      tr.cells[9].querySelector("select").value  = (data?.defaultDays ?? "Any").toString();

      // color swatch sync + eyedropper
      const colorInput  = tr.cells[3].querySelector('input[type="color"]');
      const swatch      = tr.cells[3].querySelector(".swatch");
      const eyeBtn      = tr.cells[3].querySelector(".eyedropper-btn");
      colorInput.addEventListener("input", () => swatch.style.background = colorInput.value);
      if (window.EyeDropper) {
        eyeBtn.addEventListener("click", async () => {
          if (_stagedColor) {
            colorInput.value = _stagedColor;
            swatch.style.background = _stagedColor;
            clearStaged(); return;
          }
          try {
            const { sRGBHex } = await new EyeDropper().open();
            colorInput.value = sRGBHex;
            swatch.style.background = sRGBHex;
          } catch { /* user cancelled */ }
        });
      } else {
        eyeBtn.title = "EyeDropper not supported in this browser (use Chrome/Edge)";
        eyeBtn.style.opacity = "0.4";
        eyeBtn.style.cursor = "not-allowed";
      }

      // area cell: save new area to list when user leaves the field
      tr.cells[4].querySelector(".area-cell").addEventListener("change", function() {
        const v = this.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,20);
        this.value = v;
        if (v) { saveAreaToList(v); rebuildAreaUI(); }
        applyAreaFilter();
      });

      // auto end-time
      function refreshEnd() {
        const hours = Number(tr.cells[2].querySelector("input").value || 0) || 0;
        const st    = tr.cells[7].querySelector("select").value;
        tr.querySelector(".endTime").textContent = calcEndTime(st, hours);
      }
      tr.cells[2].querySelector("input").addEventListener("input", refreshEnd);
      tr.cells[7].querySelector("select").addEventListener("change", refreshEnd);
      refreshEnd();

      tr.querySelector(".btn-danger").addEventListener("click", () => {
        if (confirm("Delete this duty?")) tr.remove();
      });

      tbody.appendChild(tr);

      // hide immediately if filter doesn't match
      if (filter !== "ALL" && chosenArea && chosenArea !== filter)
        tr.classList.add("hidden-row");
    }

    // ── Read table → object ────────────────────────────────────────────────────
    function readTableToDutiesObject() {
      const out = {};
      for (const tr of Array.from(document.querySelectorAll("#dutiesBody tr"))) {
        const code = (tr.cells[0].querySelector("input").value || "").toString().trim().toUpperCase();
        if (!code) continue;
        if (!/^[A-Z]{1,5}$/.test(code)) throw new Error(`Invalid code: "${code}" (1–5 letters)`);
        out[code] = {
          label:       (tr.cells[1].querySelector("input").value || code).toString().trim(),
          hours:       Number(tr.cells[2].querySelector("input").value || 0) || 0,
          color:       (tr.cells[3].querySelector('input[type="color"]').value || "#111827").toString(),
          area:        (tr.cells[4].querySelector(".area-cell").value || "").toString().toUpperCase(),
          assignedSt:  Number(tr.cells[5].querySelector("input").value || 0) || 0,
          startDay:    (tr.cells[6].querySelector("select").value || "Any").toString(),
          startTime:   (tr.cells[7].querySelector("select").value || "Any").toString(),
          defaultDays: (tr.cells[9].querySelector("select").value || "Any").toString()
        };
      }
      if (!Object.keys(out).length) throw new Error("No duties to save.");
      return out;
    }

    // ── Local save / load ──────────────────────────────────────────────────────
    function saveDutiesLocal() {
      try {
        const obj = readTableToDutiesObject();
        localStorage.setItem(DUTIES_ALL_KEY, JSON.stringify(obj));
        showStatus(`Saved ${Object.keys(obj).length} duties locally ✅`);
      } catch(e) { console.error(e); showStatus("Save failed: " + e.message, true); }
    }

    function loadDutiesLocal(showMsg = false) {
      const raw = localStorage.getItem(DUTIES_ALL_KEY);
      document.getElementById("dutiesBody").innerHTML = "";
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch { data = null; } }
      if (!data || typeof data !== "object" || !Object.keys(data).length) {
        if (showMsg) showStatus("No saved duties found. Add duties using the button above.", true);
        return;
      }
      for (const [code, meta] of Object.entries(data)) addDutyRow({ code, ...meta });
      applyAreaFilter();
      if (showMsg) showStatus(`Loaded ${Object.keys(data).length} duties ✅`);
    }

    function clearAreaDuties() {
      const filter = getCurrentFilter();
      if (filter === "ALL") {
        if (!confirm("Clear ALL duties for all areas?")) return;
        localStorage.removeItem(DUTIES_ALL_KEY);
        document.getElementById("dutiesBody").innerHTML = "";
        showStatus("All duties cleared ✅");
        return;
      }
      if (!confirm(`Clear all duties tagged with area "${filter}"?`)) return;
      // Remove only rows that match the filter
      Array.from(document.querySelectorAll("#dutiesBody tr")).forEach(tr => {
        const rowArea = (tr.querySelector(".area-cell")?.value || "").trim().toUpperCase();
        if (rowArea === filter) tr.remove();
      });
      // Persist the remaining duties
      try {
        const obj = readTableToDutiesObject();
        localStorage.setItem(DUTIES_ALL_KEY, JSON.stringify(obj));
      } catch { localStorage.removeItem(DUTIES_ALL_KEY); }
      showStatus(`Duties for area "${filter}" cleared ✅`);
    }

    // ── Firestore save / load ──────────────────────────────────────────────────
    const DUTIES_CLOUD_DOC = "DUTIES_POOL";   // fixed doc name — no user input needed

    function getDutiesDocRef(key, saveName) {
      return window.FB.doc(window.FB.db, "bcot_overtime_secure", key, "duties_named", saveName);
    }

    async function saveDutiesToCloud() {
      try {
        const key = getKeyOrWarn(); if (!key) return;
        const obj = readTableToDutiesObject();
        showStatus("Saving duties to cloud…");
        await window.FB.setDoc(getDutiesDocRef(key, DUTIES_CLOUD_DOC), {
          savedAt: new Date().toISOString(), duties: obj
        }, { merge: true });
        showStatus(`${Object.keys(obj).length} duties saved to cloud ✅`);
      } catch(e) { console.error(e); showStatus("Save failed: " + e.message, true); }
    }

    async function loadDutiesFromCloud() {
      try {
        const key = getKeyOrWarn(); if (!key) return;
        showStatus("Loading duties from cloud…");
        const snap = await window.FB.getDoc(getDutiesDocRef(key, DUTIES_CLOUD_DOC));
        if (!snap.exists()) { showStatus("No duties found in cloud. Save first.", true); return; }
        const duties = snap.data()?.duties || {};
        if (!Object.keys(duties).length) { showStatus("Cloud document has no duties.", true); return; }
        document.getElementById("dutiesBody").innerHTML = "";
        for (const [code, meta] of Object.entries(duties)) addDutyRow({ code, ...meta });
        localStorage.setItem(DUTIES_ALL_KEY, JSON.stringify(duties));
        rebuildAreaUI(); applyAreaFilter();
        showStatus(`Loaded ${Object.keys(duties).length} duties from cloud ✅`);
      } catch(e) { console.error(e); showStatus("Load failed: " + e.message, true); }
    }

    async function saveDutiesToFirestore() {
      try {
        const key = getKeyOrWarn(); if (!key) return;
        const nm  = (document.getElementById("dutiesSaveName").value || "").trim();
        if (!nm) { showStatus("Enter a cloud save name.", true); return; }
        const safeName = nm.replace(/[^\w\- ]+/g,"").replace(/\s+/g,"_");
        if (!safeName) { showStatus("Save name invalid.", true); return; }
        const obj = readTableToDutiesObject();
        await window.FB.setDoc(getDutiesDocRef(key, safeName), {
          saveName: nm, savedAt: new Date().toISOString(), duties: obj
        }, { merge: true });
        showStatus(`Duties saved to cloud ✅ (${safeName})`);
      } catch(e) { console.error(e); showStatus("Save failed: " + e.message, true); }
    }

    async function loadDutiesFromFirestore() {
      try {
        const key = getKeyOrWarn(); if (!key) return;
        const nm  = (document.getElementById("dutiesSaveName").value || "").trim();
        if (!nm) { showStatus("Enter the cloud save name to load.", true); return; }
        const safeName = nm.replace(/[^\w\- ]+/g,"").replace(/\s+/g,"_");
        showStatus("Loading from cloud…");
        const snap = await window.FB.getDoc(getDutiesDocRef(key, safeName));
        if (!snap.exists()) { showStatus(`No cloud duties found: "${safeName}"`, true); return; }
        const duties = snap.data()?.duties || {};
        if (!Object.keys(duties).length) { showStatus("Cloud document has no duties.", true); return; }
        document.getElementById("dutiesBody").innerHTML = "";
        for (const [code, meta] of Object.entries(duties)) addDutyRow({ code, ...meta });
        localStorage.setItem(DUTIES_ALL_KEY, JSON.stringify(duties));
        applyAreaFilter();
        showStatus(`Loaded ${Object.keys(duties).length} duties from cloud ✅`);
      } catch(e) { console.error(e); showStatus("Load failed: " + e.message, true); }
    }

    // ── Import from another area ───────────────────────────────────────────────
    function rebuildImportSourceSelect() {
      const areas = getAreasList();
      const current = getCurrentFilter();
      const sel = document.getElementById("importSourceArea");
      sel.innerHTML = '<option value="">-- Select source area --</option>';
      areas.forEach(a => {
        if (a !== current) {
          const o = document.createElement("option"); o.value = a; o.textContent = a; sel.appendChild(o);
        }
      });
    }

    function previewImport() {
      const src = document.getElementById("importSourceArea").value;
      const current = getCurrentFilter();
      if (!src)    { showStatus("Select a source area first.", true); return; }
      if (current === "ALL") { showStatus("Set a specific area filter first (not All Areas).", true); return; }

      const all = getDutiesFromStorage();
      // Duties in source area
      const srcDuties = Object.entries(all).filter(([,m]) => {
        const areas = (m.area||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
        return areas.includes(src.toUpperCase()) || (!areas.length && src === "ALL");
      });
      // Duties already in current area
      const currentCodes = new Set(
        Object.entries(all)
          .filter(([,m]) => {
            const areas = (m.area||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
            return areas.includes(current) || !areas.length;
          })
          .map(([code]) => code)
      );

      const available = srcDuties.filter(([code]) => !currentCodes.has(code));
      if (!available.length) {
        document.getElementById("importPreview").style.display = "none";
        document.getElementById("importHint").textContent = "No new duties found in that area (all already present here).";
        return;
      }

      document.getElementById("importHint").textContent = `${available.length} duties available from ${src}.`;
      const list = document.getElementById("importList");
      list.innerHTML = "";
      available.forEach(([code, meta]) => {
        const bg = meta.color || "#1a4f8b";
        const item = document.createElement("label");
        item.style.cssText = `display:inline-flex;align-items:center;gap:5px;background:${bg};color:#fff;font-weight:700;
          border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;user-select:none;`;
        item.innerHTML = `<input type="checkbox" data-code="${code}" style="accent-color:#fff;width:13px;height:13px;" checked>
          ${code}${meta.label?` — ${meta.label}`:''}`;
        list.appendChild(item);
      });
      document.getElementById("importPreview").style.display = "block";
    }

    function selectAllImport() {
      document.querySelectorAll("#importList input[type=checkbox]").forEach(cb => cb.checked = true);
    }

    function cancelImport() {
      document.getElementById("importPreview").style.display = "none";
      document.getElementById("importHint").textContent = "Select a source area and click Preview.";
    }

    function doImportDuties() {
      const current = getCurrentFilter();
      if (current === "ALL") { showStatus("Set a specific area filter first.", true); return; }
      const selected = [...document.querySelectorAll("#importList input[type=checkbox]:checked")].map(cb => cb.dataset.code);
      if (!selected.length) { showStatus("No duties selected.", true); return; }

      const all = getDutiesFromStorage();
      let imported = 0;
      selected.forEach(code => {
        if (!all[code]) return;
        const existing = (all[code].area || "").split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
        if (!existing.includes(current.toUpperCase())) {
          existing.push(current.toUpperCase());
          all[code].area = existing.join(",");
          imported++;
        }
      });
      if (!imported) { showStatus("All selected duties were already in this area.", true); return; }
      localStorage.setItem(DUTIES_ALL_KEY, JSON.stringify(all));

      // Re-render
      document.getElementById("dutiesBody").innerHTML = "";
      for (const [code, meta] of Object.entries(all)) addDutyRow({ code, ...meta });
      applyAreaFilter();
      cancelImport();
      showStatus(`Imported ${imported} duties into ${current} ✅`);
    }

    function getDutiesFromStorage() {
      try { return JSON.parse(localStorage.getItem(DUTIES_ALL_KEY) || "{}") || {}; } catch { return {}; }
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    (function init() {
      rebuildAreaUI();

      // Restore last used filter
      const lastArea = (localStorage.getItem("BCOT_CURRENT_AREA_V1") || "ALL").trim().toUpperCase();
      const sel = document.getElementById("areaFilter");
      if (lastArea && (lastArea === "ALL" || getAreasList().includes(lastArea))) sel.value = lastArea;

      loadDutiesLocal(false);
      applyAreaFilter();

      const raw = localStorage.getItem(DUTIES_ALL_KEY);
      if (!raw) showStatus("No duties yet. Use '+ Add Duty' to build your duty list.", true);

      document.getElementById("newAreaInput").addEventListener("keydown", e => {
        if (e.key === "Enter") addNewArea();
      });

      // Persist filter choice so Rota page knows last used area
      document.getElementById("areaFilter").addEventListener("change", () => {
        const v = document.getElementById("areaFilter").value;
        if (v !== "ALL") localStorage.setItem("BCOT_CURRENT_AREA_V1", v);
      });
    })();
  