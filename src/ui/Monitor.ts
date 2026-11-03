import type { VitalsReading } from '../core/VitalsSim';
import { h } from './dom';

const gauss = (x: number, mu: number, s: number) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

/** รูปคลื่นไฟฟ้าหัวใจ 1 จังหวะ (P, QRS, T) วาดด้วยโค้ด */
function ecg(ph: number): number {
  return (
    0.12 * gauss(ph, 0.12, 0.025) -
    0.12 * gauss(ph, 0.215, 0.008) +
    1.0 * gauss(ph, 0.24, 0.011) -
    0.24 * gauss(ph, 0.265, 0.01) +
    0.28 * gauss(ph, 0.46, 0.042)
  );
}

function pleth(ph: number): number {
  const p = (ph + 0.78) % 1;
  return 0.85 * gauss(p, 0.18, 0.07) + 0.35 * gauss(p, 0.42, 0.09);
}

/** จอมอนิเตอร์สัญญาณชีพ: HR, BP, SpO₂, RR, อุณหภูมิ + กราฟ ECG แบบกวาด */
export class VitalsMonitor {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private x = 0;
  private phase = 0;
  private lastE = 0;
  private lastP = 0;
  private nums: Record<string, HTMLSpanElement> = {};
  onBeat?: () => void;

  constructor() {
    this.canvas = h('canvas', { width: 320, height: 132, class: 'ecg' });
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#04090c';
    this.ctx.fillRect(0, 0, 320, 132);
    const num = (key: string, label: string, unit: string, cls: string) => {
      const v = h('span', { class: 'v' }, '--');
      this.nums[key] = v;
      return h('div', { class: `vital ${cls}` }, h('span', { class: 'l' }, label), v, h('span', { class: 'u' }, unit));
    };
    this.el = h(
      'div',
      { class: 'monitor' },
      this.canvas,
      h(
        'div',
        { class: 'vitals-grid' },
        num('HR', 'HR', 'ครั้ง/นาที', 'hr'),
        num('BP', 'BP', 'มม.ปรอท', 'bp'),
        num('SpO2', 'SpO₂', '%', 'spo2'),
        num('RR', 'RR', 'ครั้ง/นาที', 'rr'),
        num('T', 'T', '°C', 'temp'),
      ),
    );
  }

  update(dt: number, v: VitalsReading): void {
    const c = this.ctx;
    const speed = 95; // พิกเซล/วินาที
    let remaining = dt * speed;
    while (remaining > 0) {
      const step = Math.min(1, remaining);
      remaining -= step;
      const prevPh = this.phase;
      this.phase += ((v.HR / 60) * step) / speed;
      if (prevPh < 0.24 && this.phase >= 0.24) this.onBeat?.();
      if (this.phase >= 1) this.phase -= 1;
      const nx = this.x + step;
      const e = 46 - ecg(this.phase) * 36;
      const amp = Math.max(0.2, Math.min(1, (v.sys - 50) / 70));
      const p = 118 - pleth(this.phase) * 30 * amp;
      c.fillStyle = '#04090c';
      c.fillRect(nx, 0, 14, 132);
      c.lineWidth = 2;
      c.strokeStyle = '#3ef08a';
      c.beginPath();
      c.moveTo(this.x, this.lastE);
      c.lineTo(nx, e);
      c.stroke();
      c.strokeStyle = '#4fd8ff';
      c.beginPath();
      c.moveTo(this.x, this.lastP);
      c.lineTo(nx, p);
      c.stroke();
      this.lastE = e;
      this.lastP = p;
      this.x = nx;
      if (this.x >= 320) {
        this.x = 0;
      }
    }
    this.nums.HR.textContent = String(v.HR);
    this.nums.BP.textContent = `${v.sys}/${v.dia}`;
    this.nums.SpO2.textContent = String(v.SpO2);
    this.nums.RR.textContent = String(v.RR);
    this.nums.T.textContent = v.T.toFixed(1);
    this.nums.HR.parentElement!.classList.toggle('alarm', v.HR > 125 || v.HR < 50);
    this.nums.BP.parentElement!.classList.toggle('alarm', v.sys < 90);
    this.nums.SpO2.parentElement!.classList.toggle('alarm', v.SpO2 < 93);
    this.nums.T.parentElement!.classList.toggle('alarm', v.T >= 38.5);
  }
}
