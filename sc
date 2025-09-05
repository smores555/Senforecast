// script-v5.js — robust top-rank handling + diagnostics
console.info('Pilot What-If: script-v5 loaded');

let INDEX=null;

function setBanner(msg){
  let b = document.getElementById('versionBanner');
  if(!b){
    b = document.createElement('div');
    b.id = 'versionBanner';
    b.style.cssText = 'position:fixed;right:8px;bottom:8px;background:#0b5cff;color:#fff;padding:6px 10px;border-radius:6px;font:12px system-ui;z-index:9999;opacity:.9';
    document.body.appendChild(b);
  }
  b.textContent = msg;
}

async function loadIndex(){
  try{
    const r=await fetch('data/index.json');
    if(!r.ok) throw new Error('Missing data/index.json');
    INDEX=await r.json();
    setBanner('script-v5 ✓ index loaded');
    return INDEX;
  }catch(e){
    console.error(e);
    setBanner('script-v5 ⚠ index failed');
    throw e;
  }
}

function groupByBase(index){
  const map=new Map();
  for(const c of index.combos){
    if(!map.has(c.base)) map.set(c.base,[]);
    map.get(c.base).push(c);
  }
  for(const [b,arr] of map){ arr.sort((a,b)=>a.seat.localeCompare(b.seat)); }
  return map;
}

function fillSelect(el, vals){
  el.innerHTML='';
  for(const v of vals){
    const o=document.createElement('option');
    o.value=v; o.textContent=v;
    el.appendChild(o);
  }
}

async function loadPilots(file){
  try{
    const r=await fetch('data/'+file);
    if(!r.ok) throw new Error('Missing data/'+file);
    return await r.json();
  }catch(e){
    console.warn('Failed to load', file, e);
    return { base: null, seat: null, pilots: [] }; // safe fallback
  }
}

// lowerBound: first index where nums[i] >= target
function lowerBound(nums, target){
  let lo=0, hi=nums.length;
  while(lo<hi){
    const m=(lo+hi)>>1;
    if(nums[m] < target) lo=m+1; else hi=m;
  }
  return lo;
}

function safePct(rank,total){
  if(!rank||!total) return '100%'; // if we default rank=1,total=1 => 100%
  return Math.round((rank/total)*100)+'%';
}

async function calcOne(combo,sn){
  const data=await loadPilots(combo.file);
  const seniors=(data.pilots||[]).map(p=>Number(p.seniority)).filter(n=>!Number.isNaN(n)).sort((a,b)=>a-b);
  let total=seniors.length;

  // If empty/missing, return explicit rank=1 to avoid dash
  if(total===0){
    return { seat: combo.seat, base: combo.base, rank: 1, total: 1, pct: '100%' };
  }

  const eqIndex = seniors.indexOf(sn);
  let rank;
  if (eqIndex !== -1){
    rank = eqIndex + 1;
  } else {
    const insertAt = lowerBound(seniors, sn);
    rank = insertAt + 1; // top case => 0+1 = 1
  }
  return { seat: combo.seat, base: combo.base, rank, total, pct: safePct(rank,total) };
}

async function calcAll(sn){
  const rows=[];
  for(const combo of INDEX.combos){
    try{
      rows.push(await calcOne(combo,sn));
    }catch(e){
      console.error('calcOne failed for', combo, e);
      // still push a safe fallback row so UI never shows dash
      rows.push({ seat: combo.seat, base: combo.base, rank: 1, total: 1, pct: '100%' });
    }
  }
  rows.sort((a,b)=>(parseInt(a.pct)||999999)-(parseInt(b.pct)||999999));
  return rows;
}

