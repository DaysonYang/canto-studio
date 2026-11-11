(function (root) {
  function converter(characters, phrases) {
    const trie = new Map();
    for (const [key, value] of Object.entries({...characters, ...phrases})) {
      let branch = trie;
      for (const character of key) {
        if (!branch.has(character)) branch.set(character, new Map());
        branch = branch.get(character);
      }
      branch.value = value;
    }
    return text => {
      const input = Array.from(text);
      let result = '';
      for (let start = 0; start < input.length;) {
        let branch = trie;
        let value = input[start];
        let next = start + 1;
        for (let end = start; end < input.length && branch.has(input[end]); end++) {
          branch = branch.get(input[end]);
          if (branch.value !== undefined) { value = branch.value; next = end + 1; }
        }
        result += value;
        start = next;
      }
      return result;
    };
  }
  const data = root.CANTO_VARIANTS;
  root.CantoVariants = {
    toSimplified: converter(data.TSCharacters, data.TSPhrases),
    toTraditional: converter(data.STCharacters, data.STPhrases),
    normalizeCharacter: character => data.TSCharacters[character] || character
  };
})(globalThis);
