export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname === "/") return json({
        ok: true,
        name: "Opportunity Finder Worker",
        version: VERSION,
        build: BUILD,
        architecture: "organization-first",
        sources: ["organization discovery", "venue discovery", "event discovery", "public employer discovery", "USAJOBS", "configured RSS/Atom feeds"]
      }, cors);

      if (url.pathname === "/test") return json(await diagnostics(env, url.pathname), cors);

      const p = Object.fromEntries(url.searchParams.entries());
      const interests = splitParam(p.interests);
      const city = p.city || "Mesopotamia";
      const state = p.state || "OH";
      const radius = clamp(Number(p.radius || 30), 1, 100);

      if (url.pathname === "/discover") {
        return json(await discover(interests, city, state, radius, env), cors);
      }
      if (url.pathname === "/groups") {
        const r = await discover(interests, city, state, radius, env);
        return json({ ...r, events: undefined, jobs: undefined }, cors);
      }
      if (url.pathname === "/jobs") {
        const partTime = p.partTime !== "false";
        return json(await discoverJobs(interests, city, state, radius, partTime, env), cors);
      }
      if (url.pathname === "/scan") {
        const partTime = p.partTime !== "false";
        const r = await discoverJobs(interests, city, state, radius, partTime, env);
        return json({ ...r, requestPath: url.pathname }, cors);
      }

      return json({ ok: false, error: "Not found" }, cors, 404);
    } catch (e) {
      return json({ ok: false, diagnostic: true, error: "Worker request failed", message: errorMessage(e), name: e?.name || "Error", version: VERSION, build: BUILD }, cors, 500);
    }
  }
};

const VERSION = "3.8.1";
const BUILD = "v3.8.1-strict-local-validation";
const SEARCH_LIMIT = 10;
const PAGE_LIMIT = 24;
const DISCOVERY_BUDGET_DEFAULT = 72;
const DANCE_RE = /\bdance\b|dancing|ballroom|ballet|tap dance|jazz dance|dance studio|dance academy/i;
const JUNK_HOST_RE = /(?:facebook|instagram|linkedin|youtube|tiktok|pinterest|x\.com|twitter|wikipedia|yelp|tripadvisor)\./i;
const ARTICLE_RE = /\b(?:news|newspaper|journalism|press release|obituary|podcast|radio|weather|scoreboard|politics|election|recipe|restaurant review|blog post)\b/i;
const CAREER_RE = /(?:career|careers|jobs|employment|work with us|join our team|job openings|opportunities)/i;
const ORG_RE = /(?:association|society|club|guild|chapter|council|league|organization|organisation|foundation|historical society|heritage|museum|library|conservancy|preservation|collective|fellowship|alliance|coalition|volunteer group|chapter)/i;
const VENUE_RE = /(?:museum|library|historic site|historical site|heritage center|heritage centre|park|nature center|nature centre|arboretum|botanical garden|fairgrounds|community center|community centre|cultural center|cultural centre|observatory|visitor center|visitor centre|hall|farm|homestead|mill|theater|theatre)/i;
const EVENT_RE = /(?:event|calendar|meeting|workshop|program|programme|exhibit|exhibition|festival|fair|lecture|tour|open house|class|demo|demonstration|registration|tickets|admission|rsvp)/i;
const LOCAL_REGION_RE = /\b(?:ohio|oh|trumbull|warren|mesopotamia|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga)\b/i;

