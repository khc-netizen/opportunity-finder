import { parseJobs } from './index.js';
import { HOME_ZIP, eligibleZips, passesHardZipGate, bestLocation } from './zip-geo.js';

const DANCE_RE = /\bdance\b|dancing|ballroom|ballet|tap dance|jazz dance|dance studio|dance academy/i;
const AMISH_RE = /\bamish\b|\bamish[- ]owned\b|\bamish[- ]run\b/i;
const JOB_SIGNAL_RE = /\b(?:job|jobs|career|careers|employment|hiring|position|apply|application|work with us|join our team|openings?|vacanc(?:y|ies)|technician|welder|welding|fabricat|mechanic|warehouse|laborer|parks|grounds|recreation|museum|archaeology|custod|maintenance|delivery|transportation|library|groundskeeper|facility)\b/i;
const JUNK_HOST_RE = /(?:facebook|instagram|linkedin|youtube|tiktok|pinterest|x\.com|twitter|wikipedia|yelp|tripadvisor|google|googleusercontent|googleapis|accounts|drive|zillow|realtor|redfin|trulia)\./i;
const CONTENT_HOST_RE = /(?:indeed|glassdoor|ziprecruiter|simplyhired|monster)\./i;
const NOISE_RE = /ancient mesopotamia|mesopotamian|mesopotamia river|louisiana|church point/i;
const OUTSIDE_STATE_RE = /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new jersey|new mexico|new york|north carolina|north dakota|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NJ|NM|NY|NC|ND|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b)/i;
const OH_RE = /\b(?:ohio|OH)\b/i;

