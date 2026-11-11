const assert = require('node:assert/strict');
require('../engine.js');
require('../data/dictionary.js');
require('../data/variants.js');
require('../variants.js');
require('../data/corpus.js');
require('../quality.js');
require('../ranking.js');
require('../reranker.js');

(async () => {
  const engine = globalThis.CantoEngine;
  const ranker = globalThis.CantoRank;
  const variants = globalThis.CantoVariants;
  const strictMapping = engine.ENCODING_MODES['394052'];
  const index = engine.createIndex(globalThis.CANTO_DATA, strictMapping);
  const found = engine.search(index, '00', [], true);
  const base = {modes:{context:false, theme:false, natural:false, similar:false}, weights:{...ranker.DEFAULT_WEIGHTS}, context:'', theme:'', references:[], style:'any', sort:'smart', preferences:{favorites:[], dislikes:[]}};
  const modes = [base, {...base, modes:{...base.modes,context:true},context:'無聊'}, {...base,modes:{...base.modes,theme:true},theme:'銀行'}, {...base,modes:{...base.modes,natural:true},sort:'frequency'}, {...base,modes:{...base.modes,similar:true},references:['銀行']}, {...base,modes:{context:true,theme:true,natural:true,similar:true},context:'明年',theme:'銀行',references:['無聊']}];
  function validate(items, code) {
    assert(items.length > 0);
    for (const item of items) {
      assert.equal(item.code, code);
      assert.equal(Array.from(item.word).length, code.length);
      assert.equal(item.entries.map(entry => engine.encode(entry.reading, strictMapping)).join(''), code);
      for (const entry of item.entries) assert(index.get(entry.code).some(actual => actual.word === entry.word && actual.reading === entry.reading));
    }
  }
  const results = [];
  for (const options of modes) {
    const result = await ranker.retrieve(found, options);
    validate(result.items, '00');
    results.push(result);
  }
  assert.equal(results[1].items[0].word, '無聊');
  assert.equal(results[2].items[0].word, '銀行');
  assert.notEqual(results[4].items[0].word, '銀行');
  assert(results[4].items[0].components.similar > 0);
  assert(results[3].items.slice(0,10).filter(item=>item.pureParticle).length <= 2);
  assert(results[3].items[0].info[0].count > 0);
  assert.equal(ranker.metadata(index.get('00').find(entry => entry.word === '同埋')).count, CANTO_CORPUS.words['同埋'][0]);
  const normalized = ranker.normalizedWeights({context:true,theme:true,natural:false,similar:false},{context:20,theme:80,natural:100,similar:100},{context:'人',theme:'雨'});
  assert.equal(normalized.context, 0.2);
  assert.equal(normalized.theme, 0.8);
  assert.equal(normalized.natural, 0);
  const changedWeights = await ranker.retrieve(found, {...modes[5],weights:{context:0,theme:100,natural:0,similar:0}});
  assert.equal(changedWeights.items[0].word, '銀行');
  const candidate = results[0].items[15];
  const normalScore = ranker.createScorer(base).score(candidate.entries).score;
  const favorite = {...base, preferences:{favorites:[{key:candidate.key,word:candidate.word}],dislikes:[]}};
  assert(ranker.createScorer(favorite).score(candidate.entries).score > normalScore);
  const disliked = {...base, preferences:{favorites:[],dislikes:[{key:candidate.key,scope:ranker.scope(base)}]}};
  assert(ranker.createScorer(disliked).score(candidate.entries).score < normalScore);
  const otherTheme = {...disliked,modes:{...base.modes,theme:true},theme:'雨夜'};
  assert.equal(ranker.createScorer(otherTheme).score(candidate.entries).score, ranker.createScorer({...otherTheme,preferences:{favorites:[],dislikes:[]}}).score(candidate.entries).score);
  const excludedSemantic = await ranker.retrieve(found, {...base,modes:{...base.modes,theme:true},theme:'🙂',relatedOnly:true});
  assert.equal(excludedSemantic.items.length, 0);
  const relaxed = await ranker.retrieve(found, {...base,modes:{...base.modes,theme:true},theme:'🙂',relatedOnly:false});
  validate(relaxed.items, '00');
  const styled = await ranker.retrieve(found, {...modes[3],style:'written',strictStyle:true});
  assert(styled.items.length > 0);
  assert(styled.items.every(item => item.style >= 0.5));
  assert(styled.items.length < results[3].items.length);
  const measures = [];
  for (const code of ['009320','0033334','009320009320']) {
    const start = performance.now();
    const combined = engine.search(index, code, [], false);
    const result = await ranker.retrieve(combined, modes[5]);
    validate(result.items, code);
    assert(result.items.length <= 600);
    assert(result.bounded);
    measures.push({code,ms:Math.round(performance.now()-start),items:result.items.length,scanned:result.scanned});
  }
  const combined = engine.search(index, '009320');
  const custom = await ranker.retrieve(combined, base, ['00','93','20']);
  validate(custom.items, '009320');
  assert(custom.items.every(item => item.entries.map(entry => entry.code).join('+') === '00+93+20'));
  const locked = engine.search(index, '009320', Array.from('紅糖水真係甜'), false, variants.normalizeCharacter, ['im']);
  const lockedRanked = await ranker.retrieve(locked, modes[5]);
  validate(lockedRanked.items, '009320');
  assert(lockedRanked.items.every(item => variants.toSimplified(item.word) === '红糖水真系甜'));
  assert.equal((await ranker.retrieve(engine.search(index, '009320', ['A']), base)).items.length, 0);
  const stable = await ranker.retrieve(found, modes[5]);
  assert.deepEqual(stable.items.map(item=>item.key), results[5].items.map(item=>item.key));
  assert.equal(await ranker.retrieve(found, base, null, ()=>true), null);
  const reranked = await CantoReranker.rerank(results[0].items, async ()=>[2,99999,'虛構句',2,0]);
  assert.equal(reranked[0], results[0].items[2]);
  assert.equal(reranked.length, results[0].items.length);
  assert.deepEqual(new Set(reranked.map(item=>item.key)),new Set(results[0].items.map(item=>item.key)));
  assert.equal(engine.encode('faan1 ke2 zoeng3 ngau4 juk6 min6', strictMapping), '394022');
  console.log('PASS: A/B/C/D及組合、權重、偏好、主題隔離、風格篩選、精確聲調、鎖字押韻、自訂分詞、取消與穩定排序、AI不可新增候選');
  console.log(JSON.stringify({performance:measures}));
})().catch(error => { console.error(error); process.exitCode = 1; });
