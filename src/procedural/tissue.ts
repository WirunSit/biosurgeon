import * as THREE from 'three';

/**
 * วัสดุเนื้อเยื่อมีชีวิต: แทนสีเรียบแบบพลาสติกด้วยลวดลายที่สร้างในเชดเดอร์ (ไม่ต้องใช้ UV จึงใช้กับโมเดลทุกชิ้นได้)
 * - สีด่าง ๆ ไม่สม่ำเสมอ, เส้นเลือดฝอยบนผิว, ลายกลีบ/ก้อนของต่อม ตับ ปอด, ลายเส้นใยกล้ามเนื้อ
 * - ผิวขรุขระระดับเล็ก (bump) และชั้นเมือกเปียกที่สะท้อนแสงเป็นจุดแตกกระจาย ไม่ใช่ไฮไลต์เรียบแบบพลาสติก
 * - แสงทะลุใต้ผิว (subsurface) แบบประมาณ: ขอบอวัยวะอมแดงอ่อน ๆ
 * - ผิวยุบ/ยืดเฉพาะจุดในเวอร์เท็กซ์เชดเดอร์: กดด้วยเครื่องมือ = บุ๋ม, คีบดึง = ยืดเป็นกระโจม, แตะ = คลื่นกระเพื่อม,
 *   ลำไส้ = คลื่นบีบตัวเคลื่อนไปตามความยาว
 * พิกัดลวดลายใช้แอตทริบิวต์ aRest (ตำแหน่งตอนสร้าง) ลวดลายจึงติดไปกับเนื้อเยื่อเมื่ออวัยวะขยับ
 */

export type TissueKind =
  | 'bowel'
  | 'inflamed'
  | 'stomach'
  | 'liver'
  | 'spleen'
  | 'gland'
  | 'fat'
  | 'lung'
  | 'heart'
  | 'kidney'
  | 'brain'
  | 'vessel'
  | 'duct'
  | 'muscle'
  | 'tendon'
  | 'nerve'
  | 'gallbladder'
  | 'bladder'
  | 'uterus'
  | 'bone'
  | 'clot'
  | 'cavity'
  | 'eye'
  | 'fluid'
  | 'synthetic'
  | 'plain';

interface Look {
  /** สีด่าง */
  mottle: number;
  /** เส้นเลือดบนผิว */
  veins: number;
  veinColor: number;
  /** ลายกลีบ/ก้อน (ต่อม ตับ ปอด ไขมัน) */
  lobule: number;
  /** ความขรุขระของผิว */
  bump: number;
  /** ลายเส้นใยตามแนวยาว */
  fiber: number;
  /** จุดเข้ม (ฝุ่นในปอด รูพรุนกระดูก) */
  spots: number;
  /** ความเปียก (ชั้นเคลือบใส) */
  wet: number;
  wetRough: number;
  rough: number;
  /** ขอบอ่อนนุ่มแบบกำมะหยี่ */
  sheen: number;
  /** แสงทะลุใต้ผิว */
  sss: number;
}

const L = (o: Partial<Look>): Look => ({
  mottle: 0.25,
  veins: 0.2,
  veinColor: 0x7a1424,
  lobule: 0,
  bump: 0.3,
  fiber: 0,
  spots: 0,
  wet: 0.6,
  wetRough: 0.14,
  rough: 0.55,
  sheen: 0.35,
  sss: 0.3,
  ...o,
});

