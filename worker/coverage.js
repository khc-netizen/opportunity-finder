import baseWorker from './index.js';
import { organicDiscover } from './organic.js';
import { discoverJobsZipFirst } from './job-discovery.js';
import { HOME_ZIP, eligibleZips } from './zip-geo.js';

const RELEASE = '3.13.0';
const RELEASE_BUILD = 'v3.13.0-independent-zip-radii';
const RELEASE_FINGERPRINT = 'independent-zip-radii-44439-2026-09-10';
const GROUP_LENS = ['community organizations','historical societies','museums','nature conservation','traditional crafts','archaeology','volunteer groups','gardening clubs'];
const JOB_LENS = ['maintenance','welding fabrication','mechanic technician','parks recreation','museum archaeology','warehouse material handling','grounds laborer','facility technician'];
const EVENT_LENS = ['community events','history events','museum programs','nature events','craft workshops','archaeology events','volunteer events','gardening events'];

async function jsonResponse(response) { const text = await response.text(); try { return { response, data: JSON.parse(text) }; } catch { return { response, data: null }; } }
function requestParams(request) {
  const u = new URL(request.url);
  const interests = String(u.searchParams.get('interests') || '').split(',').map(x => x.trim()).filter(Boolean);
  const city = u.searchParams.get('city') || 'Mesopotamia';
  const state = u.searchParams.get('state') || 'OH';
  const legacyRadius = Number(u.searchParams.get('radius') || 30);
  const groupRadius = Number(u.searchParams.get('groupRadius') || legacyRadius);
  const eventRadius = Number(u.searchParams.get('eventRadius') || legacyRadius);
  const jobRadius = Number(u.searchParams.get('jobRadius') || legacyRadius);
  const zip = u.searchParams.get('zip') || HOME_ZIP;
  return { interests, city, state, radius: legacyRadius, groupRadius, eventRadius, jobRadius, zip };
}
function release(data) { return { ...data, deployment: { version: RELEASE, build: RELEASE_BUILD, fingerprint: RELEASE_FINGERPRINT, entrypoint: 'worker/coverage.js' } }; }
function uniqueItems(items = []) { const seen = new Set(); return items.filter(item => { const key = `${String(item?.title || item?.name || '').toLowerCase()}|${String(item?.url || item?.link || '').toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; }); }

async function jobsFor(request, env) {
  const p = requestParams(request);
  return discoverJobsZipFirst(p.interests, p.city, p.state, p.jobRadius, String(new URL(request.url).searchParams.get('partTime') || 'true') !== 'false', env);
}

async function discovery(request, env, ctx) {
  const p = requestParams(request);
  const groupOrganic = await organicDiscover(p.interests, p.city, p.state, p.groupRadius, p.eventRadius);
  const eventOrganic = p.eventRadius === p.groupRadius ? groupOrganic : await organicDiscover(p.interests, p.city, p.state, p.eventRadius, p.eventRadius);
  const jobs = await jobsFor(request, env);
  const groups = uniqueItems(groupOrganic.groups || []);
  const events = uniqueItems(eventOrganic.events || []);
  return release({ ok: true, version: RELEASE, build: RELEASE_BUILD, architecture: 'organization-first / organic-first / canonical hard ZIP gate / independent ZIP radii', groups, events, jobs: jobs.jobs || [], items: groups, fetchBudget: { groups: groupOrganic.fetchBudget, events: eventOrganic.fetchBudget, jobs: jobs.fetchBudget }, coverage: { groupRadius: p.groupRadius, eventRadius: p.eventRadius, jobRadius: p.jobRadius, adaptiveLens: true, GROUP_LENS, EVENT_LENS, JOB_LENS, seedFallbackUsed: false, fallbackDisabled: true, groupEligibleZipCount: eligibleZips(p.groupRadius).length, eventEligibleZipCount: eligibleZips(p.eventRadius).length, jobEligibleZipCount: eligibleZips(p.jobRadius).length, homeZip: p.zip, organicResults: { groups: groups.length, events: events.length }, jobResults: jobs.jobs?.length || 0 } });
}

async function diagnostic(request, env, ctx) {
  const p = requestParams(request); const started = Date.now();
  const groupOrganic = await organicDiscover(p.interests, p.city, p.state, p.groupRadius, p.eventRadius);
  const eventOrganic = p.eventRadius === p.groupRadius ? groupOrganic : await organicDiscover(p.interests, p.city, p.state, p.eventRadius, p.eventRadius);
  const jobs = await jobsFor(request, env);
  const payload = release({
    ok: true, diagnostic: true, version: RELEASE, build: RELEASE_BUILD, worker: new URL(request.url).origin,
    architecture: 'organization-first / organic-first / canonical hard ZIP gate / independent ZIP radii',
    geography: { homeZip: p.zip, groupRadius: p.groupRadius, eventRadius: p.eventRadius, jobRadius: p.jobRadius, groupEligibleZips: eligibleZips(p.groupRadius), eventEligibleZips: eligibleZips(p.eventRadius), jobEligibleZips: eligibleZips(p.jobRadius), hardGate: true, prefetchFiltering: true },
    groups: { radius: p.groupRadius, stages: { organicSearchCandidates: groupOrganic.coverage?.candidateCount || 0, organicOrganizations: groupOrganic.groups.length }, fetchBudget: groupOrganic.fetchBudget, tail: groupOrganic.diagnostics.slice(-16) },
    events: { radius: p.eventRadius, stages: { organicOrganizations: eventOrganic.groups.length, organicEvents: eventOrganic.events.length }, fetchBudget: eventOrganic.fetchBudget, tail: eventOrganic.diagnostics.slice(-16) },
    jobs: { radius: p.jobRadius, counts: { jobs: jobs.jobs?.length || 0 }, fetchBudget: jobs.fetchBudget, tail: jobs.diagnostics?.slice?.(-20) || [] },
    discoveryHealth: { organicGroups: groupOrganic.groups.length, organicEvents: eventOrganic.events.length, jobs: jobs.jobs?.length || 0, fallbackActivated: false, hardZipGate: true, prefetchFiltering: true, independentRadii: true, durationMs: Date.now() - started }
  });
  return new Response(JSON.stringify(payload, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}

export default { async fetch(request, env, ctx) { const url = new URL(request.url); if (url.pathname === '/test') return diagnostic(request, env, ctx); if (url.pathname === '/groups' || url.pathname === '/events' || url.pathname === '/discover') { const result = await discovery(request, env, ctx); if (url.pathname === '/groups') return new Response(JSON.stringify({ ...result, items: result.groups, events: undefined, jobs: undefined }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); if (url.pathname === '/events') return new Response(JSON.stringify({ ...result, items: result.events, groups: undefined, jobs: undefined, uniqueCount: result.events.length }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); } return baseWorker.fetch(request, env, ctx); } };