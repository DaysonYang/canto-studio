const assert = require('node:assert/strict');
require('../engine.js');
require('../data/dictionary.js');
require('../data/variants.js');
require('../variants.js');
require('../data/corpus.js');
require('../quality.js');
require('../ranking.js');

(async () => {
  const engine = CantoEngine;
  const normalize = CantoVariants.normalizeCharacter;
  const readingIndex = engine.createReadingIndex(CANTO_DATA, normalize);
  const options = {modes:{context:false,theme:true,natural:true,similar:false},weights:CantoRank.DEFAULT_WEIGHTS,theme:'詩詞',style:'any'};
  assert.equal(engine.DEFAULT_MODE, '394052');
  assert.deepEqual(Object.keys(engine.ENCODING_MODES).sort(), ['0243','394052']);
  assert.throws(() => engine.validateMapping(['3','9','4','0','4','2']));
  for (const [mode, nineCode, toneCode, threeTones, fourTones] of [
    ['0243','334022342','334042',['1','2'],['3','5']],
    ['394052','394022342','394052',['1'],['3']]
  ]) {
    const mapping = engine.ENCODING_MODES[mode];
    const index = engine.createIndex(CANTO_DATA, mapping);
    assert.equal(engine.encode(engine.EXAMPLE.reading, mapping), nineCode);
    assert.equal(engine.encode(engine.TONE_EXAMPLE.reading, mapping), toneCode);
    assert.equal(engine.encode('bat1 hek3 juk6', mapping), '342');
    assert.deepEqual(['bat1','hek3','juk6'].map(syllable => engine.toneDetails(syllable,mapping).nine), [7,8,9]);
    assert.equal(engine.toneDetails('si5',mapping).code, mode === '0243' ? '4' : '5');
    const text = '诗史试时市是';
    const recognized = engine.recognize(readingIndex,text,normalize);
    assert.equal(recognized.map(segment=>segment.candidates[0].reading).join(' '),engine.TONE_EXAMPLE.reading);
    for (const [digit, expected] of [['3',threeTones],['4',fourTones]]) {
      const found = engine.search(index,digit,[],true);
      const entries = found.partitionAt(0n)[0].candidates;
      assert.deepEqual([...new Set(entries.map(entry=>entry.reading.slice(-1)))].sort(),expected);
      assert(entries.every(entry=>entry.code === digit));
    }
    for (const digit of ['9','5']) assert.equal(engine.search(index,digit,[],true).ways > 0n, mode === '394052');
    const found = engine.search(index,toneCode,Array.from(text),false,normalize);
    const parts = [toneCode.slice(0,2),...toneCode.slice(2)];
    assert(found.rankOfPartition(parts) >= 0n);
    const ranked = await CantoRank.retrieve(found,options,parts);
    assert(ranked.items.length > 0);
    for (const item of ranked.items) {
      assert.equal(item.entries.map(entry=>entry.code).join(' + '),parts.join(' + '));
      assert.equal(item.entries.map(entry=>engine.encode(entry.reading,mapping)).join(''),toneCode);
      assert.equal(CantoVariants.toSimplified(item.word),text);
    }
  }
  console.log('PASS: 兩種編碼、逐字入聲、實際檢索、第五聲、保留讀音、分詞及排序');
})().catch(error=>{console.error(error);process.exitCode=1;});