const LOOKS: Record<TissueKind, Look> = {
  bowel: L({ mottle: 0.35, veins: 0.8, bump: 0.45, wet: 0.85, wetRough: 0.09, sheen: 0.45, sss: 0.45 }),
  inflamed: L({ mottle: 0.55, veins: 1, veinColor: 0x4a0818, bump: 0.6, wet: 0.9, wetRough: 0.08, sheen: 0.3, sss: 0.3 }),
  stomach: L({ mottle: 0.35, veins: 0.85, bump: 0.55, wet: 0.8, wetRough: 0.1, sheen: 0.4, sss: 0.4 }),
  liver: L({ mottle: 0.3, veins: 0.05, lobule: 0.45, bump: 0.25, wet: 0.95, wetRough: 0.07, rough: 0.5, sheen: 0.2, sss: 0.15 }),
  spleen: L({ mottle: 0.32, veins: 0.12, lobule: 0.25, bump: 0.3, wet: 0.85, wetRough: 0.08, sss: 0.2 }),
  gland: L({ mottle: 0.4, veins: 0.3, lobule: 0.85, bump: 1.1, wet: 0.55, wetRough: 0.16, rough: 0.6, sss: 0.35 }),
  fat: L({ mottle: 0.3, veins: 0.35, veinColor: 0x9a2a2a, lobule: 0.9, bump: 1.2, wet: 0.6, wetRough: 0.12, sss: 0.55 }),
  lung: L({ mottle: 0.45, veins: 0.25, veinColor: 0x6a2440, lobule: 0.6, spots: 0.45, bump: 0.4, wet: 0.6, wetRough: 0.12, sss: 0.5 }),
  heart: L({ mottle: 0.35, veins: 0.3, veinColor: 0x5a0f1c, fiber: 0.35, bump: 0.45, wet: 0.75, wetRough: 0.1, sss: 0.3 }),
  kidney: L({ mottle: 0.25, veins: 0.3, bump: 0.25, wet: 0.85, wetRough: 0.08, sss: 0.25 }),
  brain: L({ mottle: 0.25, veins: 1.0, veinColor: 0xa01c2c, bump: 0.5, wet: 0.65, wetRough: 0.12, sss: 0.4 }),
  vessel: L({ mottle: 0.15, veins: 0.25, fiber: 0.25, bump: 0.2, wet: 0.85, wetRough: 0.08, sss: 0.45 }),
  duct: L({ mottle: 0.2, veins: 0.5, bump: 0.25, wet: 0.8, wetRough: 0.1, sss: 0.4 }),
  muscle: L({ mottle: 0.2, veins: 0.15, fiber: 1, bump: 0.6, wet: 0.55, wetRough: 0.14, sss: 0.3 }),
  tendon: L({ mottle: 0.12, veins: 0.06, fiber: 0.9, bump: 0.35, wet: 0.75, wetRough: 0.1, rough: 0.45, sheen: 0.5, sss: 0.2 }),
  nerve: L({ mottle: 0.15, veins: 0.2, fiber: 0.7, bump: 0.3, wet: 0.7, wetRough: 0.1, sss: 0.4 }),
  gallbladder: L({ mottle: 0.25, veins: 0.55, bump: 0.25, wet: 0.95, wetRough: 0.06, sss: 0.6 }),
  bladder: L({ mottle: 0.25, veins: 0.7, bump: 0.35, wet: 0.75, wetRough: 0.1, sss: 0.45 }),
  uterus: L({ mottle: 0.3, veins: 0.45, bump: 0.35, wet: 0.75, wetRough: 0.1, sss: 0.35 }),
  bone: L({ mottle: 0.3, veins: 0.05, spots: 0.3, bump: 0.6, wet: 0.12, wetRough: 0.3, rough: 0.7, sheen: 0.1, sss: 0.15 }),
  clot: L({ mottle: 0.5, veins: 0, lobule: 0.4, bump: 0.9, wet: 0.9, wetRough: 0.06, rough: 0.45, sss: 0.2 }),
  cavity: L({ mottle: 0.4, veins: 0.7, veinColor: 0x5a0d18, bump: 0.4, wet: 0.4, wetRough: 0.2, sheen: 0.15, sss: 0.25 }),
  eye: L({ mottle: 0.1, veins: 0.05, bump: 0.05, wet: 0.9, wetRough: 0.04, sheen: 0, sss: 0.1 }),
  fluid: L({ mottle: 0.12, veins: 0, bump: 0.15, wet: 1, wetRough: 0.04, rough: 0.2, sheen: 0, sss: 0.1 }),
  synthetic: L({ mottle: 0, veins: 0, bump: 0, wet: 0, sheen: 0, sss: 0 }),
  plain: L({}),
};

