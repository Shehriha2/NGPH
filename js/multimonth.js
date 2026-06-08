    const AREAS_KEY   = "BCOT_AREAS_LIST_V1";
    const DUTIES_KEY  = "BCOT_DUTIES_ALL_V1";
    const APP_KEY     = window.BCOT_APP_KEY || "";

    const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];

    // ── Helpers ────────────────────────────────────────────────────────────────
    function showStatus(msg, type="success"){
      const el=document.getElementById("statusBox");
      el.textContent=msg; el.className="status-message status-"+type;
      el.style.display="block"; setTimeout(()=>el.style.display="none",3200);
    }

    function getAreasList(){ try{ return JSON.parse(localStorage.getItem(AREAS_KEY)||"[]")||[]; }catch{ return []; } }

    function loadAllDuties(){
      try{ return JSON.parse(localStorage.getItem(DUTIES_KEY)||"{}")||{}; }catch{ return {}; }
    }

    function getDutiesForArea(area){
      const all=loadAllDuties();
      if(area==="ALL") return all;
      const out={};
      Object.entries(all).forEach(([code,meta])=>{
        const areas=(meta.area||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
        if(!areas.length||areas.includes(area.toUpperCase())) out[code]=meta;
      });
      return out;
    }

    function isWeekend(year,month,day){ const d=new Date(year,month-1,day).getDay(); return d===5||d===6; }
    function getDaysInMonth(year,month){ return new Date(year,month,0).getDate(); }

    function getMonthDocRef(key,area,docId){
      return window.FB.doc(window.FB.db,'bcot_overtime_secure',key,'areas',area,'months',docId);
    }

    // ── Populate area dropdown ─────────────────────────────────────────────────
    function buildAreaSelect(){
      const areas=getAreasList();
      const sel=document.getElementById("mmArea");
      sel.innerHTML='<option value="ALL">All Areas</option>';
      areas.forEach(a=>{ const o=document.createElement("option"); o.value=a; o.textContent=a; sel.appendChild(o); });
      const last=(localStorage.getItem("BCOT_CURRENT_AREA_V1")||"ALL").toUpperCase();
      if(last==="ALL"||areas.includes(last)) sel.value=last;
    }

    // ── Load data ──────────────────────────────────────────────────────────────
    let loadedPayloads = {}; // key = "YYYY-MM"

    async function loadMultiMonth(){
      if(!APP_KEY){ showStatus("config.js not found — cannot load from cloud.","error"); return; }
      const area=document.getElementById("mmArea").value;
      const year=parseInt(document.getElementById("mmYear").value)||new Date().getFullYear();
      const start=parseInt(document.getElementById("mmStart").value);
      const end=parseInt(document.getElementById("mmEnd").value);
      if(start>end){ showStatus("'From' month must be ≤ 'To' month.","error"); return; }
      if(end-start>11){ showStatus("Maximum range is 12 months.","error"); return; }

      showStatus("Loading…","info");
      loadedPayloads={};
      const months=[];
      for(let m=start;m<=end;m++) months.push(m);

      const promises=months.map(async m=>{
        const docId=`${year}-${String(m).padStart(2,'0')}`;
        try{
          const snap=await window.FB.getDoc(getMonthDocRef(APP_KEY,area,docId));
          if(snap.exists()) loadedPayloads[docId]=snap.data();
          else loadedPayloads[docId]=null;
        }catch(e){
          console.warn(`Failed to load ${docId}:`,e);
          loadedPayloads[docId]=null;
        }
      });
      await Promise.all(promises);

      const loaded=Object.values(loadedPayloads).filter(Boolean).length;
      showStatus(`Loaded ${loaded}/${months.length} months ✅`);
      renderTable(area,year,months);
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    function renderTable(area,year,months){
      const DUTIES=getDutiesForArea(area);

      // Collect all staff names (preserve order of first appearance)
      const staffOrder=[];
      const staffSet=new Set();
      months.forEach(m=>{
        const docId=`${year}-${String(m).padStart(2,'0')}`;
        const payload=loadedPayloads[docId];
        if(!payload||!Array.isArray(payload.records)) return;
        payload.records.forEach(rec=>{
          const n=(rec.staffName||'').trim(); if(!n) return;
          if(!staffSet.has(n)){ staffSet.add(n); staffOrder.push(n); }
        });
      });

      if(!staffOrder.length){
        showStatus("No staff data found for the selected range.","error");
        document.getElementById("tableOuter").style.display="none";
        document.getElementById("summaryBar").style.display="none";
        return;
      }

      // Build header rows
      // Row 1: Staff Name | [Month header spanning days] ...
      // Row 2: (empty)   | 1 2 3 ... N | 1 2 3 ...
      let headRow1='<tr><th rowspan="2" style="min-width:160px;text-align:left;padding:3px 8px;position:sticky;left:0;z-index:4;background:#0f3460;">Staff Name</th>';
      let headRow2='<tr>';
      months.forEach((m,mi)=>{
        const days=getDaysInMonth(year,m);
        const sepClass=mi>0?'month-sep':'';
        headRow1+=`<th colspan="${days}" class="th-month ${sepClass}">${MONTH_NAMES[m]} ${year}</th>`;
        for(let d=1;d<=days;d++){
          const we=isWeekend(year,m,d);
          headRow2+=`<th class="${we?'th-weekend':'th-day'}${d===1&&mi>0?' month-sep':''}">${d}</th>`;
        }
      });
      headRow1+='</tr>';
      headRow2+='</tr>';

      // Build body rows
      let bodyHtml='';
      staffOrder.forEach(name=>{
        let rowHtml=`<td class="td-name">${name}</td>`;
        months.forEach((m,mi)=>{
          const docId=`${year}-${String(m).padStart(2,'0')}`;
          const payload=loadedPayloads[docId];
          const days=getDaysInMonth(year,m);
          // Find this staff's record in this month
          const rec=payload&&Array.isArray(payload.records)?payload.records.find(r=>(r.staffName||'').trim()===name):null;

          for(let d=1;d<=days;d++){
            const sepClass=d===1&&mi>0?' month-sep':'';
            const we=isWeekend(year,m,d);
            if(!rec){
              rowHtml+=`<td class="td-empty${we?' td-weekend':''}${sepClass}" style="min-width:18px;"></td>`;
              continue;
            }
            const raw=((rec.daysData||{})[`day${d}`]||'').toUpperCase();
            const base=raw.endsWith('_O')?raw.slice(0,-2):raw;
            const duty=DUTIES[base];
            if(duty){
              const bg=duty.color||'#1a4f8b';
              const dlen=raw.length>=4?String(raw.length):'';
              rowHtml+=`<td class="td-duty${sepClass}" style="background:${bg};min-width:18px;"${dlen?` data-dlen="${dlen}"`:''}>${raw}</td>`;
            } else {
              rowHtml+=`<td class="td-empty${we?' td-weekend':''}${sepClass}" style="min-width:18px;"></td>`;
            }
          }
        });
        bodyHtml+=`<tr>${rowHtml}</tr>`;
      });

      document.getElementById("mmTable").innerHTML=`<thead>${headRow1}${headRow2}</thead><tbody>${bodyHtml}</tbody>`;
      document.getElementById("tableOuter").style.display="block";

      // Summary
      buildSummary(area,year,months,DUTIES,staffOrder);
    }

    function buildSummary(area,year,months,DUTIES,staffOrder){
      const bar=document.getElementById("summaryBar");
      const content=document.getElementById("summaryContent");
      content.innerHTML='';
      months.forEach(m=>{
        const docId=`${year}-${String(m).padStart(2,'0')}`;
        const payload=loadedPayloads[docId];
        const count=payload&&Array.isArray(payload.records)?payload.records.filter(r=>(r.staffName||'').trim()).length:0;
        const div=document.createElement("div");
        div.style.cssText="min-width:120px;background:#f9fbfd;border:1px solid #e7edf3;border-radius:8px;padding:8px 12px;text-align:center;";
        div.innerHTML=`<div style="font-weight:800;font-size:13px;color:#1f4e79;">${MONTH_NAMES[m]}</div>
          <div style="font-size:11px;color:#6b7280;">${count} staff${payload?'':' — not saved'}</div>`;
        content.appendChild(div);
      });
      bar.style.display="block";
    }

    // ── Excel export ───────────────────────────────────────────────────────────
    function exportMultiMonthExcel(){
      const table=document.getElementById("mmTable");
      if(!table.rows.length){ showStatus("No data to export.","error"); return; }
      const area=document.getElementById("mmArea").value;
      const year=document.getElementById("mmYear").value;
      const start=MONTH_NAMES[parseInt(document.getElementById("mmStart").value)];
      const end=MONTH_NAMES[parseInt(document.getElementById("mmEnd").value)];
      const fname=`MultiMonth_${area}_${year}_${start}-${end}`.replace(/\s+/g,'_');

      // Build styled HTML
      let thead='', tbody='';
      for(let ri=0;ri<table.tHead.rows.length;ri++){
        thead+='<tr>';
        for(let ci=0;ci<table.tHead.rows[ri].cells.length;ci++){
          const cell=table.tHead.rows[ri].cells[ci];
          const cs=cell.colSpan>1?` colspan="${cell.colSpan}"`:'';
          const rs=cell.rowSpan>1?` rowspan="${cell.rowSpan}"`:'';
          thead+=`<th${cs}${rs} style="background:#1f4e79;color:#fff;font-weight:bold;border:1pt solid #aaa;padding:2pt 3pt;font-size:8pt;">${cell.textContent}</th>`;
        }
        thead+='</tr>';
      }
      for(let ri=0;ri<table.tBodies[0].rows.length;ri++){
        tbody+='<tr>';
        for(let ci=0;ci<table.tBodies[0].rows[ri].cells.length;ci++){
          const cell=table.tBodies[0].rows[ri].cells[ci];
          const bg=cell.style.background||cell.style.backgroundColor||'';
          const isName=cell.classList.contains('td-name');
          const isWeek=cell.classList.contains('td-weekend');
          const bgStyle=bg?`background:${bg};`:(isName?'background:#f9fbfd;':(isWeek?'background:#f0f0f0;':'background:#fff;'));
          const clr=bg?'color:#fff;':'color:#000;';
          const fw=isName||bg?'font-weight:bold;':'';
          tbody+=`<td style="${bgStyle}${clr}${fw}border:1pt solid #ddd;padding:2pt 3pt;text-align:center;font-size:8pt;white-space:nowrap;">${cell.textContent}</td>`;
        }
        tbody+='</tr>';
      }

      const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><style>table{border-collapse:collapse;}body{font-family:Arial;}</style></head>
        <body>
        <h2 style="font-size:13pt;color:#1f4e79;">Multi-Month Rota — ${area} — ${start} to ${end} ${year}</h2>
        <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
        </body></html>`;

      const blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=fname+'.xls'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      showStatus("Multi-month Excel exported ✅");
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    (function init(){
      buildAreaSelect();
      // Set year to current
      document.getElementById("mmYear").value=new Date().getFullYear();
    })();
  