/**
 * Procedural sound effects via Web Audio — zero audio files, so the app stays tiny and loads instantly.
 * The AudioContext is created lazily on the first user gesture (required by iOS/Android autoplay rules).
 */
class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** Call from a user gesture handler. */
  unlock(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slide?: number } = {}): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    const vol = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, cutoff: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.6);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur);
  }

  pick(): void {
    this.tone(660, 0.05, { type: 'triangle', vol: 0.12 });
  }

  place(): void {
    this.tone(220, 0.09, { type: 'triangle', vol: 0.35, slide: 140 });
  }

  invalid(): void {
    this.tone(160, 0.12, { type: 'square', vol: 0.06, slide: 110 });
  }

  clear(lines: number, streak: number): void {
    const base = 523.25 * Math.pow(2, Math.min(streak - 1, 7) / 12);
    const notes = Math.min(2 + lines, 6);
    const steps = [0, 4, 7, 12, 16, 19];
    for (let i = 0; i < notes; i++) {
      this.tone(base * Math.pow(2, steps[i] / 12), 0.22, { type: 'sine', vol: 0.22, delay: i * 0.055 });
    }
  }

  bomb(): void {
    this.noise(0.45, 0.6, 900);
    this.tone(90, 0.35, { type: 'sine', vol: 0.5, slide: 40 });
  }

  gem(): void {
    this.tone(1318, 0.12, { type: 'sine', vol: 0.18 });
    this.tone(1760, 0.18, { type: 'sine', vol: 0.15, delay: 0.07 });
  }

  fever(): void {
    [0, 4, 7, 12].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.16, { type: 'sawtooth', vol: 0.08, delay: i * 0.06 }));
  }

  smash(): void {
    this.noise(0.25, 0.5, 1800);
    this.tone(180, 0.18, { type: 'square', vol: 0.12, slide: 80 });
  }

  click(): void {
    this.tone(880, 0.035, { type: 'triangle', vol: 0.1 });
  }

  reward(): void {
    [0, 7, 12, 19].forEach((s, i) => this.tone(659 * Math.pow(2, s / 12), 0.2, { type: 'triangle', vol: 0.15, delay: i * 0.07 }));
  }

  gameOver(): void {
    [0, -3, -7, -12].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.14 }));
  }
}

export const sfx = new Sfx();
