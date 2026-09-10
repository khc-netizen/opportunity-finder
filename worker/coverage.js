import baseWorker from "./index.js";

const GROUP_LENS = [
  "local historical societies",
  "museums",
  "nature conservation",
  "traditional crafts",
  "archaeology",
  "community organizations",
  "volunteer groups",
  "gardening clubs"
];

const JOB_LENS = [
  "maintenance",
  "welding fabrication",
  "mechanic technician",
  "parks recreation",
  "museum archaeology",
  "warehouse material handling",
  "grounds laborer",
  "facility technician"
];

const EVENT_LENS = [
  "local history",
  "museum programs",
  "nature conservation",
  "traditional crafts",
  "archaeology",
  "community workshops",
  "heritage events",
  "gardening"
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

// The base worker only consumes the first eight interests. The old coverage layer
// appended its lens after the user's interests, so a six-interest request changed
// only two terms and often produced essentially the same search plan. A supplemental
// pass is intentionally lens-led: it searches a different discovery vocabulary.
function withLens(request, lens) {
  const u = new URL(request.url);
  u.searchParams.set("interests", lens.join(","));
  return new Request(u, request);
}

async function adaptive(request, env, ctx, field, lens, minimum, maxPrimaryFetches = Infinity) {
  const first = await jsonResponse(await baseWorker.fetch(request, env, ctx));
  if (!first.data || !Array.isArray(first.data[field]) || first.data[field].length >= minimum) return first.response;

  // Never launch a second full worker pass when the first pass is already close to
  // the Cloudflare subrequest ceiling. Jobs currently use much more of the budget
  // than groups/events, so this keeps the adaptive layer safe for production.
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
    if (url.pathname === "/groups") return adaptive(request, env, ctx, "groups", GROUP_LENS, 6, 22);
    if (url.pathname === "/events") return adaptive(request, env, ctx, "events", EVENT_LENS, 8, 22);
    // Jobs normally consume ~38/44 fetches on the primary pass, so a second full
    // pass would be unsafe. Job quality is improved in the base worker's candidate
    // filtering rather than by doubling the fetch workload.
    if (url.pathname === "/jobs") return baseWorker.fetch(request, env, ctx);
    if (url.pathname === "/discover") {
      // /discover is a combined endpoint and therefore cannot safely run two full
      // supplemental workers under the shared subrequest ceiling. Keep it on the
      // validated primary worker; category endpoints receive adaptive coverage.
      return baseWorker.fetch(request, env, ctx);
    }
    return baseWorker.fetch(request, env, ctx);
  }
};
