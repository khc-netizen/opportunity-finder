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
      const home = parseHomeLocation(p.home || "");
      const city = p.city || home.city || "Mesopotamia";
      const state = p.state || home.state || "OH";
      const radius = clamp(Number(p.radius || 30), 1, 100);

      if (url.pathname === "/discover") {
        return json(await discover(interests, city, state, radius, env), cors);
      }
      if (url.pathname === "/groups") {
        const r = await discover(interests, city, state, radius, env);
        return json({ ...r, items: r.groups || [], events: undefined, jobs: undefined }, cors);
      }
      if (url.pathname === "/events") {
        const r = await discover(interests, city, state, radius, env);
        return json({ ...r, items: r.events || [], groups: undefined, jobs: undefined, uniqueCount: (r.events || []).length }, cors);
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

const VERSION = "3.9.6";
const BUILD = "v3.9.7-usajobs-local-parttime";
const SEARCH_LIMIT = 10;
const PAGE_LIMIT = 72;

// Verified regional organizations/venues used as discovery anchors. These are organization seeds,
// not hard-coded event records; their live pages are fetched and validated before appearing.
const BUILTIN_DISCOVERY_SEEDS = [
  "https://www.trumbullbeekeepers.org/",
  "https://www.wraba.com/",
  "https://centuryvillagemuseum.org/",
  "https://www.trumbullcountyhistory.com/",
  "https://sites.google.com/trumbullcountyhistory.org/trumbull-history-hub/home/mesopotamia"
];
const BUILTIN_EVENT_SOURCES = [
  { url: "https://centuryvillagemuseum.org/event/", name: "Century Village Museum" },
  { url: "https://centuryvillagemuseum.org/events-calendar/", name: "Century Village Museum" }
];
const DANCE_RE = /\bdance\b|dancing|ballroom|ballet|tap dance|jazz dance|dance studio|dance academy/i;
const JUNK_HOST_RE = /(?:facebook|instagram|linkedin|youtube|tiktok|pinterest|x\.com|twitter|wikipedia|yelp|tripadvisor)\./i;
const FOREIGN_GOV_HOST_RE = /(?:^|\.)(?:gov|gouv|government|gc|ac)\.(?:co|uk|au|nz|ca|in|pk|bd|za|ng|ke|br|mx|fr|de|es|it|nl|be|ch|at|pl|se|no|dk|fi|jp|kr|sg|my|ph|id|th|vn)$/i;
const ARTICLE_RE = /\b(?:news|newspaper|journalism|press release|obituary|podcast|radio|weather|scoreboard|politics|election|recipe|restaurant review|blog post)\b/i;
const AMISH_RE = /\bamish\b|\bamish[- ]owned\b|\bamish[- ]run\b/i;
const CAREER_RE = /(?:career|careers|jobs|employment|work with us|join our team|job openings|opportunities)/i;
const ORG_RE = /(?:association|society|club|guild|chapter|council|league|organization|organisation|foundation|historical society|heritage|museum|library|conservancy|preservation|collective|fellowship|alliance|coalition|volunteer group|chapter)/i;
const ORG_IDENTITY_RE = /(?:association|society|club|guild|chapter|council|league|organization|organisation|foundation|conservancy|preservation|collective|fellowship|alliance|coalition|volunteer group)/i;
const VENUE_RE = /(?:museum|library|historic site|historical site|heritage center|heritage centre|park|nature center|nature centre|arboretum|botanical garden|fairgrounds|community center|community centre|cultural center|cultural centre|observatory|visitor center|visitor centre|hall|farm|homestead|mill|theater|theatre)/i;
const EVENT_RE = /(?:event|calendar|meeting|workshop|program|programme|exhibit|exhibition|festival|fair|lecture|tour|open house|class|demo|demonstration|registration|tickets|admission|rsvp)/i;
const LOCAL_REGION_RE = /\b(?:ohio|trumbull|warren|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga)\b/i;

function parseHomeLocation(value) {
  const raw = clean(value);
  if (!raw) return { city: "", state: "" };
  const parts = raw.split(",").map(x => x.trim()).filter(Boolean);
  const city = parts[0] || "";
  const state = parts[1] ? (parts[1].match(/\b(?:OH|Ohio)\b/i)?.[0] || parts[1]) : "";
  return { city, state };
}
function splitParam(s) { return String(s || "").split(",").map(x => x.trim()).filter(Boolean); }
function errorMessage(e) { return e instanceof Error ? (e.message || String(e)) : typeof e === "string" ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })(); }
function json(data, cors, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors } }); }
function clamp(n, min, max) { return Math.min(Math.max(Number.isFinite(n) ? n : min, min), max); }
function norm(s) { return String(s || "").toLowerCase().replace(/https?:\/\//g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function decodeEntities(s) {
  return String(s || "").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;|&#038;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&#x2f;|&#47;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : _; })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : _; });
}
function clean(s) { return stripHtml(decodeEntities(String(s || ""))).replace(/\s+/g, " ").trim(); }
function stripHtml(s) { return String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'").replace(/&#x2F;/gi, "/"); }
function decodeHtml(s) { return clean(s); }
function isHttp(u) { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } }
function abs(u, base) { try { return new URL(u || base.href, base.href).href; } catch { return base.href; } }
function host(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } }
function listEnv(env, key) { return String(env?.[key] || "").split(",").map(x => x.trim()).filter(Boolean); }
function urlKey(u) { try { const x = new URL(u); return `${x.hostname.toLowerCase()}${x.pathname.replace(/\/$/, "")}`; } catch { return norm(u); } }
function key(name, u) { return `${norm(name)}|${urlKey(u)}`; }
function distanceApprox(a, b) { return null; } // kept explicit: no fake distances

