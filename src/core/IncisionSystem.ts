import * as THREE from 'three';

/**
 * ระบบเปิดผ่าแบบชั้น (Layered Incision — แผนข้อ 3.2)
 * ไม่ตัดเนื้อแบบฟิสิกส์จริง แต่ใช้ shader แบบ alpha-clip เปิด "ช่องรูปเลนส์" ตามแนวกรีด
 * แต่ละชั้นมีความกว้างของช่องเปิดของตัวเอง (uOpen) ทำให้เห็นขอบแต่ละชั้นซ้อนเป็นขั้นบันได
 */

export interface OpeningUniforms {
  uOpen: { value: number };
  uA: { value: THREE.Vector2 };
  uB: { value: THREE.Vector2 };
  uCenter: { value: THREE.Vector2 };
  uEdgeColor: { value: THREE.Color };
  uEdgeW: { value: number };
  /** 0 = ช่องรูปเลนส์ตามแนว A–B, 1 = วงกลมศูนย์กลาง A รัศมี uOpen */
  uShape: { value: number };
  uNoise: { value: number };
}

const FRAG_HEAD = /* glsl */ `
uniform float uOpen;
uniform vec2 uA;
uniform vec2 uB;
uniform vec3 uEdgeColor;
uniform float uEdgeW;
uniform float uShape;
uniform float uNoise;
varying vec2 vLocal;
float bsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bsHash(i), bsHash(i + vec2(1.0, 0.0)), f.x),
             mix(bsHash(i + vec2(0.0, 1.0)), bsHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const FRAG_CLIP = /* glsl */ `
float bsEdge = 0.0;
if (uOpen > 0.0001) {
  float d;
  float taper = 1.0;
  if (uShape > 0.5) {
    d = length(vLocal - uA);
  } else {
    vec2 ab = uB - uA;
    float t = clamp(dot(vLocal - uA, ab) / dot(ab, ab), 0.0, 1.0);
    d = length(vLocal - (uA + ab * t));
    float k = 2.0 * t - 1.0;
    taper = sqrt(max(0.0, 1.0 - k * k));
  }
  float r = uOpen * taper * (0.9 + 0.2 * bsNoise(vLocal * uNoise));
  float inside = r - d;
  if (inside > 0.0) discard;
  bsEdge = 1.0 - smoothstep(0.0, uEdgeW, -inside);
}
`;

export function makeOpeningMaterial(
  params: THREE.MeshStandardMaterialParameters,
  edgeColor: THREE.ColorRepresentation,
  a: THREE.Vector2,
  b: THREE.Vector2,
  center: THREE.Vector2,
  shape = 0,
  scale = 1,
): { material: THREE.MeshStandardMaterial; uniforms: OpeningUniforms } {
  const material = new THREE.MeshStandardMaterial(params);
  const uniforms: OpeningUniforms = {
    uOpen: { value: 0 },
    uA: { value: a.clone() },
    uB: { value: b.clone() },
    uCenter: { value: center.clone() },
    uEdgeColor: { value: new THREE.Color(edgeColor) },
    uEdgeW: { value: 0.0035 * scale },
    uShape: { value: shape },
    uNoise: { value: 160 / scale },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uCenter;\nvarying vec2 vLocal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLocal = (modelMatrix * vec4(position, 1.0)).xz - uCenter;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_CLIP)
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uEdgeColor, bsEdge);',
      );
  };
  return { material, uniforms };
}

/** สูตรเดียวกับ shader (ไม่มี noise) ใช้ตรวจว่าจุดนั้น "เปิด" อยู่หรือไม่ — ค่าบวก = อยู่ในช่องเปิด */
export function openingInside(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2, open: number, shape = 0): number {
  if (open <= 0.0001) return -1;
  if (shape === 1) return open - p.distanceTo(a);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = THREE.MathUtils.clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby), 0, 1);
  const dx = p.x - (a.x + abx * t);
  const dy = p.y - (a.y + aby * t);
  const k = 2 * t - 1;
  const taper = Math.sqrt(Math.max(0, 1 - k * k));
  return open * taper - Math.hypot(dx, dy);
}

/** ความกว้างครึ่งหนึ่งของช่องเปิด ณ ตำแหน่ง t (0–1) ตามแนวกรีด */
export function openingHalfWidth(open: number, t: number): number {
  const k = 2 * t - 1;
  return open * Math.sqrt(Math.max(0, 1 - k * k));
}

/**
 * ติดตามการลากตามเส้น (action "trace") — วัดระยะเบี่ยงเบนจากเส้นเป็นความแม่นยำ %
 * ลากจากปลายด้านใดก็ได้
 */
export class TraceTracker {
  private cum: number[] = [0];
  readonly length: number;
  private dir: 1 | -1 = 1;
  started = false;
  /** เส้นปิด (วงกลม): เริ่มที่ใดก็ได้ วัดระยะสะสมรอบวง */
  closed = false;
  private lastS = 0;
  private travel = 0;
  private maxS = 0;
  private samples = 0;
  private scoreSum = 0;

  constructor(
    private pts: THREE.Vector2[],
    private tol = 0.011,
    private freeTol = 0.0022,
  ) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }

  project(p: THREE.Vector2): { s: number; d: number } {
    let best = { s: 0, d: Infinity };
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const t = THREE.MathUtils.clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1);
      const d = Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
      if (d < best.d) best = { s: this.cum[i] + Math.sqrt(len2) * t, d };
    }
    return best;
  }

  /** เริ่มลาก: ต้องเริ่มใกล้ปลายเส้นด้านใดด้านหนึ่ง */
  begin(p: THREE.Vector2): boolean {
    const { s, d } = this.project(p);
    if (d > this.tol * 1.6) return false;
    if (this.closed) {
      this.started = true;
      this.lastS = s;
      this.travel = 0;
      this.samples = 0;
      this.scoreSum = 0;
      this.add(p);
      return true;
    }
    if (s < this.length * 0.22) this.dir = 1;
    else if (s > this.length * 0.78) this.dir = -1;
    else return false;
    this.started = true;
    this.maxS = 0;
    this.samples = 0;
    this.scoreSum = 0;
    this.add(p);
    return true;
  }

  add(p: THREE.Vector2): void {
    if (!this.started) return;
    const { s, d } = this.project(p);
    if (this.closed) {
      let ds = s - this.lastS;
      if (ds > this.length / 2) ds -= this.length;
      if (ds < -this.length / 2) ds += this.length;
      if (d < this.tol * 2 && Math.abs(ds) < this.length * 0.2) this.travel += ds;
      this.lastS = s;
      this.samples++;
      this.scoreSum += THREE.MathUtils.clamp(1 - Math.max(0, d - this.freeTol) / this.tol, 0, 1);
      return;
    }
    const sd = this.dir === 1 ? s : this.length - s;
    if (d < this.tol * 2 && sd > this.maxS && sd - this.maxS < this.length * 0.3) this.maxS = sd;
    this.samples++;
    this.scoreSum += THREE.MathUtils.clamp(1 - Math.max(0, d - this.freeTol) / this.tol, 0, 1);
  }

  get progress(): number {
    if (this.closed) return Math.min(1, Math.abs(this.travel) / this.length);
    return this.maxS / this.length;
  }

  get accuracy(): number {
    return this.samples ? this.scoreSum / this.samples : 0;
  }
}
