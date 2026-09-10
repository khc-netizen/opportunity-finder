import baseWorker from './index.js';

const RELEASE = '3.9.16';
const RELEASE_BUILD = 'v3.9.16-seed-fallback';
const RELEASE_FINGERPRINT = 'seed-fallback-2026-09-10';

const GROUP_LENS = ['community organizations Warren Ohio','historical societies Cortland Ohio','museums Garrettsville Ohio','nature conservation Middlefield Ohio','traditional crafts Burton Ohio','archaeology Chardon Ohio','volunteer groups Kent Ohio','gardening clubs Ravenna Ohio'];
const JOB_LENS = ['maintenance','welding fabrication','mechanic technician','parks recreation','museum archaeology','warehouse material handling','grounds laborer','facility technician'];
const EVENT_LENS = ['community events Warren Ohio','history events Cortland Ohio','museum programs Garrettsville Ohio','nature events Middlefield Ohio','craft workshops Burton Ohio','archaeology events Chardon Ohio','volunteer events Kent Ohio','gardening events Ravenna Ohio'];
const DIAGNOSTIC_SEEDS = [
  { name: 'Trumbull County Beekeepers', url: 'https://www.trumbullbeekeepers.org/' },
  { name: 'Western Reserve Artist Blacksmith Association', url: 'https://www.wraba.com/' },
  { name: 'Century Village Museum', url: 'https://centuryvillagemuseum.org/' }
];