async function fetchText(url, options = {}, budget) {
  if (budget && budget.used >= budget.limit) return { ok: false, status: 0, text: "", error: "fetch budget exhausted", milliseconds: 0, bytes: 0 };
  if (budget) budget.used++;
  const started = Date.now();
  try {
    const r = await fetch(url, {
      ...options,
      redirect: "follow",
      headers: { "User-Agent": `Opportunity-Finder/${VERSION}`, "Accept": "text/html,application/xhtml+xml,application/xml,application/json,text/xml,*/*", ...(options.headers || {}) }
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
      if (FOREIGN_GOV_HOST_RE.test(x.hostname)) return;
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
    `"${city}" Ohio`, `"Trumbull County" Ohio`, `"Warren" Ohio`, `"Northeast Ohio"`, `"Geauga County" Ohio`, `"Portage County" Ohio`, `"Ashtabula County" Ohio`, `"Mahoning County" Ohio`
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
    qs.push(`"${cats[i]}" ${p} Ohio (association OR society OR club OR guild OR chapter OR organization) -dance`);
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
  const budget = { used: 0, limit: Number(env?.DISCOVERY_FETCH_LIMIT || 72) };
  const diagnostics = [], venueCandidates = [];
  // Put trusted local seeds first so generic search-engine articles cannot consume the validation budget.
  const orgCandidates = [...BUILTIN_DISCOVERY_SEEDS, ...listEnv(env, "GROUP_SEEDS"), ...listEnv(env, "DISCOVERY_SEEDS")]
    .filter(u => acceptDiscoveryUrl(u, state))
    .map(u => ({ url: u, query: "trusted discovery seed" }));
  const orgQueries = buildOrgQueries(interests, city, state);

  // Stage 1: discover organizations first. Search results are never returned directly.
  for (const query of orgQueries) {
    const r = await searchWeb(query, env, budget);
    diagnostics.push({ stage: "organization-search", source: "search", query, ok: r.ok, status: r.status, parser: r.parser || null, candidates: r.urls.length, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error });
    for (const u of r.urls) {
      if (acceptDiscoveryUrl(u, state)) orgCandidates.push({ url: u, query });
    }
  }

  const uniqueOrgUrls = dedupeCandidateUrls(orgCandidates).slice(0, 14);
  const organizations = [];
  for (const c of uniqueOrgUrls) {
    const r = await fetchText(c.url, {}, budget);
    const d = { stage: "organization-validation", url: c.url, query: c.query, ok: r.ok, status: r.status, milliseconds: r.milliseconds, bytes: r.bytes, accepted: 0, rejected: null, evidence: [] };
    if (!r.ok) { d.rejected = r.error || `HTTP ${r.status}`; diagnostics.push(d); continue; }
    const page = parseOrganizationPage(r.text, c.url, interests, city, state, false, radius);
    d.evidence = page.evidence; d.accepted = page.organizations.length; d.rejected = page.organizations.length ? null : page.rejectReason;
    diagnostics.push(d); organizations.push(...page.organizations);
  }

  const orgs = dedupeOrganizations(organizations).slice(0, 100);

  // Stage 2: venues are independent discovery anchors, but use the same strict organization validation.
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
    const page = parseOrganizationPage(r.text, c.url, interests, city, state, true, radius);
    d.accepted = page.organizations.length; d.rejected = page.organizations.length ? null : page.rejectReason; diagnostics.push(d); venues.push(...page.organizations);
  }

  const anchors = dedupeOrganizations([...orgs, ...venues]);

  // Stage 3: trusted event sources first, then validated organization/venue anchors.
  // This makes event discovery resilient when search-engine results are sparse or noisy.
  const eventBudget = { used: 0, limit: Math.min(24, Math.max(0, budget.limit - budget.used)) };
  const events = [];
  const trustedEventSources = [...BUILTIN_EVENT_SOURCES, ...listEnv(env, "EVENT_SOURCES").map(url => ({ url, name: "configured event source" }))];
  for (const source of trustedEventSources) {
    if (eventBudget.used >= eventBudget.limit) break;
    const pr = await fetchText(source.url, {}, eventBudget);
    const d = { stage: "trusted-event-source", organization: source.name, url: source.url, ok: pr.ok, status: pr.status, accepted: 0, rejected: null };
    if (!pr.ok) { d.rejected = pr.error || `HTTP ${pr.status}`; diagnostics.push(d); continue; }
    const org = { name: source.name, url: source.url };
    const found = parseEvents(pr.text, source.url, interests, city, state, org, radius);
    d.accepted = found.events.length; d.rejected = found.events.length ? null : found.rejectReason;
    diagnostics.push(d); events.push(...found.events);
  }

  // Supplemental event discovery from validated anchors.
  for (const org of anchors.slice(0, 8)) {
    if (eventBudget.used >= eventBudget.limit) break;
    for (const query of buildEventQueries(org, interests, city, state).slice(0, 2)) {
      if (eventBudget.used >= eventBudget.limit) break;
      const r = await searchWeb(query, env, eventBudget);
      diagnostics.push({ stage: "event-search", organization: org.name, query, ok: r.ok, status: r.status, candidates: r.urls.length, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error });
      for (const u of r.urls.slice(0, 4)) {
        if (!acceptDiscoveryUrl(u, state) || eventBudget.used >= eventBudget.limit) continue;
        const pr = await fetchText(u, {}, eventBudget);
        const d = { stage: "event-validation", organization: org.name, url: u, ok: pr.ok, status: pr.status, accepted: 0, rejected: null };
        if (!pr.ok) { d.rejected = pr.error || `HTTP ${pr.status}`; diagnostics.push(d); continue; }
        const found = parseEvents(pr.text, u, interests, city, state, org, radius);
        d.accepted = found.events.length; d.rejected = found.events.length ? null : found.rejectReason; diagnostics.push(d); events.push(...found.events);
      }
    }
  }

  const uniqueEvents = dedupeBy(events, x => key(x.title, x.url)).slice(0, 100);
  const uniqueOrganizations = anchors.slice(0, 100);
  return {
    ok: true, version: VERSION, build: BUILD, architecture: "organization-first", city, state, radius, interests,
    stages: { organizationCandidates: orgCandidates.length, validatedOrganizations: orgs.length, validatedAnchors: uniqueOrganizations.length, eventCandidates: events.length, validatedEvents: uniqueEvents.length },
    counts: { groups: uniqueOrganizations.length, events: uniqueEvents.length, jobs: 0 },
    groups: uniqueOrganizations,
    events: uniqueEvents,
    jobs: [],
    fetchBudget: { used: budget.used + eventBudget.used, limit: budget.limit, organizationAndVenue: budget.used, events: eventBudget.used, eventLimit: eventBudget.limit },
    diagnostics,
    notes: [
      "Organization and venue discovery happens before event discovery.",
      "A search-engine result is a candidate only; it is not a listing until its page passes validation.",
      "Organizations require organization/venue evidence plus target-state geographic evidence.",
      "Events require event-specific evidence and a target-location signal; generic articles are rejected.",
      "No distance is fabricated when exact geocoding is unavailable.",
      "Dance-related organizations and events are excluded."
    ]
  };
}

function acceptDiscoveryUrl(u, state) {
  if (!isHttp(u)) return false;
  try {
    const x = new URL(u);
    if (JUNK_HOST_RE.test(x.hostname)) return false;
    if (isObviousOutOfState(x.href, state)) return false;
    return true;
  } catch { return false; }
}
function isObviousOutOfState(u, state) {
  if (!/^(OH|Ohio)$/i.test(state)) return false;
  const t = norm(u);
  const outside = /\b(?:new jersey|new york|pennsylvania|michigan|indiana|kentucky|west virginia)\b/.test(t);
  const ohio = /\b(?:ohio|oh|trumbull|warren|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga)\b/.test(t);
  return outside && !ohio;
}
function dedupeCandidateUrls(arr) { const m = new Map(); for (const x of arr) if (!m.has(urlKey(x.url))) m.set(urlKey(x.url), x); return [...m.values()]; }
function dedupeOrganizations(arr) { return dedupeBy(arr, x => key(x.name, x.url)).sort((a, b) => (b.confidence - a.confidence) || (b.score - a.score)); }
function dedupeBy(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); if (!k || m.has(k)) continue; m.set(k, x); } return [...m.values()]; }

