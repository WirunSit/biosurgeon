import * as THREE from 'three';

/** รวมเมาส์ / ทัช / ปากกา เป็นเหตุการณ์เดียว (Pointer Events) และคำนวณพิกัด NDC สำหรับ raycast */
export class InputManager {
  readonly ndc = new THREE.Vector2(9, 9);
  down = false;
  /** มีตำแหน่งชี้บนแคนวาสแล้วหรือยัง (บนจอทัชจะมีหลังแตะครั้งแรก) */
  active = false;
  enabled = true;

  onDown?: () => void;
  onMove?: () => void;
  onUp?: () => void;
  /** คลิกขวา = วางเครื่องมือคืน */
  onCancel?: () => void;
  onWheel?: (deltaY: number) => void;

  constructor(private el: HTMLElement) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.button === 2) {
        this.onCancel?.();
        return;
      }
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      this.update(e);
      this.down = true;
      this.onDown?.();
    });
    el.addEventListener('pointermove', (e) => {
      this.update(e);
      if (this.enabled) this.onMove?.();
    });
    const end = (e: PointerEvent) => {
      if (!this.down) return;
      this.update(e);
      this.down = false;
      if (this.enabled) this.onUp?.();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', (e) => {
      if (!this.down && e.pointerType === 'mouse') this.active = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.onWheel?.(e.deltaY);
      },
      { passive: false },
    );
  }

  /** ยกเลิกการกดค้าง (เช่น เมื่อมีหน้าต่างคำอธิบายเด้งขึ้น) */
  release(): void {
    this.down = false;
  }

  private update(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.active = true;
  }
}
