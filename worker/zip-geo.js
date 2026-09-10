// Canonical ZIP-first geographic filter for all Opportunity Finder discovery.
const HOME_ZIP = '44439';
const ZIP_REGION = [
  ['44439','Mesopotamia',0],['44062','Middlefield',5],['44099','Windsor',8],['44402','Bristolville',8],
  ['44491','West Farmington',8],['44450','North Bloomfield',9],['44046','Huntsburg',10],['44080','Parkman',10],
  ['44076','Orwell',11],['44021','Burton',12],['44417','Farmdale',13],['44410','Cortland',14],
  ['44444','Newton Falls',15],['44231','Garrettsville',17],['44482','Warren',18],['44486','Warren',18],
  ['44481','Warren',19],['44430','Leavittsburg',20],['44234','Hiram',21],['44266','Ravenna',23],
  ['44024','Chardon',25],['44240','Kent',27],['44484','Warren',20],['44485','Warren',20]
];
const ZIP_SET = new Set(ZIP_REGION.map(x => x[0]));
const ZIP_TO_CITY = Object.fromEntries(ZIP_REGION.map(([zip, city]) => [zip, city]));
function normalizeZip(value) { const m = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/); return m ? m[1] : ''; }
function eligibleZips(radius) { const r = Number(radius || 30); return ZIP_REGION.filter(x => x[2] <= r).map(([zip, city, distance]) => ({ zip, city, distance })); }
function distanceForZip(zip, radius) { const z = normalizeZip(zip); const row = ZIP_REGION.find(x => x[0] === z); if (!row || row[2] > Number(radius || 30)) return null; return row[2]; }
function isAllowedZip(zip, radius) { const z = normalizeZip(zip); const d = distanceForZip(z, radius); return !!z && ZIP_SET.has(z) && d !== null; }
function extractZips(text) { return [...String(text || '').matchAll(/\b(\d{5})(?:-\d{4})?\b/g)].map(m => m[1]).filter((z, i, a) => a.indexOf(z) === i); }
function zipEvidence(text, radius) { return extractZips(text).map(zip => ({ zip, city: ZIP_TO_CITY[zip] || '', distance: distanceForZip(zip, radius), allowed: isAllowedZip(zip, radius) })); }
function passesZipGate(value, radius) { const zips = extractZips(value); return zips.some(zip => isAllowedZip(zip, radius)); }
function enrichLocation(item, radius) {
  const text = `${item?.zip || ''} ${item?.location || ''} ${item?.address || ''} ${item?.description || ''} ${item?.url || ''}`;
  const zips = zipEvidence(text, radius).filter(x => x.allowed);
  if (!zips.length) return null;
  const best = zips[0];
  return { ...item, zip: best.zip, city: item.city || best.city, state: item.state || 'OH', distance: best.distance, location: `${item.city || best.city}, ${item.state || 'OH'} ${best.zip}` };
}
export { HOME_ZIP, ZIP_REGION, ZIP_SET, ZIP_TO_CITY, eligibleZips, distanceForZip, isAllowedZip, extractZips, zipEvidence, passesZipGate, enrichLocation, normalizeZip };
