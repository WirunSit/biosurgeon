/**
 * ตรวจชนิดอุปกรณ์ (คอมพิวเตอร์ / แท็บเล็ต / โทรศัพท์) ก่อนเข้าเกม แล้วเลือกระดับกราฟิกให้เหมาะ
 * โทรศัพท์: จำกัด 30 เฟรม/วินาที ความละเอียดต่ำลง ไม่มีเงา ลวดลายเนื้อเยื่อแบบเบา → ลื่น ไม่ร้อน แบตไม่หมดเร็ว
 * ผู้เล่น/ครูเปลี่ยนระดับเองได้ในล็อบบี้ (เก็บใน localStorage 'bs.quality')
 */

export type DeviceKind = 'phone' | 'tablet' | 'desktop';
export type Quality = 'low' | 'medium' | 'high';
export type QualityPref = 'auto' | Quality;

export interface DeviceProfile {
  kind: DeviceKind;
  /** จอสัมผัสเป็นอินพุตหลัก (ไม่มีเมาส์) */
  touch: boolean;
  /** iPhone/iPod: เบราว์เซอร์ไม่รองรับโหมดเต็มจอของหน้าเว็บ */
  ios: boolean;
  pref: QualityPref;
  quality: Quality;
  /** ความละเอียดการเรนเดอร์สูงสุด/ต่ำสุด (เท่าของพิกเซล CSS) — ระบบปรับอัตโนมัติอยู่ในช่วงนี้ */
  maxDpr: number;
  minDpr: number;
  /** เพดานเฟรม/วินาทีระหว่างเล่น */
  fpsCap: number;
  shadows: boolean;
  /** ลวดลายเนื้อเยื่อแบบเบา (ตัดเส้นเลือดฝอยชั้นละเอียด ลายกลีบ เงาวาว sheen) */
  lightTissue: boolean;
  /** หมุนมุมมองได้จำกัด (โทรศัพท์) แทนหมุนรอบตัว */
  limitedOrbit: boolean;
}

const KIND_NAMES: Record<DeviceKind, string> = { phone: 'โทรศัพท์', tablet: 'แท็บเล็ต', desktop: 'คอมพิวเตอร์' };
export const QUALITY_NAMES: Record<Quality, string> = { low: 'ประหยัดพลังงาน', medium: 'สมดุล', high: 'สวยที่สุด' };

function detectKind(): { kind: DeviceKind; touch: boolean; ios: boolean } {
  const ua = navigator.userAgent;
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  const coarse = mq('(pointer: coarse)');
  const fine = mq('(any-pointer: fine)');
  const points = navigator.maxTouchPoints || 0;
  // iPadOS 13+ รายงานตัวเองเป็น Mac — แยกด้วยจอสัมผัส
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && points > 1);
  const ios = /iPhone|iPod/.test(ua);
  const shortSide = Math.min(screen.width, screen.height);
  const touch = coarse || (points > 0 && !fine);
  let kind: DeviceKind = 'desktop';
  if (ios || /Android.+Mobile|Windows Phone|Mobi/.test(ua) || (touch && shortSide < 600)) kind = 'phone';
  else if (ipad || /Android|Tablet/.test(ua) || (touch && !fine)) kind = 'tablet';
  return { kind, touch: touch || kind !== 'desktop', ios };
}

function readPref(): QualityPref {
  try {
    const v = localStorage.getItem('bs.quality');
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch {
    /* ไม่มี localStorage — ใช้อัตโนมัติ */
  }
  return 'auto';
}

function build(base: { kind: DeviceKind; touch: boolean; ios: boolean }, pref: QualityPref): DeviceProfile {
  const quality: Quality = pref !== 'auto' ? pref : base.kind === 'phone' ? 'low' : base.kind === 'tablet' ? 'medium' : 'high';
  const dpr = window.devicePixelRatio || 1;
  const q = {
    low: { maxDpr: Math.min(dpr, 1.25), minDpr: 0.7, fpsCap: 30, shadows: false, lightTissue: true },
    medium: { maxDpr: Math.min(dpr, 1.5), minDpr: 0.75, fpsCap: 60, shadows: true, lightTissue: true },
    high: { maxDpr: Math.min(dpr, 1.5), minDpr: 0.6, fpsCap: 60, shadows: true, lightTissue: false },
  }[quality];
  return { ...base, pref, quality, ...q, limitedOrbit: base.kind === 'phone' };
}

const base = detectKind();
// ทดสอบบนคอม: ?device=phone|tablet|desktop
const forced = new URLSearchParams(location.search).get('device');
if (forced === 'phone' || forced === 'tablet' || forced === 'desktop') {
  base.kind = forced;
  base.touch = forced !== 'desktop';
}

/** โปรไฟล์ปัจจุบัน (แก้ค่าในที่เดิมเมื่อผู้เล่นเปลี่ยนระดับกราฟิก) */
export const device: DeviceProfile = build(base, readPref());

const listeners = new Set<() => void>();
export function onDeviceChange(fn: () => void): void {
  listeners.add(fn);
}

export function setQualityPref(pref: QualityPref): void {
  try {
    if (pref === 'auto') localStorage.removeItem('bs.quality');
    else localStorage.setItem('bs.quality', pref);
  } catch {
    /* บันทึกไม่ได้ก็ใช้ได้ในรอบนี้ */
  }
  Object.assign(device, build(base, pref));
  applyBodyClasses();
  for (const fn of listeners) fn();
}

export function deviceLabel(): string {
  const icon = device.kind === 'phone' ? '📱' : device.kind === 'tablet' ? '📲' : '💻';
  return `${icon} ${KIND_NAMES[device.kind]} • กราฟิก${QUALITY_NAMES[device.quality]}${device.pref === 'auto' ? ' (อัตโนมัติ)' : ''}`;
}

/** คลาสบน <body> ให้ CSS จัดหน้าจอตามอุปกรณ์ (dev-phone / dev-tablet / dev-desktop, touch) */
export function applyBodyClasses(): void {
  const b = document.body.classList;
  b.remove('dev-phone', 'dev-tablet', 'dev-desktop');
  b.add(`dev-${device.kind}`);
  b.toggle('touch', device.touch);
  b.toggle('q-low', device.quality === 'low');
}
