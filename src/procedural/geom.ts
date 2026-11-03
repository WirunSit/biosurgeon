import * as THREE from 'three';

/**
 * ท่อที่รัศมีเปลี่ยนตามความยาวได้ (ไส้ติ่งบวมตรงกลาง ลำไส้ใหญ่เป็นกระเปาะ ฯลฯ)
 * ใช้ parallel-transport frame เพื่อไม่ให้ท่อบิด และรองรับการสร้างเฉพาะช่วง t0–t1 ของเส้นโค้ง
 */
export function varTube(
  curve: THREE.Curve<THREE.Vector3>,
  radius: (t: number) => number,
  opts: { tubular?: number; radial?: number; t0?: number; t1?: number } = {},
): THREE.BufferGeometry {
  const tubular = opts.tubular ?? 64;
  const radial = opts.radial ?? 14;
  const t0 = opts.t0 ?? 0;
  const t1 = opts.t1 ?? 1;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const N = new THREE.Vector3();

  curve.getTangentAt(t0, T);
  // เวกเตอร์ตั้งฉากเริ่มต้น
  const helper = Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  n.crossVectors(T, helper).normalize();

  for (let i = 0; i <= tubular; i++) {
    const t = t0 + ((t1 - t0) * i) / tubular;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    // parallel transport
    n.sub(T.clone().multiplyScalar(n.dot(T))).normalize();
    b.crossVectors(T, n).normalize();
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      N.set(c * n.x + s * b.x, c * n.y + s * b.y, c * n.z + s * b.z);
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      nor.push(N.x, N.y, N.z);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const c = (i + 1) * (radial + 1) + j;
      idx.push(a, a + 1, c, c, a + 1, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** โค้งมนที่ปลายท่อ: คูณกับรัศมีให้ปลายปิดเป็นทรงกลม */
export function capEnds(t: number, start: number, end: number): number {
  let k = 1;
  if (start > 0 && t < start) k = Math.sqrt(Math.max(0, 1 - ((start - t) / start) ** 2));
  if (end > 0 && t > 1 - end) k = Math.sqrt(Math.max(0, 1 - ((t - (1 - end)) / end) ** 2));
  return Math.max(0.02, k);
}

/** แผ่นผิวโค้งจากฟังก์ชัน f(a, b) → จุด (a, b อยู่ในช่วง 0–1) */
export function paramSurface(
  f: (a: number, b: number, out: THREE.Vector3) => void,
  na: number,
  nb: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= na; i++) {
    for (let j = 0; j <= nb; j++) {
      f(i / na, j / nb, v);
      pos.push(v.x, v.y, v.z);
      uv.push(i / na, j / nb);
    }
  }
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      const a = i * (nb + 1) + j;
      const c = (i + 1) * (nb + 1) + j;
      idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** แท่งสี่เหลี่ยมระหว่างจุดสองจุดบนระนาบ XY (ใช้สร้างขาเครื่องมือ) */
export function bar(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  depth: number,
  mat: THREE.Material,
): THREE.Mesh {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, len, depth), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
  m.rotation.z = -Math.atan2(x1 - x0, y1 - y0);
  return m;
}