function clean(s) { return String(s || '').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'").replace(/\s+/g,' ').trim(); }
function host(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } }
function urlKey(url) { try { const u = new URL(url); return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/,'')}`; } catch { return String(url || '').toLowerCase(); } }
function validCandidateUrl(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) && !JUNK_HOST_RE.test(u.hostname); } catch { return false; } }
function decodeSearchUrl(href) { try { const u = new URL(href); if (!/(^|\.)bing\.com$/i.test(u.hostname) || !/^\/ck\/a/i.test(u.pathname)) return href; let raw = u.searchParams.get('u') || ''; if (!raw) return href; if (raw.startsWith('a1')) raw = raw.slice(2); raw = raw.replace(/-/g,'+').replace(/_/g,'/'); while (raw.length % 4) raw += '='; const decoded = atob(raw); return /^https?:\/\//i.test(decoded) ? decoded : href; } catch { return href; } }
function extractSearchResults(html) {
  const out = [], seen = new Set();
  const blocks = [...html.matchAll(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].map(m => m[1]);
  for (const block of blocks) {
    const m = block.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    const url = decodeSearchUrl(m[1]), text = clean(m[2]), evidence = clean(block);
    if (!validCandidateUrl(url) || !text || seen.has(urlKey(url))) continue;
    seen.add(urlKey(url)); out.push({ url, text, title:text, evidence, snippet:evidence });
  }
  if (!out.length) for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeSearchUrl(m[1]), text = clean(m[2]);
    if (!validCandidateUrl(url) || !text || seen.has(urlKey(url))) continue;
    seen.add(urlKey(url)); out.push({ url, text, title:text, evidence:text, snippet:text });
    if (out.length >= 12) break;
  }
  return out.slice(0,12);
}
async function search(query, budget) {
  if (budget.used >= budget.limit) return { urls: [], error: 'fetch budget exhausted' };
  budget.used++;
  try { const u = new URL('https://www.bing.com/search'); u.searchParams.set('q', query); u.searchParams.set('count','10'); const r = await fetch(u.href,{redirect:'follow',headers:{'User-Agent':'Opportunity-Finder/3.14-jobs-evidence','Accept':'text/html,application/xhtml+xml'}}); const html = await r.text(); if (!r.ok) return { urls:[],status:r.status }; return { urls:extractSearchResults(html),status:r.status }; }
  catch (e) { return { urls:[],error:String(e?.message || e) }; }
}
async function fetchCandidate(url,budget) { if (budget.used >= budget.limit) return null; budget.used++; try { const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Opportunity-Finder/3.14-jobs-evidence','Accept':'text/html,application/xhtml+xml,application/json,text/xml,*/*'}}); if(!r.ok)return null; return {url:r.url||url,text:await r.text(),status:r.status}; } catch { return null; } }
function buildQueries(interests,radius) {
  const zips=eligibleZips(radius).slice(0,12);
  const terms=(interests.length?interests:['maintenance','welding fabrication','mechanic technician','warehouse material handling','parks recreation grounds','museum library history','custodial facilities','delivery transportation']).slice(0,8);
  const queries=[];
  for(let i=0;i<terms.length;i++){const z=zips[i%zips.length];queries.push(`"${z.zip}" "${z.city}" Ohio "${terms[i]}" (jobs OR careers OR employment OR hiring) -dance -amish`);}
  return [...new Set(queries)];
}
function candidatePassesGate(candidate,radius) {
  const evidence=`${candidate.url} ${candidate.text||''} ${candidate.title||''} ${candidate.evidence||''} ${candidate.query||''}`;
  if(DANCE_RE.test(evidence)||AMISH_RE.test(evidence)||NOISE_RE.test(evidence)) return {ok:false,reason:DANCE_RE.test(evidence)?'dance exclusion':AMISH_RE.test(evidence)?'Amish employer exclusion':'search noise'};
  if(OUTSIDE_STATE_RE.test(evidence)&&!OH_RE.test(evidence)) return {ok:false,reason:'outside-state evidence'};
  if(CONTENT_HOST_RE.test(host(candidate.url))&&!JOB_SIGNAL_RE.test(evidence)) return {ok:false,reason:'non-job content host without job signal'};
  if(!JOB_SIGNAL_RE.test(evidence)) return {ok:false,reason:'no job signal in search result'};
  const location=bestLocation(evidence,radius);
  if(!location||!passesHardZipGate(evidence,radius)) return {ok:false,reason:'hard ZIP gate failed before fetch'};
  return {ok:true,location};
}

export async function discoverJobsZipFirst(interests=[],city='Mesopotamia',state='OH',radius=30,partTime=true,env={}) {
  const budget={used:0,limit:Math.min(44,Number(env?.DISCOVERY_FETCH_LIMIT||44))};
  const diagnostics=[],items=[],seen=new Set(),queries=buildQueries(interests,radius);
  for(const query of queries){if(budget.used>=budget.limit)break;const r=await search(query,budget);diagnostics.push({stage:'job-search',query,ok:r.status===200,status:r.status||0,candidates:r.urls.length,error:r.error||null});for(const c0 of r.urls){if(budget.used>=budget.limit)break;if(seen.has(urlKey(c0.url)))continue;seen.add(urlKey(c0.url));const candidate={...c0,query};const gate=candidatePassesGate(candidate,radius);diagnostics.push({stage:'job-prefetch-zip-gate',url:c0.url,accepted:gate.ok,rejected:gate.ok?null:gate.reason,zip:gate.location?.zip||null,distanceMiles:gate.location?.distance??null,geoEvidence:`${c0.title||''} ${c0.evidence||''} ${query}`});if(!gate.ok)continue;const page=await fetchCandidate(c0.url,budget);if(!page){diagnostics.push({stage:'job-validation',url:c0.url,ok:false,rejected:'fetch failed after ZIP gate'});continue;}const found=parseJobs(page.text,page.url,interests,city,state,radius,{source:'validated job page',partTime});const enriched=found.map(x=>({...x,zip:x.zip||gate.location.zip,city:x.city||gate.location.city,state:x.state||state,distanceMiles:x.distanceMiles??gate.location.distance,distance:x.distance??gate.location.distance}));diagnostics.push({stage:'job-validation',url:c0.url,ok:true,accepted:enriched.length,rejected:enriched.length?'':'no validated local job posting'});items.push(...enriched);}}
  const unique=[],keys=new Set();for(const item of items){const k=`${String(item.title||'').toLowerCase()}|${String(item.url||'').toLowerCase()}`;if(keys.has(k))continue;keys.add(k);unique.push(item);}return {ok:true,version:'3.14.0',build:'v3.14.0-search-evidence-gates',city,state,radius,partTime,homeZip:HOME_ZIP,zipFirst:true,queries,counts:{jobs:unique.length},items:unique,jobs:unique,fetchBudget:budget,diagnostics};
}
