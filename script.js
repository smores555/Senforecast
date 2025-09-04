// Full script: populate Base/Seat selects, seniority-only Base/Seat projection with constant headcount,
// optional Master projection, robust errors.

let INDEX = null;
let MASTER = null;

// ---------- Utils ----------
function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent = msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function hideError(){ const el=document.getElementById('dataError'); if(el) el.style.display='none'; }

async function loadJsonSafe(paths){
  for(const p of paths){
    try{
      const r = await fetch(p, {cache:'no-store'});
      if(!r.ok) continue;
      return await r.json();
    }catch(e){ /* keep trying */ }
  }
  throw new Error('Could not load: '+paths.join(', '));
}

function parseDate(v){
  if(!v) return null;
  const m1 = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if(m1){ const [_,y,m,d] = m1; return new Date(parseInt(y), parseInt(m)-1, d?parseInt(d):1); }
  const m2 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m2){ let [_, mm, dd, yy] = m2; mm=parseInt(mm,10); dd=parseInt(dd,10); yy=parseInt(yy,10); if(yy<100) yy = yy>=70? (1900+yy):(2000+yy); return new Date(yy, mm-1, dd); }
  return null;
}

function inferRoster(data){
  if(Array.isArray(data)) return data;
  if(data && Array.isArray(data.pilots)) return data.pilots;
  if(data && Array.isArray(data.captains)) return data.captains;
  if(data && Array.isArray(data.rows)) return data.rows;
  if(data && Array.isArray(data.list)) return data.list;
  return [];
}

function retireField(p){ return p?.retire_month ?? p?.retireMonth ?? p?.retire_date ?? p?.retireDate ?? null; }
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
function clamp(x, min, max){ return Math.max(min, Math.min(max, x)); }
function percentStr(pos, den){ if(!den || !pos) return '—'; const pct=(pos/den)*100; const v=Math.round(pct*10)/10; return v.toFixed(1).replace(/\.0$/,'')+'%'; }

function groupByBase(index){
  const m = new Map();
  for(const c of (index.combos||[])){
    if(!m.has(c.base)) m.set(c.base, []);
    m.get(c.base).push(c);
  }
  for(const [b, arr] of m){
    arr.sort((a,b)=> a.seat.localeCompare(b.seat) || (a.file||'').localeCompare(b.file||''));
  }
  return m;
}

