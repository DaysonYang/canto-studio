importScripts('data/dictionary.js', 'data/variants.js', 'variants.js', 'engine.js', 'data/corpus.js', 'data/clauses.js', 'quality.js', 'pos.js', 'ranking.js', 'sentence.js');
let current = 0;
let mapping = '';
let index;
onmessage = async event => {
  const {id, constraints, options, parts} = event.data;
  current = id;
  try {
    const key = constraints.mapping.join('');
    if (key !== mapping) { index = CantoEngine.createIndex(CANTO_DATA, constraints.mapping); mapping = key; }
    const found = CantoEngine.search(index, constraints.code, constraints.locks, constraints.whole, CantoVariants.normalizeCharacter, constraints.rhyme, constraints.pos?.length ? entry=>CantoPOS.matches(entry,constraints.pos) : null);
    const result = await CantoRank.retrieve(found, options, parts, () => current !== id, constraints);
    if (result && current === id) postMessage({id, result});
  } catch (error) { postMessage({id, error: error.message}); }
};
