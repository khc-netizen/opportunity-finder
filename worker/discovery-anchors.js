// Verified local sources retained as diagnostic fixtures. They must never be
// injected into production discovery results; they tell us whether organic
// discovery is still capable of finding known-good local organizations/events.
const SOURCES = [
  { kind:'wraba', url:'https://www.wraba.com/see_what_we_do/century_village_demos', name:'Western Reserve Artist Blacksmith Association (WRABA)', zip:'44021', city:'Burton' },
  { kind:'century', url:'https://centuryvillagemuseum.org/events-calendar/', name:'Century Village Museum', zip:'44021', city:'Burton' },
  { kind:'tcba', url:'https://www.trumbullbeekeepers.org/', name:'Trumbull County Beekeepers Association (TCBA)', zip:'44410', city:'Cortland' }
];

function sourceHost(url){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}

export function diagnoseKnownLocalSources(result={}) {
  const all=[...(result.groups||[]),...(result.events||[])];
  return SOURCES.map(source=>{
    const host=sourceHost(source.url);
    const matches=all.filter(x=>sourceHost(x.url||x.link||'')===host || sourceHost(x.sourceUrl||'')===host);
    const groupMatch=(result.groups||[]).some(x=>sourceHost(x.url||x.link||'')===host);
    const eventMatch=(result.events||[]).some(x=>sourceHost(x.url||x.link||'')===host);
    return {
      stage:'organic-diagnostic',
      source:source.name,
      expectedHost:host,
      organicallyFound:matches.length>0,
      groupFound:groupMatch,
      eventFound:eventMatch,
      matches:matches.length,
      status:matches.length>0?'PASS':'FAIL',
      note:'Diagnostic only; this source is not injected into production results.'
    };
  });
}

// tcba-official-recurring remains a historical diagnostic marker only. TCBA
// is deliberately not synthesized or injected into production discovery.
