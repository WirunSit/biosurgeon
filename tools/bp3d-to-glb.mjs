// แปลงโมเดลอวัยวะจาก BodyParts3D (.stl, หน่วย มม.) เป็น .glb ขนาดเล็กสำหรับเกม — ไม่ต้องใช้ Blender
//
// ใช้: node tools/bp3d-to-glb.mjs <โฟลเดอร์ STL> [โฟลเดอร์ปลายทาง]
// รายการโมเดลอยู่ใน tools/bp3d-models.json: { "ชื่อไฟล์.glb": { "fma": ["7197", ...], "tris": 6000 } }
//
// ขั้นตอน: รวมหลายชิ้นเป็นชิ้นเดียว → เชื่อมจุดซ้ำ → ลดจำนวนสามเหลี่ยมแบบรวมจุดในกริด → ปรับผิวเรียบ (Taubin)
// → หมุนแกนเป็นแกนของเกม → เขียน .glb (ตำแหน่ง + เวกเตอร์ปกติ + ดัชนี)
//
// แกน BodyParts3D: x = ซ้ายของผู้ป่วย, y = ด้านหลัง, z = ด้านศีรษะ
// แกนในเกม (ภายในวัตถุ): x = ซ้ายของผู้ป่วย, y = ด้านหน้า (หันหากล้องเมื่อนอนหงาย), z = ทางเท้า
// ข้อมูล: BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, outDir = 'public/models/organs'] = process.argv.slice(2);
if (!srcDir) {
  console.error('ใช้: node tools/bp3d-to-glb.mjs <โฟลเดอร์ STL> [โฟลเดอร์ปลายทาง]');
  process.exit(1);
}
const list = JSON.parse(fs.readFileSync(new URL('./bp3d-models.json', import.meta.url), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

function readSTL(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(80);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 3; k++) {
      const x = b.readFloatLE(o + k * 12);
      const y = b.readFloatLE(o + k * 12 + 4);
      const z = b.readFloatLE(o + k * 12 + 8);
      // มม. → เมตร และหมุน 180° รอบแกน x
      pos[i * 9 + k * 3] = x * 0.001;
      pos[i * 9 + k * 3 + 1] = -y * 0.001;
      pos[i * 9 + k * 3 + 2] = -z * 0.001;
    }
  }
  return pos;
}

/** เชื่อมจุดที่ตำแหน่งเดียวกัน → { v: Float32Array, f: Uint32Array } */
function weld(pos) {
  const map = new Map();
  const v = [];
  const f = new Uint32Array(pos.length / 3);
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${Math.round(pos[i] * 1e6)},${Math.round(pos[i + 1] * 1e6)},${Math.round(pos[i + 2] * 1e6)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = v.length / 3;
      map.set(key, id);
      v.push(pos[i], pos[i + 1], pos[i + 2]);
    }
    f[i / 3] = id;
  }
  return { v: new Float32Array(v), f };
}

/** ลดรายละเอียดด้วยการรวมจุดในช่องกริด (เร็ว ทนต่อโมเดลที่ไม่ปิดสนิท) */
function cluster(mesh, cell) {
  const { v, f } = mesh;
  const cellOf = new Int32Array(v.length / 3);
  const cells = new Map();
  const sum = [];
  for (let i = 0; i < v.length / 3; i++) {
    const key = `${Math.floor(v[i * 3] / cell)},${Math.floor(v[i * 3 + 1] / cell)},${Math.floor(v[i * 3 + 2] / cell)}`;
    let c = cells.get(key);
    if (c === undefined) {
      c = sum.length;
      cells.set(key, c);
      sum.push([0, 0, 0, 0]);
    }
    cellOf[i] = c;
    const s = sum[c];
    s[0] += v[i * 3];
    s[1] += v[i * 3 + 1];
    s[2] += v[i * 3 + 2];
    s[3]++;
  }
  const nv = new Float32Array(sum.length * 3);
  sum.forEach((s, i) => {
    nv[i * 3] = s[0] / s[3];
    nv[i * 3 + 1] = s[1] / s[3];
    nv[i * 3 + 2] = s[2] / s[3];
  });
  const seen = new Set();
  const nf = [];
  for (let i = 0; i < f.length; i += 3) {
    const a = cellOf[f[i]];
    const b = cellOf[f[i + 1]];
    const c = cellOf[f[i + 2]];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    nf.push(a, b, c);
  }
  return { v: nv, f: new Uint32Array(nf) };
}

function decimate(mesh, target) {
  if (mesh.f.length / 3 <= target) return mesh;
  let lo = 0;
  let hi = 0;
  const v = mesh.v;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i++) {
    min[i % 3] = Math.min(min[i % 3], v[i]);
    max[i % 3] = Math.max(max[i % 3], v[i]);
  }
  hi = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 20;
  lo = hi / 400;
  let best = mesh;
  for (let it = 0; it < 18; it++) {
    const mid = Math.sqrt(lo * hi);
    const m = cluster(mesh, mid);
    if (m.f.length / 3 > target) lo = mid;
    else {
      hi = mid;
      best = m;
    }
  }
  return best;
}