/** เดาชนิดเนื้อเยื่อจากรหัส/ชื่อโมเดล/ป้ายชื่อ (ภาษาไทย) */
export function tissueKindOf(key: string, opts: { metal?: number; blood?: boolean } = {}): TissueKind {
  const k = key.toLowerCase();
  if ((opts.metal ?? 0) >= 0.5) return 'synthetic';
  if (opts.blood || /blood|pool|fluid|\bpus\b|urine|spill|เลือดที่|แอ่ง|หนอง|ปัสสาวะ/.test(k)) return 'fluid';
  if (/hematoma|clot|ก้อนเลือด|ลิ่มเลือด/.test(k)) return 'clot';
  if (/inflam|อักเสบ/.test(k)) return 'inflamed';
  if (/screw|plate|stent|ring\d|port\d|\biol\b|patch_mesh|burr|fix_|graft|peanut|สกรู|แผ่นโลหะ|ตาข่าย/.test(k)) return 'synthetic';
  if (/cornea|lens|iris|กระจกตา|เลนส์|ม่านตา/.test(k)) return 'eye';
  if (/ตับอ่อน|pancrea|islet/.test(k)) return 'gland';
  if (/liver|ตับ/.test(k)) return 'liver';
  if (/spleen|ม้าม/.test(k)) return 'spleen';
  if (/stomach|กระเพาะอาหาร/.test(k)) return 'stomach';
  if (/gall|ถุงน้ำดี/.test(k)) return 'gallbladder';
  if (/bladder|trigone|กระเพาะปัสสาวะ/.test(k)) return 'bladder';
  if (/omentum|fat|ไขมัน|โอเมนตัม/.test(k)) return 'fat';
  if (/lung|lobe_(upper|middle|lower)|^[lr]_(upper|middle|lower)|ปอด/.test(k)) return 'lung';
  if (/heart|^lv\d?\b|^rv\b|^ra\b|^la\b|atri|ventric|septum|vsd|หัวใจ|ห้อง/.test(k)) return 'heart';
  if (/artery|vein|aorta|vena|\bivc\b|\bsvc\b|\bgsv\b|pulm_trunk|\bmma\b|\blad\b|vessel|หลอดเลือด|เส้นเลือด|สายสะดือ/.test(k)) return 'vessel';
  if (/nerve|rln|cord|เส้นประสาท|ไขสันหลัง/.test(k)) return 'nerve';
  if (/cerebr|cerebell|brain|pons|midbrain|thalam|callosum|sulci|herniation|สมอง/.test(k)) return 'brain';
  if (/kidney|renal|ไต(?!ร)/.test(k)) return 'kidney';
  if (/bowel|colon|small_int|duoden|appendix|ileum|cecum|ลำไส้|ไส้ติ่ง/.test(k)) return 'bowel';
  if (/tendon|ligament|เอ็น/.test(k)) return 'tendon';
  if (/bone|humer|femur|rib|pelvis|compact|marrow|periost|fragment|chips|vertebr|skull|กระดูก/.test(k)) return 'bone';
  if (/biceps|triceps|muscle|tongue|diaphragm|sphincter|forearm|กล้ามเนื้อ|กะบังลม|ลิ้น/.test(k)) return 'muscle';
  if (/duct|cbd|ureter|urethra|\bvas\b|tube_|ท่อ/.test(k)) return 'duct';
  if (/uterus|cervix|endometri|placenta|ectopic|มดลูก|รก/.test(k)) return 'uterus';
  if (/thyroid|isthmus|lobe_[lr]\b|adr|adrenal|prostat|thymus|vesicle|tonsil|^ln\d|nod_|tumor|testis|epididym|ovary|lymph|pituitar|abscess|ต่อม|ก้อน|อัณฑะ|รังไข่|ทอนซิล/.test(k)) return 'gland';
  return 'plain';
}

export interface TissueUniforms {
  tScale: { value: number };
  tLook1: { value: THREE.Vector4 };
  tLook2: { value: THREE.Vector4 };
  tVein: { value: THREE.Color };
  tAxis: { value: THREE.Vector3 };
  tBumpH: { value: number };
  tSss: { value: number };
  dOn: { value: number };
  dEps: { value: number };
  dPoke: { value: THREE.Vector4 };
  dPokeDir: { value: THREE.Vector3 };
  dPokeR: { value: number };
  dPull: { value: THREE.Vector4 };
  dPullVec: { value: THREE.Vector3 };
  dRip: { value: THREE.Vector4 };
  dRipA: { value: THREE.Vector3 };
  dWave: { value: THREE.Vector4 };
}

