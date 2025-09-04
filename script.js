// JS with null-safe rendering
function renderBaseSeat(res){
  const basePos = document.getElementById('basePos');
  if(basePos) basePos.textContent =
    (res.projectedRank && res.activeTotal)
      ? `#${res.projectedRank} of ${res.activeTotal} (${res.pct}%)`
      : '—';

  const baseActive = document.getElementById('baseActive');
  if(baseActive) baseActive.textContent = res.activeTotal ?? '—';

  const baseRetTable = document.getElementById('baseRetList');
  if(baseRetTable){
    const tb = baseRetTable.querySelector('tbody');
    if(tb){
      tb.innerHTML='';
      for(const p of res.retireesAheadList || []){
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${p.seniority}</td><td>${p.retire_date||''}</td>`;
        tb.appendChild(tr);
      }
    }
  }
}
// Dummy placeholder for rest of your app logic...
