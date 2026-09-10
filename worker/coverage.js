import baseWorker from './index.js';
import { organicDiscover } from './organic.js';

const RELEASE = '3.11.7';
const RELEASE_BUILD = 'v3.11.7-zip-first';
const RELEASE_FINGERPRINT = 'zip-first-44439-2026-09-10';
const GROUP_LENS = ['community organizations Warren Ohio','historical societies Cortland Ohio','museums Garrettsville Ohio','nature conservation Middlefield Ohio','traditional crafts Burton Ohio','archaeology Chardon Ohio','volunteer groups Kent Ohio','gardening clubs Ravenna Ohio'];
const JOB_LENS = ['maintenance','welding fabrication','mechanic technician','parks recreation','museum archaeology','warehouse material handling','grounds laborer','facility technician'];
const EVENT_LENS = ['community events Warren Ohio','history events Cortland Ohio','museum programs Garrettsville Ohio','nature events Middlefield Ohio','craft workshops Burton Ohio','archaeology events Chardon Ohio','volunteer events Kent Ohio','gardening events Ravenna Ohio'];
const DIAGNOSTIC_SEEDS = [
  { name: 'Trumbull County Beekeepers', url: 'https://www.trumbullbeekeepers.org/' },
  { name: 'Western Reserve Artist Blacksmith Association', url: 'https://www.wraba.com/' },
  { name: 'Century Village Museum', url: 'https://centuryvillagemuseum.org/' }
];

async function jsonResponse(response) { const text = await response.text(); try { return { response, data: JSON.parse(text) }; } catch { return { response, data: null }; } }
function requestParams(request) { const u = new URL(request.url); const interests = String(u.searchParams.get('interests') || '').split(',').map(x => x.trim()).filter(Boolean); const city = u.searchParams.get('city') || 'Mesopotamia'; const state = u.searchParams.get('state') || 'OH'; const radius = Number(u.searchParams.get('radius') || 30); const zip = u.searchParams.get('zip') || '44439'; return { interests, city, state, radius, zip }; }
function release(data) { return { ...data, deployment: { version: RELEASE, build: RELEASE_BUILD, fingerprint: RELEASE_FINGERPRINT, entrypoint: 'worker/coverage.js' } }; }
function uniqueItems(items = []) { const seen = new Set(); return items.filter(item => { const key = `${String(item?.title || item?.name || '').toLowerCase()}|${String(item?.url || item?.link || '').toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function fallbackItem(item) { return { ...item, discoverySource: 'seed-fallback' }; }

async function jobsFor(request, env, ctx) { const u = new URL(request.url); const p = requestParams(request); const existing = String(u.searchParams.get('interests') || '').split(',').map(x => x.trim()).filter(Boolean); const zipFirstInterests = [p.zip, ...existing.filter(x => x !== p.zip)]; u.searchParams.set('interests', zipFirstInterests.join(',')); u.pathname = '/jobs'; return jsonResponse(await baseWorker.fetch(new Request(u, request), env, ctx)); }

async function discovery(request, env, ctx) {
  const p = requestParams(request);
  const organic = await organicDiscover(p.interests, p.city, p.state, p.radius);
  const jobs = await jobsFor(request, env, ctx);
  let groups = organic.groups || [];
  let events = organic.events || [];
  let seedFallbackUsed = false;
  let fallbackDiagnostics = null;
  if (!groups.length || !events.length) {
    const base = await jsonResponse(await baseWorker.fetch(request, env, ctx));
    if (base.data) {
      if (!groups.length && Array.isArray(base.data.groups)) { groups = uniqueItems(base.data.groups.map(fallbackItem)); seedFallbackUsed = groups.length > 0; }
      if (!events.length && Array.isArray(base.data.events)) { events = uniqueItems(base.data.events.map(fallbackItem)); seedFallbackUsed = seedFallbackUsed || events.length > 0; }
      fallbackDiagnostics = base.data.diagnostics || base.data.coverage || null;
    }
  }
  return release({ ok: true, version: RELEASE, build: RELEASE_BUILD, architecture: 'organization-first / organic-first with explicit seed fallback', groups, events, jobs: jobs.data?.jobs || [], items: groups, fetchBudget: { organic: organic.fetchBudget, jobs: jobs.data?.fetchBudget || null }, coverage: { ...(organic.coverage || {}), adaptiveLens: true, GROUP_LENS, EVENT_LENS, JOB_LENS, seedFallbackUsed, fallbackDiagnostics, organicResults: { groups: organic.groups.length, events: organic.events.length } });
}

async function diagnostic(request, env, ctx) {
  const p = requestParams(request); const started = Date.now();
  const organic = await organicDiscover(p.interests, p.city, p.state, p.radius);
  const jobs = await jobsFor(request, env, ctx);
  const seedFallback = !organic.groups.length || !organic.events.length;
  const legacy = seedFallback ? await jsonResponse(await baseWorker.fetch(request, env, ctx)) : null;
  const foundSeeds = DIAGNOSTIC_SEEDS.filter(seed => JSON.stringify(legacy?.data || {}).toLowerCase().includes(seed.name.toLowerCase())).length;
  const diagnosticPayload = release({
    ok: true, diagnostic: true, version: RELEASE, build: RELEASE_BUILD, worker: new URL(request.url).origin,
    architecture: 'organization-first / organic-first with explicit seed fallback',
    groups: { stages: { organicSearchCandidates: organic.coverage?.candidateCount || 0, organicOrganizations: organic.groups.length, organicEventsFromOrganizations: organic.events.length }, fetchBudget: organic.fetchBudget, tail: organic.diagnostics.slice(-12), seedFallbackUsed: !organic.groups.length, legacyFallbackAvailable: !!legacy?.data },
    events: { stages: { organicOrganizations: organic.groups.length, organicEvents: organic.events.length }, fetchBudget: organic.fetchBudget, tail: organic.diagnostics.slice(-12), seedFallbackUsed: !organic.events.length, legacyFallbackAvailable: !!legacy?.data },
    jobs: { counts: { jobs: Array.isArray(jobs.data?.jobs) ? jobs.data.jobs.length : 0 }, fetchBudget: jobs.data?.fetchBudget || null, tail: jobs.data?.diagnostics?.slice?.(-12) || [] },
    discoveryHealth: { organicGroups: organic.groups.length, organicEvents: organic.events.length, organicCandidateCount: organic.coverage?.candidateCount || 0, seedCoverage: `${foundSeeds}/${DIAGNOSTIC_SEEDS.length}`, seedCoveragePass: foundSeeds === DIAGNOSTIC_SEEDS.length, seedFallbackUsed: seedFallback, fallbackActivated: !!legacy?.data, organicResults: organic.groups.length + organic.events.length, discoveryPass: organic.groups.length > 0, recovery: { attempted: seedFallback, status: legacy?.data ? 'available' : 'not-needed' }, durationMs: Date.now() - started }
  });
  return new Response(JSON.stringify(diagnosticPayload, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}

export default { async fetch(request, env, ctx) { const url = new URL(request.url); if (url.pathname === '/test') return diagnostic(request, env, ctx); if (url.pathname === '/groups' || url.pathname === '/events' || url.pathname === '/discover') { const result = await discovery(request, env, ctx); if (url.pathname === '/groups') return new Response(JSON.stringify({ ...result, items: result.groups, events: undefined, jobs: undefined }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); if (url.pathname === '/events') return new Response(JSON.stringify({ ...result, items: result.events, groups: undefined, jobs: undefined, uniqueCount: result.events.length }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); } return baseWorker.fetch(request, env, ctx); } };
