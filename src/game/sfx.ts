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

  /** Nitro barrel pickup — triumphant rising arpeggio. */
  powerup(): void {
    const notes = [392, 523, 659, 784];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, f * 1.02, 0.12, 'sawtooth', 0.22), i * 55));
  }

  // --- Continuous engine sound, styled per fuel type. ---
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineNoise: AudioBufferSourceNode | null = null;
  private engineNoiseFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private engineType: 'petrol' | 'gas' | 'electric' = 'petrol';

  /**
   * petrol: growling V8 (sawtooth + sub through a dark lowpass)
   * gas: rocket jet (high saw + looping hiss through a rising bandpass)
   * electric: clean rising EV whine (sine + detuned triangle, beating)
   */
  startEngine(fuelId: string = 'petrol'): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.engineOsc) return;
    this.engineType = fuelId === 'gas' || fuelId === 'electric' ? fuelId : 'petrol';
    const type = this.engineType;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);

    this.engineOsc = ctx.createOscillator();
    this.engineSub = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';

    if (type === 'petrol') {
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineSub.type = 'sine';
      this.engineSub.frequency.value = 27.5;
      lp.frequency.value = 420;
    } else if (type === 'gas') {
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 85;
      this.engineSub.type = 'sine';
      this.engineSub.frequency.value = 42;
      lp.frequency.value = 700;
      // Jet hiss: looping noise through a bandpass that opens with speed.
      const frames = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      this.engineNoise = ctx.createBufferSource();
      this.engineNoise.buffer = buf;
      this.engineNoise.loop = true;
      this.engineNoiseFilter = ctx.createBiquadFilter();
      this.engineNoiseFilter.type = 'bandpass';
      this.engineNoiseFilter.frequency.value = 900;
      this.engineNoiseFilter.Q.value = 0.9;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.55;
      this.engineNoise.connect(this.engineNoiseFilter).connect(noiseGain).connect(this.engineGain);
      this.engineNoise.start();
    } else {
      // electric
      this.engineOsc.type = 'sine';
      this.engineOsc.frequency.value = 150;
      this.engineSub.type = 'triangle';
      this.engineSub.frequency.value = 303; // slight detune → EV "beating" whine
      lp.frequency.value = 2600;
    }

    this.engineOsc.connect(lp);
    this.engineSub.connect(lp);
    lp.connect(this.engineGain);
    this.engineOsc.start();
    this.engineSub.start();
  }

  /** speedFrac 0..1 of top speed; surge = boosting/overdrive. */
  setEngine(speedFrac: number, surge: boolean): void {
    if (!this.engineOsc || !this.engineSub || !this.engineGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const type = this.engineType;
    let freq: number;
    let vol: number;
    if (type === 'petrol') {
      const wobble = Math.sin(now * 31) * 2.2;
      freq = 48 + speedFrac * 105 + (surge ? 22 : 0) + wobble;
      this.engineSub.frequency.setTargetAtTime(freq / 2, now, 0.06);
      vol = 0.02 + speedFrac * 0.045 + (surge ? 0.025 : 0);
    } else if (type === 'gas') {
      freq = 75 + speedFrac * 180 + (surge ? 45 : 0);
      this.engineSub.frequency.setTargetAtTime(freq / 2, now, 0.06);
      this.engineNoiseFilter?.frequency.setTargetAtTime(600 + speedFrac * 2600 + (surge ? 900 : 0), now, 0.1);
      vol = 0.016 + speedFrac * 0.05 + (surge ? 0.035 : 0);
    } else {
      freq = 140 + speedFrac * 460 + (surge ? 90 : 0);
      this.engineSub.frequency.setTargetAtTime(freq * 2.02, now, 0.05);
      vol = 0.012 + speedFrac * 0.034 + (surge ? 0.018 : 0);
    }
    this.engineOsc.frequency.setTargetAtTime(freq, now, 0.06);
    this.engineGain.gain.setTargetAtTime(this.enabled ? vol : 0, now, 0.08);
  }

  stopEngine(): void {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    if (this.ctx) {
      const stopAt = this.ctx.currentTime + 0.3;
      this.engineOsc?.stop(stopAt);
      this.engineSub?.stop(stopAt);
      this.engineNoise?.stop(stopAt);
    }
    this.engineOsc = null;
    this.engineSub = null;
    this.engineNoise = null;
    this.engineNoiseFilter = null;
    this.engineGain = null;
  }

  reward(): void {
    this.tone(784, 1568, 0.2, 'triangle', 0.3);
  }
}

export const sfx = new Sfx();
