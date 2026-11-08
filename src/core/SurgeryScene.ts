import type * as THREE from 'three';
import type { ToolId } from '../types';

export interface PickResult {
  /** id ของเป้าหมายที่ใกล้ที่สุดที่มองเห็น (เช่น "appendix", "skin", "drape") */
  targetId: string | null;
  point: THREE.Vector3 | null;
  /** พิกัดบนระนาบแผล (เมตร, ศูนย์กลางหน้าต่างผ่าตัด) */
  uv: THREE.Vector2 | null;
}

export interface LabelAnchor {
  key: string;
  text: string;
  pos: THREE.Vector3;
  kind: 'layer' | 'organ';
}

/**
 * สัญญาระหว่าง StepEngine กับฉากผ่าตัดแต่ละแบบ
 * เคสใหม่ที่ใช้ฉากเดิมเขียนแค่ JSON ส่วนฉากใหม่ (ทรวงอก กะโหลก ฯลฯ) ให้ implement interface นี้
 */
export interface SurgeryScene {
  readonly root: THREE.Object3D;
  /** สเกลของฉาก (ขนาดหน้าต่าง / 7.5 ซม.) ใช้ปรับระยะยอมรับการคลิก/ลาก */
  readonly unit?: number;
  readonly toolScale?: number;
  /** ฉากขอเปลี่ยนมุมกล้อง (กล้องส่อง/อุโมงค์) */
  onPose?: (p: { pos: THREE.Vector3; target: THREE.Vector3 }) => void;
  rotateUpdate?(target: string, deg: number): void;
  isClosedPath?(id: string): boolean;
  pick(ray: THREE.Raycaster): PickResult;
  /** พิกัดบนชั้นเนื้อเยื่อที่ระบุ (ไม่สนใจว่ามีชั้นบนบังหรือไม่) */
  layerUV(layer: string, ray: THREE.Raycaster): THREE.Vector2 | null;
  /** เป้าหมายที่ต้องการ ตรงกับสิ่งที่ชี้อยู่หรือไม่ (รองรับชื่อแฝง และเป้าหมายแบบพื้นที่) */
  matches(wanted: string, hit: PickResult): boolean;
  path(id: string): THREE.Vector2[];
  /** ถู/ดูดที่เป้าหมาย คืนค่าความคืบหน้า 0–1 และคำเตือน (ถ้ามี) */
  scrub(
    target: string,
    hit: PickResult,
    ray: THREE.Raycaster,
    first: boolean,
  ): { progress: number; inside: boolean; warn?: string };
  traceDraw(tool: ToolId, from: THREE.Vector2, to: THREE.Vector2, layer?: string): void;
  traceReset(tool: ToolId): void;
  dragUpdate(target: string, delta: THREE.Vector2, progress: number): void;
  dragEnd(target: string, success: boolean): void;
  suturePoints(layer: string, stitches: number): THREE.Vector2[];
  showSuturePoints(layer: string, pts: THREE.Vector2[], next: number): void;
  placeStitch(layer: string, a: THREE.Vector2, b: THREE.Vector2, frac: number): void;
  holdFx(target: string, active: boolean): void;
  effect(name: string): void;
  setHighlight(target: string | null): void;
  showGuide(path: string | null): void;
  setBleeding(rate: number): void;
  labels(): LabelAnchor[];
  /** มุมมองกล้องของห้องผ่าตัดนี้ */
  fieldPose(): { pos: THREE.Vector3; target: THREE.Vector3 };
  /** ชีพจรและการหายใจของผู้ป่วยตอนนี้ (live = ผู้ป่วยจริง ไม่ใช่หุ่นจำลอง/แผ่นฝึก) ใช้ขยับอวัยวะ */
  setPhysiology?(p: { hr: number; rr: number; live: boolean }): void;
  /** เครื่องมือแตะวัตถุ (เนื้อเยื่อสั่นกระเพื่อมเล็กน้อย) */
  touch?(targetId: string | null): void;
  update(dt: number, t: number, camera: THREE.Camera): void;
  dispose(): void;
}
