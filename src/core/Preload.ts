import type { CaseDef, CaseIndexEntry } from '../types';
import { prefetch, preloadModels } from './AssetLoader';

const BASE = import.meta.env.BASE_URL;

/** ไฟล์โมเดลอวัยวะทั้งหมดที่เคสนี้ใช้ */
export function caseModels(c: CaseDef): string[] {
  const set = new Set<string>();
  for (const o of c.surgery.field?.objects ?? []) if (o.model) set.add(`${BASE}${o.model}`);
  return [...set];
}

/** รูปภาพผลตรวจ/แผนภาพที่อ้างถึงในไฟล์เคส (ค้นทุกช่องที่เป็นข้อความ img/...) */
export function caseImages(c: CaseDef): string[] {
  const set = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (/^img\/[\w./-]+\.(svg|png|jpe?g|webp)$/i.test(v)) set.add(`${BASE}${v}`);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(c);
  return [...set];
}

/** โหลดโมเดลและรูปของเคสเข้าแคช — onProgress(0–1) */
export async function preloadCase(c: CaseDef, onProgress: (p: number) => void): Promise<void> {
  const models = caseModels(c);
  const images = caseImages(c);
  const total = models.length + images.length;
  let done = 0;
  const tick = () => onProgress(total ? ++done / total : 1);
  if (!total) onProgress(1);
  await Promise.all([
    preloadModels(models, tick),
    ...images.map((u) =>
      fetch(u)
        .catch(() => undefined)
        .then(tick),
    ),
  ]);
}

/** ระหว่างเล่น: ดึงไฟล์ของเคสอื่นในระบบร่างกายเดียวกันไว้ในแคชเบราว์เซอร์ (เข้าเคสถัดไปได้เร็ว) */
export function prefetchSystem(index: CaseIndexEntry[], current: CaseIndexEntry | undefined, fetchCase: (id: string) => Promise<CaseDef>): void {
  if (!current) return;
  const others = index.filter((e) => e.available && e.system === current.system && e.id !== current.id);
  // รอให้เคสปัจจุบันเริ่มเล่นก่อน แล้วค่อยดึงเบื้องหลังทีละเคส
  setTimeout(async () => {
    for (const e of others) {
      try {
        const c = await fetchCase(e.id);
        prefetch([...caseModels(c), ...caseImages(c)]);
      } catch {
        /* ไม่สำคัญ — ค่อยโหลดตอนเลือกเคสนั้น */
      }
    }
  }, 4000);
}
