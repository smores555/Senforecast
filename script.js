//
// Script with fixed date parser for retirements like "Dec-27", "Mar-28", "Sept-29".
// Also keeps other formats working (YYYY-MM, YYYY/MM, M/D/YY, MMM YYYY, etc.).
// Seniority-only input, constant headcount. One button runs both Master and Base/Seat projections.
//
// IDs expected: yourSeniority, targetDate, baseSelect, seatSelect, runMaster
// projOnDate, retireesAhead, yourRetireMonth, yourRetireRank
// basePos, baseActive, baseRetList
//
let INDEX=null, MASTER=null;

function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function hideError(){ const el=document.getElementById('dataError'); if(el){ el.style.display='none'; } }
async function loadJsonSafe(paths){ for(const p of paths){ try{ const r=await fetch(p,{cache:'no-store'}); if(!r.ok) continue; return await r.json(); }catch(_){}} throw new Error('Could not load: '+paths.join(', ')); }
function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }

// --- fixed date parser ---
function parseDate(v){
  if(!v) return null;
  v=String(v).trim();
  let m;

  // Case: Dec-27, Mar-28, Sept-29 (MMM-YY)
  if((m=v.match(/^([A-Za-z]{3,4})-(\d{2})$/))){
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
    const mon = m[1].toLowerCase();
    const idx = months[mon] ?? 0;
    let yy = +m[2];
    yy = 2000 + yy; // always push to 2000s (e.g., 27 -> 2027)
    return new Date(yy, idx, 1);
  }

  // Case: ISO-like YYYY-MM(-DD)
  if((m=v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/))) return new Date(+m[1], +m[2]-1, m[3]?+m[3]:1);
  // Case: M/D/YY or M/D/YYYY
  if((m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))){ let mm=+m[1], dd=+m[2], yy=+m[3]; if(yy<100) yy=2000+yy; return new Date(yy,mm-1,dd); }
  // Case: YYYY/MM
  if((m=v.match(/^(\d{4})\/(\d{1,2})$/))) return new Date(+m[1], +m[2]-1, 1);
  // Case: MM-YYYY
  if((m=v.match(/^(\d{1,2})-(\d{4})$/))) return new Date(+m[2], +m[1]-1, 1);
  // Case: MMM YYYY
  if((m=v.match(/^([A-Za-z]{3,})\s+(\d{4})$/))){
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
    const mon = m[1].toLowerCase();
    const idx = months[mon] ?? 0;
    return new Date(+m[2], idx, 1);
  }
  return null;
}

const RETIRE_KEYS = ['retire_month','retireMonth','retire_date','retireDate'];
function retireField(p){ for(const k of RETIRE_KEYS){ const v=p?.[k]; if(v) return v; } return null; }

function percentStr(pos, den){ if(!den || !pos) return '—'; const pct=(pos/den)*100; const v=Math.round(pct*10)/10; return v.toFixed(1).replace(/\.0$/,'')+'%'; }
function inferRoster(data){ if(Array.isArray(data)) return data; if(data?.pilots) return data.pilots; if(data?.captains) return data.captains; if(data?.rows) return data.rows; if(data?.list) return data.list; return []; }
function groupByBase(index){ const m=new Map(); for(const c of (index.combos||[])){ if(!m.has(c.base)) m.set(c.base,[]); m.get(c.base).push(c);} for(const [b,arr] of m){ arr.sort((a,b)=> a.seat.localeCompare(b.seat) || (a.file||'').localeCompare(b.file||'')); } return m; }
function fillSelect(el, vals){ el.innerHTML=''; for(const v of vals){ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o);} }

// --- Master ---
function computeMasterProjection(yourSeniority, targetDateStr){
  if(!MASTER?.pilots) throw new Error('Master list not found (data/data.json or .txt).');
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const pilots = MASTER.pilots.slice().sort((a,b)=> (n(a?.seniority??1e9))-(n(b?.seniority??1e9)));
  const retireesAhead = pilots.filter(p=> n(p?.seniority??1e9) < yourSeniority)
                              .filter(p=>{ const rm=parseDate(retireField(p)); return rm && rm<=target; }).length;
  const projected = yourSeniority - retireesAhead;
  const you = pilots.find(p => n(p?.seniority) === yourSeniority);
  const yourRM = you ? (retireField(you) || '—') : '—';
  let rankAtRet='—';
  if(you && yourRM!=='—'){ const retDate=parseDate(yourRM); const ahead=pilots.filter(p=> n(p?.seniority??1e9) < yourSeniority)
                                             .filter(p=>{ const rm=parseDate(retireField(p)); return rm && rm<=retDate; }).length;
    rankAtRet = yourSeniority - ahead;
  }
  return {projected, retireesAhead, yourRM, rankAtRet};
}

// --- Base/Seat ---
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

  return { headcount, posNow, projectedPos, nowPct, projPct, retireesAhead };
}

function renderMaster(res){
  const proj = document.getElementById('projOnDate'); if(proj) proj.textContent = '#'+res.projected;
  const ra = document.getElementById('retireesAhead'); if(ra) ra.textContent = res.retireesAhead;
  const rm = document.getElementById('yourRetireMonth'); if(rm) rm.textContent = res.yourRM;
  const rr = document.getElementById('yourRetireRank'); if(rr) rr.textContent = res.rankAtRet;
}
function renderBaseSeat(res){
  const basePos = document.getElementById('basePos');
  if(basePos){ basePos.textContent = `#${res.projectedPos} of ${res.headcount} (${res.projPct}) • now: #${res.posNow} (${res.nowPct})`; }
  const baseActive = document.getElementById('baseActive'); if(baseActive) baseActive.textContent = (res.headcount ?? '—');
}

// --- init ---
async function initApp(){
  try{ INDEX = await loadJsonSafe(['data/index.json','data/index.json.txt']); }catch(e){ showError('Cannot load data/index.json'); return; }
  try{ MASTER = await loadJsonSafe(['data/data.json','data/data.json.txt']); }catch(_){}

  const baseSel = document.getElementById('baseSelect');
  const seatSel = document.getElementById('seatSelect');
  if(baseSel && seatSel){
    const byBase = groupByBase(INDEX);
    const bases = [...byBase.keys()].sort();
    fillSelect(baseSel, bases);
    function refreshSeats(){ const combos = byBase.get(baseSel.value)||[]; const seats=[...new Set(combos.map(c=>c.seat))].sort(); fillSelect(seatSel, seats); }
    baseSel.addEventListener('change', refreshSeats);
    refreshSeats();
  }

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
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }

// Added handler for "Calculate" button (Base/Seat)
function attachRunBaseSeat(){
  try{
    const runBaseSeat = document.getElementById('runBaseSeat');
    if (!runBaseSeat) return;
    runBaseSeat.onclick = async () => {
      try {
        const s = n(document.getElementById('yourSeniority')?.value);
        const d = document.getElementById('targetDate')?.value;
        const base = document.getElementById('baseSelect')?.value;
        const seat = document.getElementById('seatSelect')?.value;
        if (!s || !d) { showError('Enter Seniority # and Target date.'); return; }
        if (base && seat) { renderBaseSeat(await computeBaseSeatProjection(base, seat, s, d)); }
        hideError();
      } catch (err) { showError(err.message || String(err)); }
    };
  }catch(e){ console.error(e); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachRunBaseSeat);
} else {
  attachRunBaseSeat();
}
