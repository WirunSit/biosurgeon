import type { CaseVitals } from '../types';

export interface VitalsReading {
  HR: number;
  sys: number;
  dia: number;
  SpO2: number;
  RR: number;
  T: number;
}

export type VitalsAlert = 'tachycardia' | 'hypotension' | 'desaturation' | 'recovering' | 'transfusion';

/**
 * จำลองสัญญาณชีพ (แผนข้อ 3.3)
 * ตัวแปรภายใน: bloodLoss, infectionRisk, anesthesiaDepth, organDamage, timeElapsed
 * ค่าที่แสดงจะค่อย ๆ เปลี่ยนตาม (มีความหน่วง) เพื่อให้นักเรียนเห็นการตอบสนองของร่างกาย
 */
export class VitalsSim {
  bloodLoss = 0;
  infectionRisk = 0;
  organDamage = 0;
  anesthesiaDepth = 0;
  timeElapsed = 0;
  /** มล./วินาที รวมจากทุกจุดเลือดออก */
  bleedRate = 0;
  /** 0–1 โรคต้นเหตุถูกกำจัดแล้วแค่ไหน (เช่น ตัดไส้ติ่งออกแล้ว) */
  recovery = 0;
  underGA = false;
  transfusedMl = 0;

  private base: { HR: number; sys: number; dia: number; SpO2: number; RR: number; T: number };
  readonly shown: VitalsReading;
  private fired = new Set<VitalsAlert>();
  private pending: VitalsAlert[] = [];
  private wobble = 0;

  constructor(v: CaseVitals) {
    const [sys, dia] = v.BP.split('/').map(Number);
    this.base = { HR: v.HR, sys, dia, SpO2: v.SpO2, RR: v.RR, T: v.T };
    this.shown = { HR: v.HR, sys, dia, SpO2: v.SpO2, RR: v.RR, T: v.T };
  }

  setBase(v: Partial<CaseVitals>): void {
    if (v.HR !== undefined) this.base.HR = v.HR;
    if (v.RR !== undefined) this.base.RR = v.RR;
    if (v.T !== undefined) this.base.T = v.T;
    if (v.SpO2 !== undefined) this.base.SpO2 = v.SpO2;
    if (v.BP) {
      const [s, d] = v.BP.split('/').map(Number);
      this.base.sys = s;
      this.base.dia = d;
    }
  }

  /** เสียเลือดสุทธิหลังหักเลือดที่ให้ทดแทน */
  get netLoss(): number {
    return Math.max(0, this.bloodLoss - this.transfusedMl);
  }

  target(): VitalsReading {
    const loss = this.netLoss;
    const b = this.base;
    const fever = Math.max(0, b.T - 37);
    let HR = b.HR - (b.HR - 82) * 0.6 * this.recovery - (this.underGA ? 6 : 0);
    HR += Math.max(0, loss - 120) * 0.065 + this.organDamage * 0.25;
    const sys = b.sys - Math.max(0, loss - 250) * 0.05 - this.organDamage * 0.1;
    const dia = b.dia - Math.max(0, loss - 250) * 0.03;
    const SpO2 = b.SpO2 - Math.max(0, loss - 800) * 0.006;
    const RR = this.underGA ? 14 : b.RR + Math.max(0, loss - 300) * 0.01;
    const T = 37 + fever * (1 - 0.4 * this.recovery) + this.infectionRisk * 0.004;
    return {
      HR: this.base.HR <= 0 ? 0 : Math.max(30, Math.min(175, HR)),
      sys: Math.max(55, sys),
      dia: Math.max(30, dia),
      SpO2: Math.max(80, Math.min(100, SpO2)),
      RR,
      T,
    };
  }

  update(dt: number): void {
    this.timeElapsed += dt;
    this.bloodLoss += this.bleedRate * dt;
    // วิสัญญีแพทย์ให้เลือดทดแทนอัตโนมัติเมื่อเสียเลือดมาก (แต่ถูกหักคะแนนความปลอดภัย)
    if (this.netLoss > 1100) {
      this.transfusedMl += 450;
      this.raise('transfusion');
    }
    const t = this.target();
    const k = 1 - Math.exp(-dt * 1.3);
    this.wobble += dt;
    const s = this.shown;
    s.HR += (t.HR - s.HR) * k;
    s.sys += (t.sys - s.sys) * k;
    s.dia += (t.dia - s.dia) * k;
    s.SpO2 += (t.SpO2 - s.SpO2) * k * 0.6;
    s.RR += (t.RR - s.RR) * k;
    s.T += (t.T - s.T) * k * 0.2;

    if (this.base.HR > 0 && s.HR > this.base.HR + 4 && this.netLoss > 250) this.raise('tachycardia');
    if (s.sys < 95 && this.netLoss > 300) this.raise('hypotension');
    if (s.SpO2 < 93) this.raise('desaturation');
    if (this.recovery > 0.5) this.raise('recovering');
  }

  /** ค่าที่แสดงบนจอ (ปัดเศษ + สั่นเล็กน้อยให้ดูมีชีวิต) */
  display(): VitalsReading {
    const s = this.shown;
    const j = Math.sin(this.wobble * 1.3) * 0.8;
    return {
      HR: Math.round(s.HR + j),
      sys: Math.round(s.sys),
      dia: Math.round(s.dia),
      SpO2: Math.round(s.SpO2),
      RR: Math.round(s.RR),
      T: Math.round(s.T * 10) / 10,
    };
  }

  private raise(a: VitalsAlert): void {
    if (a !== 'transfusion' && this.fired.has(a)) return;
    this.fired.add(a);
    this.pending.push(a);
  }

  takeAlerts(): VitalsAlert[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }
}