function fillSelect(el, vals){
  el.innerHTML = '';
  for(const v of vals){
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
}

// ---------- Master Projection (optional) ----------
function computeMasterProjection(yourSeniority, targetDateStr){
  if(!MASTER?.pilots) throw new Error('Master list not found (data/data.json or .txt).');
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const pilots = MASTER.pilots.slice().sort((a,b)=>(num(a?.seniority??1e9))-(num(b?.seniority??1e9)));
  const retireesAhead = pilots.filter(p => num(p?.seniority??1e9) < yourSeniority)
                              .filter(p => { const rm = parseDate(retireField(p)); return rm && rm <= target; })
                              .length;
  const projected = yourSeniority - retireesAhead;
  const you = pilots.find(p => num(p?.seniority) === yourSeniority);
  const yourRM = you ? (retireField(you) || '—') : '—';
  let rankAtRet = '—';
  if(you && yourRM !== '—'){
    const retDate = parseDate(yourRM);
    const aheadByRet = pilots.filter(p => num(p?.seniority??1e9) < yourSeniority)
                             .filter(p => { const rm = parseDate(retireField(p)); return rm && rm <= retDate; })
                             .length;
    rankAtRet = yourSeniority - aheadByRet;
  }
  return { projected, retireesAhead, yourRM, rankAtRet };
}

// ---------- Base/Seat projection (seniority-only, constant headcount) ----------
async function computeBaseSeatProjection(base, seat, yourSeniority, targetDateStr){
  const idx = (INDEX?.combos||[]).find(c => c.base===base && c.seat===seat);
  if(!idx) throw new Error('No data file for '+base+' '+seat);
  const data = await loadJsonSafe(['data/'+idx.file]);
  const roster = inferRoster(data);
  const headcount = roster.length; // constant

  const byGlobal = roster.slice().sort((a,b)=>(num(a?.seniority??1e9))-(num(b?.seniority??1e9)));
  const posNowRaw = (function(){
    const ahead = byGlobal.filter(p => num(p?.seniority??1e9) < yourSeniority);
    return ahead.length + 1;
  })();
  const posNow = clamp(posNowRaw, 1, Math.max(1, headcount));

  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const aheadLocal = byGlobal.slice(0, Math.max(0, posNowRaw-1)); // use raw for true # ahead
  const retireesAheadList = aheadLocal.filter(p => { const rm = parseDate(retireField(p)); return rm && rm <= target; })
                                      .map(p => ({ seniority: p.seniority ?? '', retire_month: retireField(p) ?? '' }));
  const projectedPosRaw = posNowRaw - retireesAheadList.length;
  const projectedPos = clamp(projectedPosRaw, 1, Math.max(1, headcount));

  const nowPct = percentStr(posNow, headcount);
  const projPct = percentStr(projectedPos, headcount);

  return { headcount, posNow, projectedPos, nowPct, projPct, retireesAheadList };
}

function renderBaseSeat(res){
  const basePos = document.getElementById('basePos');
  if(basePos){
    basePos.textContent = `#${res.projectedPos} of ${res.headcount} (${res.projPct}) • now: #${res.posNow} (${res.nowPct})`;
  }
  const baseActive = document.getElementById('baseActive');
  if(baseActive) baseActive.textContent = (res.headcount ?? '—');

  const tb = document.getElementById('baseRetList')?.querySelector('tbody');
  if(tb){
    tb.innerHTML = '';
    for(const p of (res.retireesAheadList||[])){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.seniority ?? ''}</td><td>${p.retire_month ?? ''}</td>`;
      tb.appendChild(tr);
    }
  }
}

// ---------- Init ----------
async function initApp(){
  try{
    INDEX = await loadJsonSafe(['data/index.json','data/index.json.txt']);
  }catch(e){ showError('Cannot load data/index.json (or .txt).'); return; }

  try{
    MASTER = await loadJsonSafe(['data/data.json','data/data.json.txt']);
  }catch(e){ /* optional; master card will error if clicked without */ }

  // Populate base/seat selects
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

  // Wire Master button (if present)
  const runMaster = document.getElementById('runMaster');
  if(runMaster){
    runMaster.onclick = () => {
      try{
        const s = num(document.getElementById('yourSeniority')?.value);
        const d = document.getElementById('targetDate')?.value;
        if(!s || !d){ showError('Enter your Seniority # and a target date.'); return; }
        const r = computeMasterProjection(s, d);
        document.getElementById('projOnDate').textContent = '#'+r.projected;
        document.getElementById('retireesAhead').textContent = r.retireesAhead;
        document.getElementById('yourRetireMonth').textContent = r.yourRM;
        document.getElementById('yourRetireRank').textContent = r.rankAtRet;
        hideError();
      }catch(err){ showError(err.message); }
    };
  }

  // Wire Base/Seat Calculate
  const runBS = document.getElementById('runBaseSeat');
  if(runBS){
    runBS.onclick = async () => {
      try{
        const s = num(document.getElementById('yourSeniority')?.value);
        const d = document.getElementById('targetDate')?.value;
        const base = document.getElementById('baseSelect')?.value;
        const seat = document.getElementById('seatSelect')?.value;
        if(!s || !d){ showError('Enter Seniority # and a target date.'); return; }
        if(!base || !seat){ showError('Pick a base and a seat.'); return; }
        const res = await computeBaseSeatProjection(base, seat, s, d);
        renderBaseSeat(res);
        hideError();
      }catch(err){ showError(err.message); }
    };
  }
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
