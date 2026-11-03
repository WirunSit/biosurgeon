import type { CaseDef, Difficulty } from '../types';

export interface MistakeLog {
  phase: 'วินิจฉัย' | 'เตรียมผ่าตัด' | 'ผ่าตัด' | 'หลังผ่าตัด';
  title: string;
  explain: string;
}

/** ข้อมูลของการเล่น 1 รอบ (1 เคส) */
export class Session {
  // การสืบสวน
  minutes = 0;
  budgetUsed = 0;
  /** หลักฐานที่ค้นพบ เช่น "history:onset", "exam:RLQ", "test:cbc" */
  found = new Map<string, string>();
  ruptured = false;

  // การวินิจฉัย
  dxCorrect = false;
  evidenceScore = 0; // 0–1
  budgetScore = 0; // 0–1

  // เตรียมผ่าตัด
  anesthesiaCorrect = false;
  trayErrors = 0;

  // ความรู้ชีววิทยา
  bioCorrect = 0;
  bioTotal = 0;

  // ผ่าตัด
  surgeryPenalty = 0;
  hintPenalty = 0;
  traceAccuracy: number | null = null;
  surgeryTimeSec = 0;
  bloodLoss = 0;
  transfused = 0;
  infectionRisk = 0;
  organDamage = 0;
  infectionMistake = false;

  mistakes: MistakeLog[] = [];

  constructor(
    readonly caseDef: CaseDef,
    readonly difficulty: Difficulty,
    readonly reducedGore: boolean,
  ) {}

  bio(correct: boolean): void {
    this.bioTotal++;
    if (correct) this.bioCorrect++;
  }
}