function parseOrganizationPage(html, baseUrl, interests, city, state, venueMode = false, radius = 75) {
  const base = new URL(baseUrl), text = clean(html), title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""), desc = clean((html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)/i) || [])[1] || "");
  const evidence = [];
  // Organization/venue evidence must come from page identity metadata (title/description)
  // or the opening page text, not from arbitrary article body text. Generic how-to/news
  // articles often mention "association", "museum", etc. deep in the body and must not
  // be promoted to organizations merely because a search query led us there.
  const identityText = `${title} ${desc} ${text.slice(0, 1800)}`;
  if (ORG_RE.test(identityText)) evidence.push("organization-language");
  if (VENUE_RE.test(identityText)) evidence.push("venue-language");
  if (LOCAL_REGION_RE.test(text.slice(0, 10000))) evidence.push("regional-language");
  if (new RegExp(`\b${escapeRe(city)}\b`, "i").test(text)) evidence.push("city-name");
  if (DANCE_RE.test(`${title} ${desc}`)) return { organizations: [], evidence, rejectReason: "dance exclusion" };
  if (ARTICLE_RE.test(title) && !ORG_RE.test(`${title} ${desc}`)) return { organizations: [], evidence, rejectReason: "article/publisher page" };

  const structured = extractOrganizationStructuredData(html);
  const structuredLocations = structured.map(x => formatLocation(x.address || x.location || x.areaServed)).filter(Boolean);
  const structuredText = structuredLocations.join(" ");
  if (structuredText) evidence.push("structured-location");
  if (structuredText && hardOutOfArea(structuredText, city, state)) return { organizations: [], evidence, rejectReason: "structured address is outside target area" };

  const combined = `${title} ${desc} ${structuredText} ${text.slice(0, 12000)}`;
  const structuredTypes = structured.map(x => Array.isArray(x["@type"]) ? x["@type"].join(" ") : String(x["@type"] || "")).join(" ");
  const orgEvidence = ORG_IDENTITY_RE.test(identityText) || /Organization|LocalBusiness/i.test(structuredTypes);
  const venueEvidence = VENUE_RE.test(identityText) || /Museum|CivicStructure|Place/i.test(structuredTypes);
  const validIdentityEvidence = venueMode ? (orgEvidence || venueEvidence) : orgEvidence;
  const localEvidence = geographicEvidence(combined, city, state);
  const distance = estimateDistance(`${city}, ${state}`, `${structuredText} ${text.slice(0, 12000)}`);
  if (distance != null && distance > radius) return { organizations: [], evidence, rejectReason: `outside requested radius (${distance} mi)` };
  if (hardOutOfArea(combined, city, state) && !new RegExp("\b" + escapeRe(city) + "\b", "i").test(combined)) return { organizations: [], evidence, rejectReason: "page contains a contradictory out-of-area location" };
  if (!validIdentityEvidence || localEvidence.score < 45) {
    return { organizations: [], evidence, rejectReason: !validIdentityEvidence ? "insufficient organization/venue evidence" : "insufficient geographic evidence" };
  }
  const name = selectOrganizationName(title, desc, base.hostname, venueMode);
  if (!name || name.length < 3 || name.length > 180) return { organizations: [], evidence, rejectReason: "weak organization name" };
  const score = relevanceScore(`${name} ${desc}`, interests);
  return { organizations: [{
    id: key(name, base.href), name, url: base.href, description: desc.slice(0, 900),
    type: classifyOrg(`${name} ${desc}`), confidence: Math.min(100, 55 + (orgEvidence ? 18 : 10) + (venueEvidence ? 12 : 0) + localEvidence.score / 4 + Math.min(score, 15)),
    score: score + localEvidence.score, location: extractLocation(text, city, state), source: "validated public page", discoveryQuality: "verified", locationScore: localEvidence.score
  }], evidence, rejectReason: null };
}
function extractOrganizationStructuredData(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const x of flattenJsonLd(JSON.parse(m[1].trim()))) {
        const type = Array.isArray(x["@type"]) ? x["@type"].join(" ") : String(x["@type"] || "");
        if (/Organization|LocalBusiness|Museum|CivicStructure|Place/i.test(type)) out.push(x);
      }
    } catch {}
  }
  return out;
}
function hardOutOfArea(text, city, state) {
  if (!/^(OH|Ohio)$/i.test(state)) return false;
  const t = norm(text);
  const hasOhio = /\b(?:ohio|oh|trumbull|warren|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga)\b/.test(t);
  const hasOutside = /\b(?:new jersey|new york|pennsylvania|michigan|indiana|kentucky|west virginia)\b/.test(t);
  return hasOutside && !hasOhio;
}

