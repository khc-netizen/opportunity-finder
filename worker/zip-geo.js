// Canonical ZIP-first geography for every discovery type.
// A candidate may not be fetched until it proves a ZIP inside the requested radius
// (or a city that maps unambiguously to one of these ZIPs) from search-result evidence.
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
const CITY_TO_ZIPS = {};
for (const [zip, city] of ZIP_REGION) (CITY_TO_ZIPS[city.toLowerCase()] ||= []).push(zip);

function normalizeZip(value) {
  const m = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : '';
}
function eligibleZips(radius) {
  const r = Number(radius || 30);
  return ZIP_REGION.filter(x => x[2] <= r).map(([zip, city, distance]) => ({ zip, city, distance }));
}
function distanceForZip(zip, radius = 30) {
  const z = normalizeZip(zip);
  const row = ZIP_REGION.find(x => x[0] === z);
  return row && row[2] <= Number(radius) ? row[2] : null;
}
function isAllowedZip(zip, radius = 30) {
  const z = normalizeZip(zip);
  return !!z && ZIP_SET.has(z) && distanceForZip(z, radius) !== null;
}
function extractZips(text) {
  return [...String(text || '').matchAll(/\b(\d{5})(?:-\d{4})?\b/g)]
    .map(m => m[1]).filter((z, i, a) => a.indexOf(z) === i);
}
function cityEvidence(text, radius = 30) {
  const t = String(text || '').toLowerCase();
  const found = [];
  for (const [city, zips] of Object.entries(CITY_TO_ZIPS)) {
    if (new RegExp(`\\b${escapeRegExp(city)}\\b`, 'i').test(t)) {
      for (const zip of zips) {
        const distance = distanceForZip(zip, radius);
        if (distance !== null) found.push({ zip, city: ZIP_TO_CITY[zip], distance, source: 'city-map' });
      }
    }
  }
  return found;
}
function zipEvidence(text, radius = 30) {
  return extractZips(text).map(zip => ({
    zip, city: ZIP_TO_CITY[zip] || '', distance: distanceForZip(zip, radius), allowed: isAllowedZip(zip, radius), source: 'explicit-zip'
  }));
}
function resolveEvidence(text, radius = 30) {
  const explicit = zipEvidence(text, radius).filter(x => x.allowed);
  if (explicit.length) return explicit;
  return cityEvidence(text, radius);
}
function passesHardZipGate(text, radius = 30) {
  return resolveEvidence(text, radius).length > 0;
}
function bestLocation(text, radius = 30) {
  const matches = resolveEvidence(text, radius).sort((a, b) => a.distance - b.distance);
  return matches[0] || null;
}
function enrichLocation(item, radius = 30) {
  const text = `${item?.zip || ''} ${item?.location || ''} ${item?.address || ''} ${item?.description || ''} ${item?.url || ''}`;
  const best = bestLocation(text, radius);
  if (!best) return null;
  return { ...item, zip: best.zip, city: item.city || best.city, state: item.state || 'OH', distance: best.distance, distanceMiles: best.distance, location: `${item.city || best.city}, ${item.state || 'OH'} ${best.zip}` };
}
function passesZipGate(value, radius) { return passesHardZipGate(value, radius); }
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export { HOME_ZIP, ZIP_REGION, ZIP_SET, ZIP_TO_CITY, CITY_TO_ZIPS, eligibleZips, distanceForZip, isAllowedZip, extractZips, zipEvidence, cityEvidence, resolveEvidence, bestLocation, passesHardZipGate, passesZipGate, enrichLocation, normalizeZip };
