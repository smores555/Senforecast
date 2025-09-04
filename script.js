// ---- INIT & HELPERS ----
let INDEX = null;

async function loadJsonSafe(pathCandidates){
  for(const p of pathCandidates){
    try{
      const r = await fetch(p, {cache:'no-store'});
      if(!r.ok) continue;
      return await r.json();
    }catch(e){}
  }
  throw new Error('Could not load any of: ' + pathCandidates.join(', '));
}

function groupByBase(index){
  const map = new Map();
  for(const c of index.combos || []){
    if(!map.has(c.base)) map.set(c.base, []);
    map.get(c.base).push(c);
  }
  // sort seats CA/FO nicely
  for(const [b, arr] of map){
    arr.sort((a,b)=>{
      if(a.seat === b.seat) return a.file.localeCompare(b.file);
      return a.seat.localeCompare(b.seat);
    });
  }
  return map;
}

function fillSelect(el, values){
  el.innerHTML = '';
  for(const v of values){
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    el.appendChild(opt);
  }
}

function showErrorBanner(msg){
  let ban = document.getElementById('dataError');
  if(!ban){
    ban = document.createElement('div');
    ban.id = 'dataError';
    ban.style = 'background:#fee;border:1px solid #c66;border-radius:6px;padding:8px 12px;margin:10px 0;color:#900;';
    document.body.prepend(ban);
  }
  ban.textContent = msg;
}

async function initApp(){
  try{
    // Try normal path, then .txt (for dev uploads)
    INDEX = await loadJsonSafe(['data/index.json', 'data/index.json.txt']);

    // Populate base/seat selects
    const byBase = groupByBase(INDEX);
    const baseSelect = document.getElementById('baseSelect');
    const seatSelect = document.getElementById('seatSelect');

    if(!baseSelect || !seatSelect){
      showErrorBanner('Missing <select id="baseSelect"> or <select id="seatSelect"> in HTML.');
      return;
    }

    const bases = Array.from(byBase.keys()).sort();
    fillSelect(baseSelect, bases);

    function refreshSeats(){
      const selBase = baseSelect.value;
      const combos = byBase.get(selBase) || [];
      const seats = [...new Set(combos.map(c=>c.seat))].sort(); // e.g., ["CA","FO"]
      fillSelect(seatSelect, seats);
    }

    baseSelect.addEventListener('change', refreshSeats);
    refreshSeats(); // initialize once

    // If you had a render function, call it here after selects are ready:
    // renderBaseSeat(await computeFor(baseSelect.value, seatSelect.value));

  }catch(err){
    console.error(err);
    showErrorBanner('Could not load data. Check that /data/index.json exists and is valid JSON.');
  }
}

// Run after DOM is ready
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initApp);
}else{
  initApp();
}
