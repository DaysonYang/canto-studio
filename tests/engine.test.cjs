const assert = require('node:assert/strict');
require('../engine.js');
require('../data/dictionary.js');
require('../data/variants.js');
require('../variants.js');
const engine = globalThis.CantoEngine;
const strictMapping = engine.ENCODING_MODES['394052'];
const index = engine.createIndex(globalThis.CANTO_DATA, strictMapping);
const exampleSyllables = engine.EXAMPLE.reading.split(' ');
assert.equal(engine.encode(engine.EXAMPLE.reading, strictMapping), '394022342');
assert.equal(exampleSyllables.map(syllable => engine.toneDetails(syllable).nine).join(''), '123496789');
assert.equal(exampleSyllables.map(syllable => engine.toneDetails(syllable).six).join(''), '123466136');
Array.from(engine.EXAMPLE.traditional).forEach((character, position) => {
  assert(CANTO_DATA.some(([word, reading]) => word === character && reading === exampleSyllables[position]));
});
assert.equal(engine.EXAMPLE.reading.replace('juk6', 'naam5').split(' ').map(syllable => engine.toneDetails(syllable).nine).join(''), '123456789');
assert(engine.search(index, '394022342', Array.from(engine.EXAMPLE.traditional)).ways > 0n);
assert.equal(engine.encode('hung4 tong4 seoi2 zan1 hai6 tim4', strictMapping), '009320');
assert.throws(() => engine.validateMapping(['0','0','1','2','3','4']));
const locked = engine.search(index, '009320', Array.from('紅糖水真係甜'));
assert(locked.ways > 0n);
for (let rank = 0n; rank < locked.ways; rank++) {
  const path = locked.partitionAt(rank);
  for (let combination = 0n; combination < engine.combinationCount(path); combination++) {
    const entries = engine.combinationAt(path, combination);
    assert.equal(entries.map(entry => entry.word).join(''), '紅糖水真係甜');
    assert.equal(entries.map(entry => entry.code).join(''), '009320');
  }
}
const fixture = engine.createIndex([['甲','gaa4','chars'],['乙','jyut4','chars'],['甲乙','gaa4 jyut4','words'],['丙','bing4','chars']]);
const found = engine.search(fixture, '00');
assert.equal(found.ways, 2n);
assert.equal(found.combinations, 10n);
assert.equal(found.rankOfPartition(['00']), 0n);
assert.equal(found.rankOfPartition(['0', '0']), 1n);
assert.throws(() => found.rankOfPartition(['0', '00']));
assert.throws(() => found.rankOfPartition(['', '00']));
assert.throws(() => engine.search(fixture, '00', [], true).rankOfPartition(['0','0']));
assert.deepEqual(found.partitionAt(0n).map(edge => edge.code), ['00']);
assert.deepEqual(found.partitionAt(1n).map(edge => edge.code), ['0','0']);
assert.equal(engine.search(fixture, '00', [], true).ways, 1n);
assert.equal(engine.search(fixture, '00', ['無']).ways, 0n);
const long = engine.search(fixture, '0'.repeat(40));
assert(long.combinations > BigInt(Number.MAX_SAFE_INTEGER));
assert.equal(long.partitionAt(long.ways - 1n).length, 40);
assert.throws(() => found.partitionAt(2n));
const all = engine.search(index, '009320');
const patterns = new Set();
for (let rank = 0n; rank < all.ways; rank++) patterns.add(all.partitionAt(rank).map(edge => edge.code).join('+'));
for (let rank = 0n; rank < all.ways; rank++) assert.equal(all.rankOfPartition(all.partitionAt(rank).map(edge => edge.code)), rank);
assert(patterns.has('009+320'));
assert(patterns.has('00+93+20'));
assert.equal(engine.search(index, '009320', ['A']).ways, 0n);
const variants = globalThis.CantoVariants;
assert.equal(variants.toSimplified('紅糖水真係甜'), '红糖水真系甜');
assert.equal(variants.toTraditional('红糖水'), '紅糖水');
const simplifiedLocked = engine.search(index, '009320', Array.from('红糖水真系甜'), false, variants.normalizeCharacter);
assert(simplifiedLocked.ways >= locked.ways);
assert(simplifiedLocked.combinations >= locked.combinations);
for (let rank = 0n; rank < simplifiedLocked.ways; rank++) {
  const path = simplifiedLocked.partitionAt(rank);
  const entries = engine.combinationAt(path, 0n);
  assert.equal(variants.toSimplified(entries.map(entry => entry.word).join('')), '红糖水真系甜');
  assert.equal(entries.map(entry => entry.code).join(''), '009320');
}
assert.equal(variants.toSimplified('音樂與歌詞 □ 009320 hung4'), '音乐与歌词 □ 009320 hung4');
for (const entry of globalThis.CANTO_DATA) {
  assert.equal(Array.from(variants.toSimplified(entry[0])).length, Array.from(entry[0]).length);
}
console.log('PASS: 真實詞庫示例、009+320 / 00+93+20、鎖定、整串、完整計數與大數分頁');
console.log('PASS: 簡繁轉換、簡體鎖定與全詞庫逐字長度一致');
const readings = engine.createReadingIndex(CANTO_DATA, variants.normalizeCharacter);
for (const text of ['紅糖水真係甜', '红糖水真系甜']) {
  const segments = engine.recognize(readings, text, variants.normalizeCharacter);
  assert(segments);
  assert.equal(segments.map(segment => segment.text).join(''), text);
  const expected = ['hung4 tong4', 'seoi2', 'zan1 hai6', 'tim4'];
  assert.equal(segments.length, expected.length);
  const chosen = segments.map((segment, position) => {
    assert(segment.candidates.some(entry => entry.reading === expected[position]));
    return engine.encode(expected[position], strictMapping);
  }).join('');
  assert.equal(chosen, '009320');
}
assert.equal(engine.recognize(readings, '紅糖🙂', variants.normalizeCharacter), null);
assert(engine.recognize(readings, '行', variants.normalizeCharacter)[0].candidates.length > 1);
console.log('PASS: 簡繁文字辨音、詞語優先、多音候選與未知字拒絕猜測');
assert.equal(engine.rhymeFinal('gwong2'), 'ong');
assert.equal(engine.rhymeFinal('ngaa4'), 'aa');
assert.equal(engine.rhymeFinal('ng5'), 'ng');
assert.equal(engine.rhymeFinal('m4'), 'm');
const rhymeIndex = engine.createIndex([['甲','saa1','chars'], ['乙','baa1','chars'], ['丙','saan1','chars'], ['甲乙丙','saa1 baa1 saan1','words']]);
const identity = character => character;
for (const count of [1, 2, 3]) {
  const finals = ['aa', 'aa', 'aan'].slice(-count);
  const filtered = engine.search(rhymeIndex, '333', [], false, identity, finals);
  assert(filtered.ways > 0n);
  for (let rank = 0n; rank < filtered.ways; rank++) {
    const path = filtered.partitionAt(rank);
    for (let choice = 0n; choice < engine.combinationCount(path); choice++) {
      const actual = engine.combinationAt(path, choice).flatMap(entry => entry.reading.split(' ')).slice(-count).map(engine.rhymeFinal);
      assert.deepEqual(actual, finals);
    }
  }
}
assert.equal(engine.search(rhymeIndex, '333', [], true, identity, ['aan']).combinations, 1n);
assert.equal(engine.search(rhymeIndex, '333', [], true, identity, ['aa']).combinations, 0n);
console.log('PASS: 末尾 1–3 字押韻、跨分詞邊界與韻尾區分');
const mixedSegments = engine.recognizeMixed(readings, '00真係0', variants.normalizeCharacter);
assert.equal(mixedSegments[0].text, '00');
assert.equal(mixedSegments[0].numeric, true);
assert(mixedSegments[1].candidates.some(entry => entry.reading === 'zan1 hai6'));
assert.equal(mixedSegments[2].text, '0');
assert.equal(engine.recognizeMixed(readings, '00🙂', variants.normalizeCharacter), null);
const mixedSearch = engine.search(index, '009320', [null,null,'水','真','係','甜'], false, variants.normalizeCharacter, ['im']);
assert(mixedSearch.ways > 0n);
for (let rank = 0n; rank < mixedSearch.ways; rank++) {
  const path = mixedSearch.partitionAt(rank);
  assert(variants.toSimplified(engine.combinationAt(path, 0n).map(entry => entry.word).join('')).endsWith('水真系甜'));
}
console.log('PASS: 混合輸入辨音、文字位置保留與押韻');
