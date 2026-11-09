/**
 * Every sound is synthesised with WebAudio, so the game ships no audio files.
 * The context is created lazily on the first user gesture (browser autoplay rules).
 */
export class Audio {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private sfx: GainNode | undefined;
  private musicGain: GainNode | undefined;
  private buzz: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | undefined;
  private noise: AudioBuffer | undefined;
  private scratch: { src: AudioBufferSourceNode; gain: GainNode } | undefined;
  private musicTimer: ReturnType<typeof setInterval> | undefined;
  private musicStep = 0;
  private lastPlay = new Map<string, number>();
  soundOn = true;
  musicOn = true;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.soundOn ? 1 : 0;
      this.sfx.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.32 : 0;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 7;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647) * 2 - 1;
      }
      this.startMusic();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    if (this.sfx && this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    if (!on) this.setBuzz(0);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1);
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if ((this.lastPlay.get(key) ?? 0) + ms > now) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0, out?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out ?? this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private hiss(dur: number, vol: number, freq: number, q = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  click(): void {
    this.tone(880, 0.07, "triangle", 0.18, 1320);
  }

  drawStart(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise || this.scratch) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.sfx);
    src.start();
    this.scratch = { src, gain };
  }

  drawSpeed(pxPerSecond: number): void {
    if (!this.scratch || !this.ctx) return;
    const v = Math.min(0.12, pxPerSecond / 9000);
    this.scratch.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  drawEnd(): void {
    if (!this.scratch || !this.ctx) return;
    const s = this.scratch;
    s.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    s.src.stop(this.ctx.currentTime + 0.2);
    this.scratch = undefined;
  }

  release(): void {
    this.tone(220, 0.18, "sine", 0.35, 110);
    this.tone(660, 0.12, "triangle", 0.12, 990, 0.02);
  }

  blocked(): void {
    if (!this.throttle("blocked", 160)) return;
    this.tone(180, 0.08, "square", 0.06, 140);
  }

  sting(): void {
    this.tone(1200, 0.08, "square", 0.12, 500);
    this.tone(520, 0.22, "triangle", 0.25, 300, 0.05);
  }

  hurt(): void {
    this.tone(300, 0.3, "sawtooth", 0.14, 120);
    this.hiss(0.2, 0.2, 900);
  }

  bump(power: number): void {
    if (!this.throttle("bump", 45)) return;
    this.tone(1400 + Math.random() * 900, 0.05, "sine", 0.04 + power * 0.06);
  }

  shieldPop(): void {
    this.tone(500, 0.12, "sine", 0.25, 1400);
    this.hiss(0.12, 0.15, 4000, 2);
  }

  explode(): void {
    this.hiss(0.7, 0.9, 260, 0.6);
    this.tone(90, 0.5, "sine", 0.6, 35);
  }

  chomp(): void {
    this.tone(140, 0.07, "square", 0.25, 80);
    this.tone(120, 0.07, "square", 0.25, 70, 0.1);
  }

  /** Ink snapping apart. */
  snap(): void {
    if (!this.throttle("snap", 80)) return;
    this.hiss(0.12, 0.35, 2600, 1.5);
    this.tone(420, 0.1, "square", 0.08, 180);
  }

  crack(): void {
    this.hiss(0.35, 0.5, 700, 0.8);
    this.tone(160, 0.25, "sawtooth", 0.15, 60);
  }

  splash(): void {
    if (!this.throttle("splash", 120)) return;
    this.hiss(0.4, 0.35, 1300, 0.7);
  }

  tongue(hit: boolean): void {
    this.tone(hit ? 300 : 700, 0.12, "sine", 0.25, hit ? 140 : 1500);
  }

  warn(): void {
    if (!this.throttle("warn", 250)) return;
    this.tone(990, 0.08, "square", 0.08);
    this.tone(990, 0.08, "square", 0.08, undefined, 0.12);
  }

  spray(): void {
    this.hiss(0.5, 0.4, 5200, 0.5);
  }

  pin(): void {
    this.tone(1800, 0.05, "triangle", 0.2);
    this.tone(2400, 0.08, "triangle", 0.15, undefined, 0.04);
  }

  tick(n: number): void {
    this.tone(n === 1 ? 1046 : 784, 0.1, "triangle", 0.25);
  }

  win(): void {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => this.tone(f, 0.22, "triangle", 0.25, undefined, i * 0.08));
    this.tone(1568, 0.5, "sine", 0.15, undefined, 0.42);
  }

  lose(): void {
    [392, 370, 349, 262].forEach((f, i) => this.tone(f, i === 3 ? 0.6 : 0.22, "triangle", 0.25, f * 0.97, i * 0.2));
  }

  starPing(i: number): void {
    this.tone(880 * Math.pow(1.26, i), 0.3, "sine", 0.3, undefined);
    this.tone(1760 * Math.pow(1.26, i), 0.2, "triangle", 0.08, undefined, 0.03);
  }

  coin(): void {
    this.tone(1318, 0.06, "square", 0.08);
    this.tone(1760, 0.12, "square", 0.08, undefined, 0.06);
  }

  /** Continuous swarm drone; `amount` 0..1 scales with nearby bees. */
  setBuzz(amount: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    if (!this.buzz && amount > 0.01) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc2.type = "sawtooth";
      osc.frequency.value = 205;
      osc2.frequency.value = 213;
      lfo.frequency.value = 23;
      lfoGain.gain.value = 18;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfoGain.connect(osc2.frequency);
      filter.type = "lowpass";
      filter.frequency.value = 1100;
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.sfx);
      osc.start();
      osc2.start();
      lfo.start();
      this.buzz = { osc, osc2, gain, lfo };
    }
    if (this.buzz) this.buzz.gain.gain.setTargetAtTime(Math.min(0.09, amount * 0.09), ctx.currentTime, 0.12);
  }

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    // A tiny pentatonic loop: plucky melody over a soft bass, ~104 bpm.
    const melody = [0, 4, 7, 9, 7, 4, 2, 4, 0, 2, 4, 7, 9, 12, 9, 7];
    const bass = [0, 0, 5, 5, 7, 7, 5, 5];
    const root = 262;
    const stepDur = 60 / 104 / 2;
    const play = () => {
      if (!this.ctx || !this.musicGain) return;
      const i = this.musicStep++;
      const out = this.musicGain;
      if (i % 2 === 0 || Math.random() < 0.5) {
        const n = melody[i % melody.length]!;
        this.tone(root * Math.pow(2, n / 12), stepDur * 1.6, "triangle", 0.16, undefined, 0, out);
      }
      if (i % 4 === 0) {
        const b = bass[(i / 4) % bass.length]!;
        this.tone((root / 2) * Math.pow(2, b / 12), stepDur * 3.5, "sine", 0.3, undefined, 0, out);
      }
    };
    this.musicTimer = globalThis.setInterval(play, stepDur * 1000);
  }

  dispose(): void {
    if (this.musicTimer) globalThis.clearInterval(this.musicTimer);
    void this.ctx?.close();
  }
}
