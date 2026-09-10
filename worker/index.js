const VERSION = '3.11.6';
const BUILD = 'v3.11.6-prefetch-state-filter';
const FETCH_LIMIT = 44;
const JOB_LIMIT = 20;
const DANCE_RE = /\bdance\b|dancing|ballroom|ballet|tap dance|jazz dance|dance studio|dance academy/i;
const AMISH_RE = /\bamish\b|\bamish[- ]owned\b|\bamish[- ]run\b/i;
const JUNK_HOST_RE = /(?:facebook|instagram|linkedin|youtube|tiktok|pinterest|wikipedia|yelp|tripadvisor|google|googleusercontent|googleapis|accounts)\./i;
const JOB_JUNK_HOST_RE = /(?:zillow\.com|realtor\.com|redfin\.com|trulia\.com|pinterest\.com|wikipedia\.org|newsbreak\.com|merriam-webster\.com|alamy\.com|shutterstock\.com|istockphoto\.com|dreamstime\.com)$/i;
const SEARCH_NOISE_RE = /\b(?:ancient mesopotamia|mesopotamian|louisiana|church point)\b/i;
const GENERIC_CONTENT_PATH_RE = /\/(?:story|stories|press|press-release|opinion|blog|podcast|dictionary|definition|encyclopedia|faq|how-to)(?:[/?#]|$)/i;
const CAREER_RE = /(?:career|careers|jobs|employment|work with us|join our team|job openings|opportunities|hiring|position|apply)/i;

function clean(s) { return String(s || '').replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'\"').replace(/&#39;|&#x27;/gi,\"'\").replace(/\\s+/g,' ').trim(); }
function json(data, status=200) { return new Response(JSON.stringify(data,null,2), {status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS'}}); }
function host(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function norm(s) { return String(s||'').toLowerCase().replace(/https?:\\/\\//g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function split(s) { return String(s||'').split(',').map(x=>x.trim()).filter(Boolean); }

// Explicit state/city tokens are checked before any network fetch. Abbreviations are only
// treated as state evidence when separated from surrounding URL text, avoiding false hits
// such as the letters "pa" inside ordinary domain names.
const OUTSIDE_STATES = {
  AL:'alabama', AK:'alaska', AZ:'arizona', AR:'arkansas', CA:'california', CO:'colorado', CT:'connecticut', DE:'delaware', FL:'florida', GA:'georgia', HI:'hawaii', ID:'idaho', IL:'illinois', IN:'indiana', IA:'iowa', KS:'kansas', KY:'kentucky', LA:'louisiana', ME:'maine', MD:'maryland', MA:'massachusetts', MI:'michigan', MN:'minnesota', MS:'mississippi', MO:'missouri', MT:'montana', NE:'nebraska', NV:'nevada', NH:'new hampshire', NJ:'new jersey', NM:'new mexico', NY:'new york', NC:'north carolina', ND:'north dakota', OK:'oklahoma', OR:'oregon', PA:'pennsylvania', RI:'rhode island', SC:'south carolina', SD:'south dakota', TN:'tennessee', TX:'texas', UT:'utah', VT:'vermont', VA:'virginia', WA:'washington', WV:'west virginia', WI:'wisconsin', WY:'wyoming'
};
function explicitStateToken(text, abbr, full) {
  const t = norm(text);
  const fullHit = new RegExp('\\b'+full.replace(/\\s+/g,'\\\\s+')+'\\b','i').test(t);
  const abbrHit = new RegExp('(^|\\s)'+abbr.toLowerCase()+'(\\s|$)','i').test(t);
  return fullHit || abbrHit;
}
function isObviousOutOfState(u, state='OH') {
  if (!/^(OH|Ohio)$/i.test(state)) return false;
  const t = norm(u);
  for (const [abbr, full] of Object.entries(OUTSIDE_STATES)) {
    if (explicitStateToken(t, abbr, full)) return true;
  }
  return false;
}
function acceptJobUrl(u,state) {
  if (!/^https?:$/i.test((()=>{try{return new URL(u).protocol}catch{return ''}})())) return false;
  if (JUNK_HOST_RE.test(host(u)) || JOB_JUNK_HOST_RE.test(host(u))) return false;
  if (SEARCH_NOISE_RE.test(norm(u)) || GENERIC_CONTENT_PATH_RE.test(u)) return false;
  if (isObviousOutOfState(u,state)) return false;
  return CAREER_RE.test(norm(u)) || /(?:jobs?|careers?|employment|hiring|apply|openings?|vacanc(?:y|ies)|positions?)/i.test(norm(u));
}
function decodeSearchUrl(href) {
  try {
    const u=new URL(href);
    if (!/(^|\\.)bing\\.com$/i.test(u.hostname) || !/^\\/ck\\/a/i.test(u.pathname)) return href;
    let raw=u.searchParams.get('u'); if(!raw) return href;
    if(raw.startsWith('a1')) raw=raw.slice(2);
    raw=raw.replace(/-/g,'+').replace(/_/g,'/'); while(raw.length%4) raw+='=';
    const d=atob(raw); return /^https?:\\/\\//i.test(d)?d:decodeURIComponent(d);
  } catch { return href; }
}
async function fetchText(url,budget) {
  if(budget.used>=budget.limit) return {ok:false,status:0,text:'',error:'fetch budget exhausted',bytes:0};
  budget.used++;
  try { const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':`Opportunity-Finder/${VERSION}`,'Accept':'text/html,application/xhtml+xml,application/json,text/xml,*/*'}}); const text=await r.text(); return {ok:r.ok,status:r.status,text,bytes:text.length}; }
  catch(e){return {ok:false,status:0,text:'',error:e?.message||String(e),bytes:0};}
}
async function searchWeb(query,budget) {
  const u=new URL('https://www.bing.com/search'); u.searchParams.set('q',query); u.searchParams.set('count','10');
  const r=await fetchText(u.href,budget); if(!r.ok)return {...r,urls:[]};
  const urls=[]; const add=href=>{href=decodeSearchUrl(clean(href)); try{const x=new URL(href); if(!/^https?:$/.test(x.protocol)||JUNK_HOST_RE.test(x.hostname))return; if(!urls.includes(x.href))urls.push(x.href);}catch{}};
  for(const m of r.text.matchAll(/<li[^>]+class=[\"'][^\"']*b_algo[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/li>/gi)){const a=m[1].match(/<h2[^>]*>\\s*<a[^>]+href=[\"']([^\"']+)[\"']/i);if(a)add(a[1]);if(urls.length>=12)break;}
  if(!urls.length)for(const m of r.text.matchAll(/<a[^>]+href=[\"']([^\"']+)[\"']/gi)){add(m[1]);if(urls.length>=12)break;}
  return {...r,urls};
}
function parseJobPage(html,url,query,city,state,partTime) {
  const text=clean(html); const title=(text.match(/(?:job title|position|opening)[:\\s]+([^\\n|]{5,140})/i)||[])[1]||'';
  const candidate=title||clean((html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)||[])[1]||'').replace(/\\s*[|–—-]\\s*.*/,'');
  const combined=`${candidate} ${text.slice(0,9000)}`;
  if(!candidate || candidate.length<5 || DANCE_RE.test(combined)||AMISH_RE.test(combined))return null;
  if(partTime && !/(part[- ]?time|hourly|\\b(?:15|16|18|20|24|25|30|32)\\s*hours?\\b)/i.test(combined))return null;
  const cityHit=new RegExp('\\b'+String(city).replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'\\b','i').test(combined);
  const stateHit=/\\b(?:ohio|oh)\\b/i.test(combined);
  if(!cityHit && !stateHit)return null;
  return {id:`${candidate.toLowerCase()}|${url}`,title:candidate,organization:'',url,description:text.slice(0,900),location:`${city}, ${state}`,employmentType:/part[- ]?time/i.test(combined)?'Part-time':'',source:'organic job discovery',type:'job',discoveryQuality:'validated',locationScore:cityHit&&stateHit?100:50,query};
}
async function discoverJobs(interests,city,state,radius,partTime,env) {
  const budget={used:0,limit:FETCH_LIMIT}, diagnostics=[], items=[];
  const queries=[
    `\"${city}\" ${state} maintenance technician laborer jobs -dance`,
    `\"${city}\" ${state} welding fabrication mechanic jobs -dance`,
    `\"${city}\" ${state} warehouse material handling jobs -dance`,
    `\"${city}\" ${state} parks grounds recreation jobs -dance`,
    `\"${city}\" ${state} museum archaeology preservation jobs -dance`,
    `\"${city}\" ${state} facility maintenance jobs -dance`
  ];
  for(const query of queries){
    if(budget.used>=budget.limit)break;
    const r=await searchWeb(query,budget); diagnostics.push({stage:'job-search',query,status:r.status,ok:r.ok,candidates:r.urls?.length||0,bytes:r.bytes||0});
    for(const u of (r.urls||[]).slice(0,4)){
      // Critical: reject explicit out-of-state URLs BEFORE fetch. Dunn, NC is therefore
      // discarded without spending a validation request on Indeed (or another host).
      if(!acceptJobUrl(u,state)){diagnostics.push({stage:'job-prefetch-filter',url:u,accepted:false,rejected:'junk, non-job, noise, or explicit out-of-state URL'});continue;}
      if(budget.used>=budget.limit)break;
      const pr=await fetchText(u,budget);
      if(!pr.ok){diagnostics.push({stage:'job-validation',url:u,ok:false,status:pr.status,rejected:pr.error||`HTTP ${pr.status}`});continue;}
      const found=parseJobPage(pr.text,u,query,city,state,partTime);
      diagnostics.push({stage:'job-validation',url:u,ok:true,status:pr.status,accepted:!!found,rejected:found?null:'no validated local job posting'});
      if(found)items.push(found);
    }
  }
  const seen=new Set(); const jobs=items.filter(x=>{const k=`${x.title.toLowerCase()}|${x.url.toLowerCase()}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,JOB_LIMIT);
  return {ok:true,version:VERSION,build:BUILD,city,state,radius,partTime,counts:{jobs:jobs.length},items:jobs,jobs,fetchBudget:budget,diagnostics};
}

export default { async fetch(request,env,ctx) {
  const url=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS'}});
  if(url.pathname==='/jobs'||url.pathname==='/scan'){
    const p=Object.fromEntries(url.searchParams.entries()); const home=String(p.home||'Mesopotamia, OH'); const parts=home.split(',').map(x=>x.trim()); const city=p.city||parts[0]||'Mesopotamia'; const state=p.state||parts[1]||'OH'; const radius=Number(p.radius||30); const interests=split(p.interests); const partTime=p.partTime!=='false'; return json(await discoverJobs(interests,city,state,radius,partTime,env));
  }
  if(url.pathname==='/')return json({ok:true,name:'Opportunity Finder Worker',version:VERSION,build:BUILD,architecture:'job backend with prefetch geographic filtering'});
  if(url.pathname==='/test')return json({ok:true,diagnostic:true,version:VERSION,build:BUILD,prefetchStateFiltering:true});
  if(url.pathname==='/discover'||url.pathname==='/groups'||url.pathname==='/events')return json({ok:true,groups:[],events:[],jobs:[],note:'Organic coverage layer handles organization and event discovery.'});
  return json({ok:false,error:'Not found'},404);
} };
export { isObviousOutOfState, acceptJobUrl, discoverJobs };