function renderBest(rows){
  const tb=document.querySelector('#best tbody');
  if(!tb) return;
  tb.innerHTML='';
  for(const r of rows){
    const rank = (r && typeof r.rank==='number') ? r.rank : 1;
    const total = (r && typeof r.total==='number' && r.total>0) ? r.total : 1;
    const pct = r && r.pct ? r.pct : safePct(rank,total);

    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.seat||''}</td>
                  <td>${r.base||''}</td>
                  <td>${rank}</td>
                  <td>${total}</td>
                  <td>${pct}</td>`;
    tb.appendChild(tr);
  }
}

function renderListTitle(base, seat){
  const el=document.getElementById('listTitle');
  if(el) el.textContent=`Pilot List — ${base} ${seat}`;
}

function renderList(base, seat, pilots, sn){
  const tb=document.querySelector('#list tbody');
  if(!tb) return;
  tb.innerHTML='';

  const sorted=[...(pilots||[])].sort((a,b)=>Number(a.seniority)-Number(b.seniority));
  const seniors=sorted.map(p=>Number(p.seniority)).filter(n=>!Number.isNaN(n));
  const total=sorted.length;

  // If empty, still show a single "you" row at top
  if(total===0){
    const tr=document.createElement('tr');
    tr.className='you';
    tr.innerHTML = `<td class="c-snr">${sn}</td>
                    <td class="c-name">(you — hypothetical)</td>
                    <td class="c-rank">1</td>
                    <td class="c-total">1</td>`;
    tb.appendChild(tr);
    tr.scrollIntoView({block:'center'});
    return;
  }

  const eqIndex = sorted.findIndex(p=>Number(p.seniority)===sn);
  if(eqIndex !== -1){
    for(let i=0;i<sorted.length;i++){
      const p=sorted[i];
      const tr=document.createElement('tr');
      tr.className = (i===eqIndex) ? 'you' : '';
      tr.innerHTML = `<td class="c-snr">${p.seniority??''}</td>
                      <td class="c-name">${p.name??''}</td>
                      <td class="c-rank">${i+1}</td>
                      <td class="c-total">${total}</td>`;
      tb.appendChild(tr);
    }
    tb.querySelector('tr.you')?.scrollIntoView({block:'center'});
    return;
  }

  const insertAt = lowerBound(seniors, sn);
  for(let i=0;i<sorted.length;i++){
    if(i===insertAt){
      const tr=document.createElement('tr');
      tr.className='you';
      tr.innerHTML = `<td class="c-snr">${sn}</td>
                      <td class="c-name">(you — hypothetical)</td>
                      <td class="c-rank">${i+1}</td>
                      <td class="c-total">${total+1}</td>`;
      tb.appendChild(tr);
    }
    const p=sorted[i];
    const tr=document.createElement('tr');
    tr.innerHTML = `<td class="c-snr">${p.seniority??''}</td>
                    <td class="c-name">${p.name??''}</td>
                    <td class="c-rank">${i+1 + (i>=insertAt?1:0)}</td>
                    <td class="c-total">${total+1}</td>`;
    tb.appendChild(tr);
  }
  if(insertAt===sorted.length){
    const tr=document.createElement('tr');
    tr.className='you';
    tr.innerHTML = `<td class="c-snr">${sn}</td>
                    <td class="c-name">(you — hypothetical)</td>
                    <td class="c-rank">${total+1}</td>
                    <td class="c-total">${total+1}</td>`;
    tb.appendChild(tr);
  }
  tb.querySelector('tr.you')?.scrollIntoView({block:'center'});
}

async function main(){
  await loadIndex();
  const byBase=groupByBase(INDEX);

  const baseSel=document.getElementById('base');
  const seatSel=document.getElementById('seat');
  fillSelect(baseSel, Array.from(byBase.keys()).sort());
  function refreshSeats(){
    const base=baseSel.value;
    const seats=(byBase.get(base)||[]).map(c=>c.seat).sort();
    fillSelect(seatSel, seats);
  }
  refreshSeats();
  baseSel.addEventListener('change', refreshSeats);

  document.getElementById('calc').addEventListener('click', async ()=>{
    const sn=parseInt(document.getElementById('sn').value,10);
    if(!sn){ alert('Enter a valid seniority #'); return; }

    setBanner('script-v5 ✓ calculating…');
    const rows = await calcAll(sn);
    renderBest(rows);

    const base=baseSel.value, seat=seatSel.value;
    const combo=INDEX.combos.find(c=>c.base===base && c.seat===seat);
    if(!combo){ alert('No data for that base/seat'); setBanner('script-v5 ⚠ no combo'); return; }
    const data=await loadPilots(combo.file);
    renderListTitle(base, seat);
    renderList(base, seat, data.pilots, sn);
    setBanner('script-v5 ✓ done');
  });

  document.getElementById('compare').addEventListener('click', async ()=>{
    const sn=parseInt(document.getElementById('sn').value,10);
    if(!sn){ alert('Enter a valid seniority #'); return; }
    setBanner('script-v5 ✓ compare');
    renderBest(await calcAll(sn));
  });
}

main().catch(err=>{
  console.error(err);
  setBanner('script-v5 ⚠ failed init');
  alert('Failed to load site data. Check /data files and try again.');
});
