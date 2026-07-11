/**
 * Procedural synthwave racing soundtrack — no audio files, everything is
 * synthesized live with WebAudio. A lookahead scheduler sequences a
 * four-bar Am–F–C–G loop at 126 BPM: kick, clap, hi-hats, a driving
 * octave bass and an arpeggio lead.
 */

const BPM = 126;
const STEP = 60 / BPM / 4; // one 16th note, seconds
const STEPS_PER_BAR = 16;
const BARS = 4;

// Chord roots (bass) and arp tones per bar: Am, F, C, G.
const BASS_ROOTS = [55.0, 43.65, 65.41, 49.0];
const ARP_NOTES: number[][] = [
  [220.0, 261.63, 329.63, 440.0], // A C E A
  [174.61, 220.0, 261.63, 349.23], // F A C F
  [261.63, 329.63, 392.0, 523.25], // C E G C
  [196.0, 246.94, 392.0, 493.88], // G B G B
];
const ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2, 0, 2, 1, 3, 2, 1, 3, 2];

class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  playing = false;
  muted = false;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        // Gentle master lowpass keeps the synths from getting harsh.
        const soften = this.ctx.createBiquadFilter();
        soften.type = 'lowpass';
        soften.frequency.value = 9000;
        this.master.connect(soften).connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a user-gesture handler; starts (or resumes) the loop. */
  start(): void {
    const ctx = this.ensure();
    if (!ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 80);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }

  /** Returns the new muted state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.16;
    return this.muted;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    while (this.nextTime < ctx.currentTime + 0.22) {
      this.playStep(this.step % (STEPS_PER_BAR * BARS), this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
    const beat = step % STEPS_PER_BAR;

    // Four-on-the-floor kick.
    if (beat % 4 === 0) this.kick(t);
    // Clap on 2 and 4.
    if (beat === 4 || beat === 12) this.clap(t);
    // Offbeat hats.
    if (beat % 2 === 1) this.hat(t, beat % 4 === 3 ? 0.09 : 0.055);
    // Driving octave bass on every 8th.
    if (beat % 2 === 0) {
      const octave = beat % 4 === 0 ? 1 : 2;
      this.bass(t, BASS_ROOTS[bar] * octave);
    }
    // Arpeggio lead — rests on the first bar of every loop to breathe.
    if (bar !== 0 || step >= STEPS_PER_BAR * BARS - 4) {
      const note = ARP_NOTES[bar][ARP_PATTERN[beat]];
      this.lead(t, note, 0.055);
      this.lead(t + STEP * 3, note * 2, 0.02); // faint octave echo
    }
  }

  private env(t: number, attack: number, decay: number, peak: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
    g.connect(this.master!);
    return g;
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    osc.connect(this.env(t, 0.002, 0.16, 0.95));
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private clap(t: number): void {
    const ctx = this.ctx!;
    const frames = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 1.2;
    src.connect(bp).connect(this.env(t, 0.001, 0.11, 0.4));
    src.start(t);
  }

  private hat(t: number, vol: number): void {
    const ctx = this.ctx!;
    const frames = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    src.connect(hp).connect(this.env(t, 0.001, 0.035, vol));
    src.start(t);
  }

  private bass(t: number, freq: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(250, t + 0.1);
    osc.connect(lp).connect(this.env(t, 0.004, 0.12, 0.3));
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private lead(t: number, freq: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    osc.connect(lp).connect(this.env(t, 0.005, 0.14, vol));
    osc.start(t);
    osc.stop(t + 0.18);
  }
}

export const music = new Music();
