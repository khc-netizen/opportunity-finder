// Canonical ZIP-first geography for every discovery type.
// Distances are calculated from verified ZIP centroid coordinates.
// Radius controls are eligibility limits; displayed distance is always the home-ZIP distance.
const HOME_ZIP = '44439';
const ZIP_REGION = [
  ['44439','Mesopotamia',41.4594,-80.9427],
  ['44062','Middlefield',41.4511,-81.0346],['44099','Windsor',41.5492,-80.9833],['44402','Bristolville',41.3980,-80.8528],
  ['44491','West Farmington',41.3700,-80.9637],['44450','North Bloomfield',41.4457,-80.8196],['44046','Huntsburg',41.5415,-81.0803],
  ['44080','Parkman',41.3684,-81.0578],['44076','Orwell',41.5281,-80.8148],['44021','Burton',41.4433,-81.1445],
  ['44417','Farmdale',41.4332,-80.6633],['44410','Cortland',41.3463,-80.7277],['44444','Newton Falls',41.1756,-80.9777],
  ['44231','Garrettsville',41.3030,-81.0705],['44482','Warren',41.3174,-80.7613],['44486','Warren',41.3174,-80.7613],
  ['44481','Warren',41.1766,-80.9025],['44430','Leavittsburg',41.2379,-80.9108],['44234','Hiram',41.3259,-81.1523],
  ['44266','Ravenna',41.1690,-81.1970],['44024','Chardon',41.5782,-81.1913],['44240','Kent',41.1330,-81.3424],
  ['44484','Warren',41.2355,-80.7498],['44485','Warren',41.2404,-80.8478],['44470','Southington',41.3003,-80.9727],
  ['44473','Vienna',41.2466,-80.6627],['44446','Niles',41.1895,-80.7475],['44483','Warren',41.2636,-80.8170],
  ['44428','Kinsman',41.4308,-80.5852],['44418','Fowler',41.3069,-80.6046],['44403','Brookfield',41.2405,-80.5827],
  ['44412','Diamond',41.3115,-80.7350],['44429','Lake Milton',41.6030,-80.9850],['44437','McDonald',41.1559,-80.7299],
  ['44438','Masury',41.2397,-80.5307],['44440','Mineral Ridge',41.1369,-80.8063],['44064','Montville',41.5981,-81.0323],
  ['44065','Newbury',41.4548,-81.2292],['44057','Madison',41.7279,-80.7359],['44072','Novelty',41.4712,-81.3249],
  ['44086','Thompson',41.6757,-81.0586],['44088','Unionville',41.7833,-81.0034],['44085','Rome',41.6033,-80.8745],
  ['44084','Rock Creek',41.6714,-80.8991],['44082','Pierpont',41.7619,-80.5675],['44047','Jefferson',41.7279,-80.7359],
  ['44032','Dorset',41.6692,-80.6701],['44041','Geneva',41.7770,-80.9500],['44033','East Claridon',41.5333,-81.1112],
  ['44026','Chesterland',41.4462,-81.4030],['44023','Chagrin Falls',41.3848,-81.2857],['44022','Chagrin Falls',41.4462,-81.4030],
  ['44093','Williamsfield',41.5362,-80.6132]
];
const ZIP_SET = new Set(ZIP_REGION.map(x => x[0]));
const ZIP_TO_CITY = Object.fromEntries(ZIP_REGION.map(([zip, city]) => [zip, city]));
const CITY_TO_ZIPS = {};
for (const [zip, city] of ZIP_REGION) (CITY_TO_ZIPS[city.toLowerCase()] ||= []).push(zip);
const EARTH_RADIUS_MILES = 3958.7613;
function normalizeZip(value) { const m = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/); return m ? m[1] : ''; }
function haversineMiles(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, a = Math.sin((lat2-lat1)*r/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin((lon2-lon1)*r/2)**2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function distanceForZip(zip, radius = Infinity) {
  const z = normalizeZip(zip), row = ZIP_REGION.find(x => x[0] === z);
  if (!row) return null;
  const d = Math.round(haversineMiles(HOME_COORDS[0], HOME_COORDS[1], row[2], row[3]));
  return d <= Number(radius) ? d : null;
}
const HOME_ROW = ZIP_REGION.find(x => x[0] === HOME_ZIP);
const HOME_COORDS = [HOME_ROW[2], HOME_ROW[3]];
function eligibleZips(radius = 30) {
  const r = Number(radius);
  return ZIP_REGION.map(([zip, city]) => ({ zip, city, distance: distanceForZip(zip) })).filter(x => x.distance !== null && x.distance <= r).sort((a,b) => a.distance-b.distance);
}
function isAllowedZip(zip, radius = 30) { const z = normalizeZip(zip); const d = distanceForZip(z); return !!z && ZIP_SET.has(z) && d !== null && d <= Number(radius); }
function extractZips(text) { return [...String(text || '').matchAll(/\b(\d{5})(?:-\d{4})?\b/g)].map(m => m[1]).filter((z,i,a) => a.indexOf(z) === i); }
function cityEvidence(text, radius = 30) {
  const t = String(text || '').toLowerCase(), found = [];
  for (const [city,zips] of Object.entries(CITY_TO_ZIPS)) if (new RegExp(`\\b${escapeRegExp(city)}\\b`,'i').test(t)) for (const zip of zips) { const distance = distanceForZip(zip); if (distance !== null && distance <= Number(radius)) found.push({zip,city:ZIP_TO_CITY[zip],distance,source:'city-map'}); }
  return found;
}
function zipEvidence(text, radius = 30) { return extractZips(text).map(zip => { const distance=distanceForZip(zip); return {zip,city:ZIP_TO_CITY[zip]||'',distance,allowed:isAllowedZip(zip,radius),source:'explicit-zip'}; }); }
function resolveEvidence(text, radius = 30) { const explicit=zipEvidence(text,radius).filter(x=>x.allowed); return explicit.length ? explicit : cityEvidence(text,radius); }
function passesHardZipGate(text,radius=30) { return resolveEvidence(text,radius).length>0; }
function bestLocation(text,radius=30) { return resolveEvidence(text,radius).sort((a,b)=>a.distance-b.distance)[0] || null; }
function enrichLocation(item,radius=30) { const best=bestLocation(`${item?.zip||''} ${item?.location||''} ${item?.address||''} ${item?.description||''} ${item?.url||''}`,radius); if(!best)return null; return {...item,zip:best.zip,city:item.city||best.city,state:item.state||'OH',distance:best.distance,distanceMiles:best.distance,location:`${item.city||best.city}, ${item.state||'OH'} ${best.zip}`}; }
function passesZipGate(value,radius){return passesHardZipGate(value,radius);}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export { HOME_ZIP, HOME_COORDS, ZIP_REGION, ZIP_SET, ZIP_TO_CITY, CITY_TO_ZIPS, eligibleZips, distanceForZip, isAllowedZip, extractZips, zipEvidence, cityEvidence, resolveEvidence, bestLocation, passesHardZipGate, passesZipGate, enrichLocation, normalizeZip };
