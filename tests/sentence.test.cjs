const assert = require('node:assert/strict');
require('../engine.js');
require('../data/dictionary.js');
require('../data/variants.js');
require('../variants.js');
require('../data/corpus.js');
require('../data/clauses.js');
require('../quality.js');
require('../ranking.js');
require('../sentence.js');

(async () => {
  const strict = CantoEngine.ENCODING_MODES['394052'];
  const loose = CantoEngine.ENCODING_MODES['0243'];
  const index = CantoEngine.createIndex(CANTO_DATA, strict);
  const looseIndex = CantoEngine.createIndex(CANTO_DATA, loose);
  const options = {sentence:true,modes:{natural:true},weights:CantoRank.DEFAULT_WEIGHTS,style:'daily',sort:'smart'};
  async function sentences(code, mapping = strict, settings = options, locks = [], rhyme = [], parts = null) {
    const activeIndex = mapping === strict ? index : looseIndex;
    const found = CantoEngine.search(activeIndex, code, locks, false, CantoVariants.normalizeCharacter, rhyme);
    const start = performance.now();
    const result = await CantoRank.retrieve(found,settings,parts,()=>false,{code,mapping});
    const milliseconds = Math.round(performance.now() - start);
    assert(result.items.length <= 72);
    for (const item of result.items) {
      assert.equal(Array.from(item.word).length,code.length);
      assert.equal(item.entries.map(entry=>CantoEngine.encode(entry.reading,mapping)).join(''),code);
      assert(item.entries.every(entry=>activeIndex.get(entry.code).includes(entry)));
      assert(item.sentence.qualified);
      if (!item.sentence.attested) assert.equal(item.sentence.coverage,1);
      if (parts) assert.equal(item.entries.map(entry=>entry.code).join('+'),parts.join('+'));
    }
    return {items:result.items,milliseconds};
  }
  const samples = [['520524','我又唔會犯錯'],['50435950','我唔覺得佢好有型'],['5034222904','我唔知個月份係幾時啊'],['559943294432','我有少少覺得自己格格不入']];
  const timings = [];
  for (const [code, expected] of samples) {
    const result = await sentences(code);
    assert(result.items.some(item=>item.word===expected && item.sentence.attested));
    timings.push({code,ms:result.milliseconds});
  }
  assert((await sentences('420424',loose)).items.some(item=>item.word==='我又唔會犯錯'));
  const withoutContext = await sentences('532434');
  const withContext = await sentences('532434',strict,{...options,modes:{natural:true,context:true},context:'換衫'});
  assert.notEqual(withoutContext.items[0].word,'已經換晒衫嚹');
  assert.equal(withContext.items[0].word,'已經換晒衫嚹');
  assert(withContext.items[0].relevance > withoutContext.items.find(item=>item.word==='已經換晒衫嚹').relevance);
  const example = withContext.items[0];
  const parts = example.entries.map(entry=>entry.code);
  const finalReading = example.entries.at(-1).reading.split(' ').at(-1);
  const locked = await sentences(example.code,strict,options,Array.from(example.word),[CantoEngine.rhymeFinal(finalReading)],parts);
  assert(locked.items.some(item=>item.word===example.word));
  assert.equal((await sentences(example.code,strict,options,Array.from(example.word),['impossible'])).items.length,0);
  assert.equal((await sentences('394052')).items.length,0);
  const natural = withoutContext.items.find(item=>!item.sentence.attested);
  assert(natural);
  const roles = natural.info.map((info,position)=>position === natural.info.length - 1 && natural.entries[position].word === '嘅' ? 'particle' : info.role);
  assert(CantoSentence.assess(natural.entries,roles).qualified);
  assert(!CantoSentence.assess([...natural.entries].reverse(),[...roles].reverse()).qualified);
  const particle = index.get('3').find(entry=>entry.word==='啦');
  assert(particle);
  assert.equal(CantoRank.metadata(particle).role,'particle');
  assert(!CantoSentence.assess([particle,particle,natural.entries[0]],['particle','particle','pronoun']).qualified);
  const verb = natural.entries.find((entry,position)=>roles[position]==='verb');
  assert.equal(CantoQuality.inspect([verb,particle],['verb','particle']).penalty,0);
  assert(CantoQuality.inspect([verb,particle,particle],['verb','particle','particle']).penalty>0.5);
  for (const code of ['0','3','4']) {
    const found = CantoEngine.search(index,code,[],true);
    const result = await CantoRank.retrieve(found,{...options,sentence:false,sort:'frequency',style:'any'});
    assert(result.items.slice(0,10).filter(item=>item.pureParticle).length<=2);
    assert.equal(new Set(result.items.slice(0,10).map(item=>CantoRank.normalize(item.word))).size,10);
  }
  assert.deepEqual(CantoSentence.diversify([{word:'我真係好鍾意'},{word:'你真係好鍾意'},{word:'已經換晒衫嚹'}]).map(item=>item.word),['我真係好鍾意','已經換晒衫嚹']);
  console.log('PASS: 助詞保留與降權、自然／錯序句、6–12 字、上下文重排、兩套聲調、分詞鎖字押韻及去重');
  console.log(JSON.stringify(timings));
})().catch(error=>{console.error(error);process.exitCode=1;});
