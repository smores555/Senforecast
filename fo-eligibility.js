// fo-eligibility.js — base-wide projected FO eligibility (supports 'pilots' arrays and snake_case dates)
async function loadJson(path){
  const r = await fetch(path, {cache:'no-store'});
  if(!r.ok) throw new Error('Missing ' + path);
  return r.json();
}
function addMonthsISO(ymd, n){
  const [y,m,d] = ymd.split(/[-\/]/).map(s=>parseInt(s,10));
  const dt = new Date(y, (m||1)-1, d||1);
  dt.setMonth(dt.getMonth() + n);
  const y2 = dt.getFullYear();
  const m2 = String(dt.getMonth()+1).padStart(2,'0');
  const d2 = String(dt.getDate()).padStart(2,'0');
  return `${y2}-${m2}-${d2}`;
}
function normalizeDateString(v){
  // Accepts "6/10/96" or "1996-06-10"; returns "YYYY-MM-DD" or null
  if(!v) return null;
  if(/\d{4}-\d{2}-\d{2}/.test(v)) return v;
  // "M/D/YY" or "MM/DD/YY"
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){
    let [_, mm, dd, yy] = m;
    mm = mm.padStart(2,'0'); dd = dd.padStart(2,'0');
    if(yy.length===2){ yy = (parseInt(yy,10) >= 70 ? '19'+yy : '20'+yy); }
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}
function getCaptainDate(c){
  const keys = ['seatDate','awardDate','effectiveDate','hireDate','hire_date','seniorityDate','doj','date'];
  for(const k of keys){
    if(c && c[k]){
      return normalizeDateString(c[k]) || c[k];
    }
  }
  return null;
}
function mostJuniorCaptainDate(captainRoster){
  let latest = null;
  for(const c of (captainRoster||[])){
    const dt = getCaptainDate(c);
    if(!dt) continue;
    if(!latest || dt > latest) latest = dt;
  }
  return latest;
}
async function baseFOEligibilityDateFromFile(pathToCAJson){
  const data = await loadJson('data/' + pathToCAJson);
  const roster = Array.isArray(data) ? data
                : (data.pilots || data.captains || data.rows || data.list || []);
  const mj = mostJuniorCaptainDate(roster);
  return mj ? addMonthsISO(mj, 18) : null;
}
async function computeAllBaseFOEligibility(index){
  const out = {};
  if(!index || !Array.isArray(index.combos)) return out;
  const caCombos = index.combos.filter(c => c.seat === 'CA' && c.file);
  for(const c of caCombos){
    try{
      const date = await baseFOEligibilityDateFromFile(c.file);
      out[c.base] = date || '—';
    }catch(e){
      console.warn('FO addon error on', c?.base, c?.file, e);
      out[c.base || 'UNKNOWN'] = '—';
    }
  }
  return out;
}
async function renderFOEligibilityBlock(containerId='fo-eligibility'){
  const el = document.getElementById(containerId);
  if(!el) return;
  let INDEX;
  try { INDEX = await loadJson('data/index.json'); }
  catch(e){
    try { INDEX = await loadJson('data/index.json.txt'); }
    catch(_){ console.error(e); el.textContent = 'Unable to load index.json'; return; }
  }
  const map = await computeAllBaseFOEligibility(INDEX);
  const bases = Object.keys(map).sort();
  const rows = bases.map(base => `<tr><td>${base}</td><td>${map[base] || '—'}</td></tr>`).join('');
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Base</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
