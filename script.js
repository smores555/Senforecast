// Base/Seat projection — constant headcount model + percent-in-base (now & target)
// Assumptions per user spec:
// - Headcount stays constant to target date (retirees are backfilled by pilots junior to YOU).
// - Therefore, denominator for percent is the current roster size of the selected base/seat.
// - Your *local* position improves only by retirements ahead of you in THIS base/seat.
// - If you're not in the roster, we virtually insert you based on GLOBAL seniority comparison.

let INDEX=null, MASTER=null;

function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }

async function loadJsonSafe(paths){
  for(const p of paths){
    try{
      const r=await fetch(p,{cache:'no-store'});
      if(!r.ok){ console.warn('Fetch not ok:', p, r.status); continue; }
      return await r.json();
    }catch(e){ console.warn('Fetch error:', p, e); }
  }
  throw new Error('Could not load: '+paths.join(', '));
}

function parseDate(v){
  if(!v) return null;
  const m1=v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if(m1){ const[_,y,m,d]=m1; return new Date(parseInt(y),parseInt(m)-1,d?parseInt(d):1); }
  const m2=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m2){ let[_,mm,dd,yy]=m2; mm=parseInt(mm,10); dd=parseInt(dd,10); yy=parseInt(yy,10); if(yy<100) yy=yy>=70?(1900+yy):(2000+yy); return new Date(yy,mm-1,dd); }
  return null;
}

function inferRoster(data){
  if(Array.isArray(data)) return data;
  if(data&&Array.isArray(data.pilots)) return data.pilots;
  if(data&&Array.isArray(data.captains)) return data.captains;
  if(data&&Array.isArray(data.rows)) return data.rows;
  if(data&&Array.isArray(data.list)) return data.list;
  return [];
}

function percentStr(num, den){
  if(!den || !num) return '—';
  const pct = (num/den)*100;
  const v = Math.round(pct*10)/10; // 1 decimal
  return v.toFixed(1).replace(/\.0$/,'') + '%';
}

// Compute current local position (1-based) by GLOBAL seniority mapping
function currentLocalPosition(rosterSortedByGlobal, yourGlobalSeniority){
  const ahead = rosterSortedByGlobal.filter(p => Number(p?.seniority ?? 999999999) < Number(yourGlobalSeniority));
  return ahead.length + 1;
}

async function computeBaseSeatProjectionConstant(base, seat, yourGlobalSeniority, targetDateStr){
  const idx = (INDEX?.combos||[]).find(c=>c.base===base && c.seat===seat);
  if(!idx) throw new Error('No data file for '+base+' '+seat);
  const data = await loadJsonSafe(['data/'+idx.file]);
  const roster = inferRoster(data);
  const headcount = roster.length;               // CONSTANT headcount per spec

  // Sort by GLOBAL seniority for deterministic insertion
  const byGlobal = roster.slice().sort((a,b)=> (Number(a?.seniority ?? 999999999)) - (Number(b?.seniority ?? 999999999)));

  // Position NOW within this base/seat
  const posNow = currentLocalPosition(byGlobal, yourGlobalSeniority);

  // Retirements ahead by target date (only those *ahead locally*)
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const aheadLocal = byGlobal.slice(0, Math.max(0, posNow-1));
  const retireesAheadList = aheadLocal.filter(p => {
    const rm = parseDate(p.retire_month || p.retireMonth || p.retire_date || p.retireDate);
    return rm && rm <= target;
  }).map(p => ({ seniority: p.seniority ?? '', retire_month: (p.retire_month || p.retireMonth || '') }));

  // Projected position on target date: you move up by the number of ahead retirements
  const projectedPos = Math.max(1, posNow - retireesAheadList.length);

  // Percent-in-base using CONSTANT denominator = headcount
  const nowPct = percentStr(posNow, headcount);
  const projPct = percentStr(projectedPos, headcount);

  return { headcount, posNow, projectedPos, nowPct, projPct, retireesAheadList };
}

function renderBaseSeatConstant(res){
  const basePos = document.getElementById('basePos');
  if(basePos){
    const nowStr = (res.posNow ? `now: #${res.posNow} (${res.nowPct})` : 'now: —');
    const projStr = (res.projectedPos ? `#${res.projectedPos} of ${res.headcount} (${res.projPct})` : '—');
    basePos.textContent = `${projStr}  •  ${nowStr}`;
  }
  const baseActive = document.getElementById('baseActive');
  if(baseActive) baseActive.textContent = (res.headcount ?? '—');

  const tbEl = document.getElementById('baseRetList');
  if(tbEl){
    let tb = tbEl.querySelector('tbody');
    if(!tb){ tb=document.createElement('tbody'); tbEl.appendChild(tb); }
    tb.innerHTML='';
    for(const p of (res.retireesAheadList||[])){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.seniority ?? ''}</td><td>${p.retire_month ?? ''}</td>`;
      tb.appendChild(tr);
    }
  }
}

// Minimal boot hook to replace only the Base/Seat calc. Leave your existing master wiring intact.
(async function patchBaseSeatCalc(){
  try{
    INDEX = await loadJsonSafe(['data/index.json','data/index.json.txt']);
  }catch(e){ /* ignore here; existing script likely loads it */ }

  const run = document.getElementById('runBaseSeat');
  if(run){
    // Unbind existing listeners by cloning (safe fallback if original double-binds)
    const newRun = run.cloneNode(true);
    run.parentNode.replaceChild(newRun, run);

    newRun.addEventListener('click', async ()=>{
      try{
        const s = Number(document.getElementById('yourSeniority')?.value);
        const d = document.getElementById('targetDate')?.value;
        const baseSel = document.getElementById('baseSelect');
        const seatSel = document.getElementById('seatSelect');
        if(!s || !d){ showError('Enter your seniority # and a target date (top section).'); return; }
        const res = await computeBaseSeatProjectionConstant(baseSel.value, seatSel.value, s, d);
        renderBaseSeatConstant(res);
        banner().style.display='none';
      }catch(err){ showError(err.message); }
    });
  }
})();