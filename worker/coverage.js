import baseWorker from './index.js';
import { discoverAll } from './discovery-v2.js';
import { diagnoseKnownLocalSources } from './discovery-anchors.js';
import { HOME_ZIP, eligibleZips } from './zip-geo.js';

const RELEASE = '3.18.0';
const RELEASE_BUILD = 'v3.18.0-organic-discovery-cleanup';
const RELEASE_FINGERPRINT = 'organic-discovery-cleanup-44439-2026-09-10';

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
function release(data) { return {...data,deployment:{version:RELEASE,build:RELEASE_BUILD,fingerprint:RELEASE_FINGERPRINT,entrypoint:'worker/coverage.js'}}; }
async function run(request) { const p=params(request); const result=await discoverAll(p); const anchorDiagnostics=diagnoseKnownLocalSources(result); return release({ok:true,version:RELEASE,build:RELEASE_BUILD,architecture:'organization-first / organic-first / diagnostic regression fixtures / candidate-only hard ZIP gate / independent ZIP radii / configurable exclusions / ranked search evidence',...result,diagnostics:[...(result.diagnostics||[]),...anchorDiagnostics],coverage:{homeZip:HOME_ZIP,groupRadius:p.groupRadius,eventRadius:p.eventRadius,jobRadius:p.jobRadius,groupEligibleZipCount:eligibleZips(p.groupRadius).length,eventEligibleZipCount:eligibleZips(p.eventRadius).length,jobEligibleZipCount:eligibleZips(p.jobRadius).length,hardZipGate:true,prefetchFiltering:true,searchEvidence:true,independentRadii:true,configurableExclusions:true,diagnosticLocalAnchors:true}}); }

export default { async fetch(request,env) { const url=new URL(request.url); if(url.pathname==='/test') return json(await run(request)); if(url.pathname==='/groups'||url.pathname==='/events'||url.pathname==='/jobs'||url.pathname==='/discover'){ const result=await run(request); if(url.pathname==='/groups') return json({...result,items:result.groups,events:undefined,jobs:undefined}); if(url.pathname==='/events') return json({...result,items:result.events,groups:undefined,jobs:undefined}); if(url.pathname==='/jobs') return json({...result,items:result.jobs,groups:undefined,events:undefined}); return json(result); } return baseWorker.fetch(request,env); } };