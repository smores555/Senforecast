//
// One-click run computes:
// 1) Master projection
// 2) Selected Base/Seat projection
// 3) NEW: All Bases & Seats table (you inserted everywhere, constant headcount)
//
// Assumptions:
// - Input is SENIORITY number only (no EN lookup)
// - Constant headcount per base/seat (retirements ahead are backfilled by pilots junior to you)
// - Retire dates may be in many formats: MMM-YY, MMM YYYY, YYYY-MM, M/D/YY, etc.
//
// IDs expected in HTML (add if missing):
// yourSeniority, targetDate, baseSelect, seatSelect, runMaster
// projOnDate, retireesAhead, yourRetireMonth, yourRetireRank
// basePos, baseActive, baseRetList
// NEW optional container: <div id="allBaseSeat"></div>  (script will create one if missing)
//
let INDEX=null, MASTER=null;

function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function hideError(){ const el=document.getElementById('dataError'); if(el){ el.style.display='none'; } }
async function loadJsonSafe(paths){ for(const p of paths){ try{ const r=await fetch(p,{cache:'no-store'}); if(!r.ok) continue; return await r.json(); }catch(_){}} throw new Error('Could not load: '+paths.join(', ')); }
function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }

// Robust date parser
function parseDate(v){
  if(!v) return null;
  v=String(v).trim();
  let m;
  if((m=v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/))) return new Date(+m[1], +m[2]-1, m[3]?+m[3]:1);
  if((m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))){ let mm=+m[1], dd=+m[2], yy=+m[3]; if(yy<100) yy=yy>=70?1900+yy:2000+yy; return new Date(yy,mm-1,dd); }
  if((m=v.match(/^(\d{4})\/(\d{1,2})$/))) return new Date(+m[1], +m[2]-1, 1);
  if((m=v.match(/^(\d{1,2})-(\d{4})$/))) return new Date(+m[2], +m[1]-1, 1);
  if((m=v.match(/^([A-Za-z]{3,5})[-\s](\d{2,4})$/))){
    const mon = m[1].toLowerCase();
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec'];
    let idx = months.indexOf(mon); if(idx === -1 && mon.startsWith('se')) idx = months.indexOf('sept');
    idx = (idx<0)?0:idx; let yy = +m[2]; if(yy<100) yy = yy>=70 ? 1900+yy : 2000+yy;
    const monthIndex = (months[idx] === 'sept') ? 8 : idx;
    return new Date(yy, monthIndex, 1);
  }
  if((m=v.match(/^([A-Za-z]{3,})\s+(\d{4})$/))){
    const mon = m[1].toLowerCase();
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec'];
    let idx = months.indexOf(mon); if(idx === -1 && mon.startsWith('se')) idx = months.indexOf('sept');
    idx = (idx<0)?0:idx; const monthIndex = (months[idx] === 'sept') ? 8 : idx;
    return new Date(+m[2], monthIndex, 1);
  }
  return null;
}

const RETIRE_KEYS = [
  'retire_month','retireMonth','retire_date','retireDate','retirement',
  'retirement_date','retirementDate','retDate','ret_date','retire',
  'retMo','retMonth','retireMo','ret_month'
];
function retireField(p){
  for(const k of RETIRE_KEYS){
    const v = p?.[k]; if(v!=null && String(v).trim()!=='') return v;
  }
  return null;
}
function percentStr(pos, den){ if(!den || !pos) return '—'; const pct=(pos/den)*100; const v=Math.round(pct*10)/10; return v.toFixed(1).replace(/\.0$/,'')+'%'; }
function inferRoster(data){ if(Array.isArray(data)) return data; if(data?.pilots) return data.pilots; if(data?.captains) return data.captains; if(data?.rows) return data.rows; if(data?.list) return data.list; return []; }
function groupByBase(index){ const m=new Map(); for(const c of (index.combos||[])){ if(!m.has(c.base)) m.set(c.base,[]); m.get(c.base).push(c);} for(const [b,arr] of m){ arr.sort((a,b)=> a.seat.localeCompare(b.seat) || (a.file||'').localeCompare(b.file||'')); } return m; }
function fillSelect(el, vals){ el.innerHTML=''; for(const v of vals){ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o);} }

// Master
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

