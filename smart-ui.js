(function (root) {
  const element = id => document.getElementById(id);
  let preferences = {favorites: [], dislikes: []};
  try {
    const stored = JSON.parse(localStorage.getItem('canto-preferences-v1'));
    if (stored && Array.isArray(stored.favorites) && Array.isArray(stored.dislikes)) preferences = {favorites: stored.favorites.filter(item => item && typeof item.key === 'string' && typeof item.word === 'string').slice(-250), dislikes: stored.dislikes.filter(item => item && typeof item.key === 'string' && typeof item.scope === 'string').slice(-200)};
  } catch {}
  const references = [];
  let refresh = () => {};
  let worker = null;
  let workerFailed = false;
  let version = 0;
  let pending = null;
  let lastOptions;
  const cache = new Map();
  let resizeResults = null;
  const modes = ['context', 'theme', 'natural', 'similar'];
  const names = {context: '上下文相關性', theme: '主題相關性', natural: '語料常用度／風格', similar: '相似詞相關性'};
  function save() {
    try { localStorage.setItem('canto-preferences-v1', JSON.stringify(preferences)); }
    catch { element('preference-status').textContent = '瀏覽器未允許本地儲存，本次偏好仍生效，關閉後不保留。'; }
    element('favorite-count').textContent = `收藏 ${preferences.favorites.length} 個`;
  }
  function addReference(word) {
    if (!references.includes(word) && references.length < 12) references.push(word);
    element('use-similar').checked = true;
    renderReferences();
    refresh();
  }
  function renderReferences() {
    element('reference-chips').replaceChildren();
    for (const word of references) {
      const chip = document.createElement('button');
      chip.textContent = word + ' ×';
      chip.setAttribute('aria-label', '移除相似參考 ' + word);
      chip.onclick = () => { references.splice(references.indexOf(word), 1); renderReferences(); refresh(); };
      element('reference-chips').append(chip);
    }
  }
  function options() {
    const active = Object.fromEntries(modes.map(name => [name, element('use-' + name).checked]));
    return {modes:active, weights: Object.fromEntries(modes.map(name => [name, Number(element('weight-' + name).value)])), context: element('semantic-context').value, theme: element('semantic-theme').value, style: element('semantic-style').value, references: [...references], sort: element('rank-sort').value, relatedOnly: element('related-only').checked, strictStyle: element('strict-style').checked, preferences};
  }
  function updateWeights(current) {
    const texts = {context: current.context, theme: current.theme, similar: current.references.join(' ')};
    const normalized = CantoRank.normalizedWeights(current.modes, current.weights, texts);
    for (const name of modes) {
      element('weight-' + name).disabled = !current.modes[name];
      element('weight-value-' + name).textContent = `${current.weights[name]}（有效 ${Math.round(normalized[name] * 100)}%）`;
    }
    element('semantic-context-box').hidden = !element('use-context').checked;
    element('semantic-theme-box').hidden = !element('use-theme').checked;
    element('semantic-style-box').hidden = !current.modes.natural;
    element('semantic-similar-box').hidden = !current.modes.similar;
  }
  function init(onChange) {
    let timer;
    let appliedStyle;
    refresh = () => {
      clearTimeout(timer);
      appliedStyle = element('semantic-style').value;
      const sortMode = {context:'context', theme:'theme', frequency:'natural', similar:'similar'}[element('rank-sort').value];
      if (sortMode && !element('use-' + sortMode).checked) element('rank-sort').value = 'smart';
      updateWeights(options());
      onChange();
    };
    element('smart-controls').innerHTML = `
      <div class="smart-modes" role="group" aria-label="智能搜尋模式">
        <label><input type="checkbox" id="use-context">根據上下文</label>
        <label><input type="checkbox" id="use-theme">根據主題</label>
        <label><input type="checkbox" id="use-natural" checked>優先常用自然表達</label>
        <label><input type="checkbox" id="use-similar">查找相似詞</label>
      </div>
      <p class="hint">變更篩選會自動重新搜尋，仍只查符合整段編碼的完整詞條。</p>
      <div id="semantic-context-box" hidden><label for="semantic-context">已有歌詞</label><textarea id="semantic-context" maxlength="1200" rows="3" placeholder="貼上一句或第一段歌詞"></textarea></div>
      <div id="semantic-theme-box" hidden><label for="semantic-theme">主題／關鍵詞</label><input id="semantic-theme" maxlength="200" placeholder="例如 思念 雨夜 城市；可同時輸入多個主題"></div>
      <div id="semantic-style-box"><label for="semantic-style">表達風格</label><select id="semantic-style" aria-describedby="semantic-style-help"><option value="any">不限風格</option><option value="daily">日常粵語</option><option value="lyrics">粵語流行歌詞</option><option value="poetic">文藝／詩意</option><option value="written">書面中文</option></select><p id="semantic-style-help" class="hint">選擇風格後會立即重新搜尋。</p></div>
      <div id="semantic-similar-box" hidden><p class="hint">點結果的「更多類似這個」可加入多個參考；不改變當前聲調與字數。</p><div id="reference-chips" class="actions"></div><button id="use-favorites">用收藏作參考</button></div>
      <details><summary>高級排序與篩選</summary><div id="weight-controls"></div><button id="reset-weights">恢復預設權重</button>
      <label class="check-label"><input id="related-only" type="checkbox">只保留有語義關聯訊號的結果</label>
      <label class="check-label"><input id="strict-style" type="checkbox">嚴格篩選所選風格（啟發式規則）</label>
      <p class="hint">語義使用 HKCanCor 共現 PPMI 向量、字詞重合與簡單的人稱、相鄰詞訊號，無法完整理解故事或轉折。未收錄的新主題可能只能按字面匹配。風格為詞性／詞長／語料覆蓋規則，並非驗證過的歌詞品質評分。</p></details>
      <div class="preference-tools"><span id="favorite-count"></span><button id="show-favorites">查看收藏</button><button id="clear-preferences">清除偏好</button><span id="preference-status" role="status"></span></div><div id="favorite-list" hidden></div>`;
    for (const name of modes) {
      const label = document.createElement('label');
      label.textContent = names[name] + ' ';
      const value = document.createElement('output');
      value.id = 'weight-value-' + name;
      const slider = document.createElement('input');
      slider.id = 'weight-' + name;
      slider.type = 'range';
      slider.min = '0'; slider.max = '100'; slider.value = CantoRank.DEFAULT_WEIGHTS[name];
      slider.setAttribute('aria-label', names[name]);
      label.append(value, slider);
      element('weight-controls').append(label);
    }
    const changed = () => { clearTimeout(timer); timer = setTimeout(refresh, 180); };
    const style = element('semantic-style');
    appliedStyle = style.value;
    const styleChanged = () => { if (style.value !== appliedStyle) refresh(); };
    style.addEventListener('input',styleChanged);
    style.addEventListener('change',styleChanged);
    for (const node of document.querySelectorAll('#smart-controls input,#smart-controls textarea,#smart-controls select')) {
      if (node === style) continue;
      if (node.type === 'checkbox' || node.tagName === 'SELECT') node.addEventListener('change', refresh);
      else node.addEventListener('input', changed);
    }
    const limit = element('result-limit');
    limit.onchange = () => { limit.value = String(resultPageSize(limit.value)); resizeResults?.(); };
    limit.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); limit.onchange(); } };
    element('rank-sort').onchange = () => {
      const mode = {context:'context', theme:'theme', frequency:'natural', similar:'similar'}[element('rank-sort').value];
      if (mode) element('use-' + mode).checked = true;
      refresh();
    };
    element('reset-weights').onclick = () => { for (const name of modes) element('weight-' + name).value = CantoRank.DEFAULT_WEIGHTS[name]; refresh(); };
    element('use-favorites').onclick = () => {
      references.splice(0, references.length, ...Array.from(new Set(preferences.favorites.map(item => item.word))).slice(-12));
      renderReferences(); refresh();
    };
    element('clear-preferences').onclick = () => { preferences = {favorites: [], dislikes: []}; references.splice(0); renderReferences(); save(); renderFavorites(); refresh(); };
    element('show-favorites').onclick = () => { element('favorite-list').hidden = !element('favorite-list').hidden; renderFavorites(); };
    save();
    updateWeights(options());
  }
  function renderFavorites() {
    element('favorite-list').replaceChildren();
    if (!preferences.favorites.length) element('favorite-list').textContent = '尚未收藏字詞。';
    for (const favorite of preferences.favorites) {
      const node = document.createElement('button');
      node.textContent = favorite.word + ' · 查找相似';
      node.onclick = () => addReference(favorite.word);
      element('favorite-list').append(node);
    }
  }
  function actions(item) {
    const area = document.createElement('div');
    area.className = 'result-actions';
    const favorite = preferences.favorites.some(entry => entry.key === item.key);
    const currentScope = CantoRank.scope(lastOptions || options());
    const disliked = preferences.dislikes.some(entry => entry.key === item.key && entry.scope === currentScope);
    const makeButton = (label, callback, pressed) => {
      const node = document.createElement('button');
      node.textContent = label;
      if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed));
      node.onclick = callback;
      area.append(node);
    };
    makeButton(favorite ? '★ 已收藏' : '☆ 收藏', () => {
      if (favorite) preferences.favorites = preferences.favorites.filter(entry => entry.key !== item.key);
      else preferences.favorites = [...preferences.favorites, {key:item.key, word:item.word}].slice(-250);
      save(); renderFavorites(); refresh();
    }, favorite);
    makeButton(disliked ? '撤銷不喜歡' : '不喜歡', () => {
      preferences.dislikes = preferences.dislikes.filter(entry => !(entry.key === item.key && entry.scope === currentScope));
      if (!disliked) preferences.dislikes.push({key:item.key, scope:currentScope});
      preferences.dislikes = preferences.dislikes.slice(-200);
      save(); refresh();
    }, disliked);
    makeButton('更多類似這個', () => addReference(item.word));
    makeButton('複製', async () => {
      try {
        const text = document.documentElement.lang === 'zh-Hans' ? CantoVariants.toSimplified(item.word) : item.word;
        await navigator.clipboard.writeText(text + '\n' + item.code);
        element('preference-status').textContent = '已複製字詞及聲調編碼。';
      } catch { element('preference-status').textContent = '瀏覽器未允許複製，請選取字詞手動複製。'; }
    });
    return area;
  }
  function cancel() {
    version++;
    resizeResults = null;
    if (pending) { pending.resolve(null); pending = null; }
  }
  function resultPageSize(value) {
    const count = Number(value);
    return value && Number.isFinite(count) ? Math.max(1, Math.min(100, Math.trunc(count))) : 12;
  }
  async function evaluate(found, constraints, currentOptions, parts, id) {
    if (!workerFailed && typeof Worker !== 'undefined' && location.protocol !== 'file:') {
      if (!worker) {
        try {
          worker = new Worker('ranking-worker.js');
          worker.onmessage = event => {
            if (pending && event.data.id === pending.id) {
              const job = pending; pending = null;
              if (event.data.error) job.reject(Error(event.data.error)); else job.resolve(event.data.result);
            }
          };
          worker.onerror = () => {
            workerFailed = true; worker.terminate(); worker = null;
            if (pending) { pending.reject(Error('worker unavailable')); pending = null; }
          };
        } catch { workerFailed = true; }
      }
      if (worker) {
        try {
          return await new Promise((resolve, reject) => { pending = {id, resolve, reject}; worker.postMessage({id, constraints, options:currentOptions, parts}); });
        } catch {
          if (id !== version) return null;
          workerFailed = true;
          if (worker) worker.terminate();
          worker = null;
        }
      }
    }
    return CantoRank.retrieve(found, currentOptions, parts, () => id !== version, constraints);
  }
  async function show(found, constraints, parts, renderItem) {
    cancel();
    const id = version;
    const currentOptions = {...options(),pos:constraints.pos};
    lastOptions = currentOptions;
    updateWeights(currentOptions);
    const area = element('candidates');
    area.replaceChildren();
    element('rank-status').textContent = '正在精確候選中排序…';
    const start = performance.now();
    const key = JSON.stringify([constraints,currentOptions,parts]);
    const cached = cache.get(key);
    const result = cached || await evaluate(found, constraints, currentOptions, parts, id);
    if (!result || id !== version) return;
    if (!cached) { if (cache.size >= 6) cache.delete(cache.keys().next().value); cache.set(key,result); }
    const elapsed = Math.round(performance.now() - start);
    element('rank-status').textContent = `${result.items.length} 個排序候選 · ${cached ? '已使用快取' : `${elapsed} ms`}。${result.bounded ? '採有界候選池，並非全組合窮舉或全域最優排名。' : '已排序本次可用候選。'} 字詞讀音均維持原聲調、字數、固定字及押韻要求。`;
    if (!result.items.length) {
      const note = document.createElement('p');
      note.textContent = '沒有符合目前條件的候選。可調整詞性、語義或風格篩選，聲調條件不會改動。';
      const relax = document.createElement('button');
      relax.textContent = '放寬語義與風格條件';
      relax.onclick = () => { element('related-only').checked = false; element('strict-style').checked = false; element('semantic-style').value = 'any'; refresh(); };
      area.append(note, relax);
      return;
    }
    function renderPage(page) {
      CantoSpeech.stop();
      const pageSize = resultPageSize(element('result-limit').value);
      const totalPages = Math.ceil(result.items.length / pageSize);
      const first = page * pageSize;
      const end = Math.min(first + pageSize, result.items.length);
      function navigation(bottom = false) {
        const nav = document.createElement('nav');
        nav.className = 'pager';
        nav.setAttribute('aria-label', bottom ? '結果分頁（底部）' : '結果分頁');
        const previous = document.createElement('button');
        const next = document.createElement('button');
        const status = document.createElement('span');
        status.setAttribute('role', 'status');
        status.textContent = `第 ${page + 1}／${totalPages} 頁 · ${first + 1}–${end}／${result.items.length} 項`;
        previous.textContent = '上一頁';
        next.textContent = '下一頁';
        previous.disabled = page === 0;
        next.disabled = page + 1 >= totalPages;
        const go = target => {
          renderPage(target);
          if (bottom) area.scrollIntoView?.({block:'start'});
          area.querySelectorAll('nav button')[target < page ? 0 : 1]?.focus();
        };
        previous.onclick = () => go(page - 1);
        next.onclick = () => go(page + 1);
        nav.append(previous, status, next);
        return nav;
      }
      area.replaceChildren(navigation(), ...result.items.slice(first, end).map(renderItem));
      if (totalPages > 1) area.append(navigation(true));
    }
    resizeResults = () => renderPage(0);
    resizeResults();
  }
  root.CantoSmart = {init, show, cancel, actions, addReference};
})(globalThis);
