(function (root) {
  const DEFAULT_WEIGHTS = {context: 35, theme: 30, natural: 25, similar: 10};
  const normalize = text => Array.from(text || '').map(CantoVariants.normalizeCharacter).join('');
  const corpus = new Map();
  for (const [word, [count, pos, readings, neighbors]] of Object.entries(root.CANTO_CORPUS?.words || {})) {
    const key = normalize(word);
    const previous = corpus.get(key);
    if (!previous) corpus.set(key, {count, pos, readings: {...readings}, neighbors: [...neighbors]});
    else {
      const previousCount = previous.count;
      previous.count += count;
      if (count > previousCount) previous.pos = pos;
      for (const [reading, amount] of Object.entries(readings)) previous.readings[reading] = (previous.readings[reading] || 0) + amount;
      previous.neighbors.push(...neighbors);
    }
  }
  const maxCount = Math.max(1, ...Array.from(corpus.values(), item => item.count));
  const bigrams = new Map();
  for (const [first, neighbors] of Object.entries(root.CANTO_CORPUS?.bigrams || {})) {
    for (const [second, count] of Object.entries(neighbors)) {
      const key = normalize(first) + '|' + normalize(second);
      bigrams.set(key, (bigrams.get(key) || 0) + count);
    }
  }
  const trie = new Map();
  for (const word of corpus.keys()) {
    let branch = trie;
    for (const character of word) {
      if (!branch.has(character)) branch.set(character, new Map());
      branch = branch.get(character);
    }
    branch.word = word;
  }
  const vectorCache = new Map();
  function tokens(text) {
    const characters = Array.from(normalize(text));
    const result = [];
    for (let start = 0; start < characters.length;) {
      if (!/\p{Script=Han}/u.test(characters[start])) { start++; continue; }
      let branch = trie;
      let word = characters[start];
      let next = start + 1;
      for (let end = start; end < characters.length && branch.has(characters[end]); end++) {
        branch = branch.get(characters[end]);
        if (branch.word) { word = branch.word; next = end + 1; }
      }
      result.push(word);
      start = next;
    }
    return result;
  }
  function vector(text) {
    const key = normalize(text);
    if (vectorCache.has(key)) return vectorCache.get(key);
    const result = new Map();
    const add = (feature, amount) => result.set(feature, (result.get(feature) || 0) + amount);
    for (const token of tokens(key)) {
      const stats = corpus.get(token);
      if (stats && !/^(n|v|a|t|s|i|l|z)/.test(stats.pos)) continue;
      const idf = stats ? Math.log(1 + (root.CANTO_CORPUS?.meta.tokens || 1) / stats.count) : 2;
      add('word:' + token, idf);
      if (stats) {
        const contexts = stats.neighbors;
        const norm = Math.sqrt(contexts.reduce((sum, [, value]) => sum + value * value, 0)) || 1;
        for (const [neighbor, value] of contexts) add('context:' + normalize(neighbor), idf * value / norm);
      }
      const characters = Array.from(token);
      for (let position = 0; position < characters.length; position++) {
        add('char:' + characters[position], 0.2);
        if (position + 1 < characters.length) add('gram:' + characters.slice(position, position + 2).join(''), 0.6);
      }
    }
    const norm = Math.sqrt(Array.from(result.values()).reduce((sum, value) => sum + value * value, 0)) || 1;
    for (const [feature, value] of result) result.set(feature, value / norm);
    if (vectorCache.size >= 24000) vectorCache.clear();
    vectorCache.set(key, result);
    return result;
  }
  function cosine(first, second) {
    if (first.size > second.size) return cosine(second, first);
    let score = 0;
    for (const [key, value] of first) score += value * (second.get(key) || 0);
    return Math.max(0, Math.min(1, score));
  }
  const viewpointWords = new Map([['我',1],['我哋',1],['我们',1],['咱们',1],['你',2],['你哋',2],['你们',2],['您',2],['佢',3],['佢哋',3],['他',3],['她',3],['他们',3],['她们',3]]);
  function viewpoints(words) {
    return new Set(words.map(word => viewpointWords.get(word)).filter(Boolean));
  }
  function normalizedWeights(modes, weights, texts = {}) {
    const enabled = {};
    let total = 0;
    for (const key of Object.keys(DEFAULT_WEIGHTS)) {
      const available = key === 'natural' || Boolean((texts[key] || '').trim());
      enabled[key] = modes[key] && available ? Math.max(0, Number(weights[key]) || 0) : 0;
      total += enabled[key];
    }
    if (total) for (const key of Object.keys(enabled)) enabled[key] /= total;
    return enabled;
  }
  function styleFit(stats, word, style) {
    if (style === 'any') return 1;
    if (!stats) return 0.25;
    const content = /^(n|v|a|t|s|i|l|z)/.test(stats.pos) && !/^(nr|ns|nt|nz)/.test(stats.pos);
    if (style === 'daily') return Math.min(1, Math.log1p(stats.count) / Math.log(30));
    if (style === 'lyrics') return (content ? 0.65 : 0.15) + (Array.from(word).length >= 2 && Array.from(word).length <= 4 ? 0.35 : 0);
    if (style === 'poetic') return (/^(n|a|t|s|i|l|z)/.test(stats.pos) ? 0.7 : 0.1) + (Array.from(word).length >= 2 ? 0.3 : 0);
    return content ? 1 : 0.2;
  }
  function metadata(entry) {
    const [count = 0, pos = '', readings = {}, neighbors = []] = root.CANTO_CORPUS?.words[entry.word] || [];
    return {count, readingCount: readings[entry.reading] || 0, pos, role:CantoQuality.role(entry.word, pos), neighbors: neighbors.slice(0, 3).map(([word]) => word)};
  }
  function scope(options) {
    return JSON.stringify([options.modes.context ? normalize(options.context) : '', options.modes.theme ? normalize(options.theme) : '', options.style]);
  }
  function preferenceKey(entries) {
    return entries.map(entry => normalize(entry.word) + ':' + entry.reading).join('|');
  }
  function createScorer(options) {
    const texts = {context: options.context || '', theme: options.theme || '', similar: (options.references || []).join(' ')};
    const weights = normalizedWeights(options.modes, options.weights, texts);
    const semanticModes = ['context', 'theme', 'similar'].filter(key => weights[key]);
    const queries = Object.fromEntries(semanticModes.map(key => [key, vector(texts[key])]));
    const contextTokens = weights.context ? tokens(texts.context) : [];
    const contextViewpoints = viewpoints(contextTokens);
    const referenceWords = new Set((options.references || []).map(normalize));
    const memo = new Map();
    const favorites = new Set(options.preferences?.favorites?.map(item => item.key) || []);
    const dislikeScope = scope(options);
    const dislikes = new Set((options.preferences?.dislikes || []).filter(item => item.scope === dislikeScope).map(item => item.key));
    const preferredVector = vector((options.preferences?.favorites || []).slice(-32).map(item => item.word).join(' '));
    const usePreferenceVector = preferredVector.size > 0 && Object.values(weights).some(value => value > 0);
    function score(entries) {
      const word = entries.map(entry => entry.word).join('');
      const key = preferenceKey(entries);
      if (memo.has(key)) return memo.get(key);
      const features = semanticModes.length || usePreferenceVector ? vector(word) : null;
      const components = {context: 0, theme: 0, similar: 0, natural: 0};
      for (const name of semanticModes) components[name] = cosine(features, queries[name]);
      if (weights.similar && referenceWords.has(normalize(word))) components.similar = 0;
      if (weights.context && contextTokens.length) {
        const candidateTokens = tokens(word);
        const candidateViewpoints = viewpoints(candidateTokens);
        const sameViewpoint = Array.from(candidateViewpoints).some(value => contextViewpoints.has(value));
        const bridge = bigrams.get(contextTokens.at(-1) + '|' + candidateTokens[0]) || 0;
        components.context = Math.min(1, components.context * 0.86 + (sameViewpoint ? 0.08 : 0) + Math.min(1, Math.log1p(bridge) / Math.log(20)) * 0.06);
      }
      const length = Array.from(word).length || 1;
      let style = 0;
      let frequency = 0;
      const info = entries.map(metadata);
      entries.forEach((entry, position) => {
        const partLength = Array.from(entry.word).length;
        const stats = corpus.get(normalize(entry.word));
        const observed = Math.log1p(info[position].count) / Math.log1p(maxCount);
        frequency += observed * partLength / length;
        style += styleFit(stats, entry.word, options.style) * partLength / length;
      });
      const contentFrequency = entries.reduce((sum, entry, position) => {
        const observed = Math.log1p(info[position].readingCount || info[position].count * 0.2) / Math.log1p(maxCount);
        const factor = !info[position].pos || /^(n|v|a|t|s|i|l|z)/.test(info[position].pos) ? 1 : 0.4;
        return sum + observed * factor * Array.from(entry.word).length / length;
      }, 0);
      let adjacency = 0;
      for (let position = 1; position < entries.length; position++) {
        const observed = bigrams.get(normalize(entries[position - 1].word) + '|' + normalize(entries[position].word)) || 0;
        adjacency += Math.min(1, Math.log1p(observed) / Math.log(20));
      }
      if (entries.length > 1) adjacency /= entries.length - 1;
      components.natural = contentFrequency * 0.7 + style * 0.2 + adjacency * 0.1;
      let relevance = 0;
      let semanticWeight = 0;
      for (const name of ['context', 'theme', 'similar']) { relevance += components[name] * weights[name]; semanticWeight += weights[name]; }
      if (semanticWeight) relevance /= semanticWeight;
      let total = Object.keys(weights).reduce((sum, name) => sum + weights[name] * components[name], 0);
      const preference = (favorites.has(key) ? 0.06 : 0) - (dislikes.has(key) ? 0.18 : 0);
      const sort = options.sort || 'smart';
      if (sort === 'frequency' && options.modes.natural) total = frequency * 0.40 + components.natural * 0.60;
      if (['context', 'theme', 'similar'].includes(sort) && weights[sort]) total = components[sort];
      total += preference;
      if (usePreferenceVector) total += cosine(features, preferredVector) * 0.03;
      if (sort === 'smart' && weights.natural) {
        const distinct = new Set(entries.map(entry => normalize(entry.word))).size;
        total -= (entries.length - distinct) * 0.1 * weights.natural;
      }
      total -= Math.max(0, entries.length - 1) * 0.008;
      const quality = CantoQuality.inspect(entries, info.map(part => part.role));
      total -= options.pos?.includes('particle') && quality.pureParticle && entries.length === 1 ? 0 : quality.penalty;
      if (entries.length === 1 && entries[0].code.length > 1) total += 0.08;
      const passes = (!options.relatedOnly || !semanticWeight || relevance >= 0.035) && (!options.strictStyle || !options.modes.natural || options.style === 'any' || style >= 0.5);
      const styleNames = {any:'未限定', daily:'日常粵語', lyrics:'粵語流行歌詞', poetic:'文藝／詩意', written:'書面中文'};
      const result = {entries, key, word, code: entries.map(entry => entry.code).join(''), score: total, components, frequency, style, styleName: options.modes.natural ? styleNames[options.style] : '風格排序已關閉', relevance, passes, info, pureParticle:quality.pureParticle, preference};
      memo.set(key, result);
      return result;
    }
    return {score, weights};
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  async function retrieve(found, options, parts = null, cancelled = () => false, constraints) {
    if (options.sentence) return CantoSentence.retrieve(found, options, parts, cancelled, constraints);
    if (!found.ways) return {items: [], bounded: false, considered: 0, weights: normalizedWeights(options.modes, options.weights)};
    const scorer = createScorer(options);
    const edges = found.edges;
    const length = edges.length - 1;
    const rankedEdges = Array.from({length}, () => []);
    let scanned = 0;
    let sliceStarted = performance.now();
    let expectedStart = 0;
    const allowed = new Map();
    if (parts) for (const part of parts) { allowed.set(expectedStart, expectedStart + part.length); expectedStart += part.length; }
    for (let start = 0; start < length; start++) {
      for (const edge of edges[start]) {
        if (parts && allowed.get(start) !== edge.end) continue;
        const ranked = [];
        for (let order = 0; order < edge.candidates.length; order++) {
          if (cancelled()) return null;
          const entry = edge.candidates[order];
          ranked.push({entry, key: normalize(entry.word), score: scorer.score([entry]).score, order});
          scanned++;
          if (scanned % 192 === 0 && performance.now() - sliceStarted >= 8) {
            await pause();
            sliceStarted = performance.now();
          }
        }
        ranked.sort((first, second) => second.score - first.score || first.order - second.order);
        rankedEdges[start].push({end: edge.end, ranked});
      }
    }
    if (cancelled()) return null;
    const candidates = [];
    let bounded = false;
    const allWhole = rankedEdges[0]?.length === 1 && rankedEdges[0][0].end === length;
    if (allWhole && (parts?.length === 1 || found.ways === 1n)) {
      for (const item of rankedEdges[0][0].ranked) candidates.push(scorer.score([item.entry]));
    } else {
      const beams = Array.from({length: length + 1}, () => []);
      beams[0] = [{entries: [], value: 0, order: 0}];
      const naturalWeight = options.sort === 'smart' ? scorer.weights.natural : 0;
      let order = 0;
      for (let start = 0; start < length; start++) {
        if (cancelled()) return null;
        beams[start].sort((first, second) => second.value - first.value || first.order - second.order);
        if (beams[start].length > 48) bounded = true;
        const states = beams[start].slice(0, 48);
        beams[start] = [];
        for (const edge of rankedEdges[start]) {
          if (edge.ranked.length > 20) bounded = true;
          const shortlist = edge.ranked.slice(0, 20);
          for (const state of states) for (const candidate of shortlist) {
            const entries = [...state.entries, candidate.entry];
            const repeat = naturalWeight && state.entries.some(entry => entry.word === candidate.entry.word) ? 0.1 * naturalWeight : 0;
            const adjacent = naturalWeight && state.lastKey ? Math.min(1, Math.log1p(bigrams.get(state.lastKey + '|' + candidate.key) || 0) / Math.log(20)) * 0.025 * naturalWeight : 0;
            const value = state.value + candidate.score * (edge.end - start) / length - 0.008 - repeat + adjacent;
            beams[edge.end].push({entries, value, order: order++, lastKey: candidate.key});
          }
          if (beams[edge.end].length > 2000) {
            beams[edge.end].sort((first, second) => second.value - first.value || first.order - second.order);
            beams[edge.end] = beams[edge.end].slice(0, 160);
            bounded = true;
          }
        }
        if (performance.now() - sliceStarted >= 8) { await pause(); sliceStarted = performance.now(); }
      }
      beams[length].sort((first, second) => second.value - first.value || first.order - second.order);
      if (beams[length].length > 600) bounded = true;
      for (const state of beams[length].slice(0, 600)) candidates.push(scorer.score(state.entries));
    }
    const unique = new Map();
    candidates.forEach((item, order) => {
      const textKey = item.word + ':' + item.entries.map(entry => entry.reading).join(' ');
      const previous = unique.get(textKey);
      if (!previous || item.score > previous.score) unique.set(textKey, {...item, order});
    });
    const items = Array.from(unique.values()).filter(item => item.passes);
    items.sort((first, second) => second.score - first.score || first.order - second.order);
    if (items.length > 600) bounded = true;
    return {items: (options.pos?.includes('particle') ? items : CantoQuality.diversifyWords(items)).slice(0, 600), bounded, considered: candidates.length, scanned, weights: scorer.weights};
  }
  root.CantoRank = {DEFAULT_WEIGHTS, normalize, vector, cosine, normalizedWeights, metadata, createScorer, retrieve, preferenceKey, scope, pairCount:(first, second) => root.CANTO_CORPUS?.bigrams[first]?.[second] || 0};
})(globalThis);
