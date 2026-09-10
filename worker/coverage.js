import baseWorker from './index.js';
import { organicDiscover } from './organic.js';

const RELEASE = '3.10.0';
const RELEASE_BUILD = 'v3.10.0-organic-first';
const RELEASE_FINGERPRINT = 'organic-first-2026-09-10';

async function jsonResponse(response) { const text = await response.text(); try { return { response, data: JSON.parse(text) }; } catch { return { response, data: null }; } }
function requestParams(request) { const u = new URL(request.url); const interests = String(u.searchParams.get('interests') || '').split(',').map(x => x.trim()).filter(Boolean); const city = u.searchParams.get('city') || 'Mesopotamia'; const state = u.searchParams.get('state') || 'OH'; const radius = Number(u.searchParams.get('radius') || 75); return { interests, city, state, radius }; }
function release(data) { return { ...data, deployment: { version: RELEASE, build: RELEASE_BUILD, fingerprint: RELEASE_FINGERPRINT, entrypoint: 'worker/coverage.js' } }; }
function fallbackItem(item) { return { ...item, discoverySource: 'seed-fallback' }; }

async function jobsFor(request, env, ctx) {
  const u = new URL(request.url); u.pathname = '/jobs';
  return jsonResponse(await baseWorker.fetch(new Request(u, request), env, ctx));
}

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
      if (!groups.length && Array.isArray(base.data.groups)) { groups = base.data.groups.map(fallbackItem); seedFallbackUsed = groups.length > 0; }
      if (!events.length && Array.isArray(base.data.events)) { events = base.data.events.map(fallbackItem); seedFallbackUsed = seedFallbackUsed || events.length > 0; }
      fallbackDiagnostics = base.data.diagnostics || base.data.coverage || null;
    }
  }

  return release({
    ok: true,
    version: RELEASE,
    build: RELEASE_BUILD,
    architecture: 'organization-first / organic-first with explicit seed fallback',
    groups,
    events,
    jobs: jobs.data?.jobs || [],
    items: groups,
    fetchBudget: { organic: organic.fetchBudget, jobs: jobs.data?.fetchBudget || null },
    coverage: { ...(organic.coverage || {}), seedFallbackUsed, fallbackDiagnostics }
  });
}

async function diagnostic(request, env, ctx) {
  const p = requestParams(request);
  const started = Date.now();
  const organic = await organicDiscover(p.interests, p.city, p.state, p.radius);
  const jobs = await jobsFor(request, env, ctx);
  const seedFallback = !organic.groups.length || !organic.events.length;
  const legacy = seedFallback ? await jsonResponse(await baseWorker.fetch(request, env, ctx)) : null;
  return new Response(JSON.stringify(release({
    ok: true,
    diagnostic: true,
    version: RELEASE,
    build: RELEASE_BUILD,
    worker: new URL(request.url).origin,
    architecture: 'organization-first / organic-first with explicit seed fallback',
    groups: {
      stages: { organicSearchCandidates: organic.coverage?.candidateCount || 0, organicOrganizations: organic.groups.length, organicEventsFromOrganizations: organic.events.length },
      fetchBudget: organic.fetchBudget,
      tail: organic.diagnostics.slice(-12),
      seedFallbackUsed: !organic.groups.length,
      legacyFallbackAvailable: !!legacy?.data
    },
    events: {
      stages: { organicOrganizations: organic.groups.length, organicEvents: organic.events.length },
      fetchBudget: organic.fetchBudget,
      tail: organic.diagnostics.slice(-12),
      seedFallbackUsed: !organic.events.length,
      legacyFallbackAvailable: !!legacy?.data
    },
    jobs: { counts: { jobs: Array.isArray(jobs.data?.jobs) ? jobs.data.jobs.length : 0 }, fetchBudget: jobs.data?.fetchBudget || null, tail: jobs.data?.diagnostics?.slice?.(-12) || [] },
    discoveryHealth: { organicGroups: organic.groups.length, organicEvents: organic.events.length, organicCandidateCount: organic.coverage?.candidateCount || 0, seedFallbackUsed, fallbackActivated: !!legacy?.data, durationMs: Date.now() - started }
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/test') return diagnostic(request, env, ctx);
    if (url.pathname === '/groups' || url.pathname === '/events' || url.pathname === '/discover') {
      const result = await discovery(request, env, ctx);
      if (url.pathname === '/groups') return new Response(JSON.stringify({ ...result, items: result.groups, events: undefined, jobs: undefined }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
      if (url.pathname === '/events') return new Response(JSON.stringify({ ...result, items: result.events, groups: undefined, jobs: undefined, uniqueCount: result.events.length }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
      return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
    }
    return baseWorker.fetch(request, env, ctx);
  }
};
