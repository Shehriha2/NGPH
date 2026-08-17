    // ── Status toast ─────────────────────────────────────────────────────────
    function showStatus(msg, isErr = false) {
      const el = document.getElementById("statusBox");
      el.textContent = msg;
      el.className = "status " + (isErr ? "err" : "ok");
      el.style.display = "block";
      setTimeout(() => el.style.display = "none", 2800);
    }

    function getKeyOrWarn() {
      const key = (window.BCOT_APP_KEY || "").trim();
      if (!key) { showStatus("config.js not found — cloud sync disabled.", true); return null; }
      return key;
    }

    function escapeHtml(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
    }

    function pad2(n) { return String(n).padStart(2, "0"); }

    // ── State ────────────────────────────────────────────────────────────────
    const DRUGS_LS = "BCOT_UDS_DRUGS_V1";
    let drugs = [];             // [{name, code}]
    let _selectedDrug = null;   // {name, code} once picked from the datalist
    let _productionDate = null; // Date, set only by a successful GS1 scan

    // ── Drug list: local + cloud ────────────────────────────────────────────
    function writeDrugsLocal() { localStorage.setItem(DRUGS_LS, JSON.stringify(drugs)); }
    function readDrugsLocal()  { try { return JSON.parse(localStorage.getItem(DRUGS_LS) || "[]") || []; } catch { return []; } }

    function getDrugsDocRef(key) {
      return window.FB.doc(window.FB.db, "bcot_overtime_secure", key, "drugs_named", "DRUG_POOL");
    }

    function rebuildDrugsDatalist() {
      const dl = document.getElementById("drugsDatalist");
      dl.innerHTML = "";
      drugs.forEach(d => {
        const o = document.createElement("option");
        o.value = `${d.name} (${d.code})`;
        dl.appendChild(o);
      });
      document.getElementById("drugCount").textContent =
        drugs.length ? `${drugs.length} drug(s) loaded` : "No drugs loaded yet — import an Excel file.";
    }

    async function saveDrugsToCloud() {
      const key = getKeyOrWarn(); if (!key) return;
      if (!drugs.length) { showStatus("No drugs to save.", true); return; }
      try {
        await window.FB.setDoc(getDrugsDocRef(key), { savedAt: new Date().toISOString(), drugs }, { merge: true });
        showStatus(`${drugs.length} drug(s) saved to cloud ✅`);
      } catch (e) { showStatus("Save failed: " + (e?.message || e), true); }
    }

    async function loadDrugsFromCloud() {
      const key = getKeyOrWarn(); if (!key) return;
      showStatus("Loading drugs from cloud…");
      try {
        const snap = await window.FB.getDoc(getDrugsDocRef(key));
        if (!snap.exists()) { showStatus("No drugs found in cloud. Import & save first.", true); return; }
        const data = snap.data()?.drugs;
        if (!Array.isArray(data) || !data.length) { showStatus("Cloud document has no drugs.", true); return; }
        drugs = data;
        rebuildDrugsDatalist();
        writeDrugsLocal();
        showStatus(`Loaded ${data.length} drug(s) from cloud ✅`);
      } catch (e) { showStatus("Load failed: " + (e?.message || e), true); }
    }

    // ── Excel import ─────────────────────────────────────────────────────────
    function findCol(headers, patterns) {
      for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i] || "").trim().toLowerCase();
        if (patterns.some(p => p.test(h))) return i;
      }
      return -1;
    }

    function handleDrugFileSelect(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          if (!rows.length) throw new Error("Sheet is empty.");
          const headers = rows[0];
          const nameCol = findCol(headers, [/^drug\s*name$/, /^name$/]);
          const codeCol = findCol(headers, [/^drug\s*code$/, /^code$/]);
          if (nameCol === -1 || codeCol === -1) throw new Error('Could not find "Drug Name" / "Drug Code" columns.');
          const out = [];
          for (let i = 1; i < rows.length; i++) {
            const name = String(rows[i][nameCol] || "").trim();
            const code = String(rows[i][codeCol] || "").trim();
            if (!name || !code) continue;
            out.push({ name, code });
          }
          if (!out.length) throw new Error("No valid drug rows found.");
          drugs = out;
          rebuildDrugsDatalist();
          writeDrugsLocal();
          showStatus(`Imported ${out.length} drug(s) ✅ — click "Save to Cloud" to keep them.`);
        } catch (err) {
          showStatus("Import failed: " + (err?.message || err), true);
        } finally {
          input.value = "";
        }
      };
      reader.readAsArrayBuffer(file);
    }

    // ── Drug picker ──────────────────────────────────────────────────────────
    function onDrugPicked() {
      const val = document.getElementById("drugInput").value;
      const m = val.match(/\(([^)]+)\)\s*$/);
      const code = m ? m[1].trim() : "";
      _selectedDrug = drugs.find(d => d.code === code && val.startsWith(d.name)) || null;
      updatePreview();
    }

    // ── GS1 barcode scan (source package) ───────────────────────────────────
    // Same Application-Identifier structure MedCheck.html already parses:
    // 01=GTIN(14) 11=production(YYMMDD) 17=expiry(YYMMDD) 10=batch(var) 21=serial(var)
    const GS1_AI_DEFS = {
      "01": { length: 14, field: "gtin" },
      "11": { length: 6,  field: "productionRaw" },
      "17": { length: 6,  field: "expiryRaw" },
      "10": { variable: true, field: "batch" },
      "21": { variable: true, field: "serial" }
    };
    const GS1_SEPARATOR_RE = /[\x1D^]/;

    function parseGS1YYMMDD(str) {
      if (!/^\d{6}$/.test(str)) return null;
      const year  = 2000 + parseInt(str.slice(0, 2), 10);
      const month = parseInt(str.slice(2, 4), 10) - 1;
      const day   = parseInt(str.slice(4, 6), 10);
      if (day === 0) return new Date(year, month + 1, 0);
      const d = new Date(year, month, day);
      if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
      return d;
    }

    function extractGS1Details(rawInput) {
      if (!rawInput.startsWith("01") || rawInput.length <= 16) return null;
      const fields = {};
      let cursor = 0;
      while (cursor < rawInput.length) {
        const ai = rawInput.slice(cursor, cursor + 2);
        const def = GS1_AI_DEFS[ai];
        if (!def) break; // unrecognized AI — stop rather than misparse the remainder
        cursor += 2;
        if (def.variable) {
          const rest = rawInput.slice(cursor);
          const sepIdx = rest.search(GS1_SEPARATOR_RE);
          const end = sepIdx === -1 ? rawInput.length : cursor + sepIdx;
          fields[def.field] = rawInput.slice(cursor, end);
          cursor = sepIdx === -1 ? rawInput.length : end + 1;
        } else {
          fields[def.field] = rawInput.slice(cursor, cursor + def.length);
          cursor += def.length;
        }
      }
      if (!fields.gtin) return null;
      return {
        gtin: fields.gtin,
        batch: fields.batch || "",
        expiryDateObj:     fields.expiryRaw     ? parseGS1YYMMDD(fields.expiryRaw)     : null,
        productionDateObj: fields.productionRaw ? parseGS1YYMMDD(fields.productionRaw) : null
      };
    }

    function toInputDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

    function handleGS1Scan(raw) {
      raw = (raw || "").trim();
      if (!raw) return;
      const details = extractGS1Details(raw);
      if (!details) { showStatus("Could not read that as a GS1 barcode.", true); return; }
      if (details.batch) document.getElementById("lotInput").value = details.batch;
      if (details.expiryDateObj) document.getElementById("expInput").value = toInputDate(details.expiryDateObj);
      _productionDate = details.productionDateObj || null;
      showStatus("Scanned ✅ Lot & Expiry filled from barcode.");
      updatePreview();
    }

    // ── UDS QR content ───────────────────────────────────────────────────────
    // Fixed template confirmed by the department: 00011022@drugCode@prod@exp@01@J01
    function toDDMMYY(d)   { return pad2(d.getDate()) + pad2(d.getMonth() + 1) + pad2(d.getFullYear() % 100); }
    function toDisplayDMY(d) { return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear(); }

    function buildQRText(drugCode, prodDate, expDate) {
      return `00011022@${drugCode}@${toDDMMYY(prodDate)}@${toDDMMYY(expDate)}@01@J01`;
    }

    function currentLabelData() {
      if (!_selectedDrug) return null;
      const qty    = document.getElementById("qtyInput").value.trim();
      const lot    = document.getElementById("lotInput").value.trim();
      const expVal = document.getElementById("expInput").value;
      if (!qty || !lot || !expVal) return null;
      const expDate  = new Date(expVal + "T00:00:00");
      const prodDate = _productionDate || new Date();
      return {
        drugName: _selectedDrug.name,
        drugCode: _selectedDrug.code,
        qty, lot,
        expDisplay: toDisplayDMY(expDate),
        qrText: buildQRText(_selectedDrug.code, prodDate, expDate)
      };
    }

    // ── Label rendering (screen preview + print use the same markup) ───────
    function buildLabelEl(data) {
      const wrap = document.createElement("div");
      wrap.className = "uds-label";
      wrap.innerHTML = `
        <div class="qr-box"><canvas></canvas></div>
        <div class="info">
          <div class="drug-name">${escapeHtml(data.drugName)}</div>
          <div class="line">Qty: ${escapeHtml(data.qty)}</div>
          <div class="line">Lot : ${escapeHtml(data.lot)}</div>
          <div class="line">Exp: ${escapeHtml(data.expDisplay)}</div>
        </div>`;
      const canvas = wrap.querySelector("canvas");
      const ready = new Promise(resolve => {
        // 500px native resolution keeps the code crisp at thermal-printer DPI even
        // though it's CSS-scaled down to the qr-box's physical 2.6cm on screen/print.
        QRCode.toCanvas(canvas, data.qrText, { width: 500, margin: 0 }, function(err) {
          if (err) console.error("QR render failed:", err);
          resolve();
        });
      });
      return { el: wrap, ready };
    }

    // Drug names vary a lot in length and must never be cut off, so the name
    // wraps (CSS) and this shrinks its font-size until the wrapped block plus
    // the three fixed lines actually fit the label's height — rather than
    // betting on one static size that could clip an unusually long name.
    // Must run after `wrap` is attached to the document (needs real layout).
    function fitDrugName(wrap) {
      const nameEl = wrap.querySelector(".drug-name");
      const lineEls = Array.from(wrap.querySelectorAll(".line"));
      const cs = getComputedStyle(wrap);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const available = wrap.clientHeight - padTop - padBottom - 2; // small safety margin
      const linesHeight = lineEls.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
      const budget = Math.max(available - linesHeight, 0);

      let fontSize = 14;
      nameEl.style.fontSize = fontSize + "pt";
      while (nameEl.scrollHeight > budget && fontSize > 7) {
        fontSize -= 0.5;
        nameEl.style.fontSize = fontSize + "pt";
      }
    }

    function updatePreview() {
      const box = document.getElementById("labelPreviewBox");
      box.innerHTML = "";
      const data = currentLabelData();
      if (!data) return;
      const { el } = buildLabelEl(data);
      box.appendChild(el);
      fitDrugName(el);
    }

    // ── Print + log ──────────────────────────────────────────────────────────
    function getWho() {
      try {
        const s = JSON.parse(localStorage.getItem("BCOT_AUTH_SESSION_V1") || "null") || {};
        return { name: [s.nameTitle, s.name].filter(Boolean).join(" ") || s.name || "Unknown", badge: s.badge || s.id || "" };
      } catch { return { name: "Unknown", badge: "" }; }
    }

    async function logPrint(data, copies) {
      const key = getKeyOrWarn(); if (!key) return;
      const who = getWho();
      try {
        await window.FB.addDoc(
          window.FB.collection(window.FB.db, "bcot_overtime_secure", key, "uds_label_prints"),
          {
            printedAt: new Date().toISOString(),
            printedBy: who.name,
            printedByBadge: who.badge,
            drugName: data.drugName,
            drugCode: data.drugCode,
            lot: data.lot,
            expiryDate: data.expDisplay,
            qty: data.qty,
            copies
          }
        );
        loadPrintHistory();
      } catch (e) { console.error("Print log failed:", e); }
    }

    async function printLabels() {
      const data = currentLabelData();
      if (!data) { showStatus("Fill in Drug, Qty, Lot and Expiry first.", true); return; }
      const copies = Math.max(1, parseInt(document.getElementById("copiesInput").value, 10) || 1);

      const area = document.getElementById("printArea");
      area.innerHTML = "";
      const readies = [];
      for (let i = 0; i < copies; i++) {
        const { el, ready } = buildLabelEl(data);
        area.appendChild(el);
        fitDrugName(el);
        readies.push(ready);
      }
      await Promise.all(readies); // wait for every QR canvas to finish drawing before printing
      window.print();
      await logPrint(data, copies);
    }

    // ── Print history ────────────────────────────────────────────────────────
    async function loadPrintHistory() {
      const key = getKeyOrWarn(); if (!key) return;
      const tbody = document.getElementById("historyBody");
      const emptyHint = document.getElementById("historyEmptyHint");
      try {
        const q = window.FB.query(
          window.FB.collection(window.FB.db, "bcot_overtime_secure", key, "uds_label_prints"),
          window.FB.orderBy("printedAt", "desc"),
          window.FB.limit(50)
        );
        const snap = await window.FB.getDocs(q);
        if (snap.empty) { tbody.innerHTML = ""; emptyHint.style.display = "block"; return; }
        emptyHint.style.display = "none";
        tbody.innerHTML = snap.docs.map(docSnap => {
          const r = docSnap.data();
          const dt = r.printedAt
            ? new Date(r.printedAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
            : "-";
          return `<tr>
            <td>${escapeHtml(dt)}</td>
            <td>${escapeHtml(r.printedBy || "-")}</td>
            <td>${escapeHtml(r.drugName || "-")} <span style="color:#9ca3af;">(${escapeHtml(r.drugCode || "-")})</span></td>
            <td>${escapeHtml(r.lot || "-")}</td>
            <td>${escapeHtml(r.expiryDate || "-")}</td>
            <td>${escapeHtml(String(r.qty ?? "-"))}</td>
            <td>${escapeHtml(String(r.copies ?? "-"))}</td>
          </tr>`;
        }).join("");
      } catch (e) { console.error("History load failed:", e); }
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    (async function init() {
      drugs = readDrugsLocal();
      rebuildDrugsDatalist();
      let t = 0; while (!window.FB && t++ < 60) await new Promise(r => setTimeout(r, 50));
      if (!drugs.length) await loadDrugsFromCloud();
      loadPrintHistory();
    })();
