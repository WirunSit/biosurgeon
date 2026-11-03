import type { Difficulty } from '../types';

/**
 * ผลการเล่นและการตั้งค่าของครู (แผนข้อ 9.3–9.4)
 * - เก็บผลไว้ในเครื่อง (localStorage) เสมอ ส่งออก CSV ได้
 * - ถ้าครูใส่ URL ของ Google Apps Script จะส่งผลเข้า Google Sheets ของครูทันที
 * - เก็บเฉพาะเลขที่/ชื่อเล่น + รหัสห้อง ไม่เก็บข้อมูลส่วนบุคคลอื่น
 */

export interface TeacherSettings {
  pin: string;
  classCode: string;
  sheetUrl: string;
  unlockAll: boolean;
  /** ด่านที่เปิดให้นักเรียนเล่น (0 = ด่านฝึก) */
  stages: number[];
  /** บังคับระดับความยาก (null = ให้นักเรียนเลือกเอง) */
  forceDifficulty: Difficulty | null;
  /** ต้องผ่านด่านก่อนหน้าก่อน */
  sequential: boolean;
}

export interface ResultRow {
  time: string;
  classCode: string;
  student: string;
  caseId: string;
  caseTitle: string;
  difficulty: Difficulty;
  total: number;
  stars: number;
  diagnosis: number;
  surgery: number;
  safety: number;
  biology: number;
  timeScore: number;
  minutes: number;
  bloodLoss: number;
  ruptured: boolean;
  mistakes: string[];
}

const TKEY = 'biosurgeon.teacher.v1';
const RKEY = 'biosurgeon.results.v1';
const SKEY = 'biosurgeon.student.v1';

export const DEFAULT_TEACHER: TeacherSettings = {
  pin: '1234',
  classCode: '',
  sheetUrl: '',
  unlockAll: false,
  stages: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  forceDifficulty: null,
  sequential: false,
};

export function loadTeacher(): TeacherSettings {
  try {
    const raw = localStorage.getItem(TKEY);
    return raw ? { ...DEFAULT_TEACHER, ...(JSON.parse(raw) as Partial<TeacherSettings>) } : { ...DEFAULT_TEACHER };
  } catch {
    return { ...DEFAULT_TEACHER };
  }
}

export function saveTeacher(t: TeacherSettings): void {
  try {
    localStorage.setItem(TKEY, JSON.stringify(t));
  } catch {
    /* ไม่มีที่เก็บข้อมูล — ใช้ค่าในหน่วยความจำต่อ */
  }
}

/**
 * ตั้งค่าห้องเรียนผ่านลิงก์ได้ เช่น index.html?class=ม5-1&sheet=https://script.google.com/...
 * ครูแชร์ลิงก์นี้ให้นักเรียน ทุกเครื่องจะส่งคะแนนเข้า Sheets เดียวกัน
 */
export function applyUrlSettings(t: TeacherSettings): TeacherSettings {
  const q = new URLSearchParams(location.search);
  const cls = q.get('class');
  const sheet = q.get('sheet');
  const stages = q.get('stages');
  const diff = q.get('difficulty') as Difficulty | null;
  const next = { ...t };
  if (cls) next.classCode = cls;
  if (sheet && /^https:\/\/script\.google(usercontent)?\.com\//.test(sheet)) next.sheetUrl = sheet;
  if (stages) next.stages = stages.split(',').map(Number).filter((n) => n >= 0 && n <= 9);
  if (diff && ['easy', 'normal', 'challenge'].includes(diff)) next.forceDifficulty = diff;
  if (cls || sheet || stages || diff) saveTeacher(next);
  return next;
}

export interface Student {
  name: string;
  classCode: string;
}

export function loadStudent(): Student {
  try {
    const raw = localStorage.getItem(SKEY);
    return raw ? (JSON.parse(raw) as Student) : { name: '', classCode: '' };
  } catch {
    return { name: '', classCode: '' };
  }
}

export function saveStudent(s: Student): void {
  try {
    localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadResults(): ResultRow[] {
  try {
    return JSON.parse(localStorage.getItem(RKEY) ?? '[]') as ResultRow[];
  } catch {
    return [];
  }
}

export function clearResults(): void {
  try {
    localStorage.removeItem(RKEY);
  } catch {
    /* ignore */
  }
}

/** บันทึกผล และส่งเข้า Google Sheets ถ้าครูตั้งค่าไว้ — คืนค่าสถานะการส่ง */
export async function recordResult(row: ResultRow, t: TeacherSettings): Promise<'local' | 'sent' | 'failed'> {
  const rows = loadResults();
  rows.push(row);
  try {
    localStorage.setItem(RKEY, JSON.stringify(rows.slice(-1000)));
  } catch {
    /* ignore */
  }
  if (!t.sheetUrl) return 'local';
  try {
    // text/plain ไม่ต้องผ่าน CORS preflight (Apps Script รับได้โดยตรง)
    await fetch(t.sheetUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(row) });
    return 'sent';
  } catch {
    return 'failed';
  }
}

export function toCSV(rows: ResultRow[]): string {
  const head = ['เวลา', 'รหัสห้อง', 'นักเรียน', 'เคส', 'ชื่อเคส', 'ระดับ', 'คะแนนรวม', 'ดาว', 'วินิจฉัย', 'ผ่าตัด', 'ความปลอดภัย', 'ชีววิทยา', 'เวลา(คะแนน)', 'นาทีผ่าตัด', 'เสียเลือด(มล.)', 'ไส้ติ่ง/อาการทรุด', 'ข้อผิดพลาด'];
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.time, r.classCode, r.student, r.caseId, r.caseTitle, r.difficulty, r.total, r.stars, r.diagnosis, r.surgery, r.safety, r.biology, r.timeScore, r.minutes, r.bloodLoss, r.ruptured ? 'ใช่' : '', r.mistakes.join(' | ')]
      .map(esc)
      .join(','),
  );
  // BOM ให้ Excel อ่านภาษาไทยถูก
  return '﻿' + [head.map(esc).join(','), ...lines].join('\r\n');
}

/** ข้อผิดพลาดที่พบบ่อย: ร้อยละของผู้เล่นแต่ละเคสที่ทำผิดเรื่องนั้น */
export function commonMistakes(rows: ResultRow[]): { caseTitle: string; mistake: string; pct: number; n: number }[] {
  const byCase = new Map<string, ResultRow[]>();
  for (const r of rows) byCase.set(r.caseTitle, [...(byCase.get(r.caseTitle) ?? []), r]);
  const out: { caseTitle: string; mistake: string; pct: number; n: number }[] = [];
  for (const [title, list] of byCase) {
    const count = new Map<string, number>();
    for (const r of list) for (const m of new Set(r.mistakes)) count.set(m, (count.get(m) ?? 0) + 1);
    for (const [m, c] of count) out.push({ caseTitle: title, mistake: m, pct: Math.round((100 * c) / list.length), n: list.length });
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, 30);
}
