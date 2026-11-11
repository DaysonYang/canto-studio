(function (root) {
  const labels = {noun:'名詞',verb:'動詞',adjective:'形容詞',adverb:'副詞',pronoun:'代詞',quantity:'數量詞',location:'時間／方位詞',connector:'介詞／連詞',particle:'助詞／語氣助詞',phrase:'固定表達',unknown:'未分類'};
  const cache = new Map();
  function category(word, pos) {
    if (/^[tsf]/.test(pos)) return 'location';
    if (/^[uye]/.test(pos)) return 'particle';
    if (/^[az]/.test(pos)) return 'adjective';
    if (/^d/.test(pos)) return 'adverb';
    if (/^n/.test(pos)) return 'noun';
    if (/^v/.test(pos)) return 'verb';
    if (/^r/.test(pos)) return 'pronoun';
    if (/^[mq]/.test(pos)) return 'quantity';
    if (/^[pc]/.test(pos)) return 'connector';
    if (/^[il]/.test(pos)) return 'phrase';
    const role = CantoQuality.role(word,pos);
    return ['link','auxiliary','interjection'].includes(role) ? 'particle' : role;
  }
  function tags(word) {
    if (!cache.has(word)) {
      const record = root.CANTO_CORPUS?.words[word];
      const raw = Object.keys(record?.[4] || (record?.[1] ? {[record[1]]:1} : {}));
      const found = new Set((raw.length ? raw : ['']).map(pos => category(word,pos)).filter(tag=>tag!=='unknown'));
      if (CantoQuality.isParticle(CantoQuality.role(word)) || CantoQuality.role(word)==='link') found.add('particle');
      if (!found.size) found.add('unknown');
      cache.set(word, [...found]);
    }
    return cache.get(word);
  }
  function matches(entry, selected) {
    return !selected?.length || tags(entry.word).some(tag=>selected.includes(tag));
  }
  function controls(title, selected, onChange) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${title}：${selected.length ? selected.map(tag=>labels[tag]).join('、') : '全部'}`;
    details.append(summary);
    const choices = document.createElement('div');
    choices.className = 'smart-modes';
    const inputs = new Map();
    for (const [tag, label] of Object.entries({all:'全部',...labels})) {
      const item = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = tag === 'all' ? !selected.length : selected.includes(tag);
      inputs.set(tag,input);
      input.onchange = () => {
        const next = tag === 'all' ? [] : [...inputs].filter(([key,field])=>key !== 'all' && field.checked).map(([key])=>key);
        for (const [key,field] of inputs) field.checked = key === 'all' ? !next.length : next.includes(key);
        summary.textContent = `${title}：${next.length ? next.map(key=>labels[key]).join('、') : '全部'}`;
        onChange(next);
      };
      item.append(input,document.createTextNode(label));
      choices.append(item);
    }
    details.append(choices);
    return details;
  }
  root.CantoPOS = {labels,tags,matches,controls};
})(globalThis);
