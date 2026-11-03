import * as THREE from 'three';
import type { ToolId } from '../types';
import { buildTool } from '../procedural/tools';

/**
 * ระบบหยิบจับเครื่องมือ (แผนข้อ 3.1)
 * เครื่องมือ 3 มิติลอยตามตำแหน่งที่ชี้ เมื่อกดจะลดระดับลงแตะเนื้อเยื่อ และปากคีบ/กรรไกรจะหุบ
 */
export class ToolSystem {
  held: ToolId | null = null;
  private meshes = new Map<ToolId, THREE.Group>();
  private holder = new THREE.Group();
  private pos = new THREE.Vector3();
  private hasPos = false;
  private press = 0;
  private tiltQ = new THREE.Quaternion();
  private scale = 0.62;

  constructor(scene: THREE.Scene) {
    this.holder.visible = false;
    scene.add(this.holder);
    const dir = new THREE.Vector3(0.3, 1, -0.55).normalize();
    this.tiltQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }

  /** ฉากเล็ก (ตา) ใช้เครื่องมือขนาดเล็กลง */
  setScale(s: number): void {
    this.scale = s;
    for (const m of this.meshes.values()) m.scale.setScalar(s);
  }

  pick(id: ToolId | null): void {
    if (this.held) this.meshes.get(this.held)!.visible = false;
    this.held = id;
    if (!id) {
      this.holder.visible = false;
      return;
    }
    let m = this.meshes.get(id);
    if (!m) {
      m = buildTool(id);
      m.scale.setScalar(this.scale);
      this.meshes.set(id, m);
      this.holder.add(m);
    }
    m.visible = true;
    m.quaternion.copy(m.userData.flat ? new THREE.Quaternion() : this.tiltQ);
  }

  dispose(): void {
    this.holder.parent?.remove(this.holder);
  }

  update(dt: number, point: THREE.Vector3 | null, pressed: boolean, t: number): void {
    if (!this.held) return;
    const m = this.meshes.get(this.held)!;
    if (!point) {
      this.holder.visible = false;
      this.hasPos = false;
      return;
    }
    this.holder.visible = true;
    this.press += ((pressed ? 1 : 0) - this.press) * Math.min(1, dt * 18);
    const k = this.scale / 0.62;
    const hover = (THREE.MathUtils.lerp(0.014, 0.0015, this.press) + Math.sin(t * 2.2) * 0.0012 * (1 - this.press)) * k;
    const goal = point.clone();
    goal.y += hover;
    if (!this.hasPos) {
      this.pos.copy(goal);
      this.hasPos = true;
    } else this.pos.lerp(goal, Math.min(1, dt * 28));
    this.holder.position.copy(this.pos);
    const jaws = m.userData.jaws as THREE.Object3D | undefined;
    if (jaws) jaws.scale.x = 1 - 0.65 * this.press;
  }
}
