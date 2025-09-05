(function(){ 
  function copyBaseOptions(){ 
    const from = document.getElementById('baseSelect'); 
    const to = document.getElementById('ugBase'); 
    if(!from || !to) return; 
    if(to.options.length>0 && to.options[0].value === from.options[0]?.value) return;
    to.innerHTML='';
    for(const opt of from.options){ 
      const o = document.createElement('option'); 
      o.value = opt.value; 
      o.textContent = opt.textContent; 
      to.appendChild(o); 
    }
  }
  function defaultAsOf(){ 
    const tgt = document.getElementById('targetDate'); 
    const asof = document.getElementById('ugAsOf'); 
    if(!asof) return; 
    asof.value = tgt && tgt.value ? tgt.value : '2025-09-05'; 
  }
  function onRun(){ 
    const sEl = document.getElementById('yourSeniority'); 
    const bEl = document.getElementById('ugBase'); 
    const dEl = document.getElementById('ugAsOf'); 
    const outDate = document.getElementById('ugDate'); 
    const outMonths = document.getElementById('ugMonths'); 
    const status = document.getElementById('ugStatus');
    if(!window.projectUpgrade){ status.textContent='projection.js not loaded'; return; }
    const seniority = parseInt(sEl.value,10);
    if(!seniority || seniority < 1){ status.textContent='Enter a valid seniority #'; return; }
    const base = bEl.value || 'SEA';
    const asOf = dEl.value || '2025-09-05';
    status.textContent='';
    const res = window.projectUpgrade(seniority, base, asOf);
    if(res.months===null){ 
      outDate.textContent='—';
      outMonths.textContent='No upgrade within 20y';
    } else {
      outDate.textContent = res.projectedDate;
      outMonths.textContent = res.months;
    }
  }
  function attach(){ 
    copyBaseOptions(); 
    defaultAsOf(); 
    const btn = document.getElementById('runUpgrade'); 
    if(btn) btn.addEventListener('click', onRun);
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', attach); }
  else { attach(); }
})();