// สัญญาณรบกวนแบบ simplex 3 มิติ (Ian McEwan, Ashima Arts — MIT) + cellular noise สำหรับลายกลีบ
const NOISE = /* glsl */ `
vec4 tPermute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 tTaylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float tNoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = tPermute(tPermute(tPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = tTaylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vRest;
uniform float tScale;
uniform vec4 tLook1; // mottle, veins, lobule, bump
uniform vec4 tLook2; // fiber, spots, wet, wetRough
uniform vec3 tVein;
uniform vec3 tAxis;
uniform float tBumpH;
uniform float tSss;
${NOISE}
vec3 tHash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
vec2 tCell(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  float d1 = 8.0; float d2 = 8.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + tHash(i + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(vec2(d1, d2));
}
// เส้นบาง ๆ จากสันของ noise ที่ไม่แตกเป็นจุดประเมื่อเส้นบางกว่าพิกเซล (จางลงแทน)
float tLine(float r, float t0, float t1){
  float fw = fwidth(r);
  return smoothstep(t0 - fw, t1 + fw, r) * clamp((1.0 - t0) / (fw * 2.0 + 1e-5), 0.0, 1.0);
}
vec3 tPerturb(vec3 pos, vec3 n, float h, float face){
  vec3 sx = dFdx(pos); vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

const FRAG_COLOR = /* glsl */ `
vec3 tp = vRest.xyz * tScale;
// ลดรายละเอียดที่เล็กกว่าพิกเซล (กันลายเม็ดทรายระยิบระยับเมื่อมองไกล)
float tPix = length(fwidth(tp));
#define TAA(f) (1.0 - smoothstep(0.18, 0.5, tPix * (f)))
diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, 1.0 + 0.12 * tSss), 0.0);
float tMot = tNoise(tp * 2.2) * 0.65 + tNoise(tp * 5.1 + 3.7) * 0.35;
diffuseColor.rgb *= 1.0 + tLook1.x * 0.38 * tMot;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.66), tLook1.x * 0.6 * smoothstep(0.0, -0.55, tMot));
float tVeinM = 0.0;
if (tLook1.y > 0.0) {
  // เส้นเลือด: สันของ noise ที่ถูกบิด (domain warp) แล้วตัดเป็นช่วงด้วย noise อีกชั้น → เป็นกิ่งก้านปลายเรียว ไม่ใช่วงปิด
  vec3 q = tp * 3.0 + 0.95 * vec3(tNoise(tp * 1.2), tNoise(tp * 1.2 + 7.1), tNoise(tp * 1.2 + 13.3));
  float w1 = tNoise(tp * 1.7 + 21.0);
  float r1 = 1.0 - abs(tNoise(q));
  float m1 = smoothstep(0.05, 0.55, tNoise(tp * 0.8 + 5.0));
  float c1 = tLine(r1, 0.962 - 0.022 * w1, 0.99) * m1;
  float h1 = smoothstep(0.86, 0.975, r1) * m1;
  vec3 q2 = q * 2.4 + 3.1;
  float r2 = 1.0 - abs(tNoise(q2));
  float m2 = smoothstep(0.1, 0.6, tNoise(tp * 1.6 + 9.0)) * max(m1, 0.35);
  float c2 = tLine(r2, 0.972, 0.994) * m2;
  float r3 = 1.0 - abs(tNoise(q * 5.6 + 9.4));
  float c3 = tLine(r3, 0.978, 0.996) * smoothstep(0.15, 0.6, tNoise(tp * 2.6 + 2.0));
  tVeinM = clamp(c1 + 0.65 * c2 + 0.4 * c3, 0.0, 1.0) * tLook1.y;
  // เลือดใต้เยื่อบาง ๆ: รอบเส้นเลือดอมแดงจาง ๆ แล้วตัวเส้นเข้มกว่า
  diffuseColor.rgb *= 1.0 - 0.16 * h1 * tLook1.y;
  diffuseColor.rgb = mix(diffuseColor.rgb, tVein, tVeinM * 0.72);
}
// ผิวอมเลือดเป็นหย่อม ๆ (สีไม่สม่ำเสมอแบบเนื้อเยื่อมีชีวิต)
float tBlush = smoothstep(0.1, 0.7, tNoise(tp * 1.4 + 31.0)) * tLook1.x;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.04, 0.74, 0.76), tBlush * 0.55);
float tLob = 0.0;
float tLobH = 0.0;
if (tLook1.z > 0.0) {
  vec2 f = tCell(tp * 7.5 + 0.3 * vec3(tNoise(tp * 3.0), tNoise(tp * 3.0 + 4.0), 0.0));
  // ร่องระหว่างกลีบจางบ้างชัดบ้าง (ไม่เป็นตาข่ายสม่ำเสมอ) แต่ละกลีบนูนเป็นโดม
  tLob = (1.0 - smoothstep(0.0, 0.16, f.y - f.x)) * tLook1.z * TAA(7.5) * smoothstep(-0.5, 0.4, tNoise(tp * 2.3 + 17.0));
  tLobH = (0.5 - f.x) * tLook1.z;
  diffuseColor.rgb *= 1.0 - 0.2 * tLob + 0.14 * tLobH;
}
float tFib = 0.0;
if (tLook2.x > 0.0) {
  vec3 pa = tp - tAxis * dot(tp, tAxis) * 0.94;
  tFib = (tNoise(pa * 30.0) * 0.6 * TAA(30.0) + tNoise(pa * 70.0) * 0.4 * TAA(70.0)) * tLook2.x;
  diffuseColor.rgb *= 1.0 + 0.14 * tFib;
}
if (tLook2.y > 0.0) {
  float sp = smoothstep(0.62, 0.8, tNoise(tp * 24.0)) * smoothstep(-0.1, 0.5, tNoise(tp * 3.0 + 2.0)) * mix(0.35, 1.0, TAA(24.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.22, 0.2, 0.24), sp * tLook2.y);
}
float tFine = tNoise(tp * 22.0) * 0.6 * TAA(22.0) + tNoise(tp * 48.0) * 0.4 * TAA(48.0);
float tH = tLook1.w * (0.55 * tMot + 0.18 * tFine) + tVeinM * 0.5 - tLob * 0.35 + tLobH * 1.2 + tFib * 0.45;
float tWet = clamp(tLook2.z * (0.8 + 0.55 * tNoise(tp * 5.5 + 11.0)), 0.0, 1.0);
`;

// แสงทะลุใต้ผิว: แสงอ้อมเลยเส้นแบ่งมืด-สว่างเข้าไปเป็นสีแดง (wrap lighting แบบผิวหนัง/เนื้อ) ทำให้เนื้อดูนุ่มไม่แข็งเหมือนพลาสติก
const FRAG_SSS = /* glsl */ `
void RE_Direct_Tissue(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float nl = dot(geometryNormal, directLight.direction);
  float wrap = max(0.0, (nl + 0.6) / 1.6) - max(0.0, nl);
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * wrap * vec3(1.0, 0.32, 0.26) * tSss * 1.6 * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Tissue
`;

const VERT_PARS = /* glsl */ `
attribute vec4 aRest;
varying vec4 vRest;
uniform float dOn;
uniform float dEps;
uniform vec4 dPoke;
uniform vec3 dPokeDir;
uniform float dPokeR;
uniform vec4 dPull;
uniform vec3 dPullVec;
uniform vec4 dRip;
uniform vec3 dRipA;
uniform vec4 dWave;
vec3 dWorld(vec3 p, vec3 n){
  vec3 d = vec3(0.0);
  if (dPoke.w != 0.0) {
    float x = length(p - dPoke.xyz) / dPokeR;
    d += dPokeDir * dPoke.w * exp(-x * x * 2.2);
  }
  if (dot(dPullVec, dPullVec) > 0.0) {
    float x = length(p - dPull.xyz) / dPull.w;
    // ยอดแหลมตรงจุดที่คีบ แล้วลาดลงแบบกระโจม
    d += dPullVec * (0.65 * exp(-x * x * 3.0) + 0.35 / (1.0 + x * x * 14.0));
  }
  if (dRipA.x > 0.0) {
    float r = length(p - dRip.xyz);
    float t = dRip.w;
    d += n * dRipA.x * exp(-t * 3.5) * sin(6.2832 * r / dRipA.y - t * 24.0) * exp(-r / dRipA.z) * smoothstep(0.0, 0.05, t);
  }
  return d;
}
`;

const VERT_MAIN = /* glsl */ `
vRest = aRest;
if (dOn > 0.5) {
  mat3 dM = mat3(modelMatrix);
  mat3 dI = inverse(dM);
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vec3 wn = normalize(objectNormal * dI);
  vec3 t1 = normalize(cross(wn, abs(wn.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(wn, t1);
  vec3 d0 = dWorld(wp, wn);
  vec3 a1 = t1 * dEps + dWorld(wp + t1 * dEps, wn) - d0;
  vec3 a2 = t2 * dEps + dWorld(wp + t2 * dEps, wn) - d0;
  vec3 nn = normalize(cross(a1, a2));
  if (dot(nn, wn) < 0.0) nn = -nn;
  if (dWave.x != 0.0) {
    float s = sin(6.2832 * aRest.w / dWave.y - dWave.z);
    d0 += wn * dWave.x * (s > 0.0 ? 0.4 * s : s);
  }
  transformed += dI * d0;
  #ifndef FLAT_SHADED
    vec3 dvn = normalize((viewMatrix * vec4(nn, 0.0)).xyz);
    #ifdef FLIP_SIDED
      dvn = -dvn;
    #endif
    vNormal = dvn;
  #endif
}
`;

export function tissueMaterial(
  params: THREE.MeshPhysicalMaterialParameters,
  kind: TissueKind,
  size: number,
): THREE.MeshPhysicalMaterial {
  const look = LOOKS[kind];
  const base = new THREE.Color(params.color ?? 0xffffff);
  const mat = new THREE.MeshPhysicalMaterial({
    roughness: look.rough,
    clearcoat: look.wet,
    clearcoatRoughness: look.wetRough,
    sheen: look.sheen,
    sheenRoughness: 0.7,
    sheenColor: base.clone().multiplyScalar(0.45),
    ...params,
  });
  const S = Math.max(size, 1e-4);
  const u: TissueUniforms = {
    tScale: { value: 1 / S },
    tLook1: { value: new THREE.Vector4(look.mottle, look.veins, look.lobule, look.bump) },
    tLook2: { value: new THREE.Vector4(look.fiber, look.spots, mat.clearcoat, mat.clearcoatRoughness) },
    tVein: { value: new THREE.Color(look.veinColor) },
    tAxis: { value: new THREE.Vector3(0, 0, 1) },
    tBumpH: { value: S * 0.0045 },
    tSss: { value: look.sss },
    dOn: { value: 0 },
    dEps: { value: S * 0.02 },
    dPoke: { value: new THREE.Vector4() },
    dPokeDir: { value: new THREE.Vector3(0, -1, 0) },
    dPokeR: { value: S * 0.25 },
    dPull: { value: new THREE.Vector4(0, 0, 0, S * 0.4) },
    dPullVec: { value: new THREE.Vector3() },
    dRip: { value: new THREE.Vector4() },
    dRipA: { value: new THREE.Vector3(0, S * 0.35, S * 0.45) },
    dWave: { value: new THREE.Vector4() },
  };
  mat.userData.tissue = u;
  mat.userData.tissueKind = kind;
  mat.customProgramCacheKey = () => 'tissue1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <displacementmap_vertex>', `#include <displacementmap_vertex>\n${VERT_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${FRAG_SSS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + 0.12 * tFine - 0.12 * tVeinM, 0.05, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        // TISSUE_NOFLIP (โมเดลที่มีรู/สามเหลี่ยมกลับด้านจากการลดจำนวนโพลีกอน): วาดสองด้านแต่ใช้ normal ของจุดยอดที่ชี้ออกนอกเสมอ
        // รูจึงเห็นเป็นเนื้อเยื่อ ไม่ทะลุเป็นจุดดำ
        `#include <normal_fragment_maps>
        #ifdef TISSUE_NOFLIP
          normal = normalize(vNormal);
          vec3 tv = normalize(vViewPosition);
          float tNv = dot(normal, tv);
          // ผิวที่หันหนีกล้อง (มองทะลุรูเข้าไปเห็นผนังด้านใน): ให้หันเข้าหากล้อง เพื่อสว่างกลมกลืนกับผิวรอบ ๆ ไม่เป็นปื้นเทา/ดำ
          if (tNv < 0.0) normal = normalize(tv * 0.85 + (normal - tv * tNv) * 0.5);
          float tFace = 1.0;
          tWet *= step(0.0, tNv);
        #else
          float tFace = faceDirection;
        #endif
        vec3 tN0 = normal;
        normal = tPerturb(-vViewPosition, normal, tH * tBumpH, tFace);`,
      )
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        // ชั้นเมือกเปียกมีผิวเป็นคลื่นเล็ก ๆ ของตัวเอง → ไฮไลต์แตกเป็นจุดระยิบ ไม่เรียบเหมือนพลาสติก
        `#include <clearcoat_normal_fragment_maps>
        #ifdef USE_CLEARCOAT
          clearcoatNormal = tPerturb(-vViewPosition, tN0, (tMot * 0.9 + tNoise(tp * 11.0) * 0.45 + tVeinM * 0.4) * tLook1.w * tBumpH * 1.4, tFace);
        #endif`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat = tWet;
          material.clearcoatRoughness = clamp(tLook2.w + (1.0 - tWet) * 0.25 + 0.04 * tFine, 0.045, 1.0);
        #endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        // แสงกระเจิงใต้ผิว (ประมาณ): ส่วนที่ได้รับแสงอมแดงขึ้น ขอบที่หันออกจากกล้องเรืองอ่อน ๆ
        `#include <lights_fragment_end>
        float tNdv = saturate(dot(normal, geometryViewDir));
        reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(1.06, 0.93, 0.9), tSss);
        reflectedLight.indirectDiffuse += material.diffuseColor * vec3(0.9, 0.28, 0.22) * pow(1.0 - tNdv, 2.5) * tSss * 0.35;`,
      );
  };
  return mat;
}

