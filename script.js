// Base/Seat projection — SENIORITY-ONLY input (no EN lookup), constant headcount
// Enter your Seniority # in the top box. We'll use ONLY that number.
//
// What this does:
// - Inserts you into the selected base/seat roster by comparing GLOBAL seniority.
// - Headcount stays constant (retirees are backfilled by pilots junior to you).
// - You move up only as seniors ahead of you in this base/seat retire by the target date.
// - Shows position/percent now and on the target date.
//
// Required fields in rosters: each pilot should have 'seniority' and optionally 'retire_month' (or retireMonth/retire_date/retireDate).

let INDEX=null;

function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function hideError(){ const el=document.getElementById('dataError'); if(el){ el.style.display='none'; } }

async function loadJsonSafe(paths){
  for(const p of paths){
    try{
      const r=await fetch(p,{cache:'no-store'});
      if(!r.ok) continue;
      return await r.json();
    }catch(e){}
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
function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }
function percentStr(numPos, den){ if(!den || !numPos) return '—'; const pct=(numPos/den)*100; const v=Math.round(pct*10)/10; return v.toFixed(1).replace(/\.0$/,'')+'%'; }

function positionByGlobal(rosterSortedByGlobal, yourSen){
  const ahead = rosterSortedByGlobal.filter(p => n(p?.seniority ?? 999999999) < yourSen);
  return ahead.length + 1;
}

async function computeBaseSeatProjection(base, seat, yourSeniority, targetDateStr){
  const idx=(INDEX?.combos||[]).find(c=>c.base===base && c.seat===seat);
  if(!idx) throw new Error('No data file for '+base+' '+seat);
  const data = await loadJsonSafe(['data/'+idx.file]);
  const roster = inferRoster(data);
  const headcount = roster.length;  // constant

  const yourSen = n(yourSeniority);
  if(!yourSen) throw new Error('Enter a valid Seniority #.');

  // Sort by GLOBAL seniority
  const byGlobal = roster.slice().sort((a,b)=> (n(a?.seniority ?? 999999999)) - (n(b?.seniority ?? 999999999)));

  // Position now
  const posNow = positionByGlobal(byGlobal, yourSen);

  // Retirements ahead by target date
  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const aheadLocal = byGlobal.slice(0, Math.max(0, posNow-1));
  const retireesAheadList = aheadLocal.filter(p => {
    const rm = parseDate(retireField(p)); return rm && rm <= target;
  }).map(p => ({ seniority: p.seniority ?? '', retire_month: retireField(p) ?? '' }));

  const projectedPos = Math.max(1, posNow - retireesAheadList.length);
  const nowPct = percentStr(posNow, headcount);
  const projPct = percentStr(projectedPos, headcount);

  return { headcount, posNow, projectedPos, nowPct, projPct, retireesAheadList };
}

(function wireSeniorityOnly(){
  // load index
  loadJsonSafe(['data/index.json','data/index.json.txt']).then(idx => { INDEX = idx; }).catch(()=>{});

  const btn = document.getElementById('runBaseSeat');
  if(!btn) return;
  const replacement = btn.cloneNode(true);
  btn.parentNode.replaceChild(replacement, btn);

  replacement.addEventListener('click', async ()=>{
    try{
      const yourSeniority = Number(document.getElementById('yourSeniority')?.value);
      const targetDate = document.getElementById('targetDate')?.value;
      const base = document.getElementById('baseSelect')?.value;
      const seat = document.getElementById('seatSelect')?.value;
      if(!yourSeniority || !targetDate){ showError('Enter Seniority # and a target date.'); return; }
      const res = await computeBaseSeatProjection(base, seat, yourSeniority, targetDate);
      // render
      const basePos = document.getElementById('basePos');
      if(basePos){ basePos.textContent = `#${res.projectedPos} of ${res.headcount} (${res.projPct}) • now: #${res.posNow} (${res.nowPct})`; }
      const baseActive = document.getElementById('baseActive');
      if(baseActive) baseActive.textContent = (res.headcount ?? '—');
      const tbEl = document.getElementById('baseRetList');
      if(tbEl){ let tb=tbEl.querySelector('tbody'); if(!tb){ tb=document.createElement('tbody'); tbEl.appendChild(tb);} tb.innerHTML=''; for(const p of (res.retireesAheadList||[])){ const tr=document.createElement('tr'); tr.innerHTML = `<td>${p.seniority ?? ''}</td><td>${p.retire_month ?? ''}</td>`; tb.appendChild(tr);} }
      hideError();
    }catch(err){ showError(err.message); }
  });
})();