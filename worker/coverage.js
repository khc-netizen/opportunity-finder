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

function withLens(request, lens) {
  const u = new URL(request.url);
  const original = u.searchParams.get("interests") || "";
  const combined = [...original.split(",").map(x => x.trim()).filter(Boolean), ...lens];
  u.searchParams.set("interests", [...new Set(combined)].join(","));
  return new Request(u, request);
}

async function adaptive(request, field, lens, minimum) {
  const first = await jsonResponse(await baseWorker.fetch(request));
  if (!first.data || !Array.isArray(first.data[field]) || first.data[field].length >= minimum) return first.response;

  const second = await jsonResponse(await baseWorker.fetch(withLens(request, lens)));
  if (!second.data || !Array.isArray(second.data[field])) return first.response;

  const merged = uniqueItems([...first.data[field], ...second.data[field]]);
  const result = {
    ...first.data,
    [field]: merged,
    items: field === "groups" || field === "events" ? merged : first.data.items,
    coverage: {
      ...(first.data.coverage || {}),
      adaptiveLens: true,
      primaryCount: first.data[field].length,
      supplementalCount: second.data[field].length,
      mergedCount: merged.length
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
    if (url.pathname === "/groups") return adaptive(request, "groups", GROUP_LENS, 6);
    if (url.pathname === "/events") return adaptive(request, "events", EVENT_LENS, 8);
    if (url.pathname === "/jobs") return adaptive(request, "items", JOB_LENS, 6);
    if (url.pathname === "/discover") {
      const first = await jsonResponse(await baseWorker.fetch(request));
      if (!first.data) return first.response;
      let result = first.data;
      if (Array.isArray(first.data.groups) && first.data.groups.length < 6) {
        const supplemental = await jsonResponse(await baseWorker.fetch(withLens(request, GROUP_LENS)));
        if (Array.isArray(supplemental.data?.groups)) result.groups = uniqueItems([...first.data.groups, ...supplemental.data.groups]);
      }
      if (Array.isArray(first.data.events) && first.data.events.length < 8) {
        const supplemental = await jsonResponse(await baseWorker.fetch(withLens(request, EVENT_LENS)));
        if (Array.isArray(supplemental.data?.events)) result.events = uniqueItems([...first.data.events, ...supplemental.data.events]);
      }
      return new Response(JSON.stringify({ ...result, coverage: { adaptiveLens: true } }, null, 2), {
        status: first.response.status,
        headers: first.response.headers
      });
    }
    return baseWorker.fetch(request, env, ctx);
  }
};