/** เปิด/ปิดการคำนวณการยุบตัวในเวอร์เท็กซ์เชดเดอร์ตามว่ามีแรงกระทำอยู่หรือไม่ */
export function syncDeform(u: TissueUniforms): void {
  const on = u.dPoke.value.w !== 0 || u.dPullVec.value.lengthSq() > 0 || u.dRipA.value.x > 0 || u.dWave.value.x !== 0;
  u.dOn.value = on ? 1 : 0;
}

/**
 * ใส่แอตทริบิวต์ aRest (ตำแหน่งตอนสร้าง เทียบกับ origin, w = พิกัดตามแนวยาว) ให้เมชที่ใช้วัสดุเนื้อเยื่อ
 * เรขาคณิตที่ใช้ร่วมกับเมชอื่น (โมเดลจากแคช) จะถูกโคลนก่อน
 */
export function bakeRest(mesh: THREE.Mesh, origin: THREE.Vector3, axis: THREE.Vector3, opts: { clone?: boolean } = {}): void {
  if (opts.clone) mesh.geometry = mesh.geometry.clone();
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const arc = g.userData.arcLength as number | undefined;
  mesh.updateWorldMatrix(true, false);
  const out = new Float32Array(pos.count * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(origin);
    out[i * 4] = v.x;
    out[i * 4 + 1] = v.y;
    out[i * 4 + 2] = v.z;
    out[i * 4 + 3] = arc && uv ? uv.getX(i) * arc : v.dot(axis);
  }
  g.setAttribute('aRest', new THREE.BufferAttribute(out, 4));
}