const GENERIC_TITLE_RE = /^(?:home|welcome|official site|official website|homepage|main page|index|landing page)$/i;
const DOMAIN_WORDS = ["beekeepers", "blacksmith", "blacksmiths", "association", "society", "museum", "historical", "history", "village", "center", "centre", "guild", "club", "foundation", "artists", "artist", "library", "preservation", "heritage", "farm", "homestead", "nature", "observatory", "community"];
function humanizeHostname(hostname) {
  let h = hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ").trim();
  for (const word of DOMAIN_WORDS.sort((a, b) => b.length - a.length)) h = h.replace(new RegExp(`(${escapeRe(word)})`, "ig"), " $1 ");
  return h.replace(/\s+/g, " ").trim();
}
function selectOrganizationName(title, desc, hostname, venueMode) {
  const first = clean(title).replace(/\s*[|–—-]\s*.+$/, "").trim();
  if (first && !GENERIC_TITLE_RE.test(first) && !ARTICLE_RE.test(first) && first.length >= 3) return first;
  const h = humanizeHostname(hostname);
  return h ? h.replace(/\b\w/g, c => c.toUpperCase()) : "";
}
function classifyOrg(t) {
  const x = norm(t);
  if (/beekeep|apiary|beekeepers association/.test(x)) return "beekeeping";
  if (/blacksmith|smithing|forge|farrier/.test(x)) return "blacksmithing";
  if (/reenact|living history|sca|society for creative anachronism/.test(x)) return "reenactment";
  if (/museum|historical society|heritage|preservation|history center|historic site/.test(x)) return "museum/historical";
  if (/nature|native plant|conservation|hiking|trail|outdoor/.test(x)) return "nature/outdoors";
  if (/garden|horticulture|master gardener|beekeep/.test(x)) return "gardening/agriculture";
  if (/bike|bicycle|cycling/.test(x)) return "cycling";
  if (/wood|carpentry|woodworking/.test(x)) return "woodworking";
  if (/astronomy|observatory|stargazing/.test(x)) return "astronomy";
  if (/guild|craft|artisan|maker/.test(x)) return "traditional crafts";
  return "community organization";
}
const CITY_COORDS = {
  "Mesopotamia, OH":[41.464,-80.975], "Warren, OH":[41.237,-80.818],
  "Cortland, OH":[41.330,-80.726], "Niles, OH":[41.182,-80.765],
  "Newton Falls, OH":[41.189,-80.978], "Farmington, OH":[41.341,-81.051],
  "North Bloomfield, OH":[41.464,-80.982], "West Farmington, OH":[41.341,-81.051],
  "Middlefield, OH":[41.462,-81.074], "Youngstown, OH":[41.099,-80.649],
  "Ravenna, OH":[41.157,-81.242], "Akron, OH":[41.081,-81.519],
  "Cleveland, OH":[41.499,-81.694], "Chardon, OH":[41.581,-81.208],
  "Burton, OH":[41.471,-81.145], "Kent, OH":[41.153,-81.357],
  "Mentor, OH":[41.666,-81.339], "Columbus, OH":[39.961,-82.999], "Garrettsville, OH":[41.284,-81.097],
  "Hiram, OH":[41.313,-81.144], "Painesville, OH":[41.724,-81.245],
  "Ashtabula, OH":[41.865,-80.789], "Geneva, OH":[41.805,-80.948],
  "Jefferson, OH":[41.738,-80.769], "Lisbon, OH":[40.772,-80.768],
  "Canton, OH":[40.798,-81.378], "Alliance, OH":[40.915,-81.106],
  "Medina, OH":[41.138,-81.863], "Wooster, OH":[40.798,-81.938],
  "Hudson, OH":[41.240,-81.440], "Aurora, OH":[41.317,-81.345],
  "Twinsburg, OH":[41.313,-81.440], "Stow, OH":[41.159,-81.440],
  "Brimfield, OH":[41.100,-81.347], "Freedom Township, OH":[41.133,-81.252],
  "Canfield, OH":[41.025,-80.760], "Strongsville, OH":[41.313,-81.835],
  "Brunswick, OH":[41.238,-81.841], "Eastlake, OH":[41.653,-81.450],
  "Willoughby, OH":[41.639,-81.406], "Beachwood, OH":[41.464,-81.508],
  "Solon, OH":[41.389,-81.441], "Bay Village, OH":[41.484,-81.922],
  "Lakewood, OH":[41.482,-81.798], "Parma, OH":[41.405,-81.722]
};
function cityKey(text) {
  const t = norm(text);
  const padded = ` ${t} `;
  for (const k of Object.keys(CITY_COORDS).sort((a,b) => b.length - a.length)) {
    const name = norm(k.split(",")[0]);
    if (padded.includes(` ${name} `)) return k;
  }
  return null;
}
function estimateDistance(home, placeText) {
  const homeKey = cityKey(home) || "Mesopotamia, OH";
  const placeKey = cityKey(placeText);
  if (!placeKey) return null;
  const a = CITY_COORDS[homeKey], b = CITY_COORDS[placeKey];
  if (!a || !b) return null;
  const rad = Math.PI / 180, lat1 = a[0] * rad, lat2 = b[0] * rad;
  const dlat = (b[0] - a[0]) * rad, dlon = (b[1] - a[1]) * rad;
  const h = Math.sin(dlat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h)));
}
function geographicEvidence(text, city, state) {
  const t = norm(text), padded = ` ${t} `;
  if (/^(OH|Ohio)$/i.test(state)) {
    const hasOhio = /\bohio\b/.test(t);
    const hasOhioAbbr = /\boh\b/.test(t);
    const hasState = hasOhio || hasOhioAbbr;
    const hasCity = !!city && padded.includes(` ${norm(city)} `);
    const hasCountyOrRegion = /\b(?:trumbull county|trumbull|warren|northeast ohio|geauga county|geauga|portage county|portage|ashtabula county|ashtabula|mahoning county|mahoning|columbiana county|columbiana|summit county|summit|lake county|lake|cuyahoga county|cuyahoga)\b/.test(t);
    let score = 0;
    if (hasState) score += 45;
    if (hasCity && hasState) score += 35;
    if (hasCountyOrRegion && hasState) score += 20;
    return { score: Math.min(100, score), hasOhio, hasOhioAbbr, hasState, hasCity, hasCountyOrRegion };
  }
  const wantedState = norm(state);
  const hasState = !!wantedState && padded.includes(` ${wantedState} `);
  const hasCity = !!city && padded.includes(` ${norm(city)} `);
  return { score: (hasState ? 50 : 0) + (hasCity && hasState ? 50 : 0), hasState, hasCity };
}
function extractLocation(text, city, state) {
  const m = text.match(new RegExp(".{0,80}\b" + escapeRe(city) + "\b.{0,80}", "i"));
  return clean(m ? m[0] : `${city}, ${state}`);
}
function escapeRe(s) { return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function parseEvents(html, baseUrl, interests, city, state, org, radius = 75) {
  const base = new URL(baseUrl), events = [], text = clean(html), evidence = [];
  const jsonld = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonld.push(...flattenJsonLd(JSON.parse(m[1].trim()))); } catch {}
  }
  for (const x of jsonld) {
    const type = Array.isArray(x["@type"]) ? x["@type"].join(" ") : String(x["@type"] || "");
    if (!/Event/i.test(type) || !x.name) continue;
    const location = formatLocation(x.location), combined = `${x.name} ${x.description || ""} ${location} ${typeof x.organizer === "object" ? x.organizer?.name || "" : x.organizer || ""}`;
    if (DANCE_RE.test(combined) || AMISH_RE.test(combined)) continue;
    const geo = geographicEvidence(combined, city, state);
    const distance = estimateDistance(`${city}, ${state}`, location);
    if (geo.score < 45 || (distance != null && distance > radius)) continue;
    events.push({ id: key(x.name, x.url || base.href), title: clean(x.name), description: clean(x.description || "").slice(0, 1000), url: abs(x.url || base.href, base), date: x.startDate, endDate: x.endDate || "", location, organizer: clean(typeof x.organizer === "object" ? x.organizer?.name || org.name : x.organizer || org.name), source: "JSON-LD Event", score: relevanceScore(combined, interests) + geo.score, type: "event", discoveryQuality: "verified", locationScore: geo.score, distanceMiles: distance, distance, org: org.name, host: org.name });
  }
  if (events.length) { evidence.push("JSON-LD Event"); return { events: dedupeEvents(events), evidence, rejectReason: null }; }

  for (const m of html.matchAll(/<(article|li|div|section)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const block = clean(m[2]);
    const date = findDate(block);
    if (/\b(?:bc|bce)\b/i.test(block) || /\b(?:solar eclipse|antipope|earl godwine|king edward|battle of arsuf)\b/i.test(block)) continue;
    if (!date || !EVENT_RE.test(block) || DANCE_RE.test(block) || AMISH_RE.test(block) || ARTICLE_RE.test(block.slice(0, 500))) continue;
    const geo = geographicEvidence(block, city, state);
    const location = extractLocation(block, city, state);
    const distance = estimateDistance(`${city}, ${state}`, location);
    if (geo.score < 45 || (distance != null && distance > radius)) continue;
    const h = clean((m[1].match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) || [])[1] || block.slice(0, 160));
    if (h.length < 4 || isGarbageEventTitle(h)) continue;
    events.push({ id: key(h, base.href + "#" + date), title: h, description: block.slice(0, 1000), url: base.href, date, endDate: "", location, organizer: org.name, source: "validated event block", score: relevanceScore(block, interests) + geo.score, type: "event", discoveryQuality: "verified", locationScore: geo.score, distanceMiles: distance, distance, org: org.name, host: org.name });
  }
  if (events.length && !evidence.includes("HTML event block")) evidence.push("HTML event block");
  if (!events.length) return { events: [], evidence, rejectReason: !EVENT_RE.test(text) ? "no event-specific evidence" : "no validated local event" };
  return { events: dedupeEvents(events), evidence, rejectReason: null };
}
function isGarbageEventTitle(title) {
  const t = norm(title);
  return /^(?:events? from|upcoming events?|events search|search|today|calendar|winter spring|summer|fall|holiday season|skip to content|skip to footer)/i.test(t)
    || /(?:skip to content|skip to footer|the museum is open|special exhibits.*all year)/i.test(t)
    || /^(?:sun|mon|tue|wed|thu|fri|sat)\s+\d{1,2}\s+/.test(t) && /\bfeatured\b/.test(t) && t.length > 140;
}
function dedupeEvents(items) {
  const seen = new Map();
  for (const item of items) {
    const k = `${eventTitleKey(item.title)}|${norm(item.location || "")}`;
    const old = seen.get(k);
    if (!old || (item.source === "JSON-LD Event" && old.source !== "JSON-LD Event")) seen.set(k, item);
  }
  return [...seen.values()];
}
function eventTitleKey(title) {
  return norm(title).replace(/^(?:sun|mon|tue|wed|thu|fri|sat)\s+\d{1,2}\s+/i, "").replace(/\bfeatured\b/g, "").replace(/\b20\d{2}\b/g, "").replace(/\b(?:century village museum|auburn church)\b/g, "").replace(/\s+/g, " ").trim();
}
function flattenJsonLd(x) { if (Array.isArray(x)) return x.flatMap(flattenJsonLd); if (x && typeof x === "object") return [x, ...(Array.isArray(x["@graph"]) ? x["@graph"].flatMap(flattenJsonLd) : [])]; return []; }
function formatLocation(x) {
  if (!x) return "";
  if (typeof x === "string") return clean(x);
  if (Array.isArray(x)) return x.map(formatLocation).filter(Boolean).join("; ");
  if (x.address) return [x.name, formatLocation(x.address)].filter(Boolean).join(", ");
  return [x.name, x.streetAddress, x.addressLocality, x.addressRegion, x.postalCode].filter(Boolean).map(clean).join(", ");
}
function findDate(t) { const m = String(t).match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*20\d{2})?)\b/i); return m ? m[0] : ""; }
function relevanceScore(text, interests) { const t = norm(text); let s = 0; for (const i of interests) { const q = norm(i); if (!q) continue; if (t.includes(q)) s += 10; for (const w of q.split(" ").filter(x => x.length > 3)) if (t.includes(w)) s += 2; } return s; }

