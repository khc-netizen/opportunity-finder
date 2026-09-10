import baseWorker from "./index.js";

// The first pass remains interest-led. When it is sparse, the second pass is
// deliberately independent: it searches by regional community hubs and then lets
// the base worker apply the same geographic, dance, and quality validation.
const GROUP_REGIONAL_LENS = [
  "community organizations Warren Ohio",
  "historical societies Cortland Ohio",
  "museums Garrettsville Ohio",
  "nature conservation Middlefield Ohio",
  "traditional crafts Burton Ohio",
  "archaeology Chardon Ohio",
  "volunteer groups Kent Ohio",
  "gardening clubs Ravenna Ohio"
];

const EVENT_REGIONAL_LENS = [
  "community events Warren Ohio",
  "history events Cortland Ohio",
  "museum programs Garrettsville Ohio",
  "nature events Middlefield Ohio",
  "craft workshops Burton Ohio",
  "archaeology events Chardon Ohio",
  "volunteer events Kent Ohio",
  "gardening events Ravenna Ohio"
];

async function jsonResponse(response) {
  const text = await response.text();
  try { return { response, data: JSON.parse(text) }; }
  catch { return { response, data: null }; }
}

function uniqueItems(items = []) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${String(item?.title || item?.name || "").toLowerCase()}|${String(item?.url || item?.link || "").toLowerCase()}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withLens(request, lens) {
  const u = new URL(request.url);
  u.searchParams.set("interests", lens.join(","));
  return new Request(u, request);
}

async function adaptive(request, env, ctx, field, lens, minimum, maxPrimaryFetches = Infinity) {
  const first = await jsonResponse(await baseWorker.fetch(request, env, ctx));
  if (!first.data || !Array.isArray(first.data[field]) || first.data[field].length >= minimum) return first.response;

  const primaryUsed = Number(first.data?.fetchBudget?.used ?? Infinity);
  if (primaryUsed > maxPrimaryFetches) return first.response;

  const second = await jsonResponse(await baseWorker.fetch(withLens(request, lens), env, ctx));
  if (!second.data || !Array.isArray(second.data[field])) return first.response;

  const merged = uniqueItems([...first.data[field], ...second.data[field]]);
  const result = {
    ...first.data,
    [field]: merged,
    items: field === "groups" || field === "events" ? merged : first.data.items,
    coverage: {
      ...(first.data.coverage || {}),
      adaptiveLens: true,
      lens,
      primaryCount: first.data[field].length,
      supplementalCount: second.data[field].length,
      mergedCount: merged.length,
      primaryFetches: primaryUsed,
      supplementalFetches: second.data?.fetchBudget?.used ?? null
    }
  };
  return new Response(JSON.stringify(result, null, 2), {
    status: first.response.status,
    headers: first.response.headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/groups") return adaptive(request, env, ctx, "groups", GROUP_REGIONAL_LENS, 6, 22);
    if (url.pathname === "/events") return adaptive(request, env, ctx, "events", EVENT_REGIONAL_LENS, 8, 22);
    // Jobs use ~38/44 fetches, so a second full pass is intentionally disabled.
    if (url.pathname === "/jobs") return baseWorker.fetch(request, env, ctx);
    // The combined endpoint must stay within the shared subrequest ceiling.
    if (url.pathname === "/discover") return baseWorker.fetch(request, env, ctx);
    return baseWorker.fetch(request, env, ctx);
  }
};
