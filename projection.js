/** ======= CONFIG YOU CAN TUNE ======= */
const UPGRADE_CONFIG = {
  anchors: [
    { date: "2025-03-02", cutoffSeniority: 2371 },
    { date: "2025-11-01", cutoffSeniority: 1863 },
  ],
  freeze: { start: "2024-02-01", end: "2025-08-31" },
  rates: {
    duringFreeze: 56,
    afterFreeze: 68,
  },
  baseMultipliers: {
    "ANC": 1.10,
    "SEA": 1.00,
    "PDX": 0.95,
    "LAX": 1.00,
    "SFO": 0.98
  }
};

function toDate(s){ const [y,m,d]=s.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)); }
function monthsBetween(d1, d2){
  const ms = d2 - d1;
  return ms / (1000*60*60*24*30.4375);
}
function addMonths(date, months){
  const d = new Date(date.getTime());
  const days = Math.round(months*30.4375);
  d.setUTCDate(d.getUTCDate()+days);
  return d;
}
function fmt(d){ return d.toISOString().slice(0,10); }

function interpolateCutoff(config, targetDate){
  const A = config.anchors.map(a => ({...a, d: toDate(a.date)})).sort((x,y)=>x.d-y.d);
  const t = targetDate;

  if (t <= A[0].d) {
    const m = monthsBetween(t, A[0].d);
    return Math.round(A[0].cutoffSeniority + m * config.rates.duringFreeze);
  }

  const freezeStart = toDate(config.freeze.start);
  const freezeEnd = toDate(config.freeze.end);

  let cutoff = A[0].cutoffSeniority;
  let lastDate = A[0].d;

  const step = (from, to, rate) => {
    const m = monthsBetween(from, to);
    return m * rate;
  };

  if (lastDate < freezeEnd && t > freezeStart) {
    const segStart = lastDate < freezeStart ? freezeStart : lastDate;
    const segEnd = t < freezeEnd ? t : freezeEnd;
    if (segEnd > segStart) {
      cutoff -= step(segStart, segEnd, config.rates.duringFreeze);
      lastDate = segEnd;
    }
  }

  if (t > lastDate) {
    cutoff -= step(lastDate, t, config.rates.afterFreeze);
  }

  return Math.round(cutoff);
}

function projectUpgrade(currentSeniority, base, asOfDate){
  const now = toDate(asOfDate);
  const cutoffNow = interpolateCutoff(UPGRADE_CONFIG, now);
  if (currentSeniority <= cutoffNow) {
    return { months: 0, projectedDate: fmt(now) };
  }

  let months = 0;
  while (months < 240) { // cap at 20 years
    const testDate = addMonths(now, months);
    const cutoff = interpolateCutoff(UPGRADE_CONFIG, testDate);
    const adjCutoff = Math.round(cutoff * (UPGRADE_CONFIG.baseMultipliers[base] || 1.0));
    if (currentSeniority <= adjCutoff) {
      return { months, projectedDate: fmt(testDate) };
    }
    months++;
  }
  return { months: null, projectedDate: null };
}
// Expose on window (for inline handlers)
window.projectUpgrade = projectUpgrade;
