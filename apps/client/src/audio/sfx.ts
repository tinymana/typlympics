/**
 * All sound is synthesised with Web Audio, so there are no audio files and
 * nothing borrowed. Placeholder quality, original by construction.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stepCount = 0;

  constructor(private volume: number) {}

  /** Browsers only allow audio after a user gesture, so call this from key handlers. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
    slideTo?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, gain: number, cutoff: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  /** Footfall for each correct key, alternating left and right. */
  step(): void {
    this.stepCount += 1;
    const base = this.stepCount % 2 === 0 ? 150 : 128;
    this.tone(base, 0.06, 'triangle', 0.35, 0, base * 0.6);
    this.noise(0.03, 0.12, 2400);
  }

  error(): void {
    this.tone(170, 0.2, 'sawtooth', 0.3, 0, 70);
    this.noise(0.12, 0.2, 900);
  }

  marks(): void {
    this.tone(392, 0.14, 'square', 0.18);
  }

  set(): void {
    this.tone(523, 0.14, 'square', 0.18);
  }

  gun(): void {
    this.noise(0.28, 0.9, 3200);
    this.tone(110, 0.22, 'sine', 0.6, 0, 40);
  }

  falseStart(): void {
    this.tone(220, 0.12, 'square', 0.25);
    this.tone(220, 0.12, 'square', 0.25, 0.16);
  }

  finish(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'square', 0.2, i * 0.09));
  }

  record(): void {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, 0.16, 'square', 0.22, i * 0.1),
    );
    this.noise(0.9, 0.12, 5000, 0.2); // crowd swell
  }
}