/** แกนยาวที่สุดของกล่องขอบเขต (ใช้เป็นทิศเส้นใยและทิศคลื่นบีบตัว) */
export function longAxis(box: THREE.Box3): THREE.Vector3 {
  const s = box.getSize(new THREE.Vector3());
  if (s.x >= s.y && s.x >= s.z) return new THREE.Vector3(1, 0, 0);
  if (s.z >= s.y) return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 1, 0);
}

/**
 * พลวัตของเนื้อเยื่อหนึ่งชิ้น: สปริงหน่วงสำหรับรอยกด/รอยดึง และคลื่นกระเพื่อม
 * เรียก update ทุกเฟรม แล้วค่าจะถูกเขียนลง uniform ของวัสดุ
 */
export class TissueDyn {
  private poke = 0;
  private pokeV = 0;
  private pokeGoal = 0;
  private pull = new THREE.Vector3();
  private pullV = new THREE.Vector3();
  private pullGoal = new THREE.Vector3();
  private ripT = -1;
  private wavePhase = 0;
  /** แอมพลิจูด (เมตร) และความยาวคลื่น (เมตร) ของคลื่นบีบตัว 0 = ไม่บีบ */
  waveAmp = 0;
  waveLen = 0.05;
  waveSpeed = 1.5;
  /** รัศมีบริเวณที่ยืดตามปากคีบ (ท่อยาวควรกว้างกว่า: ยกขดลำไส้ขึ้นมาทั้งช่วง) */
  grabR: number;