async function jsonResponse(response) { const text = await response.text(); try { return { response, data: JSON.parse(text) }; } catch { return { response, data: null }; } }
function uniqueItems(items = []) { const seen = new Set(); return items.filter(item => { const key = `${String(item?.title || item?.name || '').toLowerCase()}|${String(item?.url || item?.link || '').toLowerCase()}`; if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
function withLens(request, lens) { const u = new URL(request.url); u.searchParams.set('interests', lens.join(',')); return new Request(u, request); }
function seedMatch(item, seed) { const haystack = `${item?.title || item?.name || ''} ${item?.url || item?.link || ''}`.toLowerCase(); return haystack.includes(seed.name.toLowerCase()) || haystack.includes(seed.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()); }
function isSeed(item) { return DIAGNOSTIC_SEEDS.some(seed => seedMatch(item, seed)); }
function organicItems(items = []) { return items.filter(item => !isSeed(item)); }
function seedHealth(items = []) { const found = DIAGNOSTIC_SEEDS.map(seed => ({ ...seed, found: items.some(item => seedMatch(item, seed)) })); const organic = organicItems(items); return { expected: DIAGNOSTIC_SEEDS.length, found: found.filter(x => x.found).length, missing: found.filter(x => !x.found).map(x => x.name), seeds: found, totalResults: items.length, organicResults: organic.length, seedOnly: items.length > 0 && organic.length === 0 }; }
function addRelease(data) { return { ...data, deployment: { version: RELEASE, build: RELEASE_BUILD, fingerprint: RELEASE_FINGERPRINT, entrypoint: 'worker/coverage.js' } }; }
function seedAwareResult(data, field) { if (!data || !Array.isArray(data[field])) return data; const all = uniqueItems(data[field]); const organic = organicItems(all); const visible = organic.length ? organic : all; return { ...data, [field]: visible, items: field === 'groups' || field === 'events' ? visible : data.items, discoveryHealth: { ...(data.discoveryHealth || {}), organicResults: organic.length, totalResults: all.length, seedOnly: all.length > 0 && organic.length === 0, seedFallbackUsed: organic.length === 0 && all.length > 0 } }; }

async function diagnosticHealth(request, env, ctx) {
  const first = await jsonResponse(await baseWorker.fetch(request, env, ctx));
  const groupsRequest = new Request(new URL('/groups' + new URL(request.url).search, request.url), request);
  const firstGroups = await jsonResponse(await baseWorker.fetch(groupsRequest, env, ctx));
  const firstItems = Array.isArray(firstGroups.data?.groups) ? firstGroups.data.groups : (Array.isArray(firstGroups.data?.items) ? firstGroups.data.items : []);
  const health = seedHealth(firstItems);
  const recovery = { attempted: false, reason: null, found: health.found, results: health.totalResults };
  if (health.found < health.expected) {
    recovery.attempted = true;
    recovery.reason = 'one or more diagnostic seed organizations were not returned by the normal Groups discovery pass';
    const recovered = await jsonResponse(await baseWorker.fetch(withLens(groupsRequest, DIAGNOSTIC_SEEDS.map(x => `"${x.name}"`)), env, ctx));
    const recoveredItems = Array.isArray(recovered.data?.groups) ? recovered.data.groups : (Array.isArray(recovered.data?.items) ? recovered.data.items : []);
    const recoveredHealth = seedHealth(recoveredItems);
    recovery.found = recoveredHealth.found; recovery.results = recoveredHealth.totalResults; recovery.missing = recoveredHealth.missing; recovery.status = recoveredHealth.found === recoveredHealth.expected ? 'recovered' : 'failed';
  } else recovery.status = 'not-needed';
  const diagnostic = addRelease({ ...(first.data || {}), version: RELEASE, build: RELEASE_BUILD, discoveryHealth: { organicResults: health.organicResults, totalResults: health.totalResults, seedOnly: health.seedOnly, seedCoverage: `${health.found}/${health.expected}`, seedCoveragePass: health.found === health.expected, discoveryPass: health.organicResults > 0, recovery, error: health.organicResults === 0 ? 'No organic organizations were discovered independently of the diagnostic seed set.' : null } });
  return new Response(JSON.stringify(diagnostic, null, 2), { status: first.response.status, headers: first.response.headers });
}

async function adaptive(request, env, ctx, field, lens, minimum, maxPrimaryFetches = Infinity) {
  const first = await jsonResponse(await baseWorker.fetch(request, env, ctx));
  if (!first.data || !Array.isArray(first.data[field])) return first.response;
  const firstProcessed = seedAwareResult(first.data, field);
  const firstOrganic = organicItems(first.data[field]);
  if (firstOrganic.length >= minimum) { const result = addRelease(firstProcessed); return new Response(JSON.stringify(result, null, 2), { status: first.response.status, headers: first.response.headers }); }
  const primaryUsed = Number(first.data?.fetchBudget?.used ?? Infinity);
  if (primaryUsed > maxPrimaryFetches) { const result = addRelease(firstProcessed); return new Response(JSON.stringify(result, null, 2), { status: first.response.status, headers: first.response.headers }); }
  const second = await jsonResponse(await baseWorker.fetch(withLens(request, lens), env, ctx));
  if (!second.data || !Array.isArray(second.data[field])) { const result = addRelease(firstProcessed); return new Response(JSON.stringify(result, null, 2), { status: first.response.status, headers: first.response.headers }); }
  const mergedAll = uniqueItems([...first.data[field], ...second.data[field]]);
  const mergedOrganic = organicItems(mergedAll);
  const visible = mergedOrganic.length ? mergedOrganic : mergedAll;
  const result = addRelease({ ...first.data, [field]: visible, items: field === 'groups' || field === 'events' ? visible : first.data.items, coverage: { ...(first.data.coverage || {}), adaptiveLens: true, lens, primaryCount: first.data[field].length, supplementalCount: second.data[field].length, mergedCount: mergedAll.length, organicCount: mergedOrganic.length, seedFallbackUsed: mergedOrganic.length === 0 && mergedAll.length > 0, primaryFetches: primaryUsed, supplementalFetches: second.data?.fetchBudget?.used ?? null } });
  return new Response(JSON.stringify(result, null, 2), { status: first.response.status, headers: first.response.headers });
}

export default { async fetch(request, env, ctx) { const url = new URL(request.url); if (url.pathname === '/test') return diagnosticHealth(request, env, ctx); if (url.pathname === '/groups') return adaptive(request, env, ctx, 'groups', GROUP_LENS, 6, 22); if (url.pathname === '/events') return adaptive(request, env, ctx, 'events', EVENT_LENS, 8, 22); if (url.pathname === '/jobs') return baseWorker.fetch(request, env, ctx); if (url.pathname === '/discover') return baseWorker.fetch(request, env, ctx); return baseWorker.fetch(request, env, ctx); } };
