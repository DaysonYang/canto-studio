(function (root) {
  function parse(code, value) {
    const parts = value.replace(/\s/g,'').split(/[+＋]/);
    if (parts.some(part=>!/^\d+$/.test(part)) || parts.join('') !== code) throw Error('用 + 分隔各段，數字與順序須和搜尋編碼一致。');
    return parts;
  }
  function slotsFor(parts, previous = []) {
    let start = 0;
    return parts.map(code => {
      const end = start + code.length;
      const existing = previous.find(slot=>slot.start === start && slot.end === end);
      const slot = {...(existing || {selected:null,locked:false,pos:[],sort:'smart',query:'',page:0}),start,end,code};
      if (existing?.code !== code) slot.page = 0;
      start = end;
      return slot;
    });
  }
  function suggestions(code, found) {
    const result = new Set();
    const add = parts => {
      if (parts.join('') !== code) return;
      try { found.rankOfPartition(parts); result.add(parts.join(' + ')); } catch {}
    };
    for (const width of [2,3,4]) add(code.match(new RegExp(`.{1,${width}}`,'g')) || []);
    for (const widths of [[2,3],[3,2],[2,4],[4,2]]) {
      const parts = [];
      for (let start=0, position=0; start<code.length; position++) {
        const width = widths[position % widths.length];
        parts.push(code.slice(start,start+width));
        start += width;
      }
      add(parts);
    }
    for (let rank = 0n; rank < found.ways && rank < 28n; rank++) add(found.partitionAt(rank).map(edge=>edge.code));
    return [...result];
  }
  function entries(context, slot) {
    return context.found.edges[slot.start]?.find(edge=>edge.end === slot.end)?.candidates || [];
  }
  function same(first,second) {
    return Boolean(first && second && first.word === second.word && first.reading === second.reading);
  }
  function valid(context,slot,entry) {
    return Boolean(context && entry && Array.from(entry.word).length === slot.code.length && CantoEngine.encode(entry.reading,context.mapping) === slot.code && entries(context,slot).some(candidate=>same(candidate,entry)));
  }
  function filtered(context,slot) {
    const query = CantoRank.normalize(slot.query.trim().toLowerCase());
    return entries(context,slot).filter(entry=>CantoPOS.matches(entry,slot.pos) && (!query || CantoRank.normalize(entry.word).includes(query) || entry.reading.includes(query)));
  }
  function rank(context,slot,allSlots,topic,dynamic) {
    const previous = allSlots.find(other=>other.end===slot.start);
    const next = allSlots.find(other=>other.start===slot.end);
    const left = previous && valid(context,previous,previous.selected) ? previous.selected.word : '';
    const right = next && valid(context,next,next.selected) ? next.selected.word : '';
    const reference = dynamic ? allSlots.filter(other=>other!==slot && valid(context,other,other.selected)).map(other=>other.selected.word).join(' ') : '';
    const sort = slot.sort;
    const scorer = CantoRank.createScorer({modes:{natural:true,theme:Boolean(topic),context:Boolean(reference)},weights:CantoRank.DEFAULT_WEIGHTS,theme:topic,context:reference,style:'any',sort,pos:slot.pos});
    const vector = reference ? CantoRank.vector(reference) : null;
    const leftRole = left ? CantoRank.metadata(previous.selected).role : '';
    const rightRole = right ? CantoRank.metadata(next.selected).role : '';
    const scored = filtered(context,slot).map(entry=>{
      const item = scorer.score([entry]);
      const pair = reference ? (left ? CantoRank.pairCount(left,entry.word) : 0) + (right ? CantoRank.pairCount(entry.word,right) : 0) : 0;
      const type = item.info[0].role;
      const followsSubject = ['pronoun','noun','adverb'].includes(leftRole) && CantoQuality.isPredicate(type);
      const leadsObject = CantoQuality.isPredicate(type) && ['pronoun','noun'].includes(rightRole);
      const extra = reference ? Math.min(0.35,Math.log1p(pair)*0.10) + CantoRank.cosine(CantoRank.vector(entry.word),vector)*0.10 + (followsSubject || leadsObject ? 0.025 : 0) : 0;
      return {...item,score:item.score+extra};
    });
    scored.sort((first,second)=>second.score-first.score);
    return (slot.pos.includes('particle') ? scored : CantoQuality.diversifyWords(scored)).map(item=>item.entries[0]);
  }
  function recommendationGraph(context, slots) {
    const edges = Array.from({length:context.code.length+1},()=>[]);
    for (const slot of slots) {
      let candidates = filtered(context,slot);
      if (slot.locked) candidates = candidates.filter(entry=>same(entry,slot.selected));
      if (!candidates.length) return null;
      edges[slot.start].push({start:slot.start,end:slot.end,code:slot.code,candidates});
    }
    return {ways:1n,edges};
  }
  function apply(context,slots,entriesToApply) {
    if (entriesToApply.length !== slots.length || !slots.every((slot,position)=>{
      const entry = entriesToApply[position];
      return (!slot.locked || same(entry,slot.selected)) && valid(context,slot,entry) && filtered(context,slot).some(candidate=>same(candidate,entry));
    })) return false;
    slots.forEach((slot,position)=>{slot.selected = entriesToApply[position];});
    return true;
  }
  root.CantoComposeEngine = {parse,slotsFor,suggestions,entries,same,valid,filtered,rank,recommendationGraph,apply};
})(globalThis);
