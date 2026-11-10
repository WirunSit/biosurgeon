// สร้างโมเดลอวัยวะสืบพันธุ์เพศหญิง (.glb) ในพิกัดร่างกายเดียวกับ BodyParts3D
// เหตุผล: ชุดข้อมูล BodyParts3D สแกนจากผู้ชาย จึงไม่มีมดลูก ท่อนำไข่ รังไข่ — สร้างจากขนาดและตำแหน่งตามตำรากายวิภาค
//   มดลูก ~7.5 × 5 × 2.5 ซม. เอียงไปด้านหน้า (anteverted) วางเหนือยอดกระเพาะปัสสาวะ, คอมดลูก ~3 ซม., ช่องคลอด ~8 ซม. เอียงไปด้านหลัง
//   ท่อนำไข่ ~11 ซม. งอกจากมุมมดลูก (ส่วนคอดแคบ → ส่วนกระเปาะ → ปากแตรมีชายครุย) โค้งคลุมรังไข่
//   รังไข่ ~3 × 2 × 1.5 ซม. ข้างผนังอุ้งเชิงกราน มีเอ็นยึดรังไข่ (ovarian ligament) เชื่อมกับมดลูก
// ทุกชิ้นซ้อนกันที่รอยต่อ (ท่อนำไข่ฝังเข้าเนื้อมดลูก ตัวมดลูกต่อคอมดลูก) จึงไม่แยกจากกันเมื่อแสดงผล
// ใช้: node tools/female-pelvis.mjs  → public/models/organs/{uterus_body,cervix_vagina,tube_r,tube_l,ovary_r,ovary_l}.glb
// แกน (เมตร): x = ซ้ายผู้ป่วย, y = ด้านหน้า, z = ทางเท้า (เหมือนโมเดล BodyParts3D หลังแปลง)
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'public/models/organs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));

/** เส้นโค้ง Catmull-Rom ผ่านจุดควบคุม */
function spline(pts, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (pts.length - 1);
    const k = Math.min(pts.length - 2, Math.floor(t));
    const u = t - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    out.push([0, 1, 2].map((j) => f(p0[j], p1[j], p2[j], p3[j])));
  }
  return out;
}

/**
 * ท่อหน้าตัดวงรีตามแนวเส้นกลาง: prof(t) → [a, b] ครึ่งแกนตามทิศ side และทิศตั้งฉาก (t = 0–1)
 * side = ทิศอ้างอิงของแกน a (เช่น ซ้าย-ขวาสำหรับมดลูก ให้ความกว้างอยู่ด้านข้าง) ปลายที่รัศมีเป็น 0 จะปิดเป็นโดม
 */