function splitParam(s) { return String(s || "").split(",").map(x => x.trim()).filter(Boolean); }
function errorMessage(e) { return e instanceof Error ? (e.message || String(e)) : typeof e === "string" ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })(); }
function json(data, cors, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors } }); }
function clamp(n, min, max) { return Math.min(Math.max(Number.isFinite(n) ? n : min, min), max); }
function norm(s) { return String(s || "").toLowerCase().replace(/https?:\/\//g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function clean(s) { return stripHtml(String(s || "")).replace(/\s+/g, " ").trim(); }
function stripHtml(s) { return String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'").replace(/&#x2F;/gi, "/"); }
function decodeHtml(s) { return clean(s); }
function isHttp(u) { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } }
function abs(u, base) { try { return new URL(u || base.href, base.href).href; } catch { return base.href; } }
function host(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } }
function listEnv(env, key) { return String(env?.[key] || "").split(",").map(x => x.trim()).filter(Boolean); }
function urlKey(u) { try { const x = new URL(u); return `${x.hostname.toLowerCase()}${x.pathname.replace(/\/$/, "")}`; } catch { return norm(u); } }
function key(name, u) { return `${norm(name)}|${urlKey(u)}`; }
function distanceApprox(a, b) { return null; }

async function fetchText(url, options = {}, budget) {
  if (budget && budget.used >= budget.limit) return { ok: false, status: 0, text: "", error: "fetch budget exhausted", milliseconds: 0, bytes: 0 };
  if (budget) budget.used++;
  const started = Date.now();
  try {
    const r = await fetch(url, {
      ...options,
      redirect: "follow",
      headers: { "User-Agent": `Opportunity-Finder/${VERSION}`, "Accept": "text/html,application/xhtml+xml,application/xml,application/json,text/xml,*/*`, ...(options.headers || {}) }
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, milliseconds: Date.now() - started, bytes: text.length, contentType: r.headers.get("content-type") || "" };
  } catch (e) {
    return { ok: false, status: 0, text: "", error: errorMessage(e), milliseconds: Date.now() - started, bytes: 0 };
  }
}

async function searchWeb(query, env, budget) {
  const endpoint = env?.SEARCH_ENDPOINT || "https://www.bing.com/search";
  const param = env?.SEARCH_QUERY_PARAM || "q";
  const u = new URL(endpoint); u.searchParams.set(param, query); u.searchParams.set("count", "10");
  const r = await fetchText(u.href, {}, budget);
  if (!r.ok) return { ...r, urls: [] };
  const urls = [];
  const add = href => {
    href = decodeSearchUrl(decodeHtml(href));
    if (!isHttp(href)) return;
    try {
      const x = new URL(href);
      if (JUNK_HOST_RE.test(x.hostname)) return;
      if (!urls.some(v => urlKey(v) === urlKey(x.href))) urls.push(x.href);
    } catch {}
  };
  for (const m of r.text.matchAll(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const a = m[1].match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["']/i); if (a) add(a[1]);
    if (urls.length >= 12) break;
  }
  if (!urls.length) for (const m of r.text.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) { add(m[1]); if (urls.length >= 12) break; }
  return { ...r, urls, parser: urls.length ? "organic-results" : "no-results" };
}
function decodeSearchUrl(href) {
  try {
    const u = new URL(href);
    if (!/(^|\.)bing\.com$/i.test(u.hostname) || !/^\/ck\/a/i.test(u.pathname)) return href;
    let raw = u.searchParams.get("u"); if (!raw) return href;
    if (raw.startsWith("a1")) raw = raw.slice(2);
    raw = raw.replace(/-/g, "+").replace(/_/g, "/"); while (raw.length % 4) raw += "=";
    const d = atob(raw); return /^https?:\/\//i.test(d) ? d : decodeURIComponent(d);
  } catch { return href; }
}

function targetPlaces(city, state) {
  if (/^(OH|Ohio)$/i.test(state)) return [
    `"${city}, Ohio"`, `"Trumbull County" Ohio`, `"Warren" Ohio`, `"Northeast Ohio"`, `"Geauga County" Ohio`, `"Portage County" Ohio`, `"Ashtabula County" Ohio`, `"Mahoning County" Ohio`, `"Columbiana County" Ohio`, `"Summit County" Ohio`
  ];
  return [`"${city}" "${state}"`, `"${state}"`];
}
function interestBase(interests) {
  return interests.length ? interests.slice(0, 8) : ["local history", "museums", "historical societies", "beekeeping", "blacksmithing", "reenactment", "traditional crafts", "nature", "native plants", "woodworking", "astronomy", "cycling", "clubs", "guilds"];
}
function buildOrgQueries(interests, city, state) {
  const places = targetPlaces(city, state), cats = interestBase(interests), qs = [];
  for (let i = 0; i < Math.min(10, cats.length); i++) {
    const p = places[i % places.length];
    qs.push(`"${cats[i]}" ${p} (association OR society OR club OR guild OR chapter OR organization) -dance`);
    if (i < 5) qs.push(`${p} ("historical society" OR museum OR "nature center" OR beekeepers OR blacksmith OR reenactment OR "craft guild") -dance`);
  }
  return [...new Set(qs)].slice(0, SEARCH_LIMIT);
}
function buildVenueQueries(interests, city, state) {
  const places = targetPlaces(city, state), cats = interestBase(interests), qs = [];
  for (let i = 0; i < Math.min(6, cats.length); i++) {
    const p = places[i % places.length];
    qs.push(`${p} "${cats[i]}" (museum OR library OR "historic site" OR "nature center" OR fairgrounds OR observatory OR "community center") -dance`);
  }
  return [...new Set(qs)].slice(0, 6);
}
function buildEventQueries(org, interests, city, state) {
  const p = targetPlaces(city, state)[0];
  const q = [`"${org.name}" (events OR calendar OR meetings OR workshops OR programs)`, `"${org.name}" events`, `"${org.name}" calendar`];
  if (interests.length) q.push(`"${org.name}" "${interests[0]}"`);
  return q.map(x => `${x} ${p} -dance`).slice(0, 4);
}

async function discover(interests, city, state, radius, env) {
  const budget = { used: 0, limit: Number(env?.DISCOVERY_FETCH_LIMIT || DISCOVERY_BUDGET_DEFAULT) };
  const diagnostics = [], orgCandidates = [], venueCandidates = [];
  const orgQueries = buildOrgQueries(interests, city, state);

  for (const query of orgQueries) {
    const r = await searchWeb(query, env, budget);
    diagnostics.push({ stage: "organization-search", source: "search", query, ok: r.ok, status: r.status, parser: r.parser || null, candidates: r.urls.length, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error });
    for (const u of r.urls) if (acceptDiscoveryUrl(u, state)) orgCandidates.push({ url: u, query });
  }

  for (const u of [...listEnv(env, "GROUP_SEEDS"), ...listEnv(env, "DISCOVERY_SEEDS")]) if (acceptDiscoveryUrl(u, state)) orgCandidates.push({ url: u, query: "configured seed" });

  const uniqueOrgUrls = dedupeCandidateUrls(orgCandidates).slice(0, 14);
  const organizations = [];
  for (const c of uniqueOrgUrls) {
    const r = await fetchText(c.url, {}, budget);
    const d = { stage: "organization-validation", url: c.url, query: c.query, ok: r.ok, status: r.status, milliseconds: r.milliseconds, bytes: r.bytes, accepted: 0, rejected: null, evidence: [] };
    if (!r.ok) { d.rejected = r.error || `HTTP ${r.status}`; diagnostics.push(d); continue; }
    const page = parseOrganizationPage(r.text, c.url, interests, city, state);
    d.evidence = page.evidence; d.accepted = page.organizations.length; d.rejected = page.organizations.length ? null : page.rejectReason;
    diagnostics.push(d); organizations.push(...page.organizations);
  }

  const orgs = dedupeOrganizations(organizations).slice(0, 100);

  for (const query of buildVenueQueries(interests, city, state)) {
    const r = await searchWeb(query, env, budget);
    diagnostics.push({ stage: "venue-search", source: "search", query, ok: r.ok, status: r.status, parser: r.parser || null, candidates: r.urls.length, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error });
    for (const u of r.urls) if (acceptDiscoveryUrl(u, state)) venueCandidates.push({ url: u, query });
  }
  const venues = [];
  for (const c of dedupeCandidateUrls(venueCandidates).slice(0, 6)) {
    const r = await fetchText(c.url, {}, budget);
    const d = { stage: "venue-validation", url: c.url, query: c.query, ok: r.ok, status: r.status, accepted: 0, rejected: null };
    if (!r.ok) { d.rejected = r.error || `HTTP ${r.status}`; diagnostics.push(d); continue; }
    const page = parseOrganizationPage(r.text, c.url, interests, city, state, true);
    d.accepted = page.organizations.length; d.rejected = page.organizations.length ? null : page.rejectReason; diagnostics.push(d); venues.push(...page.organizations);
  }

  const anchors = dedupeOrganizations([...orgs, ...venues]);

  const events = [];
  for (const org of anchors.slice(0, 30)) {
    for (const query of buildEventQueries(org, interests, city, state)) {
      const r = await searchWeb(query, env, budget);
      diagnostics.push({ stage: "event-search", source: "search", query, anchor: org.name, ok: r.ok, status: r.status, parser: r.parser || null, candidates: r.urls.length, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error });
      for (const u of r.urls) if (acceptDiscoveryUrl(u, state)) {
        const f = await fetchText(u, {}, budget);
        const d = { stage: "event-validation", url: u, anchor: org.name, ok: f.ok, status: f.status, accepted: 0, rejected: null };
        if (!f.ok) { d.rejected = f.error || `HTTP ${f.status}`; diagnostics.push(d); continue; }
        const page = parseEventPage(f.text, u, interests, city, state, org);
        d.accepted = page.events.length; d.rejected = page.events.length ? null : page.rejectReason; diagnostics.push(d); events.push(...page.events);
      }
    }
    if (budget.used >= budget.limit) break;
  }

  const jobs = await discoverJobs(interests, city, state, radius, true, env, budget, diagnostics);
  return { diagnostic: true, version: VERSION, build: BUILD, requestPath: "/discover", architecture: "organization-first", location: { city, state, radius }, budget, organizations: anchors, events: dedupeEvents(events), jobs: jobs.jobs || [], diagnostics };
}

async function discoverJobs(interests, city, state, radius, partTime, env, budget, diagnostics) {
  const localBudget = budget || { used: 0, limit: Number(env?.DISCOVERY_FETCH_LIMIT || DISCOVERY_BUDGET_DEFAULT) };
  const ds = diagnostics || [];
  const jobs = [];
  const queries = [
    `${city} Ohio part time jobs ${interests.slice(0, 2).join(" ")} -dance`,
    `Trumbull County Ohio part time jobs ${interests.slice(0, 2).join(" ")} -dance`,
    `Warren Ohio part time jobs ${interests.slice(0, 2).join(" ")} -dance`
  ];
  for (const query of queries) {
    const r = await searchWeb(query, env, localBudget);
    ds.push({ stage: "job-search", source: "search", query, ok: r.ok, status: r.status, parser: r.parser || null, candidates: r.urls.length, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error });
    for (const u of r.urls) {
      if (isObviousOutOfState(u, state) || JUNK_HOST_RE.test(host(u))) continue;
      const f = await fetchText(u, {}, localBudget);
      if (!f.ok) continue;
      const page = parseJobPage(f.text, u, interests, city, state, partTime);
      ds.push({ stage: "job-validation", url: u, query, ok: f.ok, status: f.status, accepted: page.jobs.length, rejected: page.jobs.length ? null : page.rejectReason });
      jobs.push(...page.jobs);
    }
    if (localBudget.used >= localBudget.limit) break;
  }
  const usa = await usaJobs(interests, city, state, radius, partTime, env, localBudget, ds);
  jobs.push(...usa.jobs);
  return { jobs: dedupeJobs(jobs), diagnostics: ds, budget: localBudget };
}

async function usaJobs(interests, city, state, radius, partTime, env, budget, diagnostics) {
  const jobs = [];
  const endpoint = env?.USAJOBS_ENDPOINT || "https://data.usajobs.gov/api/search";
  const keyHeader = env?.USAJOBS_API_KEY || "";
  if (!keyHeader) return { jobs, skipped: true };
  const u = new URL(endpoint);
  u.searchParams.set("LocationName", `${city}, ${state}`);
  u.searchParams.set("Keyword", interests.slice(0, 3).join(" "));
  u.searchParams.set("ResultsPerPage", "25");
  const r = await fetchText(u.href, { headers: { "Authorization-Key": keyHeader, "Host": env?.USAJOBS_USER_AGENT || "Opportunity Finder" } }, budget);
  diagnostics.push({ stage: "usajobs", ok: r.ok, status: r.status, candidates: 0, error: r.ok ? null : r.error });
  if (!r.ok) return { jobs };
  try {
    const data = JSON.parse(r.text);
    for (const x of data?.SearchResult?.SearchResultItems || []) {
      const j = x?.MatchedObjectDescriptor;
      if (!j) continue;
      jobs.push({ title: clean(j.PositionTitle), employer: clean(j.OrganizationName), url: j.PositionURI, source: "USAJOBS", location: clean((j.PositionLocation || []).map(v => v?.LocationName).filter(Boolean).join("; ")), partTime: /part time/i.test(JSON.stringify(j)) });
    }
  } catch (e) { diagnostics.push({ stage: "usajobs-parse", ok: false, error: errorMessage(e) }); }
  return { jobs };
}

function acceptDiscoveryUrl(u, state) {
  if (!isHttp(u)) return false;
  if (JUNK_HOST_RE.test(host(u))) return false;
  if (DANCE_RE.test(u)) return false;
  if (isObviousOutOfState(u, state)) return false;
  return true;
}

function isObviousOutOfState(u, state) {
  if (!/^(OH|Ohio)$/i.test(state)) return false;
  const t = norm(u);
  const outside = /\b(?:new jersey|new york|pennsylvania|michigan|indiana|kentucky|west virginia)\b/.test(t);
  const ohio = /\b(?:ohio|trumbull|warren|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga)\b/.test(t);
  return outside && !ohio;
}

function geographicEvidence(text, city, state, extra = {}) {
  const t = norm(text), cityNorm = norm(city);
  let score = 0;
  if (/^(OH|Ohio)$/i.test(state)) {
    if (/\bohio\b/.test(t)) score += 40;
    if (cityNorm && t.includes(cityNorm)) score += 45;
    if (/\b(?:trumbull|warren|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga)\b/.test(t)) score += 25;
    if (extra.structuredText && /\bohio\b/i.test(extra.structuredText)) score += 20;
    if (extra.structuredText && cityNorm && norm(extra.structuredText).includes(cityNorm)) score += 30;
  } else {
    if (state && t.includes(norm(state))) score += 40;
    if (cityNorm && t.includes(cityNorm)) score += 45;
  }
  return { score: Math.min(100, score) };
}

function hardOutOfArea(text, city, state) {
  if (!/^(OH|Ohio)$/i.test(state)) return false;
  const t = norm(text);
  const local = /\b(?:ohio|trumbull|warren|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga)\b/.test(t);
  const outside = /\b(?:new jersey|new york|pennsylvania|michigan|indiana|kentucky|west virginia)\b/.test(t);
  return outside && !local;
}

function parseOrganizationPage(html, url, interests, city, state, venue = false) {
  const text = clean(html);
  const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,""])[1]);
  const structured = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => clean(m[1])).join(" ");
  const evidence = geographicEvidence(`${title} ${text.slice(0, 12000)}`, city, state, { structuredText: structured });
  const obviousArticle = ARTICLE_RE.test(`${title} ${text.slice(0, 4000)}`) && !ORG_RE.test(`${title} ${text.slice(0, 4000)}`);
  const localEnough = evidence.score >= 50 && !hardOutOfArea(`${title} ${text.slice(0, 12000)}`, city, state);
  const typeMatch = venue ? VENUE_RE.test(`${title} ${text.slice(0, 5000)}`) : ORG_RE.test(`${title} ${text.slice(0, 5000)}`);
  const interestMatch = interests.length ? interests.some(i => norm(`${title} ${text.slice(0, 7000)}`).includes(norm(i))) : true;
  if (!localEnough) return { organizations: [], evidence: [{ score: evidence.score, localEnough, title }], rejectReason: "insufficient local geographic evidence" };
  if (obviousArticle) return { organizations: [], evidence: [{ score: evidence.score, localEnough, title }], rejectReason: "article/news content" };
  if (!typeMatch) return { organizations: [], evidence: [{ score: evidence.score, localEnough, title }], rejectReason: venue ? "not a venue" : "not an organization" };
  if (DANCE_RE.test(`${title} ${text.slice(0, 10000)}`)) return { organizations: [], evidence: [{ score: evidence.score, localEnough, title }], rejectReason: "dance exclusion" };
  return { organizations: [{ name: title || new URL(url).hostname, url, type: venue ? "venue" : "organization", locationScore: evidence.score, interestMatch }], evidence: [{ score: evidence.score, localEnough, title }] };
}

function parseEventPage(html, url, interests, city, state, anchor) {
  const text = clean(html), title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,""])[1]);
  const evidence = geographicEvidence(`${title} ${text.slice(0, 10000)}`, city, state);
  if (evidence.score < 45 || hardOutOfArea(`${title} ${text.slice(0, 10000)}`, city, state)) return { events: [], rejectReason: "insufficient local geographic evidence" };
  if (!EVENT_RE.test(`${title} ${text.slice(0, 7000)}`)) return { events: [], rejectReason: "not an event page" };
  if (DANCE_RE.test(`${title} ${text.slice(0, 10000)}`)) return { events: [], rejectReason: "dance exclusion" };
  return { events: [{ title: title || "Local event", url, anchor: anchor.name, locationScore: evidence.score }] };
}

