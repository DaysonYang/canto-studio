(function (root) {
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  let model;
  function buildModel() {
    const patterns = new Map();
    const prefixes = new Map();
    const triples = new Set();
    const spans = [];
    for (const span of root.CANTO_CLAUSES || []) {
      const roles = span.map(([word,,pos],position) => word === '嘅' && position === span.length - 1 ? 'particle' : CantoQuality.role(word,pos));
      if (!plausible(roles)) continue;
      const pattern = roles.join('|');
      for (let position = 2; position < span.length; position++) triples.add(span.slice(position-2,position+1).map(([word])=>word).join('|'));
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      for (let length = 1; length <= roles.length; length++) {
        const prefix = roles.slice(0,length).join('|');
        prefixes.set(prefix,(prefixes.get(prefix) || 0) + 1);
      }
      spans.push({span,roles});
    }
    return {patterns,prefixes,spans,triples};
  }
  function plausible(roles) {
    if (!roles.some(CantoQuality.isPredicate) || roles.includes('unknown')) return false;
    if (['link','auxiliary','connector','quantity','adverb'].includes(roles.at(-1))) return false;
    return roles.every((type, position) => !CantoQuality.isParticle(type) || position > 0 && position === roles.length - 1);
  }
  function assess(entries, roles, attested = false) {
    model ||= buildModel();
    const pattern = model.patterns.get(roles.join('|')) || 0;
    const pairs = entries.slice(1).map((entry,position) => CantoRank.pairCount(entries[position].word,entry.word));
    const coverage = pairs.filter(Boolean).length / Math.max(1,pairs.length);
    const average = pairs.reduce((sum,count)=>sum + Math.min(1,Math.log1p(count)/Math.log(20)),0) / Math.max(1,pairs.length);
    const {penalty} = CantoQuality.inspect(entries, roles);
    const knownTriples = entries.slice(2).every((entry,position)=>model.triples.has([entries[position].word,entries[position+1].word,entry.word].join('|')));
    const qualified = plausible(roles) && (attested || (pattern >= 2 && coverage === 1 && knownTriples && penalty < 0.34));
    return {qualified,attested,pattern,coverage,collocation:average,quality:attested ? 1 : Math.min(1,0.45 * coverage + 0.35 * average + 0.2 * Math.min(1,Math.log1p(pattern)/Math.log(50)) - penalty * 0.35)};
  }
  function diversify(items) {
    const accepted = [];
    const words = [];
    for (const item of items) {
      const characters = Array.from(CantoRank.normalize(item.word));
      const close = words.some(previous => {
        const changes = characters.reduce((sum,character,position)=>sum + Number(character !== previous[position]),0);
        return changes <= Math.max(1,Math.floor(characters.length * 0.2));
      });
      if (!close) { accepted.push(item); words.push(characters); }
      if (accepted.length >= 72) break;
    }
    return accepted;
  }
  async function retrieve(found, options, parts, cancelled, constraints) {
    const scorer = CantoRank.createScorer(options);
    const response = {items:[],bounded:true,considered:0,weights:scorer.weights};
    if (!found.ways || !constraints) return response;
    model ||= buildModel();
    const {code,mapping} = constraints;
    const allowed = new Map();
    let offset = 0;
    for (const part of parts || []) { allowed.set(offset,offset + part.length); offset += part.length; }
    const matches = (start,end) => parts && allowed.get(start) !== end ? null : found.edges[start]?.find(edge=>edge.end === end);
    const results = new Map();
    function add(entries,roles,attested) {
      if (entries.map(entry=>CantoEngine.encode(entry.reading,mapping)).join('') !== code || entries.reduce((sum,entry)=>sum + Array.from(entry.word).length,0) !== code.length) return;
      const evaluation = assess(entries,roles,attested);
      if (!evaluation.qualified) return;
      const scored = scorer.score(entries);
      if (!scored.passes) return;
      const expression = entries.filter((entry,position)=>entry.code.length > 1 && CantoQuality.isContent(roles[position])).length / entries.length;
      const grammar = Math.min(1,Math.log1p(evaluation.pattern)/Math.log(30));
      const emphasis = options.sort === 'frequency' ? scored.frequency : scored.components[options.sort] || 0;
      const score = evaluation.quality * 0.35 + scored.relevance * 0.25 + (evaluation.collocation * 0.65 + grammar * 0.35) * 0.20 + (expression * 0.5 + scored.style * 0.5) * 0.15 + scored.frequency * 0.05 + scored.preference + emphasis * 0.08;
      const key = CantoRank.normalize(scored.word);
      if (!results.has(key) || results.get(key).sentence.attested < attested || results.get(key).sentence.attested === attested && results.get(key).score < score) results.set(key,{...scored,score,sentence:{...evaluation,hasContext:Boolean(options.context || options.theme)}});
    }
    let scanned = 0;
    let slice = performance.now();
    for (const {span,roles} of model.spans) {
      if (cancelled()) return null;
      if (++scanned % 512 === 0 && performance.now() - slice >= 8) { await pause(); slice = performance.now(); }
      if (span.map(([,reading])=>CantoEngine.encode(reading,mapping)).join('') !== code) continue;
      let start = 0;
      const entries = [];
      for (const [word,reading] of span) {
        const end = start + Array.from(word).length;
        const entry = matches(start,end)?.candidates.find(candidate=>candidate.word === word && candidate.reading === reading);
        if (!entry) break;
        entries.push(entry);
        start = end;
      }
      if (entries.length === span.length) add(entries,roles,true);
    }
    const beams = Array.from({length:code.length+1},()=>[]);
    beams[0].push({entries:[],roles:[],pattern:'',score:0});
    const wordScores = new Map();
    for (let start=0; start<code.length; start++) {
      if (cancelled()) return null;
      const states = beams[start].sort((left,right)=>right.score-left.score).slice(0,64);
      if (!states.length) continue;
      for (const edge of found.edges[start]) {
        if (parts && allowed.get(start) !== edge.end) continue;
        const groups = new Map();
        for (const entry of edge.candidates) {
          if (cancelled()) return null;
          if (++scanned % 256 === 0 && performance.now() - slice >= 8) { await pause(); slice = performance.now(); }
          let candidate = wordScores.get(entry);
          if (!candidate) {
            const info = CantoRank.metadata(entry);
            if (!info.readingCount || info.role === 'unknown') continue;
            candidate = {entry,role:info.role,score:scorer.score([entry]).score};
            wordScores.set(entry,candidate);
          }
          const role = entry.word === '嘅' && edge.end === code.length ? 'particle' : candidate.role;
          if (CantoQuality.isParticle(role) && (start === 0 || edge.end !== code.length)) continue;
          const group = groups.get(role) || [];
          group.push(candidate);
          groups.set(role,group);
        }
        for (const [role,candidates] of groups) {
          candidates.sort((left,right)=>right.score-left.score);
          const top = candidates.slice(0,12);
          for (const state of states) {
            const pattern = state.pattern ? state.pattern + '|' + role : role;
            const evidence = model.prefixes.get(pattern) || 0;
            if (evidence < 2 || edge.end === code.length && !model.patterns.has(pattern)) continue;
            for (const candidate of top) {
              if (state.entries.some(entry=>entry.word===candidate.entry.word)) continue;
              const previous = state.entries.at(-1);
              const pair = previous ? CantoRank.pairCount(previous.word,candidate.entry.word) : 0;
              if (previous && !pair) continue;
              if (state.entries.length > 1 && !model.triples.has([state.entries.at(-2).word,previous.word,candidate.entry.word].join('|'))) continue;
              const score = state.score + candidate.score * candidate.entry.code.length / code.length * 0.32 + Math.log1p(evidence) * 0.012 + Math.min(1,Math.log1p(pair)/Math.log(20))*0.20;
              beams[edge.end].push({entries:[...state.entries,candidate.entry],roles:[...state.roles,role],pattern,score});
            }
          }
        }
        if (beams[edge.end].length > 900) beams[edge.end] = beams[edge.end].sort((left,right)=>right.score-left.score).slice(0,edge.end === code.length ? 320 : 96);
      }
      if (performance.now() - slice >= 8) { await pause(); slice = performance.now(); }
    }
    for (const state of beams[code.length].sort((left,right)=>right.score-left.score).slice(0,320)) add(state.entries,state.roles,false);
    const ordered = [...results.values()].sort((left,right)=>Number(right.sentence.attested)-Number(left.sentence.attested) || right.score-left.score);
    return {...response,items:diversify(ordered),considered:ordered.length,scanned};
  }
  root.CantoSentence = {retrieve,assess,diversify};
})(globalThis);
