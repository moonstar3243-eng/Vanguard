class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainVal = 0.08,
    delay = 0
  ) {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playClick() {
    this.playTone(440, 0.06, 'sine', 0.04);
  }

  playBuild() {
    this.playTone(260, 0.09, 'triangle', 0.07, 0);
    this.playTone(390, 0.12, 'triangle', 0.07, 0.06);
  }

  playResearch() {
    this.playTone(523.25, 0.12, 'sine', 0.06, 0);
    this.playTone(659.25, 0.14, 'sine', 0.06, 0.07);
    this.playTone(783.99, 0.2, 'sine', 0.07, 0.14);
  }

  playBattleWin() {
    this.playTone(220, 0.12, 'sawtooth', 0.05, 0);
    this.playTone(330, 0.14, 'triangle', 0.08, 0.08);
    this.playTone(440, 0.24, 'triangle', 0.09, 0.16);
  }

  playBattleLoss() {
    this.playTone(190, 0.16, 'sawtooth', 0.06, 0);
    this.playTone(145, 0.24, 'sawtooth', 0.07, 0.12);
  }

  playAlert() {
    this.playTone(310, 0.12, 'square', 0.04, 0);
    this.playTone(240, 0.18, 'square', 0.05, 0.12);
  }

  playVictory() {
    [261.6, 329.6, 392.0, 523.2].forEach((f, idx) => {
      this.playTone(f, 0.25, 'triangle', 0.08, idx * 0.1);
    });
  }
}

export const soundFX = new SoundEngine();
