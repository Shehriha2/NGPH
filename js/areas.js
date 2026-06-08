    const AREAS_LIST_KEY   = "BCOT_AREAS_LIST_V1";
    const AREA_BUDGETS_KEY = "BCOT_AREA_BUDGETS_V1";

    function showStatus(msg, isErr = false) {
      const el = document.getElementById("statusBox");
      el.textContent = msg;
      el.className = "status-message " + (isErr ? "status-error" : "status-success");
      el.style.display = "block";
      setTimeout(() => el.style.display = "none", 3200);
    }

    function getKeyOrWarn() {
      const key = (window.BCOT_APP_KEY || "").trim();
      if (!key) { showStatus("config.js not found — cloud sync disabled.", true); return null; }
      return key;
    }

    function getAreasList() {
      try { return JSON.parse(localStorage.getItem(AREAS_LIST_KEY) || "[]") || []; } catch { return []; }
    }

    function getBudgets() {
      try { return JSON.parse(localStorage.getItem(AREA_BUDGETS_KEY) || "{}") || {}; } catch { return {}; }
    }

    function readBudgetsFromTable() {
      const out = {};
      document.querySelectorAll("#budgetTable tbody tr").forEach(tr => {
        const area = tr.dataset.area;
        const val  = parseFloat(tr.querySelector("input").value || "0") || 0;
        out[area]  = val;
      });
      return out;
    }

    function renderTable(budgets) {
      const areas = getAreasList();
      const wrapper = document.getElementById("tableWrapper");
      if (!areas.length) {
        wrapper.innerHTML = '<div class="empty-msg">No areas found. Add areas in Staff.html or index.html first.</div>';
        return;
      }
      let html = `<table id="budgetTable">
        <thead><tr><th>#</th><th>Area</th><th>SAR Budget</th></tr></thead>
        <tbody>`;
      areas.forEach((area, idx) => {
        const val = budgets[area] != null ? Number(budgets[area]) : 0;
        html += `<tr data-area="${area}">
          <td>${idx + 1}</td>
          <td><b>${area}</b></td>
          <td><input type="number" min="0" step="0.01" value="${val}" placeholder="0.00"/></td>
        </tr>`;
      });
      html += "</tbody></table>";
      wrapper.innerHTML = html;
    }

    function saveBudgetsLocal() {
      const budgets = readBudgetsFromTable();
      localStorage.setItem(AREA_BUDGETS_KEY, JSON.stringify(budgets));
      showStatus(`Saved budgets for ${Object.keys(budgets).length} area(s) locally ✅`);
    }

    function loadBudgetsLocal() {
      const budgets = getBudgets();
      renderTable(budgets);
      showStatus("Loaded from local storage ✅");
    }

    function getBudgetDocRef(key) {
      return window.FB.doc(window.FB.db, "bcot_overtime_secure", key, "area_budgets", "main");
    }

    async function saveBudgetsToCloud() {
      const key = getKeyOrWarn(); if (!key) return;
      try {
        const budgets = readBudgetsFromTable();
        await window.FB.setDoc(getBudgetDocRef(key), { budgets, savedAt: new Date().toISOString() }, { merge: true });
        showStatus("Saved budgets to cloud ✅");
      } catch(e) { console.error(e); showStatus("Cloud save failed: " + (e?.message||e), true); }
    }

    async function loadBudgetsFromCloud() {
      const key = getKeyOrWarn(); if (!key) return;
      showStatus("Loading from cloud…");
      try {
        const snap = await window.FB.getDoc(getBudgetDocRef(key));
        if (!snap.exists()) { showStatus("No budget data in cloud yet.", true); return; }
        const budgets = snap.data()?.budgets || {};
        localStorage.setItem(AREA_BUDGETS_KEY, JSON.stringify(budgets));
        renderTable(budgets);
        showStatus("Loaded budgets from cloud ✅");
      } catch(e) { console.error(e); showStatus("Cloud load failed: " + (e?.message||e), true); }
    }

    // Init
    (function init() {
      const budgets = getBudgets();
      renderTable(budgets);
      if (!getAreasList().length) showStatus("No areas found — add areas in Staff.html or index.html first.", true);
    })();
  