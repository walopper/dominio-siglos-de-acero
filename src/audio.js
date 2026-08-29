export function createAudioDirector() {
  let context = null;
  let master = null;
  let ambience = null;
  let enabled = true;

  const ensure = () => {
    if (context) return context;
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.gain.value = 0.2;
    master.connect(context.destination);
    return context;
  };

  const tone = ({ frequency = 220, endFrequency = frequency, duration = 0.12, gain = 0.12, type = 'sine', delay = 0 }) => {
    if (!enabled) return;
    const ctx = ensure();
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.025, duration * 0.25));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  };

  const noise = (duration = 0.2, gain = 0.08, filterFrequency = 500) => {
    if (!enabled) return;
    const ctx = ensure();
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    envelope.gain.setValueAtTime(gain, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(envelope).connect(master);
    source.start();
  };

  const play = (name) => {
    if (name === 'select') tone({ frequency: 720, endFrequency: 880, duration: 0.07, gain: 0.045, type: 'triangle' });
    if (name === 'order') tone({ frequency: 410, endFrequency: 520, duration: 0.1, gain: 0.06, type: 'square' });
    if (name === 'build') {
      tone({ frequency: 140, endFrequency: 95, duration: 0.16, gain: 0.09, type: 'triangle' });
      noise(0.11, 0.03, 800);
    }
    if (name === 'shot') {
      noise(0.13, 0.12, 1300);
      tone({ frequency: 105, endFrequency: 42, duration: 0.18, gain: 0.12, type: 'sawtooth' });
    }
    if (name === 'explosion') {
      noise(0.5, 0.2, 350);
      tone({ frequency: 80, endFrequency: 25, duration: 0.55, gain: 0.16, type: 'sawtooth' });
    }
    if (name === 'alert') {
      tone({ frequency: 520, duration: 0.12, gain: 0.08, type: 'square' });
      tone({ frequency: 420, duration: 0.18, gain: 0.07, type: 'square', delay: 0.14 });
    }
    if (name === 'era') {
      [196, 262, 330, 392, 523].forEach((frequency, i) => tone({ frequency, duration: 0.55, gain: 0.055, type: 'triangle', delay: i * 0.11 }));
    }
    if (name === 'victory') {
      [262, 330, 392, 523].forEach((frequency, i) => tone({ frequency, duration: 0.8, gain: 0.07, type: 'triangle', delay: i * 0.18 }));
    }
  };

  const startAmbience = () => {
    if (!enabled || ambience) return;
    const ctx = ensure();
    const hum = ctx.createOscillator();
    const hum2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    hum.type = 'sine';
    hum.frequency.value = 46;
    hum2.type = 'triangle';
    hum2.frequency.value = 69;
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    gain.gain.value = 0.022;
    hum.connect(filter);
    hum2.connect(filter);
    filter.connect(gain).connect(master);
    hum.start();
    hum2.start();
    ambience = { hum, hum2, gain };
  };

  return {
    play,
    startAmbience,
    resume() { ensure().resume(); },
    setEnabled(value) {
      enabled = value;
      if (master) master.gain.value = value ? 0.2 : 0;
    },
    get enabled() { return enabled; },
  };
}
