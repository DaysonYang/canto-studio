(function (root) {
  const particles = new Set(Array.from('啊呀啦喇㗎嘎喎呢咩囉啰囖嚹嗎吗嘛啫咋嘞嗱噃𡃉吖呵欸呃哩啵喔咯嗻哦嘩'));
  const modifiers = new Set(['唔','冇','未','咪','唔好','好','太','更加','都','又','仲','已經','仍然','成日','淨係']);
  function role(word, pos = '') {
    if (word === '嘅' || word === '的') return 'link';
    if (particles.has(word) || /^y/.test(pos)) return 'particle';
    if (/^e/.test(pos)) return 'interjection';
    if (modifiers.has(word) || /^d/.test(pos)) return 'adverb';
    if (/^r/.test(pos)) return 'pronoun';
    if (/^v/.test(pos)) return 'verb';
    if (/^[az]/.test(pos)) return 'adjective';
    if (/^[nts]/.test(pos)) return 'noun';
    if (/^[mq]/.test(pos)) return 'quantity';
    if (/^[pc]/.test(pos)) return 'connector';
    if (/^u/.test(pos)) return 'auxiliary';
    if (/^[il]/.test(pos)) return 'phrase';
    return 'unknown';
  }
  const isParticle = type => type === 'particle' || type === 'interjection';
  const isPredicate = type => type === 'verb' || type === 'adjective';
  const isContent = type => ['noun','verb','adjective','adverb','phrase'].includes(type);
  function inspect(entries, roles) {
    let penalty = 0;
    let particleCount = 0;
    for (let position = 0; position < roles.length; position++) {
      if (!isParticle(roles[position])) continue;
      particleCount++;
      if (position !== roles.length - 1 || !roles.slice(0, position).some(isContent)) penalty += 0.28;
      if (isParticle(roles[position - 1])) penalty += 0.45;
    }
    if (roles.length === 1 && roles[0] === 'link') penalty += 0.30;
    if (roles.length > 1) {
      penalty += (entries.length - new Set(entries.map(entry => entry.word)).size) * 0.09;
      penalty += Math.max(0, entries.filter(entry => entry.code.length === 1).length - 2) * 0.035;
    }
    return {penalty, particleCount, pureParticle: roles.every(type => isParticle(type) || type === 'link')};
  }
  function diversifyWords(items) {
    const front = [];
    const deferred = [];
    const seen = new Set();
    let particleSlots = 0;
    for (const item of items) {
      const key = CantoRank.normalize(item.word);
      if (front.length < 10 && !seen.has(key) && (!item.pureParticle || particleSlots < 2)) {
        seen.add(key);
        front.push(item);
        if (item.pureParticle) particleSlots++;
      } else deferred.push(item);
    }
    return [...front, ...deferred];
  }
  root.CantoQuality = {role, isParticle, isPredicate, isContent, inspect, diversifyWords};
})(globalThis);
