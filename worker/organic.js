const DEFAULT_INTERESTS = ["community organizations", "historical societies", "museums", "nature conservation", "traditional crafts", "archaeology", "volunteer groups", "gardening clubs"];
const REGION_TERMS = ["Ohio", "Trumbull County Ohio", "Warren Ohio", "Northeast Ohio", "Geauga County Ohio", "Portage County Ohio", "Ashtabula County Ohio", "Mahoning County Ohio"];
const GROUP_TYPES = ["association", "society", "club", "guild", "chapter", "organization", "foundation", "conservancy", "preservation", "museum", "library", "historical", "heritage", "nature", "conservation", "volunteer", "community"];
const DANCE_RE = /\bdance\b|dancing|ballroom|ballet|tap dance|jazz dance|dance studio|dance academy/i;
const JUNK_HOST_RE = /(?:facebook|instagram|linkedin|youtube|tiktok|pinterest|x\.com|twitter|wikipedia|yelp|tripadvisor|google|googleusercontent|googleapis|accounts|drive)\./i;
const CONTENT_HOST_RE = /(?:indeed|glassdoor|ziprecruiter|simplyhired|monster|britannica|merriam-webster|newsbreak|restaurantji|weather)\./i;
const DIAGNOSTIC_SEED_HOST_RE = /(?:trumbullbeekeepers\.org|wraba\.com|centuryvillagemuseum\.org)$/i;
const NOISE_RE = /ancient mesopotamia|mesopotamian|mesopotamia river|louisiana|church point/i;
const ORG_RE = /association|society|club|guild|chapter|organization|organisation|foundation|conservancy|preservation|museum|library|historical|heritage|nature|conservation|volunteer|community/i;
const EVENT_RE = /event|calendar|meeting|workshop|program|programme|exhibit|exhibition|festival|fair|lecture|tour|open house|class|demo|demonstration|registration|tickets|rsvp/i;
const LOCAL_RE = /ohio|trumbull|warren|northeast ohio|geauga|portage|ashtabula|mahoning|columbiana|summit|lake|cuyahoga/i;

