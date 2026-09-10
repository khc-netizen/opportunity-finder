import baseWorker from './index.js';
import { organicDiscover } from './organic.js';
import { discoverJobsZipFirst } from './job-discovery.js';
import { HOME_ZIP, eligibleZips } from './zip-geo.js';

const RELEASE = '3.12.0';
const RELEASE_BUILD = 'v3.12.0-hard-zip-discovery';
const RELEASE_FINGERPRINT = 'hard-zip-44439-2026-09-10';
const GROUP_LENS = ['community organizations','historical societies','museums','nature conservation','traditional crafts','archaeology','volunteer groups','gardening clubs'];
const JOB_LENS = ['maintenance','welding fabrication','mechanic technician','parks recreation','museum archaeology','warehouse material handling','grounds laborer','facility technician'];
const EVENT_LENS = ['community events','history events','museum programs','nature events','craft workshops','archaeology events','volunteer events','gardening events'];

async function jsonResponse(response) { const text = await response.text(); try { return { response, data: JSON.parse(text) }; } catch { return { response, data: null }; } }
function requestParams(request) { const u = new URL(request.url); const interests = String(u.searchParams.get('interests') || '').split(',').map(x => x.trim()).filter(Boolean); const city = u.searchParams.get('city') || 'Mesopotamia'; const state = u.searchParams.get('state') || 'OH'; const radius = Number(u.searchParams.get('radius') || 30); const zip = u.searchParams.get('zip') || HOME_ZIP; return { interests, city, state, radius, zip }; }
function release(data) { return { ...data, deployment: { version: RELEASE, build: RELEASE_BUILD, fingerprint: RELEASE_FINGERPRINT, entrypoint: 'worker/coverage.js' } }; }
function uniqueItems(items = []) { const seen = new Set(); return items.filter(item => { const key = `${String(item?.title || item?.name || '').toLowerCase()}|${String(item?.url || item?.link || '').toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; }); }

async function jobsFor(request, env) {
  const p = requestParams(request);
  return discoverJobsZipFirst(p.interests, p.city, p.state, p.radius, String(new URL(request.url).searchParams.get('partTime') || 'true') !== 'false', env);
}

async function discovery(request, env, ctx) {
  const p = requestParams(request);
  const organic = await organicDiscover(p.interests, p.city, p.state, p.radius);
  const jobs = await jobsFor(request, env);
  const groups = uniqueItems(organic.groups || []);
  const events = uniqueItems(organic.events || []);
  return release({ ok: true, version: RELEASE, build: RELEASE_BUILD, architecture: 'organization-first / organic-first / canonical hard ZIP gate', groups, events, jobs: jobs.jobs || [], items: groups, fetchBudget: { organic: organic.fetchBudget, jobs: jobs.fetchBudget }, coverage: { ...(organic.coverage || {}), adaptiveLens: true, GROUP_LENS, EVENT_LENS, JOB_LENS, seedFallbackUsed: false, fallbackDisabled: true, eligibleZipCount: eligibleZips(p.radius).length, homeZip: p.zip, organicResults: { groups: groups.length, events: events.length }, jobResults: jobs.jobs?.length || 0 } });
}

async function diagnostic(request, env, ctx) {
  const p = requestParams(request); const started = Date.now();
  const organic = await organicDiscover(p.interests, p.city, p.state, p.radius);
  const jobs = await jobsFor(request, env);
  const payload = release({
    ok: true, diagnostic: true, version: RELEASE, build: RELEASE_BUILD, worker: new URL(request.url).origin,
    architecture: 'organization-first / organic-first / canonical hard ZIP gate',
    geography: { homeZip: p.zip, radius: p.radius, eligibleZips: eligibleZips(p.radius), hardGate: true, prefetchFiltering: true },
    groups: { stages: { organicSearchCandidates: organic.coverage?.candidateCount || 0, organicOrganizations: organic.groups.length }, fetchBudget: organic.fetchBudget, tail: organic.diagnostics.slice(-16) },
    events: { stages: { organicOrganizations: organic.groups.length, organicEvents: organic.events.length }, fetchBudget: organic.fetchBudget, tail: organic.diagnostics.slice(-16) },
    jobs: { counts: { jobs: jobs.jobs?.length || 0 }, fetchBudget: jobs.fetchBudget, tail: jobs.diagnostics?.slice?.(-20) || [] },
    discoveryHealth: { organicGroups: organic.groups.length, organicEvents: organic.events.length, organicCandidateCount: organic.coverage?.candidateCount || 0, jobs: jobs.jobs?.length || 0, fallbackActivated: false, hardZipGate: true, prefetchFiltering: true, durationMs: Date.now() - started }
  });
  return new Response(JSON.stringify(payload, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}

export default { async fetch(request, env, ctx) { const url = new URL(request.url); if (url.pathname === '/test') return diagnostic(request, env, ctx); if (url.pathname === '/groups' || url.pathname === '/events' || url.pathname === '/discover') { const result = await discovery(request, env, ctx); if (url.pathname === '/groups') return new Response(JSON.stringify({ ...result, items: result.groups, events: undefined, jobs: undefined }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); if (url.pathname === '/events') return new Response(JSON.stringify({ ...result, items: result.events, groups: undefined, jobs: undefined, uniqueCount: result.events.length }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); } return baseWorker.fetch(request, env, ctx); } };