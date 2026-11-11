(function (root) {
  let active = null;
  let sequence = 0;
  function reset() {
    if (!active) return;
    active.textContent = '▶';
    active.setAttribute('aria-pressed', 'false');
    active = null;
  }
  function cantoneseVoice(voices) {
    const local = voices.filter(voice => voice.localService);
    return local.find(voice => /^yue(?:[-_]|$)/i.test(voice.lang)) || local.find(voice => /^zh[-_]HK$/i.test(voice.lang));
  }
  function stop() {
    sequence++;
    if (root.speechSynthesis) root.speechSynthesis.cancel();
    reset();
  }
  async function play(entry, control, report) {
    if (active === control) { stop(); return; }
    stop();
    const token = sequence;
    if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) {
      report('此瀏覽器不支援語音播放，請使用支援語音朗讀的瀏覽器。');
      return;
    }
    const synth = root.speechSynthesis;
    let voice = cantoneseVoice(synth.getVoices());
    if (!voice) {
      report('正在檢查裝置粵語語音…');
      await new Promise(resolve => {
        const ready = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', ready); resolve(); };
        const timer = setTimeout(ready, 1200);
        synth.addEventListener('voiceschanged', ready);
      });
      if (token !== sequence) return;
      voice = cantoneseVoice(synth.getVoices());
    }
    if (!voice) {
      report('裝置尚未提供粵語語音，請在系統語音設定加入「粵語／香港中文」後重試。');
      return;
    }
    const utterance = new root.SpeechSynthesisUtterance(entry.word);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.8;
    active = control;
    control.textContent = '■';
    control.setAttribute('aria-pressed', 'true');
    utterance.onend = () => { if (token === sequence) reset(); };
    utterance.onerror = () => {
      if (token !== sequence) return;
      reset();
      report('語音未能播放，請檢查裝置語音設定後重試。');
    };
    report(`粵語合成朗讀：${entry.word}。詞庫讀音 ${entry.reading}；合成語音可能採用不同的多音字讀法。`);
    synth.speak(utterance);
  }
  root.CantoSpeech = {play, stop, cantoneseVoice};
})(globalThis);
