import type { Severity } from '../sim/types';

/** Tiny WebAudio synth: no audio files to download. Created lazily on the first user gesture. */
export class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;

  unlock(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.06): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Each severity has its own pattern, so it can be recognised without looking. */
  alarm(sev: Severity): void {
    if (sev <= 1) this.tone(660, 0, 0.18, 'triangle');
    else if (sev === 2) {
      this.tone(520, 0, 0.14, 'square', 0.04);
      this.tone(520, 0.2, 0.14, 'square', 0.04);
    } else {
      for (let i = 0; i < 3; i++) this.tone(880 - i * 120, i * 0.16, 0.14, 'sawtooth', 0.04);
    }
  }

  success(): void {
    this.tone(660, 0, 0.12);
    this.tone(990, 0.1, 0.18);
  }

  cash(): void {
    this.tone(1320, 0, 0.08, 'triangle', 0.04);
    this.tone(1760, 0.07, 0.12, 'triangle', 0.04);
  }

  click(): void {
    this.tone(300, 0, 0.04, 'square', 0.02);
  }
}
