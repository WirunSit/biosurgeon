import * as THREE from 'three';
import { openingEdge } from '../core/IncisionSystem';
import { surfaceY, type Layer, type Win } from './patient';
import { tissueMaterial, type TissueKind } from './tissue';

/**
 * ผนังรอยตัดของชั้นเนื้อเยื่อ: แผ่นตั้งตามขอบช่องเปิด จากผิวของชั้นนี้ลงไปถึงชั้นถัดไป
 * ทำให้เห็นความหนาและเนื้อในของแต่ละชั้นตรงรอยตัด (หนังแท้ → ไขมันเป็นกลีบ, กล้ามเนื้อสีแดงมีเส้นใยและเลือดซึมที่ขอบ,
 * กระดูกมีชั้นแข็งด้านนอกและไขกระดูกสีแดงตรงกลาง) แทนชั้นแผ่นบางที่เห็นเป็นขั้นบันไดสีเรียบ
 * ขอบตามสูตรเดียวกับ shader ของชั้น (openingEdge) จึงต่อกับขอบรูพอดี และขยับตามเมื่อถ่างแผล/เย็บปิด
 */
export type WallKind = 'skin' | 'fat' | 'muscle' | 'membrane' | 'bone';

/** สีตามความลึก (สัดส่วน 0 = ผิวบนของชั้น, 1 = ล่างสุด) */
const STOPS: Record<WallKind, [number, string][]> = {
  skin: [[0, '#b97a66'], [0.05, '#e3ad98'], [0.2, '#f0d2b4'], [0.3, '#f0cd74'], [1, '#e6bb58']],
  fat: [[0, '#f4d47c'], [1, '#e7bb57']],
  muscle: [[0, '#6e1717'], [0.1, '#9c3029'], [0.45, '#b4453b'], [1, '#97342d']],
  membrane: [[0, '#e8d2c9'], [1, '#d6b6aa']],
  bone: [[0, '#f0e9d9'], [0.18, '#e6d8be'], [0.32, '#b5574b'], [0.68, '#a54a40'], [0.82, '#e6d8be'], [1, '#f0e9d9']],
};

const LOOK: Record<WallKind, TissueKind> = { skin: 'fat', fat: 'fat', muscle: 'muscle', membrane: 'plain', bone: 'bone' };

export function wallKindOf(tex: string | undefined, index: number): WallKind {
  if (index === 0 && (tex ?? 'skin') === 'skin') return 'skin';
  if (tex === 'fat' || tex === 'muscle' || tex === 'bone') return tex;
  return 'membrane';
}

export class CutWall {
  readonly mesh: THREE.Mesh;
  private last = -1;
  private readonly n: number;
  private readonly rows: number[];

  constructor(
    private L: Layer,
    private a: THREE.Vector2,
    private b: THREE.Vector2,
    private shape: number,
    private W: Win,
    private bottom: number,
    kind: WallKind,
    scale: number,
    reducedGore: boolean,
  ) {
    const stops = STOPS[kind].map(([f, c]): [number, THREE.Color] => [f, new THREE.Color(c)]);
    // ภาพลดความรุนแรง: ไม่มีเลือดซึมที่ขอบกล้ามเนื้อ
    if (reducedGore && kind === 'muscle') stops[0][1] = stops[1][1].clone();
    this.rows = stops.map((s) => s[0]);
    this.n = shape === 1 ? 160 : 320;
    const cols = this.n + 1;
    const R = this.rows.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * R * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cols * R * 3), 3));
    g.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(cols * R * 4), 4));
    const color = new Float32Array(cols * R * 3);
    for (let j = 0; j < cols; j++)
      stops.forEach(([, c], r) => {
        const o = (j * R + r) * 3;
        color[o] = c.r;
        color[o + 1] = c.g;
        color[o + 2] = c.b;
      });
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    const idx: number[] = [];
    for (let j = 0; j < this.n; j++)
      for (let r = 0; r < R - 1; r++) {
        const p = j * R + r;
        const q = (j + 1) * R + r;
        idx.push(p, p + 1, q, q, p + 1, q + 1);
      }
    g.setIndex(idx);
    const mat = tissueMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.5 }, LOOK[kind], 0.03 * scale);
    // เส้นใยกล้ามเนื้อวิ่งตามแนวแผล (ขนานกับผนัง)
    mat.userData.tissue.tAxis.value.set(1, 0, 0);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = `${L.id}-cut`;
  }

  /** เรียกทุกเฟรม: สร้างรูปทรงใหม่เมื่อช่องเปิดเปลี่ยนขนาด */
  update(): void {
    const open = this.L.uniforms.uOpen.value;
    this.mesh.visible = this.L.mesh.visible && open > 0.0008;
    if (!this.mesh.visible || Math.abs(open - this.last) < 1e-6) return;
    this.last = open;
    const g = this.mesh.geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const rest = g.getAttribute('aRest') as THREE.BufferAttribute;
    const R = this.rows.length;
    const noiseF = this.L.uniforms.uNoise.value;
    const top = this.L.depth;
    const ab = this.b.clone().sub(this.a);
    for (let j = 0; j <= this.n; j++) {
      const s = j / this.n;
      const { p, x } = openingEdge(s, this.a, this.b, open, this.shape, noiseF);
      // ผนังหันเข้าหาช่องเปิด
      let axisPt = this.a;
      if (this.shape !== 1) {
        const t = THREE.MathUtils.clamp(p.clone().sub(this.a).dot(ab) / ab.lengthSq(), 0, 1);
        axisPt = this.a.clone().addScaledVector(ab, t);
      }
      const inward = axisPt.clone().sub(p);
      if (inward.lengthSq() < 1e-12) inward.set(0, 0);
      else inward.normalize();
      const wx = this.W.cx + p.x;
      const wz = this.W.cz + p.y;
      const y0 = surfaceY(wx, wz);
      for (let r = 0; r < R; r++) {
        const depth = top + this.rows[r] * (this.bottom - top);
        const i = j * R + r;
        pos.setXYZ(i, wx, y0 - depth, wz);
        nrm.setXYZ(i, inward.x, 0, inward.y);
        rest.setXYZW(i, x, -depth, 0, x);
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    rest.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
