// Base/Seat projection — EN# aware input, constant headcount, local progression
// You can enter either: Seniority #  OR  EN/Employee #. We detect and map EN -> seniority.
//
// How EN detection works:
// 1) If the number exactly matches a 'seniority' in MASTER.pilots, we use it directly.
// 2) Otherwise we try to find a pilot whose EN-like fields equal the number:
//    fields tried: en, EN, emp_no, empNo, employee_number, employeeNumber, id
//    If found, we take that pilot's seniority for all calculations.
// 3) If MASTER missing, we'll also try to detect EN inside the selected base/seat roster.

let INDEX=null, MASTER=null;

function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function hideError(){ const el=document.getElementById('dataError'); if(el){ el.style.display='none'; } }

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
function retireField(p){ return p?.retire_month ?? p?.retireMonth ?? p?.retire_date ?? p?.retireDate ?? null; }
function num(v){ const n=Number(v); return Number.isFinite(n) ? n : null; }

function findPilotByEN(arr, enValue){
  if(!Array.isArray(arr)) return null;
  const keys=['en','EN','emp_no','empNo','employee_number','employeeNumber','id'];
  return arr.find(p => keys.some(k => String(p?.[k] ?? '') === String(enValue)));
}

function resolveSeniority(inputNumber, rosterOrNull){
  const maybeSen = num(inputNumber);
  if(maybeSen==null) return null;

  // 1) Exact seniority match in MASTER
  if(MASTER?.pilots){
    const bySen = MASTER.pilots.find(p => num(p?.seniority) === maybeSen);
    if(bySen) return maybeSen;
    // 2) EN match in MASTER
    const byEN = findPilotByEN(MASTER.pilots, maybeSen);
    if(byEN && num(byEN.seniority)) return num(byEN.seniority);
  }

  // 3) If we have a roster, try EN match there
  if(rosterOrNull){
    const bySen = rosterOrNull.find(p => num(p?.seniority) === maybeSen);
    if(bySen) return maybeSen;
    const byEN  = findPilotByEN(rosterOrNull, maybeSen);
    if(byEN && num(byEN.seniority)) return num(byEN.seniority);
  }

  // 4) Fall back to treating it as Seniority #
  return maybeSen;
}

function percentStr(numPos, den){ if(!den || !numPos) return '—'; const pct=(numPos/den)*100; const v=Math.round(pct*10)/10; return v.toFixed(1).replace(/\.0$/,'')+'%'; }

function positionByGlobal(rosterSortedByGlobal, yourSen){
  const ahead = rosterSortedByGlobal.filter(p => num(p?.seniority ?? 999999999) < yourSen);
  return ahead.length + 1;
}

async function computeBaseSeatProjectionConstant(base, seat, inputNumber, targetDateStr){
  const idx=(INDEX?.combos||[]).find(c=>c.base===base && c.seat===seat);
  if(!idx) throw new Error('No data file for '+base+' '+seat);
  const data = await loadJsonSafe(['data/'+idx.file]);
  const roster = inferRoster(data);
  const headcount = roster.length;

  // Resolve user's seniority from input (supports EN or Seniority)
  const yourSeniority = resolveSeniority(inputNumber, roster);
  if(!yourSeniority) throw new Error('Could not resolve your Seniority # from input. Enter Seniority or EN.');

  // Sort by GLOBAL seniority for deterministic insertion
  const byGlobal = roster.slice().sort((a,b)=> (num(a?.seniority ?? 999999999)) - (num(b?.seniority ?? 999999999)));

  // Current position within this base/seat
  const posNow = positionByGlobal(byGlobal, yourSeniority);

  // Retirements ahead by target date (only those *ahead locally*)
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const aheadLocal = byGlobal.slice(0, Math.max(0, posNow-1));
  const retireesAheadList = aheadLocal.filter(p => {
    const rm = parseDate(retireField(p)); return rm && rm <= target;
  }).map(p => ({ seniority: p.seniority ?? '', retire_month: retireField(p) ?? '' }));

  // Projected position on target date (constant headcount)
  const projectedPos = Math.max(1, posNow - retireesAheadList.length);
  const nowPct = percentStr(posNow, headcount);
  const projPct = percentStr(projectedPos, headcount);

  return { headcount, posNow, projectedPos, nowPct, projPct, retireesAheadList };
}

function renderBaseSeatConstant(res){
  const basePos = document.getElementById('basePos');
  if(basePos){
    basePos.textContent = `#${res.projectedPos} of ${res.headcount} (${res.projPct}) • now: #${res.posNow} (${res.nowPct})`;
  }
  const baseActive = document.getElementById('baseActive');
  if(baseActive) baseActive.textContent = (res.headcount ?? '—');
  const tbEl = document.getElementById('baseRetList');
  if(tbEl){
    let tb = tbEl.querySelector('tbody');
    if(!tb){ tb=document.createElement('tbody'); tbEl.appendChild(tb); }
    tb.innerHTML='';
    for(const p of (res.retireesAheadList||[])){
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${p.seniority ?? ''}</td><td>${p.retire_month ?? ''}</td>`;
      tb.appendChild(tr);
    }
  }
}

(async function patchENAware(){
  try{
    INDEX = await loadJsonSafe(['data/index.json','data/index.json.txt']);
  }catch(e){ /* ignore; existing script likely loads it too */ }
  try{
    MASTER = await loadJsonSafe(['data/data.json','data/data.json.txt']);
  }catch(e){ /* optional */ }

  const btn = document.getElementById('runBaseSeat');
  if(!btn) return;
  const replacement = btn.cloneNode(true);
  btn.parentNode.replaceChild(replacement, btn);

  replacement.addEventListener('click', async ()=>{
    try{
      const input = Number(document.getElementById('yourSeniority')?.value);
      const d = document.getElementById('targetDate')?.value;
      const baseSel = document.getElementById('baseSelect');
      const seatSel = document.getElementById('seatSelect');
      if(!input || !d){ showError('Enter Seniority # or EN #, and a target date.'); return; }
      const res = await computeBaseSeatProjectionConstant(baseSel.value, seatSel.value, input, d);
      renderBaseSeatConstant(res);
      hideError();
    }catch(err){ showError(err.message); }
  });
})();