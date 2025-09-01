let DATA=null;

async function loadData(){
  const r=await fetch('data/data.json');
  DATA = await r.json();
  document.getElementById('asof').textContent = DATA.as_of;
  return DATA;
}

function computeProjection(sn, targetISO){
  const pilots = DATA.pilots;
  const me = pilots.find(p => p.seniority === sn);
  if(!me){ throw new Error('Your seniority number not found in the baseline list.'); }
  const target = new Date(targetISO+'T00:00:00Z');

  // Retirees ahead: SEN < sn AND retire_month <= target
  const ahead = pilots.filter(p => p.seniority < sn && p.retire_month && new Date(p.retire_month+'T00:00:00Z') <= target);
  const retireesAhead = ahead.length;

  const projected = sn - retireesAhead;

  // Your retirement month
  const yourRetire = me.retire_month ? new Date(me.retire_month+'T00:00:00Z') : null;

  // Your seniority at retirement: subtract everyone ahead who retires before or on your retire month
  let seniorityAtRetire = null;
  if(yourRetire){
    const aheadByYourRetire = pilots.filter(p => p.seniority < sn && p.retire_month && new Date(p.retire_month+'T00:00:00Z') <= yourRetire).length;
    seniorityAtRetire = sn - aheadByYourRetire;
  }

  // List of retirees ahead before target
  const retireesList = ahead.sort((a,b)=> new Date(a.retire_month) - new Date(b.retire_month));

  return { projected, retireesAhead, yourRetire, seniorityAtRetire, retireesList };
}

function fmtDate(d){ if(!d) return '—'; const yyyy=d.getUTCFullYear(); const mm=String(d.getUTCMonth()+1).padStart(2,'0'); const dd=String(d.getUTCDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }

function render(res){
  document.getElementById('proj').textContent = res.projected ?? '—';
  document.getElementById('ahead').textContent = res.retireesAhead ?? '—';
  document.getElementById('yourRetire').textContent = fmtDate(res.yourRetire);
  document.getElementById('atRetire').textContent = res.seniorityAtRetire ?? '—';

  const tb = document.querySelector('#retList tbody');
  tb.innerHTML='';
  for(const p of res.retireesList){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${p.seniority}</td><td>${p.name||''}</td><td>${p.retire_month||''}</td>`;
    tb.appendChild(tr);
  }
}

async function main(){
  await loadData();
  document.getElementById('calc').addEventListener('click', ()=>{
    const sn = parseInt(document.getElementById('sn').value,10);
    const td = document.getElementById('targetDate').value;
    if(!sn || !td){ alert('Enter seniority # and target date'); return; }
    try {
      const res = computeProjection(sn, td);
      render(res);
    } catch(e){
      alert(e.message);
    }
  });
}
main();
