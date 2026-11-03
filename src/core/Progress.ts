/** ความคืบหน้าของผู้เล่น (เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น — ไม่เก็บข้อมูลส่วนบุคคล) */
export interface Progress {
  best: Record<string, { score: number; stars: number }>;
  codex: { id: string; title: string; text: string }[];
  settings: { difficulty: 'easy' | 'normal' | 'challenge'; reducedGore: boolean; sound: boolean };
}

const KEY = 'biosurgeon.progress.v1';

export function loadProgress(): Progress {
  const empty: Progress = { best: {}, codex: [], settings: { difficulty: 'easy', reducedGore: false, sound: true } };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<Progress>;
    return { best: p.best ?? {}, codex: p.codex ?? [], settings: { ...empty.settings, ...p.settings } };
  } catch {
    return empty;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* โหมดส่วนตัว / ปิดการเก็บข้อมูล — เล่นต่อได้ตามปกติ */
  }
}
