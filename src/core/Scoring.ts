import type { Session } from './Session';

export interface ScoreLine {
  name: string;
  score: number;
  max: number;
  note: string;
}

export interface Badge {
  id: string;
  name: string;
  desc: string;
}

export interface ScoreResult {
  lines: ScoreLine[];
  total: number;
  stars: number;
  badges: Badge[];
  rank: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** คะแนนต่อเคส 100 คะแนน → 1–5 ดาว (แผนข้อ 9.1) */
export function computeScore(s: Session): ScoreResult {
  const timeLimit = s.caseDef.surgery.timeLimitSec;

  const dx = (s.dxCorrect ? 15 : 0) + s.evidenceScore * 10 + s.budgetScore * 5;

  const traceLoss = s.traceAccuracy === null ? 0 : (1 - s.traceAccuracy) * 8;
  const surgery = clamp(25 - s.surgeryPenalty - s.hintPenalty - s.trayErrors - traceLoss, 0, 25);

  const loss = Math.max(0, s.bloodLoss - 100);
  const safety = clamp(
    20 - loss / 60 - s.infectionRisk / 6 - s.organDamage / 2.5 - (s.anesthesiaCorrect ? 0 : 5) - (s.ruptured ? 3 : 0),
    0,
    20,
  );

  const bio = s.bioTotal ? (20 * s.bioCorrect) / s.bioTotal : 0;

  const over = Math.max(0, s.surgeryTimeSec - timeLimit);
  const time = clamp(5 - over / 60, 0, 5);

  const lines: ScoreLine[] = [
    { name: 'การวินิจฉัย', score: round1(dx), max: 30, note: 'เลือกโรคถูก + หลักฐานถูก + ใช้งบตรวจคุ้มค่า' },
    { name: 'ความถูกต้องของการผ่าตัด', score: round1(surgery), max: 25, note: 'ลำดับขั้นตอน เครื่องมือ ความแม่นยำการกรีด' },
    { name: 'ความปลอดภัยของผู้ป่วย', score: round1(safety), max: 20, note: 'เลือดที่เสีย การติดเชื้อ อวัยวะข้างเคียง' },
    { name: 'ความรู้ชีววิทยา', score: round1(bio), max: 20, note: `ตอบถูก ${s.bioCorrect}/${s.bioTotal} ข้อ` },
    { name: 'เวลา', score: round1(time), max: 5, note: `ผ่าตัด ${fmtTime(s.surgeryTimeSec)} (กำหนด ${fmtTime(timeLimit)})` },
  ];
  if (s.caseDef.mode === 'anatomy') {
    // ห้องปฏิบัติการกายวิภาค: หุ่นจำลองไม่มีสัญญาณชีพ — คิดเฉพาะการผ่า ความรู้ และเวลา แล้วปรับให้เต็ม 100
    const keep = lines.filter((l) => l.name !== 'การวินิจฉัย' && l.name !== 'ความปลอดภัยของผู้ป่วย');
    keep[0] = { ...keep[0], name: 'ความถูกต้องของการผ่าและระบุอวัยวะ', note: 'ระบุอวัยวะถูก ใช้เครื่องมือถูก ความแม่นยำการกรีด' };
    const raw = keep.reduce((a, l) => a + l.score, 0);
    const total = Math.round((raw * 100) / 50);
    const stars = total >= 90 ? 5 : total >= 75 ? 4 : total >= 60 ? 3 : total >= 40 ? 2 : 1;
    return { lines: keep, total, stars, badges: [], rank: stars >= 4 ? 'นักกายวิภาค' : 'ทบทวนอีกรอบ' };
  }
  if (s.caseDef.mode === 'tutorial') {
    // ด่านฝึก: ไม่มีการวินิจฉัย ปรับสัดส่วนคะแนนที่เหลือให้เต็ม 100
    lines.shift();
    const raw = lines.reduce((a, l) => a + l.score, 0);
    const total = Math.round((raw * 100) / 70);
    const stars = total >= 90 ? 5 : total >= 75 ? 4 : total >= 60 ? 3 : total >= 40 ? 2 : 1;
    return { lines, total, stars, badges: badgesFor(s), rank: stars >= 4 ? 'พร้อมขึ้นเวร!' : 'ฝึกต่ออีกนิด' };
  }
  const total = Math.round(lines.reduce((a, l) => a + l.score, 0));
  const stars = total >= 90 ? 5 : total >= 75 ? 4 : total >= 60 ? 3 : total >= 40 ? 2 : 1;

  const badges = badgesFor(s);
  const rank =
    stars >= 5 ? 'ศัลยแพทย์ผู้เชี่ยวชาญ' : stars === 4 ? 'ศัลยแพทย์' : stars === 3 ? 'แพทย์ประจำบ้าน' : stars === 2 ? 'แพทย์ฝึกหัด' : 'นักศึกษาแพทย์';
  return { lines, total, stars, badges, rank };
}

function badgesFor(s: Session): Badge[] {
  const badges: Badge[] = [];
  if (s.traceAccuracy !== null && s.traceAccuracy >= 0.95)
    badges.push({ id: 'steady', name: 'มือนิ่ง', desc: `กรีดแม่นยำ ${Math.round(s.traceAccuracy * 100)}%` });
  if (s.caseDef.mode !== 'tutorial' && s.dxCorrect && s.budgetUsed <= 3 && s.evidenceScore >= 0.99)
    badges.push({ id: 'detective', name: 'นักสืบ', desc: 'วินิจฉัยถูกโดยใช้งบตรวจน้อยที่สุด' });
  if (!s.infectionMistake && s.infectionRisk < 10)
    badges.push({ id: 'aseptic', name: 'ปลอดเชื้อสมบูรณ์', desc: 'ไม่มีความผิดพลาดด้านการปลอดเชื้อ' });
  if (s.bloodLoss < 150) badges.push({ id: 'dry', name: 'เสียเลือดน้อย', desc: `เสียเลือดเพียง ${Math.round(s.bloodLoss)} มล.` });
  return badges;
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
