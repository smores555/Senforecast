// ---------- tiny helpers ----------
const by  = id  => document.getElementById(id);
const txt = (id, v) => { const el = by(id); if (el) el.textContent = (v ?? '—'); };

function parseISODate(iso){ return new Date(iso + 'T00:00:00Z'); }
function fmtDate(d){ if(!d) return '—'; const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

// Accepts "YYYY-MM" or "Mon-YY" like "Feb-27", returns "YYYY-MM-01"
function normalizeMonth(s){
  if(!s) return null;
  if(/^\d{4}-\d{2}/.test(s)) return s.slice(0,7) + "-01";
  const MAP = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  const mon = s.slice(0,3);
  const yy  = s.slice(-2);
  const mm  = MAP[mon] || '01';
  const year = (Number(yy) >= 70 ? '19' : '20') + yy; // adjust if you truly have 1970s dates
  return `${year}-${mm}-01`;
}

async function jget(url){
  const r = await fetch(url, { cache: 'no-store' });
  if(!r.ok) throw new Error(`Failed to load ${url} (${r.status})`);
  return r.json();
}

// ---------- global ----------
let MASTER = null;     // data/data.json   -> { as_of, pilots:[{seniority, retire_month, ...}] }
let INDEX  = null;     // data/index.json  -> { combos:[{base, seat, file}] }
const BASE_MAP = new Map(); // base -> [{base, seat, file}...]

// ---------- UI ----------
function fillSelect(sel, values){
  if(!sel) return;
  sel.innerHTML = '';
  for(const v of values){
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
}

function updateSeatSelect(){
  const base = by('baseSel')?.value;
  const seats = BASE_MAP.get(base) || [];
  fillSelect(by('seatSel'), seats.map(s => s.seat));
}

// ---------- master projection (unchanged behavior) ----------
function computeMaster(sn, targetISO){
  const pilots = MASTER?.pilots || [];
  const me = pilots.find(p => p.seniority === sn);
  if(!me) throw new Error('Your seniority number was not found in the master list.');

  const target = parseISODate(targetISO);

  // Accept retire_month either "YYYY-MM" or "YYYY-MM-DD"
  const ahead = pilots.filter(p => {
    if(!(p.seniority < sn) || !p.retire_month) return false;
    const iso = p.retire_month.length === 7 ? (p.retire_month + "-01") : p.retire_month;
    return parseISODate(iso) <= target;
  });

  const retireesAhead = ahead.length;
  const projected = sn - retireesAhead;

  const yourRetire = me.retire_month
    ? parseISODate(me.retire_month.length === 7 ? (me.retire_month + "-01") : me.retire_month)
    : null;

  let seniorityAtRetire = null;
  if(yourRetire){
    const aheadByYourRetire = pilots.filter(p => {
      if(!(p.seniority < sn) || !p.retire_month) return false;
      const iso = p.retire_month.length === 7 ? (p.retire_month + "-01") : p.retire_month;
      return parseISODate(iso) <= yourRetire;
    }).length;
    seniorityAtRetire = sn - aheadByYourRetire;
  }
  return { projected, retireesAhead, yourRetire, seniorityAtRetire };
}

function renderMaster(res){
  txt('proj',       res.projected);
  txt('ahead',      res.retireesAhead);
  txt('yourRetire', res.yourRetire ? fmtDate(res.yourRetire) : '—');
  txt('atRetire',   res.seniorityAtRetire);
}

// ---------- base/seat projection ----------
async function computeBaseSeat(sn, targetISO){
  const base = by('baseSel')?.value;
  const seat = by('seatSel')?.value;
  if(!base || !seat) throw new Error('Pick a Base and Seat.');

  const combo = (BASE_MAP.get(base) || []).find(c => c.seat === seat);
  if(!combo) throw new Error(`No mapping for ${base}/${seat} in index.json`);

  const raw = await jget(`data/${combo.file}`);
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw.pilots) ? raw.pilots : []);

  const target = parseISODate(targetISO);
  const rows = list.map(p => ({
      seniority: Number(p.seniority),
      retireISO: normalizeMonth(p.retire_date || p.retire_month || null)
    }))
    .filter(p => Number.isFinite(p.seniority))
    .sort((a,b) => a.seniority - b.seniority);

  const aheadBaseline = rows.filter(p => p.seniority < sn).length;
  const aheadRetiring = rows.filter(p => p.seniority < sn && p.retireISO && parseISODate(p.retireISO) <= target).length;

  const projectedRank = 1 + aheadBaseline - aheadRetiring;
  const activeTotal   = rows.filter(p => !p.retireISO || parseISODate(p.retireISO) > target).length;
  const pct           = activeTotal ? ((projectedRank/activeTotal)*100).toFixed(1) : null;

  const retireesAheadList = rows
    .filter(p => p.seniority < sn && p.retireISO && parseISODate(p.retireISO) <= target)
    .sort((a,b) => parseISODate(a.retireISO) - parseISODate(b.retireISO));

  return { projectedRank, activeTotal, pct, retireesAheadList };
}

function renderBaseSeat(res){
  txt('basePos', (res.projectedRank && res.activeTotal) ? `#${res.projectedRank} of ${res.activeTotal} (${res.pct}%)` : '—');
  txt('baseActive', res.activeTotal);

  // Only render table if it exists (prevents "null is not an object")
  const table = by('baseRetList');
  if(table){
    const tb = table.querySelector('tbody');
    if(tb){
      tb.innerHTML = '';
      for(const p of (res.retireesAheadList || [])){
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.seniority}</td><td>${p.retireISO || ''}</td>`;
        tb.appendChild(tr);
      }
    }
  }
}

// ---------- boot ----------
async function main(){
  try{
    // load master
    MASTER = await jget('data/data.json');
    txt('asof', MASTER?.as_of ?? '—');

    // load base index
    INDEX = await jget('data/index.json');
    if(!INDEX?.combos || !Array.isArray(INDEX.combos)) throw new Error('index.json missing combos[]');

    // build map & populate dropdowns
    for(const c of INDEX.combos){
      if(!BASE_MAP.has(c.base)) BASE_MAP.set(c.base, []);
      BASE_MAP.get(c.base).push(c);
    }
    for(const [b, arr] of BASE_MAP){ arr.sort((a,b)=>a.seat.localeCompare(b.seat)); }

    fillSelect(by('baseSel'), [...BASE_MAP.keys()].sort());
    updateSeatSelect();

    by('baseSel')?.addEventListener('change', updateSeatSelect);

    by('calc')?.addEventListener('click', async ()=>{
      const sn = parseInt(by('sn')?.value ?? '', 10);
      const td = by('targetDate')?.value;
      if(!sn || !td){ alert('Enter seniority # and target date'); return; }

      try{
        const m = computeMaster(sn, td);
        renderMaster(m);

        const b = await computeBaseSeat(sn, td);
        renderBaseSeat(b);
      }catch(err){
        console.error(err);
        alert(err.message);
      }
    });

    console.log('Loaded: master + index; dropdowns ready.');
  }catch(e){
    console.error(e);
    alert(e.message);
  }
}

main();
