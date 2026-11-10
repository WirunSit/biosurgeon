import * as THREE from 'three';

/**
 * รวมเมาส์ / ทัช / ปากกา เป็นเหตุการณ์เดียว (Pointer Events) และคำนวณพิกัด NDC สำหรับ raycast
 * ปุ่มซ้าย/นิ้วเดียว = ใช้เครื่องมือ, คลิกขวาลาก = หมุนมุมมอง (คลิกขวาเฉย ๆ = วางเครื่องมือ),
 * คลิกกลางลาก หรือ Shift + คลิกขวาลาก = เลื่อนมุมมอง, ล้อเมาส์ = ซูม, สองนิ้ว = บีบซูม + เลื่อน
 */
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
  /** ลากหมุนมุมมอง (พิกเซล) */
  onOrbit?: (dx: number, dy: number) => void;
  /** ลากเลื่อนมุมมอง (พิกเซล) */
  onPan?: (dx: number, dy: number) => void;
  /** บีบสองนิ้ว: อัตราส่วนระยะห่างนิ้ว (>1 = กางออก/ซูมเข้า) */
  onPinch?: (ratio: number) => void;
  /** คืนค่า true = ลากคลิกซ้ายเพื่อเลื่อนมุมมอง (เช่น ตอนไม่ได้ถือเครื่องมือ) — คลิกเฉย ๆ ยังเป็นคลิกปกติ */
  leftPans?: () => boolean;

  private view: { mode: 'orbit' | 'pan'; x: number; y: number; moved: number; id: number; left?: boolean } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(private el: HTMLElement) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          // นิ้วที่สองแตะ: ยกเลิกการใช้เครื่องมือของนิ้วแรก แล้วเข้าโหมดบีบ/เลื่อน
          if (this.down) {
            this.down = false;
            this.onUp?.();
          }
          this.pinchDist = this.touchSpread();
          return;
        }
        if (this.touches.size > 2) return;
      }
      if (e.button === 2 || e.button === 1) {
        this.capture(e.pointerId);
        this.view = { mode: e.button === 1 || e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
        return;
      }
      if (e.button !== 0) return;
      this.capture(e.pointerId);
      if (e.pointerType === 'mouse' && this.leftPans?.()) {
        this.update(e);
        this.view = { mode: 'pan', x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId, left: true };
        return;
      }
      this.update(e);
      this.down = true;
      this.onDown?.();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        const center0 = this.touchCenter();
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size >= 2) {
          const c1 = this.touchCenter();
          const d = this.touchSpread();
          if (this.pinchDist > 0 && d > 0) this.onPinch?.(d / this.pinchDist);
          this.pinchDist = d;
          this.onPan?.(c1.x - center0.x, c1.y - center0.y);
          return;
        }
      }
      if (this.view && e.pointerId === this.view.id) {
        const dx = e.clientX - this.view.x;
        const dy = e.clientY - this.view.y;
        this.view.x = e.clientX;
        this.view.y = e.clientY;
        this.view.moved += Math.abs(dx) + Math.abs(dy);
        if (this.view.moved > 4) (this.view.mode === 'pan' ? this.onPan : this.onOrbit)?.(dx, dy);
        return;
      }
      this.update(e);
      if (this.enabled) this.onMove?.();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this.touches.delete(e.pointerId);
        if (this.touches.size < 2) this.pinchDist = 0;
      }
      if (this.view && e.pointerId === this.view.id) {
        // คลิกขวาโดยไม่ลาก = วางเครื่องมือ (เหมือนเดิม)
        if (this.view.mode === 'orbit' && this.view.moved <= 4 && e.type === 'pointerup') this.onCancel?.();
        // คลิกซ้ายโดยไม่ลาก = คลิกปกติ
        if (this.view.left && this.view.moved <= 4 && e.type === 'pointerup' && this.enabled) {
          this.update(e);
          this.onDown?.();
          this.onUp?.();
        }
        this.view = null;
        return;
      }
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
        this.update(e);
        this.onWheel?.(e.deltaY);
      },
      { passive: false },
    );
  }

  /** ยกเลิกการกดค้าง (เช่น เมื่อมีหน้าต่างคำอธิบายเด้งขึ้น) */
  release(): void {
    this.down = false;
  }

  private capture(id: number): void {
    try {
      this.el.setPointerCapture(id);
    } catch {
      /* pointer สังเคราะห์ (ทดสอบอัตโนมัติ) จับไม่ได้ — ไม่เป็นไร */
    }
  }

  private touchCenter(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const t of this.touches.values()) {
      x += t.x;
      y += t.y;
    }
    const n = Math.max(1, this.touches.size);
    return { x: x / n, y: y / n };
  }

  private touchSpread(): number {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private update(e: PointerEvent | WheelEvent): void {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.active = true;
  }
}
