/**
 * Tiny WebAudio synth for retro SFX — zero audio assets needed.
 * Every effect is generated from oscillators/noise at call time.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch {
        this.enabled = false;
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume = 0.5,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration);
  }

  private noise(duration: number, volume = 0.5, lowpass = 1200): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  pickup(): void {
    this.tone(660 + Math.random() * 120, 1100, 0.08, 'square', 0.16);
  }

  scrapPickup(): void {
    this.tone(440, 880, 0.12, 'triangle', 0.3);
  }

  explosion(): void {
    this.noise(0.5, 0.8, 900);
    this.tone(160, 30, 0.45, 'sawtooth', 0.5);
  }

  wreck(): void {
    this.noise(0.7, 0.9, 700);
    this.tone(120, 24, 0.65, 'sawtooth', 0.6);
  }

  boost(): void {
    this.tone(200, 520, 0.25, 'sawtooth', 0.18);
  }

  spin(): void {
    this.tone(500, 180, 0.35, 'triangle', 0.3);
  }

  bump(): void {
    this.tone(180, 90, 0.12, 'square', 0.25);
    this.noise(0.08, 0.3, 2000);
  }

  lowFuel(): void {
    this.tone(880, 880, 0.09, 'square', 0.25);
  }

  click(): void {
    this.tone(700, 500, 0.05, 'square', 0.15);
  }

  levelUp(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, f, 0.14, 'square', 0.25), i * 90));
  }

  reward(): void {
    this.tone(784, 1568, 0.2, 'triangle', 0.3);
  }
}

export const sfx = new Sfx();