  constructor(
    readonly u: TissueUniforms,
    readonly size: number,
  ) {
    this.grabR = size * 0.42;
  }

  /** แตะ: คลื่นกระเพื่อมจากจุดที่แตะ */
  ripple(point: THREE.Vector3, strength = 1): void {
    this.u.dRip.value.set(point.x, point.y, point.z, 0);
    this.u.dRipA.value.x = this.size * 0.035 * strength;
    this.ripT = 0;
  }

  /** กดค้าง: ผิวบุ๋มลงตามทิศของเครื่องมือ */
  press(point: THREE.Vector3 | null, dir?: THREE.Vector3): void {
    if (!point) {
      this.pokeGoal = 0;
      return;
    }
    this.u.dPoke.value.x = point.x;
    this.u.dPoke.value.y = point.y;
    this.u.dPoke.value.z = point.z;
    if (dir) this.u.dPokeDir.value.copy(dir).normalize();
    this.pokeGoal = this.size * 0.09;
  }

  /** คีบดึง: เนื้อเยื่อรอบจุดที่คีบยืดตามเป็นกระโจม (vec = เมตร, null = ปล่อย ดีดกลับแบบสปริง) */
  grab(point: THREE.Vector3 | null, vec?: THREE.Vector3): void {
    if (point) this.u.dPull.value.set(point.x, point.y, point.z, this.grabR);
    if (vec) this.pullGoal.copy(vec).clampLength(0, this.size * 0.4);
    else this.pullGoal.set(0, 0, 0);
  }

