(function (root) {
  async function rerank(items, selectIds, context = {}) {
    if (typeof selectIds !== 'function') return items;
    const shortlist = items.slice(0, 30);
    const candidates = shortlist.map((item, id) => ({id, text: item.word, reading: item.entries.map(entry => entry.reading).join(' '), code: item.code}));
    try {
      const selected = await selectIds({candidates, context});
      if (!Array.isArray(selected)) return items;
      const seen = new Set();
      const reordered = [];
      for (const id of selected) {
        if (!Number.isInteger(id) || id < 0 || id >= shortlist.length || seen.has(id)) continue;
        seen.add(id);
        reordered.push(shortlist[id]);
      }
      return [...reordered, ...shortlist.filter((item, id) => !seen.has(id)), ...items.slice(30)];
    } catch { return items; }
  }
  root.CantoReranker = {rerank};
})(globalThis);
