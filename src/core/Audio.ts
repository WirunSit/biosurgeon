/**
 * เสียงสังเคราะห์ด้วย Web Audio (ไม่ต้องมีไฟล์เสียง)
 * เสียงมอนิเตอร์ปรับระดับเสียงตาม SpO₂ เหมือนเครื่องจริง: ออกซิเจนต่ำ → เสียงต่ำลง
 */
class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** เรียกครั้งแรกเมื่อผู้ใช้คลิก (เบราว์เซอร์ต้องการท่าทางผู้ใช้ก่อนเล่นเสียง) */
  unlock(): void {
    this.ensure();
  }

  tone(freq: number, dur: number, vol = 0.08, type: OscillatorType = 'sine', delay = 0): void {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  beep(spo2: number): void {
    this.tone(420 + (Math.max(80, spo2) - 80) * 16, 0.09, 0.05, 'sine');
  }
  click(): void {
    this.tone(1400, 0.04, 0.04, 'square');
  }
  good(): void {
    this.tone(660, 0.12, 0.06, 'triangle');
    this.tone(990, 0.16, 0.06, 'triangle', 0.1);
  }
  bad(): void {
    this.tone(220, 0.22, 0.07, 'sawtooth');
  }
  alarm(): void {
    for (let i = 0; i < 3; i++) this.tone(880, 0.12, 0.05, 'square', i * 0.18);
  }
}

export const sfx = new Sfx();
