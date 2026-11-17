// All sound is synthesised with WebAudio — no audio files. A small engine
// hum, a two-tone police siren, gunshots, pickups, a mission jingle and a
// laid-back synthwave loop that plays under the whole game.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);

    // Engine hum: two detuned saws through a low-pass filter.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55 * 1.005;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    osc2.start();
    this._engineOsc2 = osc2;

    // Police siren: a square wave whose pitch wobbles between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();

    this.startMusic();
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // speed 0..1, on true while the player is driving.
  setEngine(speed, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speed * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const freq = 48 + speed * 110;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    this._engineOsc2.frequency.setTargetAtTime(freq * 1.005, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speed * 900, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.25);
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _blip(freq, duration, type, volume, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.14);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this._blip(160, 0.09, 'square', 0.25);
  }

  punch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.08);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  pickup() {
    this._blip(880, 0.12, 'sine', 0.3);
    this._blip(1318, 0.18, 'sine', 0.3, 0.09);
  }

  cash() {
    this._blip(1046, 0.1, 'triangle', 0.3);
    this._blip(1318, 0.1, 'triangle', 0.3, 0.08);
    this._blip(1568, 0.16, 'triangle', 0.3, 0.16);
  }

  missionComplete() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this._blip(n, 0.22, 'triangle', 0.32, i * 0.11));
  }

  missionFail() {
    this._blip(392, 0.25, 'sawtooth', 0.2);
    this._blip(311, 0.35, 'sawtooth', 0.2, 0.2);
  }

  click() {
    this._blip(660, 0.06, 'square', 0.15);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // A slow synthwave loop: Am – F – C – G pads over a soft bass pulse.
  startMusic() {
    if (this.musicTimer) return;
    const chords = [
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [130.81, 196.0, 261.63], // C
      [196.0, 246.94, 293.66], // G
    ];
    const bass = [55, 43.65, 65.41, 49];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      if (step === 0) {
        for (const f of chords[bar]) this._padNote(f, 2.4);
        this._padNote(bass[bar], 2.4, 'triangle', 0.5);
      }
      if (step === 4) this._padNote(bass[bar] * 2, 1.1, 'triangle', 0.3);
      this.musicStep += 1;
    }, 300);
  }

  _padNote(freq, duration, type = 'sine', volume = 0.12) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.4);
    gain.gain.setValueAtTime(volume, t + duration - 0.5);
    gain.gain.linearRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}
