import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { device, onDeviceChange } from './Device';

export interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

type Updater = (dt: number, t: number) => void;

/**
 * กล้อง แสง เรนเดอร์ลูป และปรับความละเอียดอัตโนมัติตามอุปกรณ์ (Device.ts)
 * - จำกัดเฟรม/วินาทีตามอุปกรณ์ (โทรศัพท์ 30) — GPU ทำงานน้อยลงครึ่งหนึ่ง เครื่องไม่ร้อน
 * - ตอนมีหน้าจอเมนู/สืบสวนบังฉาก 3 มิติ วาดแค่ 8 เฟรม/วินาที, หน้าต่างเด้งระหว่างผ่าตัด 20 เฟรม/วินาที
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly lookTarget = new THREE.Vector3(0, 1, 0);

  private updaters = new Set<Updater>();
  private tween: { from: CameraPose; to: CameraPose; t: number; dur: number; done: () => void } | null = null;
  private last = performance.now();
  private elapsed = 0;
  private dpr: number;
  private fpsTime = 0;
  private fpsFrames = 0;
  /** หลังลดความละเอียด รอสักพักก่อนเพิ่มกลับ (กันภาพกระพริบชัด-เบลอสลับไปมา) */
  private holdUpUntil = 0;
  fps = 60;
  /** ระดับการบังฉาก: 'screen' = หน้าจอเต็มบังอยู่, 'modal' = หน้าต่างเด้ง, null = เห็นฉากเต็มที่ */
  covered: 'screen' | 'modal' | null = null;

  /** โหมดหมุนรอบห้องช้า ๆ ตอนอยู่หน้าเมนู */
  idleOrbit = true;
  private orbitAngle = 0.6;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: device.kind === 'desktop' ? 'high-performance' : 'default' });
    this.dpr = device.maxDpr;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = device.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 40);
    this.camera.position.set(2, 1.9, 2.2);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.scene.background = new THREE.Color(0xcfdcdc);
    pmrem.dispose();

    window.addEventListener('resize', () => this.resize());
    onDeviceChange(() => this.applyDevice());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** ผู้เล่นเปลี่ยนระดับกราฟิก: ปรับความละเอียดและเงาทันที (ต้องคอมไพล์วัสดุใหม่เมื่อเปิด/ปิดเงา) */
  private applyDevice(): void {
    this.dpr = device.maxDpr;
    this.renderer.setPixelRatio(this.dpr);
    this.resize();
    if (this.renderer.shadowMap.enabled !== device.shadows) {
      this.renderer.shadowMap.enabled = device.shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
    }
  }

  addUpdater(fn: Updater): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  /** คอมไพล์เชดเดอร์ของทุกวัตถุในฉากล่วงหน้า (ตอนหน้าจอโหลด) — ไม่ให้เกมกระตุกตอนเห็นอวัยวะครั้งแรก */
  async warmUp(): Promise<void> {
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  /** เลื่อนกล้องไปยังมุมมองใหม่แบบนุ่มนวล */
  flyTo(pose: CameraPose, dur = 1.4): Promise<void> {
    this.idleOrbit = false;
    return new Promise((resolve) => {
      this.tween = {
        from: { pos: this.camera.position.clone(), target: this.lookTarget.clone() },
        to: { pos: pose.pos.clone(), target: pose.target.clone() },
        t: 0,
        dur,
        done: resolve,
      };
    });
  }

  setPose(pose: CameraPose): void {
    this.tween = null;
    this.camera.position.copy(pose.pos);
    this.lookTarget.copy(pose.target);
    this.camera.lookAt(this.lookTarget);
  }

  startIdleOrbit(): void {
    this.tween = null;
    this.idleOrbit = true;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // หน้าต่างถูกย่อจนเหลือ 0 — ข้ามไปก่อน (ถ้าคำนวณจะได้ค่ากล้องเป็น NaN)
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // จอแคบ (แท็บเล็ตแนวตั้ง/มือถือ) ขยายมุมมองให้เห็นแผลครบ
    this.camera.fov = w / h < 1 ? 62 : 45;
    this.camera.updateProjectionMatrix();
  }

  /** เพดานเฟรม/วินาทีตอนนี้ */
  private cap(): number {
    if (this.covered === 'screen') return 8;
    if (this.covered === 'modal') return Math.min(20, device.fpsCap);
    return device.fpsCap;
  }

  private frame(): void {
    const now = performance.now();
    // ข้ามเฟรมให้ไม่เกินเพดาน (เผื่อ 2 มิลลิวินาทีให้จอ 60 Hz วาดทุก 2 เฟรมพอดีที่ 30)
    if (now - this.last < 1000 / this.cap() - 2) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.adaptResolution(dt, now);
  }

  /** เดินเฟรมหนึ่งครั้ง (ใช้ภายใน และใช้ทดสอบอัตโนมัติผ่าน window.__bs ในโหมดพัฒนา) */
  step(dt: number): void {
    this.elapsed += dt;

    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, k);
      this.lookTarget.lerpVectors(tw.from.target, tw.to.target, k);
      this.camera.lookAt(this.lookTarget);
      if (tw.t >= 1) {
        this.tween = null;
        tw.done();
      }
    } else if (this.idleOrbit) {
      this.orbitAngle += dt * 0.06;
      const r = 2.6;
      this.camera.position.set(Math.sin(this.orbitAngle) * r, 1.95, Math.cos(this.orbitAngle) * r + 0.2);
      this.lookTarget.set(0, 1.0, 0.1);
      this.camera.lookAt(this.lookTarget);
    }

    for (const fn of this.updaters) fn(dt, this.elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  /** ถ้าทำเฟรมไม่ทันเพดาน ลดความละเอียดการเรนเดอร์ลงทีละขั้น ถ้าเหลือเฟือค่อยเพิ่มกลับ */
  private adaptResolution(dt: number, now: number): void {
    if (this.covered) {
      this.fpsTime = 0;
      this.fpsFrames = 0;
      return;
    }
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < 2) return;
    this.fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    const cap = this.cap();
    let next = this.dpr;
    if (this.fps < cap * 0.8 && this.dpr > device.minDpr) {
      next = Math.max(device.minDpr, this.dpr - 0.15);
      this.holdUpUntil = now + 12000;
    } else if (this.fps > cap * 0.93 && this.dpr < device.maxDpr && now > this.holdUpUntil) next = Math.min(device.maxDpr, this.dpr + 0.1);
    if (next !== this.dpr) {
      this.dpr = next;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }
}