/** ตัดจุดที่ไม่มีสามเหลี่ยมใช้ทิ้ง (เหลือจากการรวมจุด) ไม่ให้ทำให้กล่องขอบเขตผิด */
function compact(mesh) {
  const map = new Int32Array(mesh.v.length / 3).fill(-1);
  const v = [];
  const f = new Uint32Array(mesh.f.length);
  for (let i = 0; i < mesh.f.length; i++) {
    const o = mesh.f[i];
    if (map[o] < 0) {
      map[o] = v.length / 3;
      v.push(mesh.v[o * 3], mesh.v[o * 3 + 1], mesh.v[o * 3 + 2]);
    }
    f[i] = map[o];
  }
  return { v: new Float32Array(v), f };
}

/** ปรับผิวเรียบแบบ Taubin (ลดรอยหยักจากการรวมจุดโดยไม่หดตัว) */
function smooth(mesh, iters = 4) {
  const { v, f } = mesh;
  const n = v.length / 3;
  const nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < f.length; i += 3)
    for (const [a, b] of [[f[i], f[i + 1]], [f[i + 1], f[i + 2]], [f[i + 2], f[i]]]) {
      nb[a].add(b);
      nb[b].add(a);
    }
  const step = (k) => {
    const out = new Float32Array(v);
    for (let i = 0; i < n; i++) {
      if (!nb[i].size) continue; // จุดที่ไม่ต่อกับสามเหลี่ยมใด — ไม่ขยับ (มิฉะนั้นจะถูกดึงเข้าหาจุดกำเนิด)
      let x = 0;
      let y = 0;
      let z = 0;
      for (const j of nb[i]) {
        x += v[j * 3];
        y += v[j * 3 + 1];
        z += v[j * 3 + 2];
      }
      const c = nb[i].size || 1;
      out[i * 3] = v[i * 3] + k * (x / c - v[i * 3]);
      out[i * 3 + 1] = v[i * 3 + 1] + k * (y / c - v[i * 3 + 1]);
      out[i * 3 + 2] = v[i * 3 + 2] + k * (z / c - v[i * 3 + 2]);
    }
    v.set(out);
  };
  for (let i = 0; i < iters; i++) {
    step(0.5);
    step(-0.53);
  }
  return mesh;
}

function normals(mesh) {
  const { v, f } = mesh;
  const nrm = new Float32Array(v.length);
  for (let i = 0; i < f.length; i += 3) {
    const [a, b, c] = [f[i] * 3, f[i + 1] * 3, f[i + 2] * 3];
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const p of [a, b, c]) {
      nrm[p] += nx;
      nrm[p + 1] += ny;
      nrm[p + 2] += nz;
    }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l;
    nrm[i + 1] /= l;
    nrm[i + 2] /= l;
  }
  return nrm;
}

function writeGLB(file, mesh, nrm) {
  const { v, f } = mesh;
  const big = v.length / 3 > 65535;
  const idx = big ? new Uint32Array(f) : new Uint16Array(f);
  const pad = (n) => (n + 3) & ~3;
  const parts = [Buffer.from(v.buffer), Buffer.from(nrm.buffer), Buffer.from(idx.buffer)];
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
  for (let i = 0; i < v.length; i++) {
    min[i % 3] = Math.min(min[i % 3], v[i]);
    max[i % 3] = Math.max(max[i % 3], v[i]);
  }
  const gltf = {
    asset: { version: '2.0', generator: 'BioSurgeon bp3d-to-glb', copyright: 'BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan' },
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
      { bufferView: 0, componentType: 5126, count: v.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: v.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: big ? 5125 : 5123, count: idx.length, type: 'SCALAR' },
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
  fs.writeFileSync(file, Buffer.concat([head, ch(0x4e4f534a, json), ch(0x004e4942, bin)]));
}

for (const [name, spec] of Object.entries(list)) {
  const arrays = spec.fma.map((id) => readSTL(path.join(srcDir, `FMA${id}.stl`)));
  const all = new Float32Array(arrays.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const a of arrays) {
    all.set(a, o);
    o += a.length;
  }
  const raw = all.length / 9;
  const mesh = smooth(compact(decimate(weld(all), spec.tris ?? 6000)), spec.smooth ?? 4);
  writeGLB(path.join(outDir, name), mesh, normals(mesh));
  const kb = Math.round(fs.statSync(path.join(outDir, name)).size / 1024);
  console.log(`${name.padEnd(24)} ${String(raw).padStart(7)} → ${String(mesh.f.length / 3).padStart(6)} สามเหลี่ยม  ${kb} KB`);
}
