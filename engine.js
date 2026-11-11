(function (root) {
  const ENCODING_MODES = Object.freeze({'0243':Object.freeze(['3','3','4','0','4','2']), '394052':Object.freeze(['3','9','4','0','5','2'])});
  const DEFAULT_MODE = '394052';
  const DEFAULT_MAPPING = ENCODING_MODES[DEFAULT_MODE];
  const EXAMPLE = {traditional:'番茄醬牛肉麵不吃辣', simplified:'番茄酱牛肉面不吃辣', reading:'faan1 ke2 zoeng3 ngau4 juk6 min6 bat1 hek3 laat6'};
  const TONE_EXAMPLE = {traditional:'詩史試時市是', reading:'si1 si2 si3 si4 si5 si6'};
  function toneDetails(syllable, mapping = DEFAULT_MAPPING) {
    const six = Number(syllable.slice(-1));
    const checked = /[ptk][1-6]$/.test(syllable);
    const nine = checked ? ({1:7,3:8,6:9}[six] || six) : six;
    const names = ['陰平','陰上','陰去','陽平','陽上','陽去','陰入','中入','陽入'];
    return {six, nine, name:names[nine - 1], code:mapping[six - 1]};
  }
  function validateMapping(mapping) {
    if (!Array.isArray(mapping) || !Object.values(ENCODING_MODES).some(preset => mapping.length === preset.length && preset.every((digit, position) => digit === mapping[position]))) throw Error('只支援 0243 寬鬆與 394052 嚴格編碼。');
  }
  function encode(reading, mapping = DEFAULT_MAPPING) {
    return reading.split(' ').map(syllable => mapping[Number(syllable.slice(-1)) - 1]).join('');
  }
  function createIndex(data, mapping = DEFAULT_MAPPING) {
    validateMapping(mapping);
    const index = new Map();
    for (const [word, reading, source] of data) {
      const code = encode(reading, mapping);
      if (!index.has(code)) index.set(code, []);
      index.get(code).push({word, reading, source, code});
    }
    return index;
  }
  function rhymeFinal(syllable) {
    const plain = syllable.replace(/[1-6]$/, '');
    if (plain === 'm' || plain === 'ng') return plain;
    return plain.replace(/^(gw|kw|ng|[bpmfdtnlgkhwzcsj])/, '');
  }
  function search(index, code, locks = [], whole = false, normalize = character => character, rhyme = [], accept = null) {
    const length = code.length;
    const edges = Array.from({length: length + 1}, () => []);
    const normalizedLocks = locks.map(character => character ? normalize(character) : null);
    for (let start = 0; start < length; start++) {
      for (let end = length; end > start; end--) {
        if (whole && (start !== 0 || end !== length)) continue;
        const matching = index.get(code.slice(start, end));
        if (!matching?.length) continue;
        const checkRhyme = end > length - rhyme.length;
        const checkLocks = normalizedLocks.slice(start, end).some(Boolean);
        const candidates = !checkRhyme && !checkLocks && !accept ? matching : matching.filter(entry => {
          if (accept && !accept(entry)) return false;
          if (checkRhyme) {
            const syllables = entry.reading.split(' ');
            for (let offset = 0; offset < syllables.length; offset++) {
              const target = rhyme[start + offset - (length - rhyme.length)];
              if (target !== undefined && rhymeFinal(syllables[offset]) !== target) return false;
            }
          }
          return !checkLocks || Array.from(entry.word).every((character, offset) => !normalizedLocks[start + offset] || normalize(character) === normalizedLocks[start + offset]);
        });
        if (candidates.length) edges[start].push({start, end, code: code.slice(start, end), candidates});
      }
    }
    const ways = Array(length + 1).fill(0n);
    const combinations = Array(length + 1).fill(0n);
    ways[length] = 1n;
    combinations[length] = 1n;
    for (let start = length - 1; start >= 0; start--) {
      for (const edge of edges[start]) {
        ways[start] += ways[edge.end];
        combinations[start] += BigInt(edge.candidates.length) * combinations[edge.end];
      }
    }
    function partitionAt(rank) {
      if (rank < 0n || rank >= ways[0]) throw Error('分詞頁碼超出範圍');
      const path = [];
      let start = 0;
      while (start < length) {
        for (const edge of edges[start]) {
          if (rank >= ways[edge.end]) { rank -= ways[edge.end]; continue; }
          path.push(edge);
          start = edge.end;
          break;
        }
      }
      return path;
    }
    function rankOfPartition(parts) {
      if (!parts.length || parts.some(part => !/^\d+$/.test(part)) || parts.join('') !== code) throw Error('分詞須使用 + 分隔，並保持原編碼及順序不變。');
      let rank = 0n;
      let start = 0;
      for (const part of parts) {
        let selected = null;
        for (const edge of edges[start]) {
          if (edge.code === part) { selected = edge; break; }
          rank += ways[edge.end];
        }
        if (!selected || ways[selected.end] === 0n) throw Error('這種分詞沒有符合條件的詞條，請調整切分位置。');
        start = selected.end;
      }
      return rank;
    }
    return {ways: ways[0], combinations: combinations[0], partitionAt, rankOfPartition, edges};
  }
  function combinationCount(path) {
    return path.reduce((count, edge) => count * BigInt(edge.candidates.length), 1n);
  }
  function combinationAt(path, rank) {
    if (rank < 0n || rank >= combinationCount(path)) throw Error('組合頁碼超出範圍');
    const result = [];
    for (let position = path.length - 1; position >= 0; position--) {
      const candidates = path[position].candidates;
      result.unshift(candidates[Number(rank % BigInt(candidates.length))]);
      rank /= BigInt(candidates.length);
    }
    return result;
  }
  function createReadingIndex(data, normalize = character => character) {
    const readings = new Map();
    for (const [word, reading] of data) {
      const key = Array.from(word).map(normalize).join('');
      if (!readings.has(key)) readings.set(key, []);
      const candidates = readings.get(key);
      if (!candidates.some(entry => entry.reading === reading)) candidates.push({word, reading});
    }
    return readings;
  }
  function recognize(readings, text, normalize = character => character) {
    const characters = Array.from(text);
    const best = Array(characters.length + 1).fill(null);
    best[characters.length] = [];
    for (let start = characters.length - 1; start >= 0; start--) {
      for (let end = characters.length; end > start; end--) {
        if (!best[end]) continue;
        const key = characters.slice(start, end).map(normalize).join('');
        const candidates = readings.get(key);
        if (candidates && (!best[start] || best[end].length + 1 < best[start].length)) {
          best[start] = [{text: characters.slice(start, end).join(''), candidates}, ...best[end]];
        }
      }
    }
    return best[0];
  }
  function recognizeMixed(readings, text, normalize = character => character) {
    const segments = [];
    for (const token of text.match(/\d+|[^\d]+/g) || []) {
      if (/^\d+$/.test(token)) segments.push({text: token, numeric: true});
      else {
        const recognized = recognize(readings, token, normalize);
        if (!recognized) return null;
        segments.push(...recognized);
      }
    }
    return segments;
  }
  root.CantoEngine = {DEFAULT_MODE, DEFAULT_MAPPING, ENCODING_MODES, EXAMPLE, TONE_EXAMPLE, toneDetails, validateMapping, encode, createIndex, search, combinationCount, combinationAt, createReadingIndex, recognize, recognizeMixed, rhymeFinal};
})(globalThis);
