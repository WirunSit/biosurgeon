import * as THREE from 'three';
import { TABLE_Y } from './room';
import { makeOpeningMaterial, type OpeningUniforms } from '../core/IncisionSystem';

/**
 * ผู้ป่วยคลุมผ้าปลอดเชื้อเกือบทั้งตัว เปิดเฉพาะ "หน้าต่างผ่าตัด" ที่ท้องน้อยขวา (แผนข้อ 5.1)
 * แกน: ศีรษะอยู่ทาง -Z, เท้า +Z, ด้านขวาของผู้ป่วยอยู่ทาง -X, สะดืออยู่ที่ (0, z=0)
 */

/** หน้าต่างผ่าตัด (เมตร): ศูนย์กลาง cx, cz และครึ่งความกว้าง hw (แกน X), hd (แกน Z) */
export const WIN = { cx: -0.075, cz: 0.075, hw: 0.075, hd: 0.075 };

/** หน้าต่างผ่าตัดทั่วไป — ทุกเคสวางหน้าต่างที่จุดเดียวกันบนลำตัว แต่ขนาดต่างกันได้ (ตา ≈ 2 ซม. ถึงช่องท้อง ≈ 15 ซม.) */
export interface Win {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
}

const BODY_H = 0.2;
const BODY_W = 0.23;

const smooth = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** ความสูงลำตัวเหนือเตียง (ไม่รวมผ้า) */
export function bodyH(x: number, z: number): number {
  const legs = smooth(0.28, 0.5, z);
  const height = BODY_H * (1 - 0.32 * legs) * (1 + 0.035 * Math.exp(-(z * z) / 0.05));
  const a = Math.abs(x) / BODY_W;
  if (a >= 1) return 0;
  return height * Math.sqrt(1 - a ** 4);
}

export function surfaceY(x: number, z: number): number {
  return TABLE_Y + bodyH(x, z);
}

/** ระดับผิวหนังที่ศูนย์กลางหน้าต่างผ่าตัด */
export const Y0 = surfaceY(WIN.cx, WIN.cz);

function drapeH(x: number, z: number, W: Win): number {
  const ax = Math.abs(x);
  let h: number;
  if (ax < 0.17) h = bodyH(x, z) + 0.004;
  else if (ax < 0.29) {
    const h0 = bodyH(Math.sign(x) * 0.17, z) + 0.004;
    h = THREE.MathUtils.lerp(h0, 0.004, smooth(0.17, 0.29, ax));
  } else if (ax < 0.31) h = 0.004;
  else h = Math.max(-0.42, 0.004 - (ax - 0.31) * 7);
  if (z > 1.02) h = Math.max(-0.42, h - (z - 1.02) * 7);
  // รอยยับของผ้า (ลดลงใกล้หน้าต่างผ่าตัด)
  const dx = Math.max(0, Math.abs(x - W.cx) - W.hw);
  const dz = Math.max(0, Math.abs(z - W.cz) - W.hd);
  const far = smooth(0.0, 0.06, Math.hypot(dx, dz));
  h += far * (0.0022 * Math.sin(x * 55 + z * 13) * Math.sin(z * 37 - x * 9) + 0.0014 * Math.sin(z * 83 + x * 31));
  return h;
}

/** จุดกริดที่มีเส้นตรงกับขอบหน้าต่างพอดี (ขอบรูผ้าจึงคม) */
function axisNodes(lo: number, a: number, b: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const band = (s0: number, s1: number, last: boolean) => {
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let i = 0; i < n + (last ? 1 : 0); i++) out.push(s0 + ((s1 - s0) * i) / n);
  };
  band(lo, a, false);
  band(a, b, false);
  band(b, hi, true);
  return out;
}

export function buildDrape(W: Win = WIN, color = 0x3e8c7e): THREE.Mesh {
  const xs = axisNodes(-0.55, W.cx - W.hw, W.cx + W.hw, 0.55, 0.0125);
  const zs = axisNodes(-0.55, W.cz - W.hd, W.cz + W.hd, 1.05, 0.0125);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      pos.push(xs[i], TABLE_Y + drapeH(xs[i], zs[j], W), zs[j]);
      uv.push(i / nx, j / nz);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      if (Math.abs(cx - W.cx) < W.hw && Math.abs(cz - W.cz) < W.hd) continue;
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ color, roughness: 0.92, side: THREE.DoubleSide }),
  );
  m.receiveShadow = true;
  m.userData.targetId = 'drape';
  return m;
}

