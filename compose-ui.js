(function (root) {
  const field = id => document.getElementById(id);
  const core = CantoComposeEngine;
  const pageSize = 10;
  let context;
  let activeMapping = CantoEngine.DEFAULT_MAPPING;
  let slots = [];
  let history = [];
  let view;
  let revision = 0;
  let mobileSlot = 0;
  let slotCache = new WeakMap();
  try { const stored = JSON.parse(localStorage.getItem('canto-combinations-v1')); if (Array.isArray(stored)) history = stored; } catch {}
  const message = text => { field('compose-status').textContent = text; };
  function node(tag,text = '') { const item = document.createElement(tag); item.textContent = text; return item; }
  function button(text,action,disabled = false) { const item = node('button',text); item.type = 'button'; item.disabled = disabled; item.onclick = action; return item; }
  function selection(slot) { return core.valid(context,slot,slot.selected) ? slot.selected : null; }
  function currentText() { return slots.map(slot=>selection(slot) ? view.displayWord(slot.selected.word) : '□'.repeat(slot.code.length)).join(''); }
  function changed() { revision++; field('compose-recommendations').replaceChildren(); }
  function renderCurrent() {
    const line = field('compose-current');
    line.replaceChildren();
    slots.forEach((slot,position)=>{
      const entry = selection(slot);
      if (position) line.append(node('span',' ＋ '));
      line.append(button(entry ? view.displayWord(entry.word) : '□'.repeat(slot.code.length),()=>{
        mobileSlot = position;
        showMobileSlot();
        field('compose-slots').children[position]?.scrollIntoView?.({block:'nearest'});
      }));
    });
    field('compose-copy').disabled = !context || !slots.some(selection);
    field('compose-save').disabled = !context || !slots.some(selection);
    field('compose-favorite').disabled = field('compose-save').disabled;
    field('compose-clear').disabled = !slots.some(slot=>slot.selected && !slot.locked);
    field('compose-recommend').disabled = !context || !slots.length;
  }
  function showMobileSlot() {
    [...field('compose-slots').children].forEach((card,position)=>{card.dataset.active = String(position===mobileSlot);});
    field('compose-mobile').value = String(mobileSlot);
  }
  function renderSlots() {
    const area = field('compose-slots');
    area.replaceChildren();
    const picker = field('compose-mobile');
    picker.replaceChildren();
    mobileSlot = Math.min(mobileSlot,Math.max(0,slots.length-1));
    slots.forEach((slot,position)=>{
      const option = node('option',`第 ${position+1} 組 · ${slot.code}`);
      option.value = String(position);
      picker.append(option);
      const card = node('article');
      card.className = 'segment compose-slot';
      const chosen = selection(slot);
      card.append(node('h3',`第 ${position+1} 組 · ${slot.code} · ${slot.code.length} 字`));
      const selectedText = chosen ? `${view.displayWord(chosen.word)} · ${chosen.reading}` : slot.selected ? `${view.displayWord(slot.selected.word)} · 目前不計入組合（此讀音現編為 ${CantoEngine.encode(slot.selected.reading,activeMapping)}）` : '未選詞';
      card.append(node('p',selectedText));
      const selectedActions = node('div'); selectedActions.className = 'actions';
      const lock = button(slot.locked ? '解除鎖定' : '鎖定',()=>{slot.locked=!slot.locked; changed(); render();},!slot.locked && !chosen);
      lock.setAttribute('aria-pressed',String(slot.locked));
      selectedActions.append(lock,button('清空',()=>{slot.selected=null;changed();render();},slot.locked || !slot.selected));
      card.append(selectedActions);
      const query = node('input'); query.type = 'search'; query.placeholder = '搜尋候選詞或粵拼'; query.value = slot.query;
      query.setAttribute('aria-label',`第 ${position+1} 組搜尋候選詞或粵拼`);
      const sort = node('select'); sort.setAttribute('aria-label',`第 ${position+1} 組排序`);
      for (const [key,label] of [['smart','智能推薦'],['frequency','常用優先'],['theme','主題相關']]) {const choice=node('option',label); choice.value=key;sort.append(choice);}
      sort.value = slot.sort;
      const list = node('div'); list.className = 'compose-list';
      let request = 0;
      function candidates() {
        const ticket = ++request;
        const snapshot = context;
        list.replaceChildren(node('p',snapshot ? '正在查找候選…' : '請先輸入符合目前模式的編碼。'));
        if (!snapshot) return;
        setTimeout(()=>{
          if (ticket!==request || snapshot!==context || !list.isConnected) return;
          const topic = field('compose-topic').value.trim();
          const dynamic = field('compose-dynamic').checked;
          const key = JSON.stringify([slot.pos,slot.sort,slot.query,topic,dynamic ? slots.map(other=>selection(other)?.word || '') : []]);
          let cached = slotCache.get(slot);
          if (!cached || cached.key!==key) {cached={key,items:core.rank(snapshot,slot,slots,topic,dynamic)};slotCache.set(slot,cached);}
          const items = cached.items;
          const pages = Math.ceil(items.length / pageSize);
          function renderPage(page) {
            slot.page = Math.max(0,Math.min(page,pages-1));
            list.replaceChildren(node('p',items.length ? `${items.length} 個讀音候選` : '沒有符合此組條件的詞語。'));
            const start = slot.page * pageSize;
            for (const entry of items.slice(start,start+pageSize)) {
              const row = node('div'); row.className = 'compose-word';
              const label = node('div');
              label.append(node('strong',view.displayWord(entry.word)),node('small',`${entry.reading} · ${CantoPOS.tags(entry.word).map(tag=>CantoPOS.labels[tag]).join('、')}`));
              const picked = core.same(chosen,entry);
              row.append(label,button(picked ? '已選' : chosen ? '替換' : '選用',()=>{
                if (!slot.locked && core.valid(context,slot,entry) && core.filtered(context,slot).some(candidate=>core.same(candidate,entry))) {slot.selected=entry;changed();render();}
              },slot.locked || picked));
              list.append(row);
            }
            if (pages > 1) {
              const pager = node('nav'); pager.className = 'compose-pager';
              pager.setAttribute('aria-label',`第 ${position+1} 組候選分頁`);
              const status = node('span',`${slot.page+1}／${pages} 頁`);
              status.setAttribute('role','status');
              pager.append(button('上一頁',()=>renderPage(slot.page-1),slot.page===0),status,button('下一頁',()=>renderPage(slot.page+1),slot.page+1===pages));
              list.append(pager);
            }
          }
          renderPage(slot.page);
        },0);
      }
      let timer;
      query.oninput = () => {slot.query=query.value;slot.page=0;changed();clearTimeout(timer);timer=setTimeout(candidates,160);};
      sort.onchange = () => {slot.sort=sort.value;slot.page=0;changed();candidates();};
      card.append(query,sort,CantoPOS.controls('詞性',slot.pos,next=>{slot.pos=next;slot.page=0;changed();candidates();}),list);
      area.append(card);
      candidates();
    });
    showMobileSlot();
  }
  function render() { renderCurrent(); renderSlots(); }
  function search(next, mapping = next?.mapping || activeMapping) {
    const previous = slots.map(slot=>slot.code).join('');
    const currentParts = slots.map(slot=>slot.code.length);
    context = next;
    activeMapping = mapping;
    slotCache = new WeakMap();
    changed();
    if (!next) { render(); message('保留原來的選詞；請先輸入目前模式可用的編碼。'); return; }
    const choices = core.suggestions(next.code,next.found);
    let start = 0;
    const parts = previous.length===next.code.length && slots.length ? currentParts.map(length=>{const part=next.code.slice(start,start+length);start+=length;return part;}) : core.parse(next.code,choices[0] || next.code);
    slots = core.slotsFor(parts,slots);
    for (const slot of slots) {
      const matched = core.entries(next,slot).find(entry=>core.same(entry,slot.selected));
      if (matched) slot.selected = matched;
    }
    field('compose-split').value = parts.join(' + ');
    const plans = field('compose-plans');
    const prompt = node('option','選擇自動拆分方案'); prompt.value = '';
    plans.replaceChildren(prompt);
    for (const choice of choices) { const option=node('option',choice); option.value=choice;plans.append(option); }
    render();
    message(slots.some(slot=>slot.selected && !selection(slot)) ? '部分舊選詞不符合目前編碼。已保留作參考，不計入組合；可解除鎖定後替換。' : '選詞後即時更新目前組合。');
  }
  function repartition(value) {
    if (!context) {message('請先搜尋有效編碼。');return;}
    try {
      const parts = core.parse(context.code,value);
      const next = core.slotsFor(parts,slots);
      if (slots.some(slot=>slot.locked && !next.some(other=>other.start===slot.start && other.end===slot.end))) throw Error('這個切法會改動已鎖定的詞組，請先解除該組鎖定。');
      slots=next;
      field('compose-split').value=parts.join(' + ');
      changed();render();message('已套用新切法，保留位置未變的選詞。');
    } catch (error) {message(error.message);}
  }
  function load(record) {
    slots = core.slotsFor(record.parts);
    slots.forEach((slot,position)=>Object.assign(slot,{selected:record.picks[position]?.entry || null,locked:Boolean(record.picks[position]?.locked)}));
  }
  function save(favorite) {
    if (!context || !slots.some(selection)) return;
    if (slots.some(slot=>slot.selected && !selection(slot))) {message('請先清空或替換不符合編碼的選詞。');return;}
    const record={code:context.code,mapping:context.mapping.join(''),parts:slots.map(slot=>slot.code),picks:slots.map(slot=>({entry:selection(slot),locked:slot.locked})),text:currentText()};
    const key=JSON.stringify([record.mapping,record.parts,record.picks.map(pick=>[pick.entry?.word,pick.entry?.reading])]);
    const existing=history.find(item=>item.key===key);
    history=[{...record,key,favorite:favorite || Boolean(existing?.favorite)},...history.filter(item=>item.key!==key)].slice(0,50);
    try {localStorage.setItem('canto-combinations-v1',JSON.stringify(history));message(favorite?'已收藏組合。':'已保存組合。');} catch {message('已保存在本次頁面，瀏覽器不允許長期儲存。');}
    renderHistory();
  }
  function renderHistory() {
    const area=field('compose-history'); area.replaceChildren();
    if (!history.length) area.append(node('p','尚未保存組合。'));
    for (const record of history.filter(record=>Array.isArray(record?.parts) && Array.isArray(record.picks))) {
      area.append(button(`${record.favorite?'★ ':''}${record.text} · ${record.parts.join(' + ')}`,()=>view.restore(record)));
    }
  }
  async function recommend() {
    if (!context) return;
    changed();
    const ticket=revision;
    const snapshot=context;
    const graph=core.recommendationGraph(snapshot,slots);
    if (!graph) {message('有槽位沒有符合篩選的候選，或鎖定詞已不符合條件。請調整該槽。');return;}
    message('正在檢查各槽位的詞性、搭配與聲調…');
    const topic=field('compose-topic').value.trim();
    try {
      const result=await CantoSentence.retrieve(graph,{modes:{natural:true,theme:Boolean(topic)},weights:CantoRank.DEFAULT_WEIGHTS,theme:topic,style:'lyrics',sort:'smart'},slots.map(slot=>slot.code),()=>ticket!==revision,snapshot);
      if (!result || ticket!==revision) return;
      if (!result.items.length) {message('目前沒有搭配證據足夠的推薦。可以改切法或放寬個別槽位的篩選；仍可自由選詞。');return;}
      for (const item of result.items.slice(0,8)) {
        field('compose-recommendations').append(button('採用：'+view.displayWord(item.word),()=>{
          if (core.apply(context,slots,item.entries)) {changed();render();message('已填入推薦，鎖定詞保持不變。');}
          else message('條件已變更，請重新推薦。');
        }));
      }
      message('以下只由各槽位的合格詞條組成，請試唱確認。');
    } catch (error) {if (ticket===revision) message('未能完成推薦：'+error.message);}
  }
  function init(options) {
    view=options;
    field('compose-apply').onclick=()=>repartition(field('compose-split').value);
    field('compose-split').onkeydown=event=>{if (event.key==='Enter' && !event.isComposing) {event.preventDefault();field('compose-apply').onclick();}};
    field('compose-plans').onchange=()=>{if (field('compose-plans').value) repartition(field('compose-plans').value);};
    field('compose-mobile').onchange=()=>{mobileSlot=Number(field('compose-mobile').value)||0;showMobileSlot();};
    field('compose-copy').onclick=async()=>{try {await navigator.clipboard.writeText(currentText());message('已複製目前組合。');} catch {message('瀏覽器不允許複製，請手動選取。');}};
    field('compose-save').onclick=()=>save(false);
    field('compose-favorite').onclick=()=>save(true);
    field('compose-clear').onclick=()=>{slots.forEach(slot=>{if (!slot.locked) slot.selected=null;});changed();render();};
    field('compose-recommend').onclick=recommend;
    field('compose-dynamic').onchange=()=>{changed();render();};
    let timer;
    field('compose-topic').oninput=()=>{changed();clearTimeout(timer);timer=setTimeout(render,160);};
    renderHistory();
  }
  root.CantoCompose = {init,search,load,translate:()=>{if (view) {render();renderHistory();}}};
})(globalThis);
