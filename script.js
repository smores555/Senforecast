let INDEX=null, MASTER=null;

async function loadJsonSafe(paths){for(const p of paths){try{const r=await fetch(p,{cache:'no-store'});if(!r.ok)continue;return await r.json();}catch(e){}}throw new Error('Could not load: '+paths.join(', '));}
function showError(msg){const el=document.getElementById('dataError'); if(el){el.textContent=msg; el.style.display='block';} console.error(msg);}

function parseDateFlex(v){
  if(!v) return null;
  const m1 = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if(m1){ const [_,y,m,d] = m1; return new Date(parseInt(y), parseInt(m)-1, d?parseInt(d):1); }
  const m2 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m2){ let [_, mm, dd, yy] = m2; mm=parseInt(mm,10); dd=parseInt(dd,10); yy=parseInt(yy,10); if(yy<100) yy = yy>=70? (1900+yy):(2000+yy); return new Date(yy, mm-1, dd); }
  return null;
}
function toYMD(d){const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`;}

function groupByBase(index){const map=new Map(); for(const c of index.combos||[]){if(!map.has(c.base)) map.set(c.base,[]); map.get(c.base).push(c);} for(const [b,arr] of map){arr.sort((a,b)=>a.seat.localeCompare(b.seat)||(a.file||'').localeCompare(b.file||''));} return map;}
function fillSelect(el, vals){el.innerHTML=''; for(const v of vals){const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o);}}
function inferRoster(data){ if(Array.isArray(data)) return data; if(data&&Array.isArray(data.pilots))return data.pilots; if(data&&Array.isArray(data.captains))return data.captains; if(data&&Array.isArray(data.rows))return data.rows; if(data&&Array.isArray(data.list))return data.list; return []; }

// ----- Master Projection (same inputs used for base/seat) -----
function computeMasterProjection(yourSeniority, targetDateStr){
  if(!MASTER || !Array.isArray(MASTER.pilots)) throw new Error('MASTER not loaded');
  const target = parseDateFlex(targetDateStr); if(!target) throw new Error('Bad target date');
  const pilots = MASTER.pilots.slice().sort((a,b)=>(a.seniority||999999)-(b.seniority||999999));
  const you = pilots.find(p=>p.seniority===yourSeniority);
  const yourRetMonth = you && (you.retire_month||you.retireMonth) ? (you.retire_month||you.retireMonth) : null;
  const yourRetDate = yourRetMonth ? parseDateFlex(yourRetMonth) : null;
  const retireesAheadByTarget = pilots.filter(p=>(p.seniority||999999)<yourSeniority)
      .filter(p=>{const rm=parseDateFlex(p.retire_month||p.retireMonth); return rm && rm<=target;}).length;
  const projectedRank = yourSeniority - retireesAheadByTarget;
  let yourRankAtRet='—'; if(yourRetDate){ const ahead=pilots.filter(p=>(p.seniority||999999)<yourSeniority).filter(p=>{const rm=parseDateFlex(p.retire_month||p.retireMonth);return rm && rm<=yourRetDate;}).length; yourRankAtRet = yourSeniority - ahead; }
  return {projectedRank, retireesAheadByTarget, yourRetireMonth: yourRetMonth||'—', yourRankAtRet};
}

// ----- Base/Seat Projection Seniority -----
async function computeBaseSeatProjection(base, seat, yourSeniority, targetDateStr){
  const combo = (INDEX.combos||[]).find(c=>c.base===base && c.seat===seat);
  if(!combo) return {activeTotal:'—', projectedRank:'—', retireesAheadList:[]};
  const data = await loadJsonSafe(['data/'+combo.file]);
  const roster = inferRoster(data).slice().sort((a,b)=>(a.seniority||999999)-(b.seniority||999999));
  const target = parseDateFlex(targetDateStr);
  const retireesAheadList = roster.filter(p=>(p.seniority||999999)<yourSeniority)
                                  .filter(p=>{const rm=parseDateFlex(p.retire_month||p.retireMonth); return rm && rm<=target;})
                                  .map(p=>({seniority:p.seniority, retire_month:(p.retire_month||p.retireMonth)}));
  const projectedRank = yourSeniority - retireesAheadList.length;
  return {activeTotal: roster.length, projectedRank, retireesAheadList};
}

function renderBaseSeat(res){
  const basePos = document.getElementById('basePos');
  if(basePos) basePos.textContent = (res.projectedRank ? '#'+res.projectedRank : '—');
  const baseActive = document.getElementById('baseActive');
  if(baseActive) baseActive.textContent = (res.activeTotal ?? '—');
  const tbEl = document.getElementById('baseRetList'); if(tbEl){ let tb=tbEl.querySelector('tbody'); if(!tb){tb=document.createElement('tbody'); tbEl.appendChild(tb);} tb.innerHTML=''; for(const p of (res.retireesAheadList||[])){ const tr=document.createElement('tr'); tr.innerHTML = `<td>${p.seniority??''}</td><td>${p.retire_month??''}</td>`; tb.appendChild(tr);} }
}

// ----- Init & wiring -----
async function initApp(){
  INDEX = await loadJsonSafe(['data/index.json','data/index.json.txt']);
  try{ MASTER = await loadJsonSafe(['data/data.json','data/data.json.txt']); }catch(e){ /* optional */ }

  // populate base/seat
  const baseSel = document.getElementById('baseSelect');
  const seatSel = document.getElementById('seatSelect');
  const byBase = groupByBase(INDEX);
  const bases = [...byBase.keys()].sort(); fillSelect(baseSel, bases);
  function refreshSeats(){ const combos = byBase.get(baseSel.value)||[]; const seats = [...new Set(combos.map(c=>c.seat))].sort(); fillSelect(seatSel, seats); }
  baseSel.addEventListener('change', refreshSeats);
  refreshSeats();

  // master run
  const runMaster = document.getElementById('runMaster');
  if(runMaster){ runMaster.addEventListener('click', ()=>{
    const s = parseInt(document.getElementById('yourSeniority').value,10);
    const d = document.getElementById('targetDate').value;
    if(!s || !d){ alert('Enter seniority and target date.'); return; }
    try{
      const r = computeMasterProjection(s, d);
      document.getElementById('projOnDate').textContent = '#'+r.projectedRank;
      document.getElementById('retireesAhead').textContent = r.retireesAheadByTarget;
      document.getElementById('yourRetireMonth').textContent = r.yourRetireMonth;
      document.getElementById('yourRetireRank').textContent = r.yourRankAtRet;
    }catch(e){ alert(e.message); }
  });}

  // base/seat run
  const runBS = document.getElementById('runBaseSeat');
  if(runBS){ runBS.addEventListener('click', async ()=>{
    const s = parseInt(document.getElementById('yourSeniority').value,10);
    const d = document.getElementById('targetDate').value;
    if(!s || !d){ alert('Enter seniority and target date (top section).'); return; }
    const res = await computeBaseSeatProjection(baseSel.value, seatSel.value, s, d);
    renderBaseSeat(res);
  });}
}

// boot
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
