//
// Patch: make Base/Seat projection move with target date by parsing retire dates like "Jul-26", "Sep-29", "Sept-29", "Mar-2028".
// Also supports existing formats (YYYY-MM, M/D/YY, etc.).
// Seniority-only input, constant headcount.
//
// IDs expected in HTML: yourSeniority, targetDate, baseSelect, seatSelect, runMaster (button),
// projOnDate, retireesAhead, yourRetireMonth, yourRetireRank, basePos, baseActive, baseRetList
//
let INDEX=null, MASTER=null;

function banner(){ let el=document.getElementById('dataError'); if(!el){ el=document.createElement('div'); el.id='dataError'; el.className='banner'; document.body.prepend(el);} return el; }
function showError(msg){ const el=banner(); el.textContent=msg; el.style.display='block'; console.error('[Senforecast]', msg); }
function hideError(){ const el=document.getElementById('dataError'); if(el){ el.style.display='none'; } }
async function loadJsonSafe(paths){ for(const p of paths){ try{ const r=await fetch(p,{cache:'no-store'}); if(!r.ok) continue; return await r.json(); }catch(_){}} throw new Error('Could not load: '+paths.join(', ')); }
function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }

// --- robust date parser ---
function parseDate(v){
  if(!v) return null;
  v=String(v).trim();
  let m;
  // 1) ISO-ish: 2029-07 or 2029-07-01
  if((m=v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/))) return new Date(+m[1], +m[2]-1, m[3]?+m[3]:1);
  // 2) US: 7/1/29 or 7/1/2029
  if((m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))){ let mm=+m[1], dd=+m[2], yy=+m[3]; if(yy<100) yy=yy>=70?1900+yy:2000+yy; return new Date(yy,mm-1,dd); }
  // 3) YYYY/MM
  if((m=v.match(/^(\d{4})\/(\d{1,2})$/))) return new Date(+m[1], +m[2]-1, 1);
  // 4) MM-YYYY
  if((m=v.match(/^(\d{1,2})-(\d{4})$/))) return new Date(+m[2], +m[1]-1, 1);
  // 5) "Jul-26" / "Sept-29" / "Mar-2028"
  if((m=v.match(/^([A-Za-z]{3,5})[-\s](\d{2,4})$/))){
    const mon = m[1].toLowerCase();
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec'];
    let idx = months.indexOf(mon);
    if(idx === -1 && mon.startsWith('se')) idx = months.indexOf('sept'); // guard
    idx = (idx<0)?0:idx;
    let yy = +m[2];
    if(yy<100) yy = yy>=70 ? 1900+yy : 2000+yy;
    // Map 'sept' to month 8 (zero-based)
    const monthIndex = (months[idx] === 'sept') ? 8 : idx;
    return new Date(yy, monthIndex, 1);
  }
  // 6) "Jul 2029"
  if((m=v.match(/^([A-Za-z]{3,})\s+(\d{4})$/))){
    const mon = m[1].toLowerCase();
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec'];
    let idx = months.indexOf(mon);
    if(idx === -1 && mon.startsWith('se')) idx = months.indexOf('sept');
    idx = (idx<0)?0:idx;
    const monthIndex = (months[idx] === 'sept') ? 8 : idx;
    return new Date(+m[2], monthIndex, 1);
  }
  return null;
}
function retireField(p){ return p?.retire_month ?? p?.retireMonth ?? p?.retire_date ?? p?.retireDate ?? null; }
function percentStr(pos, den){ if(!den || !pos) return '—'; const pct=(pos/den)*100; const v=Math.round(pct*10)/10; return v.toFixed(1).replace(/\.0$/,'')+'%'; }
function inferRoster(data){ if(Array.isArray(data)) return data; if(data?.pilots) return data.pilots; if(data?.captains) return data.captains; if(data?.rows) return data.rows; if(data?.list) return data.list; return []; }
function groupByBase(index){ const m=new Map(); for(const c of (index.combos||[])){ if(!m.has(c.base)) m.set(c.base,[]); m.get(c.base).push(c);} for(const [b,arr] of m){ arr.sort((a,b)=> a.seat.localeCompare(b.seat) || (a.file||'').localeCompare(b.file||'')); } return m; }
function fillSelect(el, vals){ el.innerHTML=''; for(const v of vals){ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o);} }

// --- Master Projection ---
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

// --- Base/Seat Projection (seniority-only, constant headcount) ---
async function computeBaseSeatProjection(base, seat, yourSeniority, targetDateStr){
  const idx = (INDEX?.combos||[]).find(c => c.base===base && c.seat===seat);
  if(!idx) throw new Error('No data file for '+base+' '+seat);
  const data = await loadJsonSafe(['data/'+idx.file]);
  const roster = inferRoster(data);
  const headcount = roster.length; // constant

  const byGlobal = roster.slice().sort((a,b)=> (n(a?.seniority??1e9))-(n(b?.seniority??1e9)));
  const aheadNow = byGlobal.filter(p => n(p?.seniority??1e9) < yourSeniority);
  const posNow = aheadNow.length + 1;

  const target = parseDate(targetDateStr); if(!target) throw new Error('Pick a valid target date.');
  const retireesAheadList = aheadNow.filter(p => { const rm=parseDate(retireField(p)); return rm && rm<=target; })
                                    .map(p => ({seniority:p.seniority ?? '', retire_month: retireField(p) ?? ''}));
  const projectedPos = Math.max(1, posNow - retireesAheadList.length);

  const nowPct = percentStr(posNow, headcount);
  const projPct = percentStr(projectedPos, headcount);
  return { headcount, posNow, projectedPos, nowPct, projPct, retireesAheadList };
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
  const tb = document.getElementById('baseRetList')?.querySelector('tbody');
  if(tb){ tb.innerHTML=''; for(const p of (res.retireesAheadList||[])){ const tr=document.createElement('tr'); tr.innerHTML=`<td>${p.seniority??''}</td><td>${p.retire_month??''}</td>`; tb.appendChild(tr);} }
}

// --- init & unified run ---
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

  // unified run
  const runMaster = document.getElementById('runMaster');
  if(runMaster){
    runMaster.onclick = async () => {
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

  // optional: wire runBaseSeat to same handler if present
  const runBS = document.getElementById('runBaseSeat');
  if(runBS){ runBS.onclick = () => runMaster?.click(); }
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
