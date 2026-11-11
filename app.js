const engine = CantoEngine;
window.addEventListener('pagehide', () => CantoSpeech.stop());
const element = id => document.getElementById(id);
let mapping = [...engine.DEFAULT_MAPPING];
let encodingMode = engine.DEFAULT_MODE;
let exampleQuery = false;
let index = engine.createIndex(CANTO_DATA, mapping);
let locks = [];
let result;
let currentConstraints = null;
let workspaceTab = 'words';
let wordPOS = [];
const acceptWord = entry => CantoPOS.matches(entry,wordPOS);
let scriptMode = 'traditional';
let originalDraft = null;
let resolvedCode = element('code').value;
let readingQuery = '';
let readingChoices = [];
let rhymeEnabled = false;
const readingIndex = engine.createReadingIndex(CANTO_DATA, CantoVariants.normalizeCharacter);
const textRecords = new WeakMap();
const attributeRecords = new WeakMap();
const displayWord = word => scriptMode === 'simplified' ? CantoVariants.toSimplified(word) : word;
function translatePage() {
  document.documentElement.lang = scriptMode === 'simplified' ? 'zh-Hans' : 'zh-Hant';
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script, style, #script-mode')) continue;
    const record = textRecords.get(node);
    const original = record && record.shown === node.nodeValue ? record.original : node.nodeValue;
    const shown = displayWord(original);
    textRecords.set(node, {original, shown});
    if (node.nodeValue !== shown) node.nodeValue = shown;
  }
  document.querySelectorAll('[aria-label], [placeholder]').forEach(node => {
    if (node.id === 'script-mode') return;
    const records = attributeRecords.get(node) || {};
    for (const attribute of ['aria-label', 'placeholder']) {
      if (!node.hasAttribute(attribute)) continue;
      const value = node.getAttribute(attribute);
      const record = records[attribute];
      const original = record && record.shown === value ? record.original : value;
      const shown = displayWord(original);
      records[attribute] = {original, shown};
      if (value !== shown) node.setAttribute(attribute, shown);
    }
    attributeRecords.set(node, records);
  });
}
function button(label, action, disabled = false) {
  const node = document.createElement('button');
  node.textContent = label;
  node.disabled = disabled;
  node.onclick = action;
  return node;
}
function invalidate() {
  CantoSmart.cancel();
  currentConstraints = null;
  CantoSpeech.stop();
  result = null;
  if (workspaceTab === 'compose') CantoCompose.search(null,engine.ENCODING_MODES[encodingMode]);
  else renderResults();
  element('summary').textContent = '條件已變更，請重新搜尋。';
}
function renderTiles() {
  const characters = Array.from(element('lyrics').value);
  const code = resolvedCode;
  element('tiles').replaceChildren();
  for (let position = 0; position < code.length; position++) {
    const character = characters[position] || '□';
    const tile = button('', () => {
      if (character === '□') return;
      locks[position] = locks[position] ? null : character;
      invalidate();
      renderTiles();
    });
    tile.className = 'tile' + (locks[position] ? ' locked' : '');
    tile.setAttribute('aria-pressed', String(Boolean(locks[position])));
    tile.setAttribute('aria-label', `第 ${position + 1} 字 ${character}，${locks[position] ? '已鎖定' : '未鎖定'}`);
    for (const [tag, text] of [['span', code[position]], ['b', character], ['small', locks[position] ? '已鎖定' : '點擊鎖定']]) {
      const node = document.createElement(tag);
      node.textContent = text;
      tile.append(node);
    }
    element('tiles').append(tile);
  }
}
function renderExampleTones() {
  const values = engine.ENCODING_MODES[encodingMode];
  element('encoding-map').textContent = '目前六調對應：' + values.map((digit, position) => `${position + 1}聲→${digit}`).join('　');
  const tables = [engine.EXAMPLE, engine.TONE_EXAMPLE].map(example => {
    const table = document.createElement('table');
    table.setAttribute('aria-label', example.traditional + '的聲調與填詞編碼');
    const syllables = example.reading.split(' ');
    const rows = [
      ['漢字', ...Array.from(example.traditional)],
      ['粵拼', ...syllables],
      ['六調', ...syllables.map(syllable => engine.toneDetails(syllable).six)],
      ['填詞編碼', ...engine.encode(example.reading, values)]
    ];
    for (const row of rows) {
      const line = document.createElement('tr');
      row.forEach((value, position) => { const cell = document.createElement(position === 0 ? 'th' : 'td'); cell.textContent = value; if (position === 0) cell.scope = 'row'; line.append(cell); });
      table.append(line);
    }
    return table;
  });
  element('example-tones').replaceChildren(...tables);
}
function renderResults() {
  CantoSpeech.stop();
  element('candidates').replaceChildren();
  if (!result || !currentConstraints) { CantoSmart.cancel(); element('rank-status').textContent = ''; return; }
  CantoSmart.show(result, currentConstraints, null, renderCandidate).catch(error => { element('rank-status').textContent = '排序暫時未能完成：' + error.message; });
}
function renderCandidate(item) {
    const entries = item.entries;
    const row = document.createElement('div');
    row.className = 'result ranked-result';
    const segments = document.createElement('div');
    segments.className = 'segments';
    for (const entry of entries) {
      const segment = document.createElement('div');
      segment.className = 'segment';
      const word = document.createElement('strong');
      Array.from(displayWord(entry.word)).forEach((character, position) => {
        const marked = document.createElement('span');
        marked.className = 'marked';
        const digit = document.createElement('em');
        digit.textContent = entry.code[position];
        marked.append(digit, document.createTextNode(character));
        word.append(marked);
      });
      const reading = document.createElement('p');
      reading.textContent = entry.reading;
      const source = document.createElement('small');
      source.textContent = `Rime / ${entry.source} · ${CantoPOS.tags(entry.word).map(tag=>CantoPOS.labels[tag]).join('、')}`;
      const wordHeading = document.createElement('div');
      wordHeading.className = 'word-heading';
      const play = button('▶', () => CantoSpeech.play(entry, play, message => { element('speech-status').textContent = message; }));
      play.className = 'word-play';
      play.setAttribute('aria-label', `播放${displayWord(entry.word)}的粵語合成讀音`);
      play.setAttribute('aria-pressed', 'false');
      play.title = '播放／停止粵語合成朗讀';
      wordHeading.append(word, play);
      segment.append(wordHeading, reading, source);
      if (entries.length > 1) {
        const similar = button('更多類似這個', () => CantoSmart.addReference(entry.word));
        similar.className = 'segment-similar';
        segment.append(similar);
      }
      segments.append(segment);
    }
    const main = document.createElement('div');
    main.className = 'result-main';
    main.append(segments, button('填入', () => {
      const draft = entries.map(entry => entry.word).join('');
      element('lyrics').value = displayWord(draft);
      originalDraft = {traditional: draft, simplified: CantoVariants.toSimplified(draft)};
      renderTiles();
      element('message').textContent = entries.length > 1 ? '已填入詞條拼接；請自行判斷語意與歌詞自然度。' : '已填入完整詞條。';
    }));
    const meta = document.createElement('p');
    meta.className = 'result-metadata';
    const styleHint = item.styleName === '未限定' || item.styleName === '風格排序已關閉' ? item.styleName : `${item.styleName}（規則匹配${item.style >= 0.5 ? '較高' : '較低'}）`;
    meta.textContent = `${item.code} · ${Array.from(item.word).length} 字 · ${entries.map(entry => entry.code).join(' | ')} · 風格：${styleHint}`;
    const evidence = document.createElement('p');
    evidence.className = 'hint';
    const frequencies = item.info.map(info => info.count ? `詞形 ${info.count} 次／本讀音 ${info.readingCount} 次` : '無語料記錄');
    const neighbors = Array.from(new Set(item.info.flatMap(info => info.neighbors))).slice(0, 3);
    evidence.textContent = `HKCanCor：${frequencies.join('；')}。${neighbors.length ? '語料共現：' + neighbors.join('、') + '（非釋義）。' : ''} 詞性 ${item.info.map(info => info.role === 'particle' ? '語氣助詞' : info.role === 'link' ? '結構助詞' : info.pos || '未知').join('/')}；風格適配為啟發式。`;
    const scores = document.createElement('p');
    scores.className = 'hint';
    scores.textContent = `相關性訊號：上下文 ${item.components.context.toFixed(2)} · 主題 ${item.components.theme.toFixed(2)} · 相似 ${item.components.similar.toFixed(2)}（演算法分數，非機率或語言統計）。`;
    const explanation = document.createElement('details');
    const explanationTitle = document.createElement('summary');
    explanationTitle.textContent = '排序依據與語料記錄';
    explanation.append(explanationTitle, evidence, scores);
    row.append(main, meta, CantoSmart.actions(item), explanation);
    return row;
}
function runSearch() {
  CantoSmart.cancel();
  currentConstraints = null;
  try {
    const nextMapping = engine.ENCODING_MODES[encodingMode];
    const query = element('code').value.trim();
    element('recognized').replaceChildren();
    let code = query;
    let sourceSyllables = [];
    const mixed = /\d/.test(query) && /[^\d]/.test(query);
    const inputLocks = [];
    if (!/^\d*$/.test(query)) {
      if (Array.from(query).length > 24) throw Error('最多輸入 24 個字。');
      const segments = engine.recognizeMixed(readingIndex, query, CantoVariants.normalizeCharacter);
      if (!segments) throw Error('詞庫未能識別全部字詞，請檢查文字；不會猜測未知字的讀音。');
      if (readingQuery !== query) { readingQuery = query; readingChoices = []; }
      const heading = document.createElement('p');
      heading.textContent = '詞庫讀音（多音字請選擇符合語境的讀法）：';
      element('recognized').append(heading);
      code = '';
      segments.forEach((segment, position) => {
        if (segment.numeric) {
          code += segment.text;
          sourceSyllables.push(...Array(segment.text.length).fill(null));
          inputLocks.push(...Array(segment.text.length).fill(null));
          return;
        }
        const selected = readingChoices[position] || 0;
        const label = document.createElement('label');
        label.textContent = segment.text + '　';
        const select = document.createElement('select');
        select.setAttribute('aria-label', segment.text + '的讀音');
        segment.candidates.forEach((entry, rank) => {
          const option = document.createElement('option');
          option.value = String(rank);
          option.textContent = `${entry.reading} → ${engine.encode(entry.reading, nextMapping)}`;
          select.append(option);
        });
        select.value = String(selected);
        select.onchange = () => { readingChoices[position] = Number(select.value); runSearch(); };
        label.append(select);
        element('recognized').append(label);
        code += engine.encode(segment.candidates[selected].reading, nextMapping);
        sourceSyllables.push(...segment.candidates[selected].reading.split(' '));
        inputLocks.push(...Array.from(segment.text));
      });
      const encoding = document.createElement('p');
      encoding.textContent = `聲調編碼：${code}`;
      element('recognized').append(encoding);
    }
    if (!code.length || code.length > 24) throw Error('請輸入字詞或 1–24 個編碼數字。');
    const invalidDigits = [...new Set(Array.from(code).filter(digit => !nextMapping.includes(digit)))];
    if (invalidDigits.length) throw Error(`${encodingMode} 模式不支援數字 ${invalidDigits.join('、')}。已保留原輸入；請修改數字、輸入歌詞或切換模式。`);
    resolvedCode = code;
    renderTiles();
    let rhyme = [];
    if (rhymeEnabled) {
      const count = Number(element('rhyme-count').value);
      if (!sourceSyllables.length) throw Error('押韻需要字詞讀音，請在搜尋框輸入字詞，而不是純數字。');
      if (sourceSyllables.length < count) throw Error(`輸入字詞不足 ${count} 字，請減少押韻字數。`);
      const tail = sourceSyllables.slice(-count);
      if (tail.some(syllable => syllable === null)) throw Error('押韻範圍含有數字，無法確定韻母；請在末尾輸入足夠的歌詞，或減少押韻字數。');
      rhyme = tail.map(engine.rhymeFinal);
    }
    if (nextMapping.join('') !== mapping.join('')) {
      mapping = nextMapping;
      index = engine.createIndex(CANTO_DATA, mapping);
    }
    const effectiveLocks = locks.slice(0, code.length);
    if (mixed) inputLocks.forEach((character, position) => { if (character) effectiveLocks[position] = character; });
    if (workspaceTab === 'compose') {
      const found = engine.search(index,code,effectiveLocks,false,CantoVariants.normalizeCharacter,rhyme);
      CantoCompose.search({code,mapping:[...mapping],found});
      element('message').textContent = `已按 ${encodingMode} 搜尋每組真實詞條。`;
      return;
    }
    const accept = wordPOS.length ? acceptWord : null;
    result = engine.search(index, code, effectiveLocks, true, CantoVariants.normalizeCharacter, rhyme, accept);
    element('summary').textContent = result.combinations ? `找到 ${result.combinations} 條符合整段編碼的詞條讀音。` : '沒有符合整段編碼的完整詞條。若想分段選詞，請切換到「自由拼詞」。';
    element('message').textContent = `已按 ${encodingMode} 搜尋完整詞條。`;
    if (rhymeEnabled) element('message').textContent = `押韻已開啟：末尾 ${rhyme.length} 字，韻母 ${rhyme.join(' · ')}；同時保留原聲調條件。`;
    if (mixed) element('message').textContent += ' 混合輸入：數字位置找詞，歌詞位置保留原字。';
    currentConstraints = {code, mapping: [...mapping], locks: [...effectiveLocks], rhyme: [...rhyme], whole: true, pos:[...wordPOS]};
    renderResults();
  } catch (error) {
    resolvedCode = '';
    invalidate();
    renderTiles();
    element('message').textContent = error.message;
  }
}
let searchTimer;
function changeEncoding(nextMode, search = true) {
  if (nextMode === encodingMode) return;
  clearTimeout(searchTimer);
  const input = element('code');
  if (exampleQuery && input.value === engine.encode(engine.EXAMPLE.reading, engine.ENCODING_MODES[encodingMode])) input.value = engine.encode(engine.EXAMPLE.reading, engine.ENCODING_MODES[nextMode]);
  encodingMode = nextMode;
  for (const [id, mode] of [['encoding-loose', '0243'], ['encoding-strict', '394052']]) {
    element(id).setAttribute('aria-pressed', String(mode === nextMode));
    element(id).classList.toggle('primary', mode === nextMode);
  }
  renderExampleTones();
  if (search) runSearch();
}
element('encoding-loose').onclick = () => changeEncoding('0243');
element('encoding-strict').onclick = () => changeEncoding('394052');
element('code').oninput = () => {
  exampleQuery = false;
  locks = [];
  invalidate();
  renderTiles();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 180);
};
element('code').oncompositionstart = () => { clearTimeout(searchTimer); };
element('code').addEventListener('input', event => { if (event.isComposing) clearTimeout(searchTimer); });
element('code').oncompositionend = element('code').oninput;
element('code').onkeydown = event => { if (event.key === 'Enter') { clearTimeout(searchTimer); runSearch(); } };
element('lyrics').oninput = () => {
  originalDraft = null;
  const characters = Array.from(element('lyrics').value);
  locks = locks.map((value, position) => value === characters[position] ? value : null);
  invalidate();
  renderTiles();
};
element('unlock').onclick = () => { locks = []; invalidate(); renderTiles(); };
element('search').onclick = runSearch;
function switchTab(tab) {
  clearTimeout(searchTimer);
  workspaceTab = tab;
  const compose = tab === 'compose';
  element('word-panel').hidden = compose;
  element('compose-panel').hidden = !compose;
  for (const [id,active] of [['tab-words',!compose],['tab-compose',compose]]) {
    element(id).setAttribute('aria-pressed',String(active));
    element(id).classList.toggle('primary',active);
  }
  element('search').textContent = compose ? '查找各組詞語' : '查找字詞';
  runSearch();
}
element('tab-words').onclick = () => switchTab('words');
element('tab-compose').onclick = () => switchTab('compose');
element('rhyme-toggle').onclick = () => {
  rhymeEnabled = !rhymeEnabled;
  element('rhyme-toggle').setAttribute('aria-pressed', String(rhymeEnabled));
  element('rhyme-toggle').textContent = rhymeEnabled ? '押韻：開' : '押韻：關';
  element('rhyme-count').disabled = !rhymeEnabled;
  runSearch();
};
element('rhyme-count').onchange = runSearch;
element('example').onclick = () => {
  exampleQuery = true;
  element('code').value = engine.encode(engine.EXAMPLE.reading, engine.ENCODING_MODES[encodingMode]);
  element('lyrics').value = displayWord(engine.EXAMPLE.traditional);
  originalDraft = {traditional: engine.EXAMPLE.traditional, simplified: engine.EXAMPLE.simplified};
  locks = [];
  renderExampleTones();
  renderTiles();
  runSearch();
};
element('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(`${element('lyrics').value}\n${resolvedCode}`);
    element('message').textContent = '已複製草稿與目標編碼。';
  } catch { element('message').textContent = '瀏覽器未允許複製，請直接選取草稿文字複製。'; }
};
const words = new Set(CANTO_DATA.map(entry => entry[0]));
element('word-pos').append(CantoPOS.controls('詞性',wordPOS,next=>{wordPOS=next;runSearch();}));
CantoCompose.init({displayWord,restore:record=>{
  const mode = record.mapping === '334042' ? '0243' : '394052';
  changeEncoding(mode,false);
  element('code').value = record.code;
  exampleQuery = false;
  locks = [];
  rhymeEnabled = false;
  element('rhyme-toggle').setAttribute('aria-pressed','false');
  element('rhyme-toggle').textContent = '押韻：關';
  element('rhyme-count').disabled = true;
  CantoCompose.load(record);
  switchTab('compose');
}});
CantoSmart.init(() => {
  clearTimeout(searchTimer);
  runSearch();
});
renderExampleTones();
element('script-mode').onchange = () => {
  const draft = element('lyrics').value;
  const nextMode = element('script-mode').value;
  if (nextMode === scriptMode) return;
  if (nextMode === 'simplified') {
    const simplified = CantoVariants.toSimplified(draft);
    originalDraft = {traditional: draft, simplified};
    element('lyrics').value = simplified;
  } else {
    element('lyrics').value = originalDraft && originalDraft.simplified === draft ? originalDraft.traditional : CantoVariants.toTraditional(draft);
  }
  scriptMode = nextMode;
  const characters = Array.from(element('lyrics').value);
  locks = locks.map((value, position) => value ? characters[position] : null);
  renderTiles();
  if (workspaceTab === 'compose') CantoCompose.translate();
  else renderResults();
  translatePage();
  try { localStorage.setItem('canto-script-mode', scriptMode); } catch {}
};
new MutationObserver(translatePage).observe(document.documentElement, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'placeholder']});
element('stats').textContent = `${words.size.toLocaleString()} 個字詞 · ${CANTO_DATA.length.toLocaleString()} 條讀音 · 本地搜尋`;
renderTiles();
runSearch();
try {
  if (localStorage.getItem('canto-script-mode') === 'simplified') {
    element('script-mode').value = 'simplified';
    element('script-mode').onchange();
  }
} catch {}
