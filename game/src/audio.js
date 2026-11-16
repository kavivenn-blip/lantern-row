// LANTERN ROW — sound. Every effect is synthesized with WebAudio: no audio files,
// no network, nothing to ship. A short noise burst through a filter is a gunshot;
// a sine blip is a hit tick; the bomb beeps faster as its fuse runs down.
export function createAudio() {
  let ctx = null;
  let master = null;
  const api = {
    ensure() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.4;
        master.connect(ctx.destination);
      } catch { ctx = null; }
    },
    shot(id, vol = 1) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const dur = id === 'harrier' ? 0.28 : id === 'gavel' ? 0.24 : 0.12;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = id === 'harrier' ? 900 : 2400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      noise.connect(filter); filter.connect(gain); gain.connect(master);
      noise.start(t); noise.stop(t + dur);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(id === 'harrier' ? 70 : 130, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.22 * vol, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(og); og.connect(master);
      osc.start(t); osc.stop(t + 0.1);
    },
    dry() { if (!ctx) return; click(1800, 0.05, 0.12); },
    reload() { if (!ctx) return; click(900, 0.05, 0.15); setTimeout(() => click(600, 0.05, 0.15), 180); },
    hit(head) { if (!ctx) return; click(head ? 2400 : 1500, 0.06, 0.2); },
    hurt() { if (!ctx) return; click(220, 0.12, 0.25); },
    plant() { if (!ctx) return; beep(880, 0.1); setTimeout(() => beep(880, 0.1), 150); },
    beep(freq = 1100) { if (!ctx) return; beep(freq, 0.07); },
    defuse() { if (!ctx) return; beep(660, 0.08); setTimeout(() => beep(660, 0.08), 120); },
    radio() { if (!ctx) return; click(1200, 0.04, 0.08); },
    round(win) {
      if (!ctx) return;
      const notes = win ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((f, i) => setTimeout(() => beep(f, 0.22), i * 130));
    },
    step() { if (!ctx) return; click(300, 0.03, 0.05); },
  };
  let _noise = null;
  function noiseBuffer() {
    if (_noise) return _noise;
    _noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = _noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return _noise;
  }
  function click(freq, dur, vol) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur);
  }
  function beep(freq, dur) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur);
  }
  return api;
}
