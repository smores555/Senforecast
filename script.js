// Seniority Forecast + Retirements Tables/Projector
// Works with:
//  - data/index.json (lists each base/seat JSON file)
//  - data/<base>_<seat>.json (rosters)
//  - data/data.json (optional master list w/ retire dates)
//  - data/retirements.json (aggregate retirements by base & year)

let INDEX = null, MASTER = null, RETS = null;

function banner(){
  let el = document.getElementById('dataError');
  if(!el){
    el = document.createElement('div');
    el.id = 'dataError';
    el.className = 'banner';
    document.body.prepend(el);
  }
  return el;
}
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function hideError(){ const el=document.getElementById('dataError'); if(el){ el.style.display='none'; } }

async function loadJsonSafe(paths){
  for(const p of paths){
    try{
      const r = await fetch(p, { cache: 'no-store' });
      if(!r.ok) continue;
      return await r.json();
    }catch(_){}
  }
  throw new Error('Could not load: ' + paths.join(', '));
}
const n = (v)=> { const x = Number(v); return Number.isFinite(x) ? x : null; };

// --- Date parsing (handles "Dec-27", "Mar-28", "Sept-29", ISO-like, etc.) ---
function parseDate(v){
  if(!v) return null;
  v = String(v).trim();
  let m;

  // MMM-YY (Dec-27, Sept-29)
  if((m = v.match(/^([A-Za-z]{3,4})-(\d{2})$/))){
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
    const idx = months[m[1].toLowerCase()] ?? 0;
    return new Date(2000 + (+m[2]), idx, 1);
  }
  // YYYY-MM or YYYY-MM-DD
  if((m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/))) return new Date(+m[1], +m[2]-1, m[3]?+m[3]:1);
  // M/D/YY or M/D/YYYY
  if((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))){ let yy=+m[3]; if(yy<100) yy=2000+yy; return new Date(yy, +m[1]-1, +m[2]); }
  // YYYY/MM
  if((m = v.match(/^(\d{4})\/(\d{1,2})$/))) return new Date(+m[1], +m[2]-1, 1);
  // MM-YYYY
  if((m = v.match(/^(\d{1,2})-(\d{4})$/))) return new Date(+m[2], +m[1]-1, 1);
  // MMM YYYY
  if((m = v.match(/^([A-Za-z]{3,})\s+(\d{4})$/))){
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
    const idx = months[m[1].toLowerCase()] ?? 0;
    return new Date(+m[2], idx, 1);
  }
  return null;
}

const RETIRE_KEYS = ['retire_month','retireMonth','retire_date','retireDate'];
function retireField(p){ for(const k of RETIRE_KEYS){ const v=p?.[k]; if(v) return v; } return null; }

// ------- Helpers -------
function percentStr(pos, den){ if(!den || !pos) return '—'; const v = Math.round(((pos/den)*100)*10)/10; return v.toFixed(1).replace(/\.0$/,'')+'%'; }
function inferRoster(data){ if(Array.isArray(data)) return data; if(data?.pilots) return data.pilots; if(data?.captains) return data.captains; if(data?.rows) return data.rows; if(data?.list) return data.list; return []; }
function groupByBase(index){
  const m = new Map();
  for(const c of (index.combos||[])){
    if(!m.has(c.base)) m.set(c.base, []);
    m.get(c.base).push(c);
  }
  for(const [b,arr] of m) arr.sort((a,b)=> a.seat.localeCompare(b.seat) || (a.file||'').localeCompare(b.file||''));
  return m;
}
function fillSelect(el, vals){ el.innerHTML=''; for(const v of vals){ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o);} }

// ------- Master projection (if MASTER has retire dates) -------
function computeMasterProjection(yourSeniority, targetDateStr){
  if(!MASTER?.pilots) throw new Error('Master list not found (data/data.json or .txt).');
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');

  const pilots = MASTER.pilots.slice().sort((a,b)=> (n(a?.seniority??1e9))-(n(b?.seniority??1e9)));
  const retireesAhead = pilots
    .filter(p=> n(p?.seniority??1e9) < yourSeniority)
    .filter(p=> { const rm=parseDate(retireField(p)); return rm && rm<=target; }).length;

  const projected = yourSeniority - retireesAhead;
  const you = pilots.find(p => n(p?.seniority) === yourSeniority);
  const yourRM = you ? (retireField(you) || '—') : '—';

  let rankAtRet='—';
  if(you && yourRM!=='—'){
    const retDate=parseDate(yourRM);
    const ahead=pilots
      .filter(p=> n(p?.seniority??1e9) < yourSeniority)
      .filter(p=> { const rm=parseDate(retireField(p)); return rm && rm<=retDate; }).length;
    rankAtRet = yourSeniority - ahead;
  }
  return {projected, retireesAhead, yourRM, rankAtRet};
}