function clean(s) { return String(s || "").replace(/<script[\\s\\S]*?<\\/script>/gi, " ").replace(/<style[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '\"').replace(/&#39;|&#x27;/gi, "'").replace(/\\s+/g, " ").trim(); }
function host(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
function validUrl(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) && !JUNK_HOST_RE.test(u.hostname) && !CONTENT_HOST_RE.test(u.hostname) && !DIAGNOSTIC_SEED_HOST_RE.test(u.hostname); } catch { return false; } }
function key(url) { try { const u = new URL(url); return `${u.hostname.toLowerCase()}${u.pathname.replace(/\\/$/, "")}`; } catch { return String(url || "").toLowerCase(); } }
function absolute(href, base) { try { return new URL(href, base).href; } catch { return ""; } }
function decodeHref(href) { return String(href || "").replace(/&amp;/g, "&").replace(/\\\\u0026/g, "&"); }
function extractLinks(html, base) {
  const out = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    const url = absolute(decodeHref(m[1]), base);
    const text = clean(m[2]);
    if (!validUrl(url) || !text) continue;
    if (NOISE_RE.test(`${text} ${url}`)) continue;
    if (!out.some(x => key(x.url) === key(url))) out.push({ url, text });
  }
  return out;
}
function titleFrom(html, fallback) { const m = html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i); return clean(m ? m[1] : fallback); }
function meta(html, name) { const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"); const m = html.match(re); return clean(m ? m[1] : ""); }
function interestTerms(interests) { return (interests.length ? interests : DEFAULT_INTERESTS).flatMap(x => String(x).split(/[,;]+/).map(y => y.trim()).filter(Boolean)); }
function querySet(interests, city, state) {
  const terms = interestTerms(interests);
  const places = [`"${city}" "${state}"`, `"Trumbull County" Ohio`, `"Warren" Ohio`, `"Northeast Ohio"`, `"Geauga County" Ohio`, `"Portage County" Ohio`, `"Ashtabula County" Ohio`, `"Mahoning County" Ohio`];
  const queries = [];
  // Interleave interests and places so the first few searches cannot be dominated by
  // the first three default interests. Keep the pass bounded for Cloudflare subrequest limits.
  const selectedTerms = terms.slice(0, 8);
  for (let i = 0; i < selectedTerms.length && queries.length < 12; i++) {
    const term = selectedTerms[i];
    const place = places[i % places.length];
    queries.push(`${place} "${term}" (${GROUP_TYPES.slice(0, 8).join(" OR ")}) -dance -"ancient Mesopotamia" -"Mesopotamian"`);
  }
  // Add a second regional pass using different places/terms when budget permits.
  for (let i = 0; i < Math.min(selectedTerms.length, places.length) && queries.length < 12; i++) {
    const term = selectedTerms[(i + 3) % selectedTerms.length];
    const place = places[(i + 3) % places.length];
    const q = `${place} "${term}" organization Ohio -dance -"ancient Mesopotamia" -"Mesopotamian"`;
    if (!queries.includes(q)) queries.push(q);
  }
  return queries;
}
async function search(query, budget) {
  if (budget.used >= budget.limit) return { urls: [], error: "fetch budget exhausted" };
  budget.used++;
  try {
    const u = new URL("https://www.bing.com/search"); u.searchParams.set("q", query); u.searchParams.set("count", "10");
    const r = await fetch(u.href, { redirect: "follow", headers: { "User-Agent": "Opportunity-Finder/3.11-organic", Accept: "text/html,application/xhtml+xml" } });
    const html = await r.text();
    if (!r.ok) return { urls: [], status: r.status };
    return { urls: extractLinks(html, u.href), status: r.status };
  } catch (e) { return { urls: [], error: String(e?.message || e) }; }
}
async function fetchPage(url, budget) {
  if (budget.used >= budget.limit) return null;
  budget.used++;
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Opportunity-Finder/3.11-organic", Accept: "text/html,application/xhtml+xml" } });
    if (!r.ok) return null;
    const html = await r.text();
    return { url: r.url || url, html, title: titleFrom(html, url), description: meta(html, "description") || meta(html, "og:description") };
  } catch { return null; }
}
function scoreCandidate(c, interests, city, state) {
  const text = `${c.text} ${c.url}`.toLowerCase(); let score = 0;
  if (ORG_RE.test(text)) score += 25;
  if (LOCAL_RE.test(text)) score += 18;
  if (city && text.includes(city.toLowerCase())) score += 12;
  if (state && text.includes(state.toLowerCase())) score += 8;
  for (const term of interestTerms(interests)) if (text.includes(term.toLowerCase())) score += 10;
  if (DANCE_RE.test(text)) score -= 100;
  if (NOISE_RE.test(text)) score -= 100;
  return score;
}
function isOrganization(page, interests, city, state) {
  const text = `${page.title} ${page.description} ${page.html.slice(0, 50000)}`;
  if (DANCE_RE.test(text) || NOISE_RE.test(text)) return false;
  if (DIAGNOSTIC_SEED_HOST_RE.test(host(page.url))) return false;
  const local = LOCAL_RE.test(text) || text.toLowerCase().includes(city.toLowerCase());
  const org = ORG_RE.test(text) || interestTerms(interests).some(x => text.toLowerCase().includes(x.toLowerCase()));
  return local && org;
}
function makeGroup(page, interests, city, state) {
  const text = clean(page.html.slice(0, 12000));
  const description = page.description || text.slice(0, 300);
  return { title: page.title || host(page.url), name: page.title || host(page.url), url: page.url, link: page.url, description, location: `${city}, ${state}`, source: "organic-search", discoverySource: "organic-search", relevance: scoreCandidate({ text: `${page.title} ${page.description}`, url: page.url }, interests, city, state) };
}
function eventLinks(page) {
  return extractLinks(page.html, page.url).filter(x => EVENT_RE.test(`${x.text} ${x.url}`)).slice(0, 4);
}
async function discoverGroups(interests, city, state, budget) {
  const diagnostics = []; const candidates = new Map();
  for (const query of querySet(interests, city, state)) {
    const r = await search(query, budget); diagnostics.push({ stage: "organic-group-search", query, candidates: r.urls.length, status: r.status || 0, error: r.error || null });
    for (const c of r.urls) { if (scoreCandidate(c, interests, city, state) <= 0) continue; candidates.set(key(c.url), c); }
    if (budget.used >= budget.limit) break;
  }
  const ranked = [...candidates.values()].sort((a, b) => scoreCandidate(b, interests, city, state) - scoreCandidate(a, interests, city, state)).slice(0, 12);
  const groups = [];
  for (const candidate of ranked) {
    const page = await fetchPage(candidate.url, budget); if (!page || !isOrganization(page, interests, city, state)) continue;
    const item = makeGroup(page, interests, city, state);
    if (!groups.some(x => host(x.url) === host(item.url))) groups.push(item);
    if (groups.length >= 8 || budget.used >= budget.limit) break;
  }
  return { groups, diagnostics, candidateCount: candidates.size };
}
async function discoverEvents(groups, interests, city, state, budget) {
  const events = []; const diagnostics = [];
  for (const group of groups.slice(0, 8)) {
    const page = await fetchPage(group.url, budget); if (!page) continue;
    const links = eventLinks(page);
    diagnostics.push({ stage: "organic-event-links", organization: group.title, candidates: links.length });
    for (const link of links) {
      if (DANCE_RE.test(`${link.text} ${link.url}`) || NOISE_RE.test(`${link.text} ${link.url}`)) continue;
      events.push({ title: link.text, name: link.text, url: link.url, link: link.url, organization: group.title, location: `${city}, ${state}`, source: "organic-organization-site", description: `Discovered from ${group.title}` });
      if (events.length >= 8) return { events, diagnostics };
    }
    if (budget.used >= budget.limit) break;
  }
  return { events, diagnostics };
}
export async function organicDiscover(interests, city, state, radius = 75) {
  const budget = { used: 0, limit: 44 }; const started = Date.now();
  const groupResult = await discoverGroups(interests, city, state, budget);
  const eventResult = await discoverEvents(groupResult.groups, interests, city, state, budget);
  return { ok: true, version: "3.11.0", build: "v3.11.0-organic-diverse", groups: groupResult.groups, events: eventResult.events, jobs: [], fetchBudget: { used: budget.used, limit: budget.limit }, coverage: { radius, organicGroups: groupResult.groups.length, organicEvents: eventResult.events.length, candidateCount: groupResult.candidateCount }, diagnostics: [...groupResult.diagnostics, ...eventResult.diagnostics], durationMs: Date.now() - started };
}
