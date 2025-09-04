// Base/Seat projection fix: compute user's POSITION within the selected base/seat,
// then apply retirements ahead in that base/seat by target date to show progression.
let INDEX=null, MASTER=null;

function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function setStatus(id, msg){ const el=document.getElementById(id); if(el){ el.textContent = msg || ''; } }

async function loadJsonSafe(paths){
  for(const p of paths){
    try{
      const r = await fetch(p, {cache:'no-store'});
      if(!r.ok){ console.warn('Fetch not ok:', p, r.status); continue; }
      return await r.json();
    }catch(e){ console.warn('Fetch error:', p, e); }
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

function groupByBase(index){ const map=new Map(); for(const c of index.combos||[]){ if(!map.has(c.base)) map.set(c.base,[]); map.get(c.base).push(c);} for(const [b,arr] of map){arr.sort((a,b)=>a.seat.localeCompare(b.seat)||(a.file||'').localeCompare(b.file||''));} return map; }
function fillSelect(el, vals){ el.innerHTML=''; for(const v of vals){ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o);} }
function inferRoster(data){ if(Array.isArray(data)) return data; if(data&&Array.isArray(data.pilots)) return data.pilots; if(data&&Array.isArray(data.captains)) return data.captains; if(data&&Array.isArray(data.rows)) return data.rows; if(data&&Array.isArray(data.list)) return data.list; return []; }

// ---- Master (unchanged minimal) ----
function computeMasterProjection(yourSeniority, targetDateStr){
  if(!MASTER || !Array.isArray(MASTER.pilots)) throw new Error('Master list not found (data/data.json or .txt).');
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const pilots = MASTER.pilots.slice().sort((a,b)=>(a.seniority||999999)-(b.seniority||999999));
  const retireesAheadByTarget = pilots.filter(p=>(p.seniority||999999)<yourSeniority)
      .filter(p=>{const rm=parseDate(p.retire_month||p.retireMonth); return rm && rm<=target;}).length;
  const projectedRank = yourSeniority - retireesAheadByTarget;
  const you = pilots.find(p=>p.seniority===yourSeniority);
  const yourRetMonth = you && (you.retire_month||you.retireMonth) ? (you.retire_month||you.retireMonth) : '—';
  let yourRankAtRet = '—';
  if(yourRetMonth && yourRetMonth!=='—'){ const retDate=parseDate(yourRetMonth);
    const ahead=pilots.filter(p=>(p.seniority||999999)<yourSeniority).filter(p=>{const rm=parseDate(p.retire_month||p.retireMonth); return rm && rm<=retDate;}).length;
    yourRankAtRet = yourSeniority - ahead;
  }
  return {projectedRank, retireesAheadByTarget, yourRetMonth, yourRankAtRet};
}

// ---- Base/Seat PROGRESSION fix ----
function computePositionInRoster(rosterSortedBySeniority, yourSeniority){
  // Position NOW (1-based) among this base/seat: count of pilots with seniority < yours + 1
  const ahead = rosterSortedBySeniority.filter(p => (p.seniority||999999) < yourSeniority);
  const posNow = ahead.length + 1;
  return {posNow, aheadList: ahead};
}

async function computeBaseSeatProjection(base, seat, yourSeniority, targetDateStr){
  const combo = (INDEX.combos||[]).find(c=>c.base===base && c.seat===seat);
  if(!combo) throw new Error('No combo for '+base+' '+seat);
  const data = await loadJsonSafe(['data/'+combo.file]);
  const roster = inferRoster(data).slice().sort((a,b)=>(a.seniority||999999)-(b.seniority||999999));
  const headcount = roster.length;

  // Where you fall in this base/seat right now (by seniority)
  const {posNow, aheadList} = computePositionInRoster(roster, yourSeniority);

  // Who among that aheadList retires by target date
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const retireesAheadList = aheadList.filter(p => {
    const rm = parseDate(p.retire_month || p.retireMonth);
    return rm && rm <= target;
  }).map(p => ({ seniority: p.seniority, retire_month: (p.retire_month || p.retireMonth) }));

  // Your projected position in this base/seat on target date:
  const projectedPos = Math.max(1, posNow - retireesAheadList.length);

  return {
    headcount,
    posNow,
    projectedPos,
    retireesAheadList
  };
}

function renderBaseSeat(res){
  // Show "#X of Y (now)" and "#X of Y (on target date)"
  const basePos = document.getElementById('basePos');
  if(basePos){
    const nowStr = (res.posNow ? `#${res.posNow}` : '—');
    const projStr = (res.projectedPos ? `#${res.projectedPos}` : '—');
    basePos.textContent = `${projStr} of ${res.headcount ?? '—'} (now: ${nowStr})`;
  }
  const baseActive = document.getElementById('baseActive');
  if(baseActive) baseActive.textContent = (res.headcount ?? '—');

  const tbEl = document.getElementById('baseRetList');
  if(tbEl){
    let tb = tbEl.querySelector('tbody');
    if(!tb){ tb = document.createElement('tbody'); tbEl.appendChild(tb); }
    tb.innerHTML='';
    for(const p of (res.retireesAheadList||[])){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.seniority ?? ''}</td><td>${p.retire_month ?? ''}</td>`;
      tb.appendChild(tr);
    }
  }
}

// ---- Bootstrapping / wiring ----
async function initApp(){
  try{
    INDEX = await loadJsonSafe(['data/index.json','data/index.json.txt']);
  }catch(e){ showError('Cannot load data/index.json (or .txt).'); return; }

  try{
    MASTER = await loadJsonSafe(['data/data.json','data/data.json.txt']);
  }catch(e){ /* optional */ }

  const byBase = groupByBase(INDEX);
  const baseSel = document.getElementById('baseSelect');
  const seatSel = document.getElementById('seatSelect');
  const bases = [...byBase.keys()].sort(); fillSelect(baseSel, bases);
  function refreshSeats(){ const combos = byBase.get(baseSel.value)||[]; const seats = [...new Set(combos.map(c=>c.seat))].sort(); fillSelect(seatSel, seats); }
  baseSel.addEventListener('change', refreshSeats);
  refreshSeats();

  // Buttons
  document.getElementById('runMaster')?.addEventListener('click', ()=>{
    try{
      const s = parseInt(document.getElementById('yourSeniority').value,10);
      const d = document.getElementById('targetDate').value;
      if(!s || !d){ showError('Enter your seniority # and a target date.'); return; }
      const r = computeMasterProjection(s, d);
      document.getElementById('projOnDate').textContent = '#'+r.projectedRank;
      document.getElementById('retireesAhead').textContent = r.retireesAheadByTarget;
      document.getElementById('yourRetireMonth').textContent = r.yourRetMonth;
      document.getElementById('yourRetireRank').textContent = r.yourRankAtRet;
      banner().style.display='none';
    }catch(err){ showError(err.message); }
  });

  document.getElementById('runBaseSeat')?.addEventListener('click', async ()=>{
    try{
      const s = parseInt(document.getElementById('yourSeniority').value,10);
      const d = document.getElementById('targetDate').value;
      if(!s || !d){ showError('Enter seniority + target date (top section).'); return; }
      const res = await computeBaseSeatProjection(baseSel.value, seatSel.value, s, d);
      renderBaseSeat(res);
      banner().style.display='none';
    }catch(err){ showError(err.message); }
  });
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
