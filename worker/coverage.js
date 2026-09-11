import baseWorker from './index.js';
import { discoverAll } from './discovery-v2.js';
import { diagnoseKnownLocalSources } from './discovery-anchors.js';
import { HOME_ZIP, eligibleZips, enrichLocation } from './zip-geo.js';

// Keep the diagnostic identity explicit so /test cannot look like an older
// deployment simply because an old application release string survived.
const RELEASE = '3.20.0';
const RELEASE_BUILD = 'v3.20.0-deployment-identity';
const RELEASE_FINGERPRINT = '778c512db374c7f7d5edb319cde7526fba189e90';

function params(request) {
  const u = new URL(request.url), q = u.searchParams;
  const interests = String(q.get('interests') || '').split(',').map(x => x.trim()).filter(Boolean);
  const city = q.get('city') || 'Mesopotamia';
  const state = q.get('state') || 'OH';
  const legacy = Number(q.get('radius') || 30);
  const groupRadius = Number(q.get('groupRadius') || legacy);
  const eventRadius = Number(q.get('eventRadius') || legacy);
  const jobRadius = Number(q.get('jobRadius') || 15);
  const partTime = q.get('partTime') !== 'false';
  return { interests, city, state, groupRadius, eventRadius, jobRadius, partTime, searchParams:q };
}
function json(data) { return new Response(JSON.stringify(data,null,2),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}}); }
function strictResults(items,radius){
  return (items||[]).map(item => enrichLocation(item,radius)).filter(Boolean);
}
function release(data,p) {
  const groups = strictResults(data.groups,p.groupRadius);
  const events = strictResults(data.events,p.eventRadius);
  const jobs = strictResults(data.jobs,p.jobRadius);
  return {
    ...data,
    groups,
    events,
    jobs,
    deployment:{
      version:RELEASE,
      build:RELEASE_BUILD,
      sourceCommit:RELEASE_FINGERPRINT,
      entrypoint:'worker/coverage.js'
    },
    coverage:{
      ...(data.coverage||{}),
      strictOutputAddressGate:true,
      deploymentIdentity:'source-commit-pinned'
    }
  };
}
async function run(request) {
  const p=params(request);
  const raw=await discoverAll(p);
  const result=release(raw,p);
  const anchorDiagnostics=diagnoseKnownLocalSources(result);
  return {
    ok:true,
    version:RELEASE,
    build:RELEASE_BUILD,
    architecture:'organization-first / broader organic-first / diagnostic regression fixtures / strict final physical-address gate / independent ZIP radii / configurable exclusions / ranked search evidence',
    ...result,
    diagnostics:[...(result.diagnostics||[]),...anchorDiagnostics]
  };
}

export default { async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname==='/test') return json(await run(request));
  if(url.pathname==='/groups'||url.pathname==='/events'||url.pathname==='/jobs'||url.pathname==='/discover'){
    const result=await run(request);
    if(url.pathname==='/groups') return json({...result,items:result.groups,events:undefined,jobs:undefined});
    if(url.pathname==='/events') return json({...result,items:result.events,groups:undefined,jobs:undefined});
    if(url.pathname==='/jobs') return json({...result,items:result.jobs,groups:undefined,events:undefined});
    return json(result);
  }
  return baseWorker.fetch(request,env);
} };