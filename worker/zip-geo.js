// Canonical ZIP-first geography for every discovery type.
// Distances are calculated from verified ZIP centroid coordinates and rounded to whole miles.
// A candidate may not be fetched until its search-result evidence maps to an eligible ZIP/city.
const HOME_ZIP = '44439';
const HOME_COORDS = [41.4594, -80.9427];
const ZIP_REGION = [
  ['44439','Mesopotamia',0],
  ['44062','Middlefield',5], ['44099','Windsor',7], ['44402','Bristolville',6], ['44491','West Farmington',6],
  ['44450','North Bloomfield',6], ['44046','Huntsburg',9], ['44080','Parkman',9], ['44076','Orwell',8],
  ['44021','Burton',11], ['44417','Farmdale',15], ['44410','Cortland',14], ['44444','Newton Falls',20],
  ['44231','Garrettsville',13], ['44482','Warren',14], ['44486','Warren',14], ['44481','Warren',20],
  ['44430','Leavittsburg',15], ['44234','Hiram',14], ['44266','Ravenna',24], ['44024','Chardon',15],
  ['44240','Kent',31], ['44484','Warren',18], ['44485','Warren',16],
  ['44470','Southington',11], ['44473','Vienna',21], ['44446','Niles',21], ['44483','Warren',15],
  ['44428','Kinsman',19], ['44418','Fowler',20], ['44403','Brookfield',24], ['44412','Diamond',26],
  ['44429','Lake Milton',25], ['44437','McDonald',24], ['44438','Masury',26], ['44440','Mineral Ridge',23],
  ['44064','Montville',11], ['44065','Newbury',15], ['44057','Madison',22], ['44072','Novelty',20],
  ['44086','Thompson',16], ['44088','Unionville',23], ['44085','Rome',11], ['44084','Rock Creek',15],
  ['44082','Pierpont',29], ['44047','Jefferson',21], ['44032','Dorset',20], ['44041','Geneva',22],
  ['44033','East Claridon',10], ['44026','Chesterland',20], ['44023','Chagrin Falls',19], ['44022','Chagrin Falls',24],
  ['44093','Williamsfield',18]
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
    if (!new RegExp(`\\b${escapeRegExp(city)}\\b`, 'i').test(t)) continue;
    for (const zip of zips) {
      const distance = distanceForZip(zip, radius);
      if (distance !== null) found.push({ zip, city: ZIP_TO_CITY[zip], distance, source: 'city-map' });
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
function passesHardZipGate(text, radius = 30) { return resolveEvidence(text, radius).length > 0; }
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
export { HOME_ZIP, HOME_COORDS, ZIP_REGION, ZIP_SET, ZIP_TO_CITY, CITY_TO_ZIPS, eligibleZips, distanceForZip, isAllowedZip, extractZips, zipEvidence, cityEvidence, resolveEvidence, bestLocation, passesHardZipGate, passesZipGate, enrichLocation, normalizeZip };
