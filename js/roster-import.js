    const LOCAL_KEY = "BCOT_ROSTER_SYMBOL_HOURS_V1";
    const CLOUD_DOC = "ROSTER_SYMBOL_HOURS";
    const DAY_NAMES = new Set(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]);

    let currentSymbols = [];

    // ── Status toast ───────────────────────────────────────────────────────────
    function showStatus(msg, isErr = false) {
      const el = document.getElementById("statusBox");
      el.textContent = msg;
      el.className = "status " + (isErr ? "err" : "ok");
      el.style.display = "block";
      setTimeout(() => el.style.display = "none", 2800);
    }

    // ── Key helper ─────────────────────────────────────────────────────────────
    function getKeyOrWarn() {
      const key = (window.BCOT_APP_KEY || "").trim();
      if (!key) { showStatus("config.js not found — cloud sync disabled.", true); return null; }
      return key;
    }

    function getDocRef(key) {
      return window.FB.doc(window.FB.db, "bcot_overtime_secure", key, "roster_symbols", CLOUD_DOC);
    }

    function getSavedMap() {
      try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {}; }
      catch { return {}; }
    }

    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
    }

    // ── Excel parsing ──────────────────────────────────────────────────────────
    // Column A holds staff names/headers and is never treated as a duty symbol.
    // Any other cell is a symbol candidate unless it's a date (header row) or a
    // bare day-name abbreviation (Sun..Sat header row) — this lets the sheet
    // contain any number of stacked staff blocks/headers without special-casing
    // row positions.
    function extractSymbolsFromSheet(ws) {
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const found = new Set();
      let staffRows = 0;
      rows.forEach(row => {
        let rowHasSymbol = false;
        for (let c = 1; c < row.length; c++) {
          let v = row[c];
          if (v === "" || v == null) continue;
          if (v instanceof Date) continue;
          v = String(v).trim();
          if (!v || DAY_NAMES.has(v)) continue;
          found.add(v);
          rowHasSymbol = true;
        }
        if (rowHasSymbol) staffRows++;
      });
      return {
        symbols: Array.from(found).sort((a, b) => a.localeCompare(b)),
        staffRows
      };
    }

    function handleFileSelect(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const { symbols, staffRows } = extractSymbolsFromSheet(ws);
          if (!symbols.length) { showStatus("No duty symbols found in the first sheet.", true); return; }

          currentSymbols = symbols;
          renderSymbolRows(symbols, getSavedMap());

          document.getElementById("fileNameLabel").textContent = file.name;
          document.getElementById("importSummary").textContent =
            `Sheet "${sheetName}" — ${staffRows} row(s) scanned, ${symbols.length} distinct duty symbol(s) found.`;
          showStatus(`Imported ${symbols.length} duty symbols from "${sheetName}" ✅`);
        } catch (err) {
          console.error(err);
          showStatus("Failed to read Excel: " + (err?.message || err), true);
        } finally {
          input.value = "";
        }
      };
      reader.readAsArrayBuffer(file);
    }

    // ── Table rendering ────────────────────────────────────────────────────────
    function renderSymbolRows(symbols, savedMap) {
      const tbody = document.getElementById("symbolsBody");
      tbody.innerHTML = "";
      symbols.forEach((symbol, i) => {
        const saved = savedMap[symbol] || {};
        const tr = document.createElement("tr");
        tr.dataset.symbol = symbol;
        const name = "hrs_" + i;
        tr.innerHTML = `
          <td class="symbol-cell">${escapeHtml(symbol)}</td>
          <td><input type="radio" name="${name}" value="9" ${saved.hours === 9 ? "checked" : ""}></td>
          <td><input type="radio" name="${name}" value="12" ${saved.hours === 12 ? "checked" : ""}></td>
          <td><input type="checkbox" class="weekend12" ${saved.weekend12 ? "checked" : ""}></td>
          <td><input type="text" class="remarks-input" placeholder="Remarks" style="width:100%;box-sizing:border-box;" value="${escapeHtml((saved.remarks || "").toString())}"></td>
        `;
        tr.querySelectorAll("input").forEach(el => el.addEventListener("change", updateClassifiedCount));
        tbody.appendChild(tr);
      });
      document.getElementById("emptyHint").style.display = symbols.length ? "none" : "block";
      updateClassifiedCount();
    }

    function updateClassifiedCount() {
      const rows = Array.from(document.querySelectorAll("#symbolsBody tr"));
      let done = 0;
      rows.forEach(tr => {
        const hasHours = tr.querySelector("input[type=radio]:checked");
        tr.classList.toggle("incomplete-row", !hasHours);
        if (hasHours) done++;
      });
      const el = document.getElementById("classifiedCount");
      if (rows.length) {
        el.textContent = `${done} / ${rows.length} classified`;
        el.style.color = done === rows.length ? "#16a34a" : "#dc2626";
      } else {
        el.textContent = "";
      }
    }

    // ── Read table → object ────────────────────────────────────────────────────
    function readTableToObject() {
      const out = {};
      document.querySelectorAll("#symbolsBody tr").forEach(tr => {
        const symbol = tr.dataset.symbol;
        const checked = tr.querySelector("input[type=radio]:checked");
        out[symbol] = {
          hours: checked ? Number(checked.value) : null,
          weekend12: tr.querySelector(".weekend12").checked,
          remarks: (tr.querySelector(".remarks-input")?.value || "").trim()
        };
      });
      return out;
    }

    // ── Save / Load ─────────────────────────────────────────────────────────────
    async function saveClassifications() {
      const rows = document.querySelectorAll("#symbolsBody tr");
      if (!rows.length) { showStatus("Nothing to save — import a file first.", true); return; }

      const obj = readTableToObject();
      const total = Object.keys(obj).length;
      const unclassified = Object.values(obj).filter(v => v.hours === null).length;

      // Merge with anything already saved so symbols outside the current import aren't lost.
      const merged = { ...getSavedMap(), ...obj };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));

      const key = getKeyOrWarn();
      if (key) {
        try {
          showStatus("Saving to cloud…");
          await window.FB.setDoc(getDocRef(key), { savedAt: new Date().toISOString(), symbols: merged }, { merge: true });
        } catch (e) {
          console.error(e);
          showStatus("Cloud save failed (kept locally): " + (e?.message || e), true);
          return;
        }
      }

      showStatus(unclassified
        ? `Saved ✅ — ${total - unclassified}/${total} classified, ${unclassified} still need hours.`
        : `Saved ✅ — all ${total} symbols classified.`);
    }

    async function loadSavedFromCloud() {
      const key = getKeyOrWarn(); if (!key) return;
      try {
        showStatus("Loading saved classifications…");
        const snap = await window.FB.getDoc(getDocRef(key));
        if (!snap.exists()) { showStatus("No saved classifications in the cloud yet.", true); return; }
        const symbols = snap.data()?.symbols || {};
        if (!Object.keys(symbols).length) { showStatus("Cloud document has no symbols.", true); return; }

        localStorage.setItem(LOCAL_KEY, JSON.stringify(symbols));
        const allSymbols = Array.from(new Set([...currentSymbols, ...Object.keys(symbols)])).sort((a, b) => a.localeCompare(b));
        currentSymbols = allSymbols;
        renderSymbolRows(allSymbols, symbols);
        document.getElementById("importSummary").textContent =
          `Loaded ${Object.keys(symbols).length} previously saved duty symbol(s) from the cloud.`;
        showStatus(`Loaded ${Object.keys(symbols).length} saved symbols ✅`);
      } catch (e) {
        console.error(e);
        showStatus("Load failed: " + (e?.message || e), true);
      }
    }