function parseJobPage(html, url, interests, city, state, partTime) {
  const text = clean(html), title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,""])[1]);
  const structured = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join(" ");
  if (!/JobPosting/i.test(structured)) return { jobs: [], rejectReason: "no JSON-LD JobPosting" };
  const evidence = geographicEvidence(`${title} ${text.slice(0, 12000)}`, city, state, { structuredText: structured });
  if (evidence.score < 45 || hardOutOfArea(`${title} ${text.slice(0, 12000)}`, city, state)) return { jobs: [], rejectReason: "insufficient local geographic evidence" };
  if (partTime && !/part[\s-]?time/i.test(`${structured} ${text}`)) return { jobs: [], rejectReason: "not part-time" };
  return { jobs: [{ title: title || "Local job", url, locationScore: evidence.score }] };
}

function dedupeCandidateUrls(xs) { const m = new Map(); for (const x of xs) { const k = urlKey(x.url); if (!m.has(k)) m.set(k, x); } return [...m.values()]; }
function dedupeOrganizations(xs) { const m = new Map(); for (const x of xs) { const k = key(x.name, x.url); if (!m.has(k)) m.set(k, x); } return [...m.values()]; }
function dedupeEvents(xs) { const m = new Map(); for (const x of xs) { const k = `${norm(x.title)}|${urlKey(x.url)}`; if (!m.has(k)) m.set(k, x); } return [...m.values()]; }
function dedupeJobs(xs) { const m = new Map(); for (const x of xs) { const k = `${norm(x.title)}|${urlKey(x.url)}`; if (!m.has(k)) m.set(k, x); } return [...m.values()]; }

async function diagnostics(env, path) {
  const budget = { used: 0, limit: Number(env?.DISCOVERY_FETCH_LIMIT || DISCOVERY_BUDGET_DEFAULT) };
  const tests = [];
  const samples = [
    { name: "ancient Mesopotamia", text: "Mesopotamia was an ancient civilization between the Tigris and Euphrates rivers." },
    { name: "local Ohio group", text: "Trumbull County Ohio beekeepers association in Mesopotamia Ohio" },
    { name: "Warren Ohio", text: "Warren Ohio historical society Trumbull County" },
    { name: "out of state", text: "New York historical society" }
  ];
  for (const s of samples) tests.push({ name: s.name, evidence: geographicEvidence(s.text, "Mesopotamia", "OH"), hardOutOfArea: hardOutOfArea(s.text, "Mesopotamia", "OH") });
  return { diagnostic: true, version: VERSION, build: BUILD, requestPath: path, architecture: "organization-first", discoveryFetchLimit: budget.limit, tests };
}