function loft(ctrl, prof, { n = 60, seg = 28, side = [1, 0, 0], wobble = 0 } = {}) {
  const C = spline(ctrl, n);
  const v = [];
  const f = [];
  for (let i = 0; i <= n; i++) {
    const T = norm(sub(C[Math.min(n, i + 1)], C[Math.max(0, i - 1)]));
    let X = sub(side, mul(T, dot(side, T)));
    if (Math.hypot(...X) < 1e-6) X = cross(T, [0, 1, 0]);
    X = norm(X);
    const Y = norm(cross(T, X));
    const [a, b] = prof(i / n);
    for (let j = 0; j < seg; j++) {
      const ang = (j / seg) * Math.PI * 2;
      // ผิวไม่กลมเรียบเป๊ะ (เนื้อเยื่อจริง)
      const w = 1 + wobble * Math.sin(ang * 3 + i * 0.7) * Math.sin(i * 0.31);
      v.push(...add(C[i], add(mul(X, Math.cos(ang) * a * w), mul(Y, Math.sin(ang) * b * w))));
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      f.push(a, c, b, b, c, d);
    }
  // ปิดปลายทั้งสองด้าน (ปลายที่รัศมีเป็น 0 รวมเป็นจุดเดียวอยู่แล้ว)
  const cap = (ring, center, flip) => {
    const ci = v.length / 3;
    v.push(...center);
    for (let j = 0; j < seg; j++) {
      const a = ring * seg + j, b = ring * seg + ((j + 1) % seg);
      flip ? f.push(ci, a, b) : f.push(ci, b, a);
    }
  };
  cap(0, C[0], false);
  cap(n, C[n], true);
  return { v, f };
}

/** ทรงรีบิดเล็กน้อย (รังไข่ผิวขรุขระ) */
function blob(c, r, { seg = 28, ring = 18, rough = 0.06 } = {}) {
  const v = [];
  const f = [];
  for (let i = 0; i <= ring; i++) {
    const th = (i / ring) * Math.PI;
    for (let j = 0; j < seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      const k = 1 + rough * Math.sin(3 * ph + 2 * th) * Math.sin(5 * th);
      v.push(c[0] + r[0] * Math.sin(th) * Math.cos(ph) * k, c[1] + r[1] * Math.sin(th) * Math.sin(ph) * k, c[2] + r[2] * Math.cos(th) * k);
    }
  }
  for (let i = 0; i < ring; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c2 = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      f.push(a, b, c2, b, d, c2);
    }
  return { v, f };
}

function merge(...ms) {
  const v = [];
  const f = [];
  for (const m of ms) {
    const o = v.length / 3;
    v.push(...m.v);
    f.push(...m.f.map((i) => i + o));
  }
  return { v, f };
}

function normals({ v, f }) {
  const n = new Float32Array(v.length);
  for (let i = 0; i < f.length; i += 3) {
    const [a, b, c] = [f[i] * 3, f[i + 1] * 3, f[i + 2] * 3];
    const e1 = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]];
    const e2 = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
    const nn = cross(e1, e2);
    for (const p of [a, b, c]) for (let k = 0; k < 3; k++) n[p + k] += nn[k];
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

function writeGLB(name, mesh) {
  const pos = new Float32Array(mesh.v);
  const nrm = normals(mesh);
  const idx = new Uint32Array(mesh.f);
  const pad = (n) => (n + 3) & ~3;
  const parts = [Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(idx.buffer)];
  const offs = [];
  let len = 0;
  for (const p of parts) {
    offs.push(len);
    len += pad(p.length);
  }
  const bin = Buffer.alloc(len);
  parts.forEach((p, i) => p.copy(bin, offs[i]));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) {
    min[i % 3] = Math.min(min[i % 3], pos[i]);
    max[i % 3] = Math.max(max[i % 3], pos[i]);
  }
  const gltf = {
    asset: { version: '2.0', generator: 'BioSurgeon female-pelvis (procedural, textbook dimensions)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: offs[0], byteLength: parts[0].length, target: 34962 },
      { buffer: 0, byteOffset: offs[1], byteLength: parts[1].length, target: 34962 },
      { buffer: 0, byteOffset: offs[2], byteLength: parts[2].length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: pos.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc(pad(json.length) - json.length, 0x20)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const ch = (t, d) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(d.length, 0);
    h.writeUInt32LE(t, 4);
    return Buffer.concat([h, d]);
  };
  fs.writeFileSync(path.join(OUT, name), Buffer.concat([head, ch(0x4e4f534a, json), ch(0x004e4942, bin)]));
  console.log(name.padEnd(20), (idx.length / 3).toString().padStart(6), 'สามเหลี่ยม', 'min', min.map((x) => Math.round(x * 1000)).join(','), 'max', max.map((x) => Math.round(x * 1000)).join(','));
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- จุดสำคัญ (เมตร) ----------
// ช่องคลอดจากปากช่องคลอด (ล่าง-หน้า) ขึ้นไปทางหลังถึงฟอร์นิกซ์, คอมดลูกชี้ไปด้านหน้า, ตัวมดลูกเอียงหน้าวางเหนือยอดกระเพาะปัสสาวะ
const INTROITUS = [0, 0.078, -0.722];
const FORNIX = [0, 0.05, -0.8];
const EXT_OS = [0, 0.054, -0.806];
const INT_OS = [0, 0.066, -0.836];
const FUNDUS = [0, 0.1, -0.893];
const CORNU = (s) => [0.024 * s, 0.094, -0.884];

// ตัวมดลูก (รูปลูกแพร์คว่ำ): จากคอคอดมดลูก (isthmus) ถึงยอดมดลูก — กว้าง 5 ซม. หนา 2.5 ซม. ที่ส่วนบน
const body = loft(
  [add(INT_OS, [0, -0.004, 0.006]), INT_OS, [0, 0.074, -0.85], [0, 0.084, -0.866], [0, 0.093, -0.881], FUNDUS],
  (t) => {
    const w = lerp(0.014, 0.026, smooth(0.05, 0.75, t)) * Math.sqrt(Math.max(0, 1 - Math.pow(smooth(0.82, 1, t), 2)));
    const d = lerp(0.011, 0.0135, smooth(0.05, 0.7, t)) * Math.sqrt(Math.max(0, 1 - Math.pow(smooth(0.8, 1, t), 2)));
    return [w + 0.0005, d + 0.0005];
  },
  { n: 70, seg: 36, wobble: 0.02 },
);
// คอมดลูกต่อช่องคลอด: ซ้อนเข้าไปในตัวมดลูกที่คอคอดเล็กน้อย จึงต่อกันไม่แยก
const lower = loft(
  [[0, 0.069, -0.842], INT_OS, EXT_OS, FORNIX, [0, 0.058, -0.775], [0, 0.068, -0.748], INTROITUS],
  (t) => {
    // คอมดลูก (t < 0.35) กลมรี ~2.5 ซม. → ช่องคลอดแบนกว้าง ~3 ซม. ลึก 1.2 ซม.
    const cerv = 1 - smooth(0.3, 0.42, t);
    const w = lerp(0.015, 0.0125, cerv) * (t > 0.97 ? 0.85 : 1);
    const d = lerp(0.0065, 0.0125, cerv);
    return [w, d];
  },
  { n: 70, seg: 32, wobble: 0.015 },
);

// ท่อนำไข่: ส่วนในมดลูก → คอด (isthmus, รัศมี 1.5 มม.) → กระเปาะ (ampulla, 3.5 มม.) → ปากแตร (infundibulum) บานออกเป็นชายครุยข้างรังไข่
function tube(s) {
  const pts = [
    [0.012 * s, 0.093, -0.882],
    CORNU(s),
    [0.042 * s, 0.097, -0.883],
    [0.06 * s, 0.096, -0.881],
    [0.075 * s, 0.088, -0.874],
    [0.084 * s, 0.076, -0.862],
    [0.081 * s, 0.064, -0.851],
    [0.072 * s, 0.058, -0.848],
  ];
  const t = loft(
    pts,
    (u) => {
      const r = u < 0.18 ? 0.0028 : lerp(0.0016, 0.0042, smooth(0.25, 0.7, u)) + 0.006 * smooth(0.86, 1, u);
      return [r, r];
    },
    { n: 80, seg: 16 },
  );
  // ชายครุย (fimbriae): นิ้วเล็ก ๆ ยื่นจากปากแตรไปหารังไข่
  const tip = pts[pts.length - 1];
  const fim = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const dir = [Math.cos(a) * 0.4, Math.sin(a) * 0.6, 0.55];
    const end = add(tip, mul(norm([dir[0] * s, dir[1], dir[2]]), 0.009));
    fim.push(loft([add(tip, [0, 0, -0.002]), add(tip, mul(sub(end, tip), 0.5)), end], (u) => [0.0012 * (1 - 0.6 * u), 0.0012 * (1 - 0.6 * u)], { n: 8, seg: 8 }));
  }
  return merge(t, ...fim);
}

// รังไข่ + เอ็นยึดรังไข่เชื่อมกับมุมมดลูกด้านล่าง-หลัง
function ovary(s) {
  const c = [0.064 * s, 0.062, -0.857];
  const o = blob(c, [0.0105, 0.008, 0.015], { rough: 0.07 });
  const lig = loft([[0.018 * s, 0.084, -0.872], [0.035 * s, 0.074, -0.866], [0.052 * s, 0.066, -0.86]], () => [0.0022, 0.0018], { n: 16, seg: 12 });
  return merge(o, lig);
}

fs.mkdirSync(OUT, { recursive: true });
writeGLB('uterus_body.glb', body);
writeGLB('cervix_vagina.glb', lower);
writeGLB('tube_r.glb', tube(-1));
writeGLB('tube_l.glb', tube(1));
writeGLB('ovary_r.glb', ovary(-1));
writeGLB('ovary_l.glb', ovary(1));
