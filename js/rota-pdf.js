/* ═══════════════════════════════════════════════════════════════════════════
   BCOT Rota — Save as PDF  (js/rota-pdf.js)
   ───────────────────────────────────────────────────────────────────────────
   The "Save PDF" button in index.html downloads the rota as a landscape A4 PDF:
   every day of the month, the Hours column, and only the staff whose Hours are
   above 0. Always the WHOLE rota — on-screen search / duty filters are ignored.

   • Built in the browser with jsPDF (js/vendor/jspdf.umd.min.js, MIT licence).
     It is only loaded the first time the button is clicked, so it adds nothing
     to the page's normal load time.
   • collect()  reads the live #rotaTable into a plain data object (needs the DOM)
   • render()   draws that data with jsPDF (pure — no DOM, so it can be tested alone)
   • Latin text only (the standard PDF fonts): anything else is printed as "?".
   • Nothing is read from or written to Firebase.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const JSPDF_SRC     = 'js/vendor/jspdf.umd.min.js?v=4.2.1';
  const LOGO_SRC      = 'MNGHA-Logo.png';
  const ROWS_PER_PAGE = 18;                       // same as the printed rota
  const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const NAVY = [31, 78, 121], WEEKEND_HDR = [180, 83, 9], WHITE = [255, 255, 255], INK = [17, 24, 39];

  let busy = false;

  /* ── Helpers ────────────────────────────────────────────────────────────── */

  // Standard PDF fonts can only draw Latin-1. Map common typographic characters
  // to plain ones and print anything else as "?" instead of garbled bytes.
  function latin(s) {
    return String(s == null ? '' : s)
      .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/…/g, '...')
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\xA1-\xFF]/g, '?')
      .trim();
  }

  // 'rgb(…)' / 'rgba(…)' / '#rgb' / '#rrggbb'  ->  [r,g,b] on white, or null if transparent / unknown
  function parseColor(str) {
    if (!str) return null;
    str = String(str).trim();
    let m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
    if (m) {
      let a = 1;
      if (m[4] != null) a = String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (!(a > 0)) return null;                              // fully transparent
      const c = [+m[1], +m[2], +m[3]];
      return (a >= 1 ? c : c.map(v => v * a + 255 * (1 - a))).map(v => Math.max(0, Math.min(255, Math.round(v))));
    }
    m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    }
    return null;
  }

  // Any CSS colour (named, hsl, …) -> [r,g,b], via the browser
  function cssToRgb(css) {
    const direct = parseColor(css);
    if (direct || typeof document === 'undefined' || !css) return direct;
    const el = document.createElement('span');
    el.style.color = css;
    document.body.appendChild(el);
    const rgb = parseColor(getComputedStyle(el).color);
    el.remove();
    return rgb;
  }

  function styleOf(el) {
    if (!el) return { bg: null, fg: null, bold: false };
    const cs = getComputedStyle(el);
    return { bg: parseColor(cs.backgroundColor), fg: parseColor(cs.color), bold: (parseInt(cs.fontWeight, 10) || 400) >= 600 };
  }

  // Text that belongs to the cell itself (ignores child elements such as the 🔒 vacation badge)
  function ownText(el) {
    let s = '';
    el.childNodes.forEach(n => { if (n.nodeType === 3) s += n.nodeValue; });
    return s.trim();
  }

  function notify(msg, type) {
    if (typeof showStatusMessage === 'function') showStatusMessage(msg, type);
    else if (type === 'error') alert(msg);
  }

  /* ── 1. Read the live table ─────────────────────────────────────────────── */
  function collect() {
    const $ = id => document.getElementById(id);
    const headerRow = $('rotaHeaderRow');
    if (!headerRow) throw new Error('The rota table was not found on this page.');
    const ths = Array.from(headerRow.children);
    const hoursTh = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'hours');
    if (hoursTh < 2) throw new Error('Could not find the Hours column.');

    const month = parseInt($('monthSelect') && $('monthSelect').value, 10) || (new Date().getMonth() + 1);
    const year  = Number($('yearInput') && $('yearInput').value) || new Date().getFullYear();

    const days = [];
    for (let i = 1; i < hoursTh; i++) {
      const n = parseInt(ths[i].textContent, 10) || i;
      days.push(Object.assign({ n, wd: WEEKDAYS[new Date(year, month - 1, n).getDay()], weekend: ths[i].classList.contains('weekend') }, styleOf(ths[i])));
    }

    const rows = [];
    document.querySelectorAll('#rotaTable tbody tr').forEach(tr => {
      const hc = tr.querySelector('.hours-cell');
      if (!hc) return;
      const hIdx = Array.from(tr.cells).indexOf(hc);
      const nameCell = tr.cells[0];
      const input = nameCell && nameCell.querySelector('input');
      const name = (input ? input.value : (nameCell ? nameCell.textContent : '')).trim();
      const cells = [];
      for (let i = 1; i <= days.length; i++) {
        const td = i < hIdx ? tr.cells[i] : null;
        cells.push(td ? Object.assign({ t: ownText(td) }, styleOf(td)) : { t: '', bg: null, fg: null, bold: false });
      }
      rows.push({ name, hours: Number(hc.textContent) || 0, hoursText: hc.textContent.trim(), cells, nameS: styleOf(nameCell), hoursS: styleOf(hc) });
    });

    const txt = id => ($(id) && $(id).textContent || '').trim();
    return {
      title: (($('rotaTitleInput') && $('rotaTitleInput').value) || '').trim() || 'Staff Rota',
      rotaName: txt('printRotaName') || txt('rotaNameLabel'),
      areaLabel: txt('printAreaLabel'),
      month, year, monthName: MONTHS[month - 1] || '',
      days, rows,
      head: { nameS: styleOf(ths[0]), hoursS: styleOf(ths[hoursTh]) },
      generatedAt: new Date()
    };
  }

  // Duty legend: only the duty codes that appear in the exported rows
  function legendFor(rows) {
    const D = (typeof DUTIES !== 'undefined' && DUTIES) ? DUTIES : {};
    const used = new Set();
    rows.forEach(r => r.cells.forEach(c => {
      let v = (c.t || '').toUpperCase();
      if (v.endsWith('_O')) v = v.slice(0, -2);
      if (v) used.add(v);
    }));
    return Array.from(used).filter(code => D[code]).sort().map(code => ({
      text: `${D[code].label || code} (${code}) - ${Number(D[code].hours) || 0}h`,
      rgb: cssToRgb(D[code].color) || [220, 220, 220]
    }));
  }

  /* ── 2. Draw the PDF (pure: data + jsPDF in, document out) ──────────────── */
  function render(jsPDF, data, opts) {
    opts = opts || {};
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const W = doc.internal.pageSize.getWidth();          // 297
    const H = doc.internal.pageSize.getHeight();         // 210
    const M = 8, BAND_H = 21, TABLE_Y = 26, HDR_H = 9, ROW_H = 7.4, FOOT_Y = H - 4;
    const nameW = 46, hoursW = 13;
    const nDays = data.days.length;
    const dayW = (W - 2 * M - nameW - hoursW) / nDays;
    const rows = data.rows;
    const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
    const legend = data.legend || [];

    doc.setProperties({
      title: latin(`${data.title} - ${data.monthName} ${data.year}`),
      subject: latin(data.rotaName || 'Staff rota'),
      creator: 'BCOT Rota'
    });

    // — drawing primitives —
    const fill = c => { const v = c || WHITE; doc.setFillColor(v[0], v[1], v[2]); };
    const ink  = c => { const v = c || INK;   doc.setTextColor(v[0], v[1], v[2]); };
    const box = (x, y, w, h, bg) => { fill(bg); doc.setDrawColor(165, 165, 165); doc.setLineWidth(0.1); doc.rect(x, y, w, h, 'FD'); };
    const font = (size, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); };
    function centred(str, cx, cy, maxW, size, bold) {          // shrinks long codes to fit the cell
      let s = size; font(s, bold);
      while (s > 3.5 && doc.getTextWidth(str) > maxW) { s -= 0.5; font(s, bold); }
      doc.text(str, cx, cy, { align: 'center', baseline: 'middle' });
    }
    function leftTrimmed(str, x, cy, maxW, size, bold) {       // truncates long names with "..."
      font(size, bold);
      let t = str;
      while (t.length > 1 && doc.getTextWidth(t) > maxW) t = t.slice(0, -1);
      if (t !== str) t = t.replace(/.$/, '').replace(/\s+$/, '') + '...';
      doc.text(t, x, cy, { baseline: 'middle' });
    }

    // — legend layout is measured first so we know whether it fits under the last page's table —
    function layoutLegend() {
      font(6.5, false);
      const maxW = W - 2 * M, chipW = 7, lineH = 5.2;
      let x = 0, line = 0;
      const placed = legend.map(it => {
        const label = latin(it.text);
        const w = chipW + 1.6 + doc.getTextWidth(label) + 4;
        if (x > 0 && x + w > maxW) { x = 0; line++; }
        const p = { it, label, x, line }; x += w; return p;
      });
      return { placed, height: legend.length ? 6 + (line + 1) * lineH : 0 };
    }
    const lg = layoutLegend();
    const lastCount = rows.length - (pages - 1) * ROWS_PER_PAGE;
    const legendTop = TABLE_Y + HDR_H + Math.max(lastCount, 0) * ROW_H + 4;
    const legendOnOwnPage = lg.height > 0 && (legendTop + lg.height > H - 9);

    function drawBand() {
      doc.setFillColor(26, 79, 139); doc.rect(0, 0, W, BAND_H, 'F');
      doc.setFillColor(47, 125, 87); doc.rect(0, BAND_H, W, 1.2, 'F');
      doc.setFillColor(255, 255, 255); doc.roundedRect(M - 2, 2.2, 17, 16.6, 1.5, 1.5, 'F');
      if (opts.logo && opts.logo.dataUrl) {
        const bw = 15, bh = 14.6, k = Math.min(bw / opts.logo.w, bh / opts.logo.h);
        const w = opts.logo.w * k, h = opts.logo.h * k;
        doc.addImage(opts.logo.dataUrl, 'PNG', M - 1 + (bw - w) / 2, 3.2 + (bh - h) / 2, w, h);
      }
      doc.setTextColor(255, 255, 255);
      font(12, true);   doc.text('Ministry of National Guard Health Affairs', W / 2, 7.2, { align: 'center' });
      font(9, false);   doc.text('KAMC-WR - Pharmaceutical Care Department', W / 2, 12.2, { align: 'center' });
      font(10.5, true); doc.text(latin(`${data.title} - ${data.monthName} ${data.year}`), W / 2, 17.6, { align: 'center' });
      if (data.rotaName) { font(8, true); doc.text(latin(data.rotaName), W - M, 8, { align: 'right' }); }
      if (data.areaLabel && data.areaLabel !== data.rotaName) { font(8, false); doc.text(latin('Area: ' + data.areaLabel), W - M, 12.5, { align: 'right' }); }
    }

    function drawTableHeader(y) {
      const nb = data.head.nameS || {}, hb = data.head.hoursS || {};
      box(M, y, nameW, HDR_H, nb.bg || NAVY);
      ink(nb.fg || WHITE); font(7, true); doc.text('Staff Name (Badge No)', M + 1.2, y + HDR_H / 2, { baseline: 'middle' });
      data.days.forEach((d, i) => {
        const x = M + nameW + i * dayW;
        box(x, y, dayW, HDR_H, d.bg || (d.weekend ? WEEKEND_HDR : NAVY));
        ink(d.fg || WHITE);
        font(7, true);  doc.text(String(d.n), x + dayW / 2, y + 3.5, { align: 'center', baseline: 'middle' });
        font(5, false); doc.text(d.wd, x + dayW / 2, y + 7, { align: 'center', baseline: 'middle' });
      });
      const hx = M + nameW + nDays * dayW;
      box(hx, y, hoursW, HDR_H, hb.bg || NAVY);
      ink(hb.fg || WHITE); font(7, true); doc.text('Hours', hx + hoursW / 2, y + HDR_H / 2, { align: 'center', baseline: 'middle' });
    }

    function drawRow(r, y) {
      box(M, y, nameW, ROW_H, r.nameS && r.nameS.bg);
      ink(r.nameS && r.nameS.fg); leftTrimmed(latin(r.name), M + 1.2, y + ROW_H / 2, nameW - 2.4, 8, false);
      r.cells.forEach((c, i) => {
        const x = M + nameW + i * dayW;
        box(x, y, dayW, ROW_H, c.bg);
        if (c.t) { ink(c.fg); centred(latin(c.t), x + dayW / 2, y + ROW_H / 2, dayW - 0.8, 7, c.bold); }
      });
      const hx = M + nameW + nDays * dayW, hs = r.hoursS || {};
      box(hx, y, hoursW, ROW_H, hs.bg);
      ink(hs.fg); centred(latin(r.hoursText || String(r.hours)), hx + hoursW / 2, y + ROW_H / 2, hoursW - 1.6, 8, true);
    }

    function drawLegend(y) {
      if (!lg.height) return;
      ink(INK); font(7, true); doc.text('Duty legend', M, y + 2);
      lg.placed.forEach(p => {
        const x = M + p.x, cy = y + 6 + p.line * 5.2;
        fill(p.it.rgb); doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.1); doc.rect(x, cy, 7, 3.6, 'FD');
        ink(INK); font(6.5, false); doc.text(p.label, x + 8.6, cy + 1.8, { baseline: 'middle' });
      });
    }

    for (let p = 0; p < pages; p++) {
      if (p > 0) doc.addPage();
      drawBand();
      let y = TABLE_Y;
      drawTableHeader(y); y += HDR_H;
      rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE).forEach(r => { drawRow(r, y); y += ROW_H; });
      if (p === pages - 1 && !legendOnOwnPage) drawLegend(y + 4);
    }
    if (legendOnOwnPage) { doc.addPage(); drawBand(); drawLegend(TABLE_Y); }

    const total = doc.getNumberOfPages();
    const stamp = data.generatedAt instanceof Date
      ? data.generatedAt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      font(7, false); doc.setTextColor(90, 90, 90);
      doc.text(latin('Generated ' + stamp), M, FOOT_Y);
      doc.text(latin(`${rows.length} staff with hours` + (data.staffTotal ? ` (of ${data.staffTotal} in the rota)` : '')), W / 2, FOOT_Y, { align: 'center' });
      doc.text(`Page ${i} / ${total}`, W - M, FOOT_Y, { align: 'right' });
    }
    return doc;
  }

  /* ── 3. Loading + the button action ─────────────────────────────────────── */
  function ensureJsPDF() {
    if (root.jspdf && root.jspdf.jsPDF) return Promise.resolve(root.jspdf.jsPDF);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSPDF_SRC;
      s.onload  = () => (root.jspdf && root.jspdf.jsPDF) ? resolve(root.jspdf.jsPDF) : reject(new Error('The PDF library loaded but is not usable.'));
      s.onerror = () => reject(new Error('Could not load the PDF library (' + JSPDF_SRC.split('?')[0] + ').'));
      document.head.appendChild(s);
    });
  }

  // Header logo, shrunk first: the original PNG is ~1 MB and would bloat every PDF.
  function loadLogo() {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve({ dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height });
        } catch (e) { resolve(null); }                   // e.g. canvas blocked: the PDF just has no logo
      };
      img.onerror = () => resolve(null);
      img.src = LOGO_SRC;
    });
  }

  function fileName(data) {
    const slug = s => latin(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const allAreas = !data.rotaName || /^all areas$/i.test(data.rotaName);
    return allAreas ? `Rota_AllAreas_${data.monthName}-${data.year}.pdf` : `Rota_${slug(data.rotaName)}_${data.year}.pdf`;
  }

  // Builds the document without downloading it (also used by the tests)
  async function build() {
    const data = collect();
    const staffTotal = data.rows.filter(r => r.name).length;
    const worked = data.rows.filter(r => r.hours > 0);
    if (!worked.length) return { empty: true, staffTotal };
    data.rows = worked;
    data.staffTotal = staffTotal;
    data.legend = legendFor(worked);
    const [jsPDF, logo] = await Promise.all([ensureJsPDF(), loadLogo()]);
    return { doc: render(jsPDF, data, { logo }), filename: fileName(data), count: worked.length, staffTotal };
  }

  async function save() {
    if (busy) return;
    busy = true;
    try {
      notify('Building PDF…', 'info');
      const r = await build();
      if (r.empty) {
        notify(r.staffTotal
          ? `No PDF made: 0 of ${r.staffTotal} staff have hours. Check the Hours column.`
          : 'No PDF made: the rota has no staff yet.', 'error');
        return;
      }
      r.doc.save(r.filename);
      notify(`Saved ${r.filename} (${r.count} staff)`, 'success');
    } catch (e) {
      console.error('[RotaPDF]', e);
      notify('Could not create the PDF: ' + (e && e.message || e), 'error');
    } finally {
      busy = false;
    }
  }

  root.RotaPDF = { save, build, collect, render, legendFor, ensureJsPDF, latin, parseColor };
})(typeof window !== 'undefined' ? window : globalThis);
