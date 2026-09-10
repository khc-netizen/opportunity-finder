// User-configurable exclusions. The UI sends comma-separated terms per category.
export const DEFAULT_EXCLUSIONS = { global: [], groups: [], events: [], jobs: [] };

function list(value) {
  return String(value || '').split(/[,;\n]+/).map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 40);
}

export function parseExclusions(params) {
  return {
    global: list(params?.get('exclude') || params?.get('excludeGlobal')),
    groups: list(params?.get('excludeGroups')),
    events: list(params?.get('excludeEvents')),
    jobs: list(params?.get('excludeJobs'))
  };
}

export function exclusionText(exclusions, type) {
  const values = [...new Set([...(exclusions?.global || []), ...(exclusions?.[type] || [])])];
  return values;
}

export function isExcluded(text, exclusions, type) {
  const haystack = String(text || '').toLowerCase();
  return exclusionText(exclusions, type).some(term => haystack.includes(term));
}

export function exclusionQuery(exclusions, type) {
  return exclusionText(exclusions, type).map(term => `-${JSON.stringify(term)}`).join(' ');
}