async function discoverJobs(interests, city, state, radius, partTime, env) {
  const budget = { used: 0, limit: Number(env?.DISCOVERY_FETCH_LIMIT || 72) };
  const diagnostics = [], items = [];
  let usajobsDiscovered = 0, usajobsDuplicateCount = 0, usajobsOutsideRadius = 0, usajobsUnknownDistance = 0, usajobsExcludedByFilter = 0, usajobsQueries = 0;
  const usajobsAnchorSummary = [];
  const trustedSources = ["https://www.neo-rls.org/view_job_postings.php", ...listEnv(env, "JOB_SOURCES")];
  for (const source of [...new Set(trustedSources)]) {
    if (budget.used >= budget.limit) break;
    const r = await fetchText(source, {}, budget);
    const d = { stage: "trusted-job-source", url: source, ok: r.ok, status: r.status, accepted: 0, rejected: null };
    if (!r.ok) { d.rejected = r.error || `HTTP ${r.status}`; diagnostics.push(d); continue; }
    const found = /neo-rls\.org/i.test(source) ? parseNeoRlsJobs(r.text, source, interests, city, state, radius, { source: "NEO-RLS", partTime }) : parseJobs(r.text, source, interests, city, state, radius, { source: "trusted job source", partTime });
    d.accepted = found.length; d.rejected = found.length ? null : "no validated local jobs from trusted source";
    diagnostics.push(d); items.push(...found);
  }

  // USAJOBS uses broad regional anchors for discovery. Its Radius is deliberately not the acceptance rule:
  // every result is validated against the user's home + requested radius using the Worker's own geography engine.
  const usaAnchors = buildUSADiscoveryAnchors(city, state);
  const usaQueries = buildUSAQueries(interests);
  const seenUSA = new Set();
  for (const anchor of usaAnchors) {
    const anchorStats = { anchor, requests: 0, http200: 0, discovered: 0, accepted: 0, rejectedDistance: 0, rejectedUnknownDistance: 0, rejectedFilter: 0, duplicate: 0 };
    for (const query of usaQueries) {
      if (budget.used >= budget.limit) break;
      usajobsQueries++;
      anchorStats.requests++;
      const url = new URL("https://data.usajobs.gov/api/search");
      url.searchParams.set("Keyword", query);
      url.searchParams.set("LocationName", `${anchor.city}, ${anchor.state}`);
      // Search broadly. Actual distance acceptance happens below.
      url.searchParams.set("Radius", "100");
      url.searchParams.set("ResultsPerPage", "20");
      if (partTime) url.searchParams.set("PositionScheduleTypeCode", "2");
      const headers = {};
      if (env?.USAJOBS_KEY) headers["Authorization-Key"] = env.USAJOBS_KEY;
      if (env?.USAJOBS_EMAIL) headers["User-Agent"] = env.USAJOBS_EMAIL;
      const r = await fetchText(url.href, { headers }, budget);
      const statusDiag = { stage: "usajobs", anchor: anchor.label, city: anchor.city, state: anchor.state, query, ok: r.ok, status: r.status, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error };
      diagnostics.push(statusDiag);
      if (!r.ok) continue;
      anchorStats.http200++;
      try {
        const j = JSON.parse(r.text);
        const results = j?.SearchResult?.SearchResultItems || [];
        for (const x of results) {
          const d = x.MatchedObjectDescriptor || {};
          const loc = d.PositionLocationDisplay || "";
          const id = String(d.PositionID || d.PositionURI || d.PositionTitle || "");
          if (seenUSA.has(id)) { usajobsDuplicateCount++; anchorStats.duplicate++; continue; }
          seenUSA.add(id);
          usajobsDiscovered++;
          anchorStats.discovered++;
          const combined = `${d.PositionTitle || ""} ${d.OrganizationName || ""} ${d.UserArea?.Details?.JobSummary || ""} ${loc}`;
          const geo = geographicEvidence(loc, city, state);
          const distance = estimateDistance(`${city}, ${state}`, loc);
          const filterReject = DANCE_RE.test(combined) || AMISH_RE.test(combined);
          if (filterReject) {
            usajobsExcludedByFilter++;
            anchorStats.rejectedFilter++;
            diagnostics.push({ stage: "usajobs-validation", anchor: anchor.label, query, positionId: d.PositionID || null, title: d.PositionTitle || "", location: loc, accepted: false, rejected: DANCE_RE.test(combined) ? "dance exclusion" : "Amish employer exclusion", geographicScore: geo.score, distanceMiles: distance });
            continue;
          }
          if (distance != null && distance > radius) {
            usajobsOutsideRadius++;
            anchorStats.rejectedDistance++;
            diagnostics.push({ stage: "usajobs-validation", anchor: anchor.label, query, positionId: d.PositionID || null, title: d.PositionTitle || "", location: loc, accepted: false, rejected: `outside requested radius (${distance} mi > ${radius} mi)`, geographicScore: geo.score, distanceMiles: distance });
            continue;
          }
          if (distance == null) {
            usajobsUnknownDistance++;
            anchorStats.rejectedUnknownDistance++;
            diagnostics.push({ stage: "usajobs-validation", anchor: anchor.label, query, positionId: d.PositionID || null, title: d.PositionTitle || "", location: loc, accepted: false, rejected: "unable to calculate distance from known city coordinates", geographicScore: geo.score, distanceMiles: null });
            continue;
          }
          if (geo.score < 45) {
            anchorStats.rejectedFilter++;
            diagnostics.push({ stage: "usajobs-validation", anchor: anchor.label, query, positionId: d.PositionID || null, title: d.PositionTitle || "", location: loc, accepted: false, rejected: "insufficient geographic evidence", geographicScore: geo.score, distanceMiles: distance });
            continue;
          }
          anchorStats.accepted++;
          items.push({ id: key(d.PositionID || d.PositionTitle, d.PositionURI || url.href), title: d.PositionTitle || "USAJOBS opportunity", organization: d.OrganizationName || "", url: d.PositionURI || "https://www.usajobs.gov/", description: clean(d.UserArea?.Details?.JobSummary || "").slice(0, 1100), date: d.PublicationStartDate || "", closeDate: d.ApplicationCloseDate || "", location: loc, employmentType: d.PositionScheduleType?.[0]?.Name || "", source: "USAJOBS", score: relevanceScore(combined, interests) + geo.score, type: "job", discoveryQuality: "verified", locationScore: geo.score, distanceMiles: distance });
        }
      } catch (e) {
        diagnostics.push({ stage: "usajobs-parse", anchor: anchor.label, query, ok: false, rejected: errorMessage(e) });
      }
    }
    usajobsAnchorSummary.push(anchorStats);
  }

  for (const query of buildJobQueries(interests, city, state)) {
    if (budget.used >= budget.limit) break;
    const r = await searchWeb(query, env, budget);
    diagnostics.push({ stage: "job-search", query, ok: r.ok, status: r.status, parser: r.parser || null, candidates: r.urls.length, milliseconds: r.milliseconds, bytes: r.bytes, error: r.ok ? null : r.error });
    for (const u of r.urls.slice(0, 5)) {
      if (budget.used >= budget.limit) break;
      if (!acceptDiscoveryUrl(u, state) || CAREER_RE.test(u)) continue;
      const pr = await fetchText(u, {}, budget);
      const d = { stage: "job-validation", url: u, ok: pr.ok, status: pr.status, accepted: 0, rejected: null };
      if (!pr.ok) { d.rejected = pr.error || `HTTP ${pr.status}`; diagnostics.push(d); continue; }
      const found = parseJobs(pr.text, u, interests, city, state, radius, { source: "validated job page", partTime });
      d.accepted = found.length; d.rejected = found.length ? null : "no validated local job posting";
      diagnostics.push(d); items.push(...found);
    }
  }
  const unique = dedupeBy(items, x => key(x.title, x.url)).slice(0, 100);
  return {
    ok: true, version: VERSION, build: BUILD, city, state, radius, partTime,
    counts: { jobs: unique.length }, items: unique, jobs: unique,
    discovery: { usaJobs: { queries: usaQueries, anchors: usaAnchors.map(x => x.label), requests: usajobsQueries, discoveredBeforeFiltering: usajobsDiscovered, duplicates: usajobsDuplicateCount, rejectedOutsideRadius: usajobsOutsideRadius, rejectedUnknownDistance: usajobsUnknownDistance, rejectedByFilter: usajobsExcludedByFilter, survivedGeographicAndFilterValidation: items.filter(x => x.source === "USAJOBS").length, http200Responses: diagnostics.filter(x => x.stage === "usajobs" && x.status === 200).length, anchorSummary: usajobsAnchorSummary } },
    fetchBudget: budget, diagnostics
  };
}
function buildUSADiscoveryAnchors(city, state) {
  if (!/^(OH|Ohio)$/i.test(state) || !/^(Mesopotamia|Warren)$/i.test(city)) return [{ label: `${city}, ${state}`, city, state }];
  return [
    { label: "Mesopotamia", city: "Mesopotamia", state: "OH" },
    { label: "Warren", city: "Warren", state: "OH" },
    { label: "Youngstown", city: "Youngstown", state: "OH" },
    { label: "Ravenna", city: "Ravenna", state: "OH" },
    { label: "Ashtabula", city: "Ashtabula", state: "OH" },
    { label: "Akron", city: "Akron", state: "OH" },
    { label: "Canton", city: "Canton", state: "OH" },
    { label: "Cleveland", city: "Cleveland", state: "OH" }
  ];
}
function buildJobQueries(interests, city, state) { const base = interestBase(interests).slice(0, 6), p = `"${city}" ${state}`; return [...new Set(base.map(x => `"${x}" ${p} (jobs OR careers OR employment OR hiring) -dance`))].slice(0, 6); }
function buildUSAQueries(interests) {
  // Keep the federal discovery pass broad but bounded. Interest-specific web/job discovery
  // remains available elsewhere; adding those interests to every USAJOBS anchor multiplied
  // requests too aggressively and exhausted the shared fetch budget.
  return [
    "maintenance facilities technician laborer mechanic equipment",
    "trades fabrication welder woodworking technician",
    "transportation warehouse material handling",
    "parks recreation natural resources",
    "cultural resources museum historic preservation archaeology"
  ];
}
function parseNeoRlsJobs(html, baseUrl, interests, city, state, radius = 30, options = {}) {
  const base = new URL(baseUrl), jobs = [];
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]{0,12000}?)(?=<h2[^>]*>|$)/gi)) {
    const title = clean(m[1]), block = clean(m[2]);
    if (!looksLikeJobTitle(title) || !block) continue;
    const combined = `${title} ${block}`;
    if (DANCE_RE.test(combined) || AMISH_RE.test(combined)) continue;
    if (/^(?:view job postings|job seekers|category|keyword|jobline|home)$/i.test(title)) continue;
    if (options.partTime && !/(part[- ]?time|\b\d{1,2}\s*(?:-|to)\s*\d{1,2}\s*hours?\b|\b(?:15|16|18|20|24|25|30|32)\s*hours?\b|hourly)/i.test(combined)) continue;
    const geo = geographicEvidence(combined, city, state);
    const distance = estimateDistance(`${city}, ${state}`, combined);
    if ((geo.score < 45 && distance == null) || (distance != null && distance > radius)) continue;
    const link = (m[2].match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*Read More/i) || [])[1];
    const url = abs(link || base.href, base);
    jobs.push({
      id: key(title, url),
      title,
      organization: extractJobOrganization(combined),
      url,
      description: block.slice(0, 1100),
      date: findDate(combined),
      closeDate: findCloseDate(combined),
      location: extractJobLocation(combined, city, state),
      employmentType: /part[- ]?time/i.test(combined) ? "Part-time" : /full[- ]?time/i.test(combined) ? "Full-time" : "",
      source: "NEO-RLS",
      score: relevanceScore(combined, interests) + geo.score,
      type: "job",
      discoveryQuality: "verified",
      locationScore: geo.score,
      distanceMiles: distance
    });
  }
  return dedupeBy(jobs, x => key(x.title, x.url));
}
function parseJobs(html, baseUrl, interests, city, state, radius = 30, options = {}) {
  const base = new URL(baseUrl), text = clean(html), jobs = [], jsonld = [];
  const trusted = /neo-rls\.org/i.test(base.hostname) || /trusted job source/i.test(options.source || "");
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { jsonld.push(...flattenJsonLd(JSON.parse(m[1].trim()))); } catch {} }
  for (const x of jsonld) {
    const type = Array.isArray(x["@type"]) ? x["@type"].join(" ") : String(x["@type"] || "");
    if (!/JobPosting/i.test(type) || !x.title) continue;
    const loc = formatLocation(x.jobLocation), org = typeof x.hiringOrganization === "object" ? x.hiringOrganization?.name || "" : x.hiringOrganization || "", combined = `${x.title} ${org} ${x.description || ""} ${loc}`;
    if (DANCE_RE.test(combined) || AMISH_RE.test(combined)) continue;
    const geo = geographicEvidence(`${loc} ${x.description || ""}`, city, state), distance = estimateDistance(`${city}, ${state}`, loc), localByCity = !!cityKey(loc);
    if ((geo.score < 45 && !(trusted && localByCity)) || (distance != null && distance > radius)) continue;
    if (options.partTime && !partTimeMatch(x)) continue;
    jobs.push({ id: key(x.title, x.url || base.href), title: clean(x.title), organization: clean(org), url: abs(x.url || base.href, base), description: clean(x.description || "").slice(0, 1100), date: x.datePosted || "", closeDate: x.validThrough || "", location: loc, employmentType: clean(x.employmentType || ""), source: options.source || "JSON-LD JobPosting", score: relevanceScore(combined, interests) + geo.score, type: "job", discoveryQuality: "verified", locationScore: geo.score, distanceMiles: distance });
  }
  for (const m of html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>([\s\S]{0,7000}?)(?=<h[1-6][^>]*>|$)/gi)) {
    const title = clean(m[2]), block = clean(m[3]);
    if (!looksLikeJobTitle(title) || !block || DANCE_RE.test(`${title} ${block}`) || AMISH_RE.test(`${title} ${block}`)) continue;
    const combined = `${title} ${block}`;
    if (CAREER_RE.test(title) && !/(part[- ]?time|full[- ]?time|hours?|salary|wage|apply|position|job)/i.test(block)) continue;
    const geo = geographicEvidence(combined, city, state), distance = estimateDistance(`${city}, ${state}`, combined), localByCity = !!cityKey(combined);
    if ((geo.score < 45 && !(trusted && localByCity)) || (distance != null && distance > radius)) continue;
    if (options.partTime && !/(part[- ]?time|\b\d{1,2}\s*(?:-|to)\s*\d{1,2}\s*hours?\b|20\s*hours?|32\s*hours?|\bpart time\b)/i.test(combined)) continue;
    const date = findDate(combined), url = base.href;
    jobs.push({ id: key(title, url + "#" + date), title, organization: extractJobOrganization(combined), url, description: block.slice(0, 1100), date, closeDate: findCloseDate(combined), location: extractJobLocation(combined, city, state), employmentType: /part[- ]?time/i.test(combined) ? "Part-time" : /full[- ]?time/i.test(combined) ? "Full-time" : "", source: options.source || "validated job block", score: relevanceScore(combined, interests) + geo.score, type: "job", discoveryQuality: "verified", locationScore: geo.score, distanceMiles: distance });
  }
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*([^<]{5,180})\s*<\/a>([\s\S]{0,7000}?)(?:Read More|(?=<a[^>]+href=["']))/gi)) {
    const title=clean(m[2]), block=clean(m[3]);
    if (!looksLikeJobTitle(title) || !block) continue;
    const combined=`${title} ${block}`;
    if (DANCE_RE.test(combined) || AMISH_RE.test(combined)) continue;
    if (options.partTime && !/(part[- ]?time|\b\d{1,2}\s*(?:-|to)\s*\d{1,2}\s*hours?\b|20\s*hours?|32\s*hours?|hourly)/i.test(combined)) continue;
    const geo=geographicEvidence(combined,city,state), distance=estimateDistance(`${city}, ${state}`,combined), localByCity=!!cityKey(combined);
    if ((geo.score<45 && !(trusted&&localByCity)) || (distance!=null && distance>radius)) continue;
    const date=findDate(combined), url=abs(m[1],base);
    jobs.push({id:key(title,url+"#"+date),title,organization:extractJobOrganization(combined),url,description:block.slice(0,1100),date,closeDate:findCloseDate(combined),location:extractJobLocation(combined,city,state),employmentType:/part[- ]?time/i.test(combined)?"Part-time":/full[- ]?time/i.test(combined)?"Full-time":"",source:options.source||"validated job block",score:relevanceScore(combined,interests)+geo.score,type:"job",discoveryQuality:"verified",locationScore:geo.score,distanceMiles:distance});
  }
  return dedupeBy(jobs, x => key(x.title, x.url));
}
function looksLikeJobTitle(t) { return t.length >= 5 && t.length <= 180 && !/^(view job postings|job seekers|category|keyword|home|services|about)$/i.test(t) && !EVENT_RE.test(t); }
function partTimeMatch(x) { return /part[- ]?time|20\s*hours?|32\s*hours?|hourly/i.test(`${x.employmentType || ""} ${x.description || ""}`); }
function extractJobOrganization(t) { const m=t.match(/(?:at|for)\s+([A-Z][A-Za-z0-9&'’ .-]{2,100})(?:\s+(?:is|has|seeks|seeking|located|in)\b|$)/); return m ? clean(m[1]) : ""; }
function extractJobLocation(t, city, state) { const m=t.match(new RegExp(`.{0,100}\b${escapeRe(city)}\b.{0,100}`, "i")); return clean(m ? m[0] : `${city}, ${state}`); }
function findCloseDate(t) { const m=t.match(/(?:closes?|deadline|expires?|application close(?:s)?)[^\d]{0,30}(\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*20\d{2})?))/i); return m ? m[1] : ""; }

async function diagnostics(env, requestPath) {
  const cf = await fetchText("https://www.cloudflare.com/"), uj = await fetchText("https://data.usajobs.gov/api/codelist/positionscheduletypes");
  const keyPresent = !!env?.USAJOBS_KEY, emailPresent = !!env?.USAJOBS_EMAIL;
  return { diagnostic: true, version: VERSION, build: BUILD, requestPath, architecture: "organization-first", secretBindings: { USAJOBS_KEY: keyPresent, USAJOBS_EMAIL: emailPresent }, connectivity: { Cloudflare: { ok: cf.ok, status: cf.status }, USAJOBS: { ok: uj.ok, status: uj.status } }, configuredFeeds: listEnv(env, "WORKER_FEEDS").length };
}

export { parseOrganizationPage, parseEvents, parseJobs, parseNeoRlsJobs, geographicEvidence, estimateDistance, parseHomeLocation };
// Cloudflare deployment verification touch — validated 3.9.5 source-specific parsers.