/** ผ้าขนหนูม้วน 4 ด้านรอบหน้าต่างผ่าตัด */
export function buildTowels(W: Win = WIN): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 1 });
  const r = 0.008 * Math.min(1, W.hw / 0.075 + 0.25);
  const edges: [number, number, number, number][] = [
    [W.cx - W.hw, W.cz - W.hd, W.cx + W.hw, W.cz - W.hd],
    [W.cx - W.hw, W.cz + W.hd, W.cx + W.hw, W.cz + W.hd],
    [W.cx - W.hw, W.cz - W.hd, W.cx - W.hw, W.cz + W.hd],
    [W.cx + W.hw, W.cz - W.hd, W.cx + W.hw, W.cz + W.hd],
  ];
  for (const [x0, z0, x1, z1] of edges) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = THREE.MathUtils.lerp(x0, x1, i / 12);
      const z = THREE.MathUtils.lerp(z0, z1, i / 12);
      pts.push(new THREE.Vector3(x, surfaceY(x, z) + r * 0.75, z));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 8), mat);
    tube.userData.targetId = 'drape';
    tube.receiveShadow = true;
    g.add(tube);
  }
  return g;
}

export interface Layer {
  id: string;
  name: string;
  depth: number;
  mesh: THREE.Mesh;
  uniforms: OpeningUniforms;
  /** ความกว้างช่องเปิดที่ต้องการ (ค่าที่แสดงจะค่อย ๆ เลื่อนเข้าหา) */
  openTarget: number;
  material: THREE.MeshStandardMaterial;
}

export function buildLayer(
  id: string,
  name: string,
  depth: number,
  params: THREE.MeshStandardMaterialParameters,
  edgeColor: THREE.ColorRepresentation,
  a: THREE.Vector2,
  b: THREE.Vector2,
  W: Win = WIN,
  shape = 0,
): Layer {
  const res = 36;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= res; j++) {
    for (let i = 0; i <= res; i++) {
      const fx = i / res;
      const fz = j / res;
      const x = W.cx - W.hw + fx * 2 * W.hw;
      const z = W.cz - W.hd + fz * 2 * W.hd;
      pos.push(x, surfaceY(x, z) - depth, z);
      uv.push(fx, 1 - fz);
    }
  }
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const p = j * (res + 1) + i;
      const q = p + res + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const { material, uniforms } = makeOpeningMaterial(params, edgeColor, a, b, new THREE.Vector2(W.cx, W.cz), shape, W.hw / 0.075);
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  mesh.userData.targetId = id;
  mesh.userData.layer = id;
  return { id, name, depth, mesh, uniforms, openTarget: 0, material };
}

/** โพรงช่องท้องใต้เยื่อบุ (มองเห็นได้เฉพาะผ่านช่องเปิด) */
export function buildCavity(W: Win = WIN, color: THREE.ColorRepresentation = 0x6e2a28, depth = 0.062, top = 0.04): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.45, side: THREE.BackSide }));
  m.scale.set(W.hw * 0.987, depth, W.hd * 0.987);
  m.position.set(W.cx, surfaceY(W.cx, W.cz) - top, W.cz);
  m.receiveShadow = true;
  return m;
}

/** เท็กซ์เจอร์เส้นใยกล้ามเนื้อ */
export function muscleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#b4443d';
  x.fillRect(0, 0, 256, 256);
  x.translate(128, 128);
  x.rotate(-0.5);
  for (let i = -200; i < 200; i += 5) {
    x.strokeStyle = i % 2 ? 'rgba(120,30,28,0.35)' : 'rgba(215,110,100,0.3)';
    x.lineWidth = 1.5 + (i % 3);
    x.beginPath();
    x.moveTo(-200, i);
    x.bezierCurveTo(-60, i + 4, 60, i - 4, 200, i);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** เท็กซ์เจอร์ไขมัน (เป็นก้อนกลมเล็ก ๆ) */
export function fatTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#efcb6e';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const r = 6 + Math.random() * 10;
    const gr = x.createRadialGradient(px - r * 0.3, py - r * 0.3, 1, px, py, r);
    gr.addColorStop(0, 'rgba(255,236,170,0.75)');
    gr.addColorStop(1, 'rgba(205,160,70,0.25)');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