function renderMaster(res){
  const proj = document.getElementById('projOnDate'); if(proj) proj.textContent = '#'+res.projected;
  const ra = document.getElementById('retireesAhead'); if(ra) ra.textContent = res.retireesAhead;
  const rm = document.getElementById('yourRetireMonth'); if(rm) rm.textContent = res.yourRM;
  const rr = document.getElementById('yourRetireRank'); if(rr) rr.textContent = res.rankAtRet;
}

// ------- Base/Seat projection (uses per-base JSONs) -------
async function computeBaseSeatProjection(base, seat, yourSeniority, targetDateStr){
  const idx = (INDEX?.combos||[]).find(c => c.base===base && c.seat===seat);
  if(!idx) throw new Error('No data file for '+base+' '+seat);
  const data = await loadJsonSafe(['data/'+idx.file]);
  const roster = inferRoster(data);
  const headcount = roster.length;

  const byGlobal = roster.slice().sort((a,b)=> (n(a?.seniority??1e9))-(n(b?.seniority??1e9)));
  const aheadNow = byGlobal.filter(p => n(p?.seniority??1e9) < yourSeniority);
  const posNow = aheadNow.length + 1;

  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const retireesAhead = aheadNow.filter(p => { const rm=parseDate(retireField(p)); return rm && rm<=target; }).length;

  const projectedPos = Math.max(1, posNow - retireesAhead);
  const nowPct = percentStr(posNow, headcount);
  const projPct = percentStr(projectedPos, headcount);

  // Optional list render (if table present)
  const listTbody = document.querySelector('#baseRetList tbody');
  if(listTbody){
    listTbody.innerHTML = '';
    aheadNow
      .map(p => ({ s: n(p?.seniority), d: retireField(p)}))
      .filter(p => p.s)
      .sort((a,b)=>a.s-b.s)
      .forEach(p=>{
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${p.s}</td><td>${p.d||'—'}</td>`;
        listTbody.appendChild(tr);
      });
  }

  return { headcount, posNow, projectedPos, nowPct, projPct, retireesAhead };
}
function renderBaseSeat(res){
  const basePos = document.getElementById('basePos');
  if(basePos){ basePos.textContent = `#${res.projectedPos} of ${res.headcount} (${res.projPct}) • now: #${res.posNow} (${res.nowPct})`; }
  const baseActive = document.getElementById('baseActive'); if(baseActive) baseActive.textContent = (res.headcount ?? '—');
}

// ------- Retirements (tables + projector) -------
async function loadRetirements(){
  const r = await fetch('data/retirements.json?v=' + Date.now());
  if(!r.ok) throw new Error('Missing data/retirements.json');
  RETS = await r.json();
  return RETS;
}
function renderRetirementsByBase(){
  const head = document.getElementById('retByBaseHead');
  const body = document.getElementById('retByBaseBody');
  if(!head || !body || !RETS) return;

  head.innerHTML = '<th>Year</th>';
  const bases = (RETS.bases || []).slice().sort();
  for(const b of bases) head.innerHTML += `<th>${b}</th>`;
  head.innerHTML += `<th>Total</th>`;

  body.innerHTML = '';
  for(const y of (RETS.years || [])){
    const bucket = (RETS.byYear || {})[String(y)] || {};
    const tr = document.createElement('tr');
    let cells = `<td>${y}</td>`;
    for(const b of bases) cells += `<td>${bucket[b] ?? 0}</td>`;
    cells += `<td><strong>${bucket.total ?? 0}</strong></td>`;
    tr.innerHTML = cells;
    body.appendChild(tr);
  }
}
function renderRetirementTotals(){
  const body = document.getElementById('retTotalsBody');
  if(!body || !RETS) return;
  body.innerHTML = '';
  for(const row of (RETS.totals || [])){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.year}</td><td>${row.retirements}</td>`;
    body.appendChild(tr);
  }
}
function cumulativeThroughYear(targetYear){
  let sum = 0;
  for(const row of (RETS.cumulative || [])){
    if(row.year <= targetYear) sum = row.cumulative_retirements;
  }
  return sum;
}
function runProjector(){
  if(!RETS) return;
  const sn = parseInt(document.getElementById('projSeniority').value, 10);
  const startYearInput = document.getElementById('projStartYear');
  let startYear = parseInt(startYearInput.value, 10);
  if(!sn || sn < 1){ alert('Enter a valid seniority number.'); return; }
  if(!startYear){
    startYear = (RETS.years && RETS.years[0]) ? RETS.years[0] : new Date().getFullYear();
    if(startYearInput) startYearInput.value = startYear;
  }
  const body = document.getElementById('projBody'); if(!body) return;
  body.innerHTML = '';

  const startCum = cumulativeThroughYear(startYear - 1);
  const startRank = Math.max(1, sn - startCum);

  for(const y of (RETS.years || [])){
    if(y < startYear) continue;
    const inYear = ((RETS.byYear || {})[String(y)] || {}).total || 0;
    const cum = cumulativeThroughYear(y);
    const projectedRank = Math.max(1, sn - cum);
    const delta = startRank - projectedRank;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${y}</td>
      <td>${inYear}</td>
      <td>${cum}</td>
      <td><strong>${projectedRank}</strong></td>
      <td>${delta > 0 ? `+${delta}` : delta}</td>`;
    body.appendChild(tr);
  }
}

// ------- Init -------
async function initApp(){
  try{ INDEX  = await loadJsonSafe(['data/index.json','data/index.json.txt']); } catch(e){ showError('Cannot load data/index.json'); return; }
  try{ MASTER = await loadJsonSafe(['data/data.json','data/data.json.txt']); } catch(_){ /* optional */ }

  // Base/Seat selectors
  const baseSel = document.getElementById('baseSelect');
  const seatSel = document.getElementById('seatSelect');
  if(baseSel && seatSel){
    const byBase = groupByBase(INDEX);
    const bases = [...byBase.keys()].sort();
    fillSelect(baseSel, bases);
    function refreshSeats(){
      const combos = byBase.get(baseSel.value) || [];
      const seats = [...new Set(combos.map(c=>c.seat))].sort();
      fillSelect(seatSel, seats);
    }
    baseSel.addEventListener('change', refreshSeats);
    refreshSeats();
  }

  // Buttons
  const run = document.getElementById('runMaster');
  if(run){
    run.onclick = async () => {
      try{
        const s = n(document.getElementById('yourSeniority')?.value);
        const d = document.getElementById('targetDate')?.value;
        const base = document.getElementById('baseSelect')?.value;
        const seat = document.getElementById('seatSelect')?.value;
        if(!s || !d){ showError('Enter Seniority # and Target date.'); return; }
        if(MASTER?.pilots){ renderMaster(computeMasterProjection(s, d)); }
        if(base && seat){ renderBaseSeat(await computeBaseSeatProjection(base, seat, s, d)); }
        hideError();
      }catch(err){ showError(err.message); }
    };
  }

  const runBaseSeat = document.getElementById('runBaseSeat');
  if(runBaseSeat){
    runBaseSeat.onclick = async () => {
      try{
        const s = n(document.getElementById('yourSeniority')?.value);
        const d = document.getElementById('targetDate')?.value;
        const base = document.getElementById('baseSelect')?.value;
        const seat = document.getElementById('seatSelect')?.value;
        if(!s || !d){ showError('Enter Seniority # and Target date.'); return; }
        if(base && seat){ renderBaseSeat(await computeBaseSeatProjection(base, seat, s, d)); }
        hideError();
      }catch(err){ showError(err.message || String(err)); }
    };
  }

  // Retirements tables + projector
  try{
    await loadRetirements();
    renderRetirementsByBase();
    renderRetirementTotals();
    const projBtn = document.getElementById('runProjector');
    if(projBtn) projBtn.addEventListener('click', runProjector);
  }catch(e){
    console.error(e);
    const b = document.getElementById('dataError');
    if(b) b.textContent = 'Failed to load retirements.json';
  }
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