// Base/Seat for a single combo
async function computeOneCombo(combo, yourSeniority, targetDateStr){
  const data = await loadJsonSafe(['data/'+combo.file]);
  const roster = inferRoster(data);
  const headcount = roster.length; // constant
  const byGlobal = roster.slice().sort((a,b)=> (n(a?.seniority??1e9))-(n(b?.seniority??1e9)));
  const aheadNow = byGlobal.filter(p => n(p?.seniority??1e9) < yourSeniority);
  const posNow = aheadNow.length + 1;
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const retireesAhead = aheadNow.filter(p => { const rm=parseDate(retireField(p)); return rm && rm<=target; }).length;
  const projectedPos = Math.max(1, posNow - retireesAhead);
  const nowPct = percentStr(posNow, headcount);
  const projPct = percentStr(projectedPos, headcount);
  return { base: combo.base, seat: combo.seat, headcount, posNow, projectedPos, nowPct, projPct, retireesAhead };
}

// All Bases & Seats
async function computeAllCombos(INDEX, yourSeniority, targetDateStr){
  const combos = (INDEX?.combos||[]).slice().sort((a,b)=> (a.base.localeCompare(b.base) || a.seat.localeCompare(b.seat)));
  const results = [];
  for(const c of combos){
    try{
      results.push(await computeOneCombo(c, yourSeniority, targetDateStr));
    }catch(e){
      results.push({ base:c.base, seat:c.seat, error: e.message });
    }
  }
  return results;
}

function renderMaster(res){
  const proj = document.getElementById('projOnDate'); if(proj) proj.textContent = '#'+res.projected;
  const ra = document.getElementById('retireesAhead'); if(ra) ra.textContent = res.retireesAhead;
  const rm = document.getElementById('yourRetireMonth'); if(rm) rm.textContent = res.yourRM;
  const rr = document.getElementById('yourRetireRank'); if(rr) rr.textContent = res.rankAtRet;
}
function renderBaseSeatSelected(res){
  const basePos = document.getElementById('basePos');
  if(basePos){ basePos.textContent = `#${res.projectedPos} of ${res.headcount} (${res.projPct}) • now: #${res.posNow} (${res.nowPct})`; }
  const baseActive = document.getElementById('baseActive'); if(baseActive) baseActive.textContent = (res.headcount ?? '—');
}
function renderAllCombosTable(items){
  let container = document.getElementById('allBaseSeat');
  if(!container){
    // create a section if missing
    const sec = document.createElement('section');
    sec.className = 'card';
    const h = document.createElement('h2'); h.textContent = 'All Bases & Seats';
    container = document.createElement('div'); container.id = 'allBaseSeat';
    sec.appendChild(h); sec.appendChild(container);
    document.querySelector('main')?.appendChild(sec);
  }
  const tbl = document.createElement('table');
  tbl.innerHTML = `<thead><tr>
    <th>Base</th><th>Seat</th>
    <th>Now</th><th>Target</th><th>Retirements Ahead</th>
  </tr></thead><tbody></tbody>`;
  const tb = tbl.querySelector('tbody');
  for(const r of items){
    const tr = document.createElement('tr');
    if(r.error){
      tr.innerHTML = `<td>${r.base}</td><td>${r.seat}</td><td colspan="3" style="color:#900">${r.error}</td>`;
    }else{
      tr.innerHTML = `<td>${r.base}</td><td>${r.seat}</td>
        <td>#${r.posNow} of ${r.headcount} (${r.nowPct})</td>
        <td><strong>#${r.projectedPos} of ${r.headcount} (${r.projPct})</strong></td>
        <td>${r.retireesAhead}</td>`;
    }
    tb.appendChild(tr);
  }
  container.innerHTML = '';
  container.appendChild(tbl);
}

// init & unified run
async function initApp(){
  try{ INDEX = await loadJsonSafe(['data/index.json','data/index.json.txt']); }catch(e){ showError('Cannot load data/index.json'); return; }
  try{ MASTER = await loadJsonSafe(['data/data.json','data/data.json.txt']); }catch(_){ /* optional */ }

  // populate selects
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
        // Selected base/seat (if chosen)
        if(base && seat){
          const selCombo = (INDEX?.combos||[]).find(c=>c.base===base && c.seat===seat);
          if(selCombo){ renderBaseSeatSelected(await computeOneCombo(selCombo, s, d)); }
        }
        // All bases & seats
        const all = await computeAllCombos(INDEX, s, d);
        renderAllCombosTable(all);

        hideError();
      }catch(err){ showError(err.message); }
    };
  }
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