  get busy(): boolean {
    return this.pokeGoal !== 0 || this.pullGoal.lengthSq() > 0;
  }

  update(dt: number, t: number, wave = true): void {
    const h = Math.min(dt, 1 / 30);
    // สปริงรอยกด: ยุบเร็ว คืนตัวช้ากว่าเล็กน้อย (เนื้อเยื่อหนืด)
    const kp = this.pokeGoal > 0 ? 260 : 140;
    this.pokeV += (kp * (this.pokeGoal - this.poke) - 2 * Math.sqrt(kp) * 0.75 * this.pokeV) * h;
    this.poke += this.pokeV * h;
    if (this.pokeGoal === 0 && Math.abs(this.poke) < this.size * 1e-4 && Math.abs(this.pokeV) < 1e-4) this.poke = this.pokeV = 0;
    // สั่นเล็กน้อยขณะกด (มือศัลยแพทย์/เนื้อเยื่อสั่นตอบสนอง)
    const tremor = this.pokeGoal > 0 ? 1 + 0.06 * Math.sin(t * 47) : 1;
    this.u.dPoke.value.w = this.poke * tremor;

    // สปริงรอยดึง: หน่วงน้อย จึงแกว่งเล็กน้อยเมื่อปล่อย
    const kq = 180;
    const acc = this.pullGoal.clone().sub(this.pull).multiplyScalar(kq).addScaledVector(this.pullV, -2 * Math.sqrt(kq) * 0.32);
    this.pullV.addScaledVector(acc, h);
    this.pull.addScaledVector(this.pullV, h);
    if (this.pullGoal.lengthSq() === 0 && this.pull.length() < this.size * 1e-4 && this.pullV.length() < 1e-4) {
      this.pull.set(0, 0, 0);
      this.pullV.set(0, 0, 0);
    }
    this.u.dPullVec.value.copy(this.pull);

    if (this.ripT >= 0) {
      this.ripT += dt;
      this.u.dRip.value.w = this.ripT;
      if (this.ripT > 1.6) {
        this.ripT = -1;
        this.u.dRipA.value.x = 0;
      }
    }

    if (this.waveAmp > 0 && wave) {
      this.wavePhase += dt * this.waveSpeed;
      this.u.dWave.value.set(this.waveAmp, this.waveLen, this.wavePhase, 0);
    } else this.u.dWave.value.x = 0;

    syncDeform(this.u);
  }
}
