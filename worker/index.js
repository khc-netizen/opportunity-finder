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

const VERSION = "3.9.8";
const BUILD = "v3.9.14-final-filter";
const SEARCH_LIMIT = 10;
const ORG_DISCOVERY_QUERY_LIMIT = 8;
const ORG_VALIDATION_LIMIT = 10;
const VENUE_DISCOVERY_QUERY_LIMIT = 2;
const VENUE_VALIDATION_LIMIT = 2;
const SAFE_FETCH_LIMIT = 44;
const EVENT_FETCH_LIMIT = 8;
const USA_DISCOVERY_ANCHOR_LIMIT = 6;
const USA_DISCOVERY_QUERY_LIMIT = 5;
const JOB_WEB_VALIDATION_LIMIT = 1;
const PAGE_LIMIT = 72;

const DANCE_RE = /\b(?:dance|dancing|ballroom|ballet|tap|jazz dance|line dance|square dance|contra dance|salsa|zumba)\b/i;
const ORG_DANCE_RE = /\b(?:dance studio|dance school|dance academy|dance company|ballet school|ballroom studio)\b/i;
const JUNK_HOST_RE = /(?:facebook\.com|instagram\.com|youtube\.com|pinterest\.com|wikipedia\.org|tripadvisor\.com|yelp\.com|mapquest\.com|yellowpages\.com|newsbreak\.com)$/i;
const LOW_VALUE_HOST_RE = /(?:merriam-webster\.com|dictionary\.com|thesaurus\.com)$/i;
const LOW_VALUE_PATH_RE = /\/(?:dictionary|definition|meaning|what-is|types-of|how-to|glossary)(?:\/|$)/i;
const JOB_JUNK_HOST_RE = /(?:zillow\.com|realtor\.com|redfin\.com|trulia\.com|pinterest\.com|wikipedia\.org|newsbreak\.com|merriam-webster\.com|alamy\.com|shutterstock\.com|istockphoto\.com|dreamstime\.com|smallbiztrends\.com|theengineerspost\.com|branchspot\.com)$/i;
const FOREIGN_GOV_HOST_RE = /(?:\.gov\.(?!us$)|\.gob\.|\.gov\.(?:uk|au|ca|nz)$)/i;
const ARTICLE_RE = /\b(?:article|blog|news|definition|dictionary|what is|types of|how to|explainer|meaning)\b/i;
const AMISH_RE = /\b(?:amish|mennonite)\b/i;
const CAREER_RE = /\b(?:job|jobs|career|careers|employment|hiring|position|apply|opening|openings|vacancy|vacancies)\b/i;
const ORG_RE = /\b(?:association|society|museum|library|guild|club|chapter|organization|organization|shire|sca|blacksmith|beekeep|reenact|history|historical|heritage|preservation|nature|conservation|arboretum|observatory|community|farm|homestead|park|volunteer)\b/i;
const ORG_IDENTITY_RE = /\b(?:association|society|museum|library|guild|club|chapter|organization|historical|heritage|preservation|nature center|conservation|arboretum|observatory|community center|farm|homestead|park|volunteer)\b/i;
const VENUE_RE = /\b(?:museum|library|historic site|nature center|fairgrounds|observatory|community center|park|farm|homestead)\b/i;
const EVENT_RE = /\b(?:event|events|calendar|meeting|meetings|workshop|workshops|program|programs|festival|fair|lecture|tour|exhibit|class|classes|open house|sale|market)\b/i;
const LOCAL_REGION_RE = /\b(?:ohio|oh|trumbull county|trumbull|warren|northeast ohio|geauga county|geauga|portage county|portage|ashtabula county|ashtabula|mahoning county|mahoning|columbiana county|columbiana|summit county|summit|lake county|lake|cuyahoga county|cuyahoga)\b/i;
const DISCOVERY_SIGNAL_RE = /\b(?:association|society|museum|library|guild|club|chapter|shire|sca|blacksmith|blacksmiths|beekeep|beekeepers|reenact|history|historical|heritage|preservation|nature|conservation|arboretum|observatory|community|farm|homestead|park|volunteer|events|calendar|meetings|workshop|program|festival|fair|lecture|tour|exhibit|class|jobs|career|employment|hiring|position|apply|technician|welder|welding|fabricat|mechanic|warehouse|laborer|maintenance|delivery|transportation)\b/i;
const JOB_SIGNAL_RE = /\b(?:job|jobs|career|careers|employment|hiring|position|apply|work|technician|welder|welding|fabricat|mechanic|warehouse|laborer|parks|grounds|recreation|museum|archaeology|custod|maintenance|delivery|transportation)\b/i;

function sameHost(a, b) { try { return host(a) === host(b); } catch { return false; } }

function targetPlaces(city, state) {
  if (/^(OH|Ohio)$/i.test(state)) return [
    `"${city}" "Trumbull County" Ohio`, `"Trumbull County" Ohio`, `"Warren" "Trumbull County" Ohio`, `"Northeast Ohio"`, `"Geauga County" Ohio`, `"Portage County" Ohio`, `"Ashtabula County" Ohio`, `"Mahoning County" Ohio`
  ];
  return [`"${city}" "${state}"`, `"${state}"`];
}
function localSearchSuffix(state) {
  return /^(OH|Ohio)$/i.test(state) ? ` -dance -"ancient Mesopotamia" -"Mesopotamia historical region" -Louisiana -"Church Point"` : "";
}
function interestBase(interests) {
  return interests.length ? interests.slice(0, 8) : ["local history", "museums", "historical societies", "beekeeping", "blacksmithing", "reenactment", "living history", "SCA", "Society for Creative Anachronism", "shire", "guilds", "nature conservation", "astronomy", "cycling trails", "gardening horticulture", "traditional crafts", "sportsmen"];
}
function buildOrgQueries(interests, city, state) {
  const places = targetPlaces(city, state), cats = interestBase(interests), qs = [];
  for (let i = 0; i < Math.min(10, cats.length); i++) {
    const p = places[i % places.length];
    const suffix = localSearchSuffix(state);
    qs.push(`"${cats[i]}" ${p} (association OR society OR club OR guild OR chapter OR organization)${suffix}`);
    if (i < 5) qs.push(`${p} ("historical society" OR museum OR "nature center" OR beekeepers OR blacksmith OR reenactment OR "craft guild")${suffix}`);
  }
  return [...new Set(qs)].slice(0, ORG_DISCOVERY_QUERY_LIMIT);
}
function buildVenueQueries(interests, city, state) {
  const places = targetPlaces(city, state), cats = interestBase(interests), qs = [];
  for (let i = 0; i < Math.min(6, cats.length); i++) {
    const p = places[i % places.length];
    qs.push(`${p} "${cats[i]}" (museum OR library OR "historic site" OR "nature center" OR fairgrounds OR observatory OR "community center")${localSearchSuffix(state)}`);
  }
  return [...new Set(qs)].slice(0, 6);
}
function buildEventQueries(org, interests, city, state) {
  const p = targetPlaces(city, state)[0];
  const q = [`"${org.name}" (events OR calendar OR meetings OR workshops OR programs)`, `"${org.name}" events`, `"${org.name}" calendar`];
  if (interests.length) q.push(`"${org.name}" "${interests[0]}"`);
  return q.map(x => `${x} ${p} -dance`).slice(0, 4);
}

// ...existing implementation continues unchanged...
