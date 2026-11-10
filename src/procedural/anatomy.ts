import * as THREE from 'three';
import { capEnds, paramSurface, varTube } from './geom';
import { WIN, Y0, surfaceY } from './patient';
import { bakeRest, longAxis, tissueMaterial, type TissueKind } from './tissue';

/**
 * กายวิภาคบริเวณท้องน้อยขวาแบบเรียบง่าย (ระยะ 0 — graybox)
 * ระยะ 2 จะเปลี่ยนเป็นโมเดลจาก Z-Anatomy แต่ยังใช้ targetId ชุดเดิม
 * พิกัด: P(u, v, depth) โดย u = ไปทางซ้ายของผู้ป่วย (+X), v = ไปทางเท้า (+Z), depth = ลึกจากผิว
 */
/** อวัยวะลึกถูกเลื่อนไปทางศีรษะเล็กน้อย เพื่อให้มองเห็นผ่านช่องแผลจากมุมกล้อง (ชดเชยพารัลแลกซ์) */
const V_SHIFT = -0.012;
const P = (u: number, v: number, depth: number) => new THREE.Vector3(WIN.cx + u, Y0 - depth, WIN.cz + v + V_SHIFT);

const smooth = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** วัสดุเนื้อเยื่อ (ลวดลาย/ความเปียก/การยุบตัว ดู tissue.ts) — size = ขนาดอ้างอิงของลวดลาย (เมตร) */
function organMat(color: THREE.ColorRepresentation, roughness: number | undefined, kind: TissueKind, size: number): THREE.MeshPhysicalMaterial {
  return tissueMaterial({ color, ...(roughness !== undefined ? { roughness } : {}), metalness: 0, emissive: 0x000000 }, kind, size);
}

/** ตัวรับการคลิกที่ใหญ่กว่าวัตถุจริง (สำหรับหลอดเลือดเส้นเล็ก ๆ และจอทัช) */
const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

export interface Anatomy {
  group: THREE.Group;
  colon: THREE.Mesh;
  ileum: THREE.Mesh;
  appendixBody: THREE.Mesh;
  appendixStump: THREE.Mesh;
  appendixMat: THREE.MeshStandardMaterial;
  appendixCurve: THREE.CatmullRomCurve3;
  appendixRadius: (t: number) => number;
  meso: THREE.Mesh;
  artery: THREE.Mesh;
  arteryProxy: THREE.Mesh;
  arteryCurve: THREE.CatmullRomCurve3;
  baseProxy: THREE.Mesh;
  loops: THREE.Mesh;
  bleeder: THREE.Group;
  bleederProxy: THREE.Mesh;
  pools: Record<'blood_pool' | 'field_fluid' | 'pus', THREE.Mesh>;
  anchors: Record<string, THREE.Vector3>;
}

export function buildAnatomy(reducedGore: boolean): Anatomy {
  const group = new THREE.Group();
  group.name = 'anatomy';
  const bloodColor = reducedGore ? 0x5b8def : 0x9b111e;

  // ซีคัม + ลำไส้ใหญ่ส่วนขึ้น (มีกระเปาะโป่ง haustra)
  const colonCurve = new THREE.CatmullRomCurve3([
    P(-0.016, 0.045, 0.082),
    P(-0.022, 0.024, 0.078),
    P(-0.028, 0.0, 0.074),
    P(-0.034, -0.03, 0.07),
    P(-0.038, -0.07, 0.068),
    P(-0.041, -0.14, 0.066),
  ]);
  const colonR = (t: number) =>
    THREE.MathUtils.lerp(0.029, 0.024, smooth(0.35, 0.6, t)) * capEnds(t, 0.14, 0) * (1 + 0.07 * Math.sin(t * 56));
  const colon = new THREE.Mesh(varTube(colonCurve, colonR, { tubular: 90, radial: 20 }), organMat(0xc8786c, undefined, 'bowel', 0.06));
  colon.userData.targetId = 'cecum';
  group.add(colon);

  // แถบกล้ามเนื้อตามยาว (taenia) ด้านหน้า ไปบรรจบที่โคนไส้ติ่ง
  const appendixCurve = new THREE.CatmullRomCurve3([
    P(-0.003, 0.017, 0.066),
    P(0.007, 0.025, 0.062),
    P(0.019, 0.025, 0.058),
    P(0.029, 0.017, 0.056),
    P(0.034, 0.005, 0.057),
  ]);
  const taeniaPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = 0.16 + (i / 14) * 0.84;
    const p = colonCurve.getPointAt(t);
    p.y += colonR(t) * 0.97;
    p.x += 0.006;
    taeniaPts.push(p);
  }
  taeniaPts.unshift(appendixCurve.getPointAt(0.2).add(new THREE.Vector3(0, 0.004, 0)));
  const taenia = new THREE.Mesh(
    varTube(new THREE.CatmullRomCurve3(taeniaPts), () => 0.0022, { tubular: 60, radial: 6 }),
    organMat(0xdc9f92, 0.5, 'tendon', 0.02),
  );
  taenia.userData.targetId = 'cecum';
  group.add(taenia);

  // ลำไส้เล็กส่วนปลาย (ไอเลียม) ต่อเข้าซีคัมด้านใน
  const ileumCurve = new THREE.CatmullRomCurve3([
    P(0.083, -0.035, 0.055),
    P(0.043, -0.027, 0.052),
    P(0.013, -0.019, 0.055),
    P(-0.009, -0.013, 0.062),
    P(-0.026, -0.008, 0.07),
  ]);
  const ileum = new THREE.Mesh(varTube(ileumCurve, () => 0.0115, { tubular: 70, radial: 18 }), organMat(0xd98b82, undefined, 'bowel', 0.03));
  ileum.geometry.userData.arcLength = ileumCurve.getLength();
  ileum.userData.targetId = 'ileum';
  group.add(ileum);

  // ไส้ติ่งอักเสบ: บวมตรงกลางถึงปลาย สีแดง (เรืองแสงเป็นจังหวะ = ภาวะอักเสบ)
  const appendixRadius = (t: number) => THREE.MathUtils.lerp(0.0055, 0.0095, smooth(0.15, 0.6, t)) * capEnds(t, 0, 0.12);
  const appendixMat = organMat(0xa8323a, 0.38, 'inflamed', 0.018);
  appendixMat.emissive.set(0xff2a12);
  appendixMat.emissiveIntensity = 0.06;
  const appendixBody = new THREE.Mesh(varTube(appendixCurve, appendixRadius, { t0: 0.24, t1: 1, tubular: 48 }), appendixMat);
  appendixBody.userData.targetId = 'appendix';
  const appendixStump = new THREE.Mesh(varTube(appendixCurve, appendixRadius, { t0: 0, t1: 0.25, tubular: 14 }), appendixMat);
  appendixStump.userData.targetId = 'appendix_base';
  group.add(appendixBody, appendixStump);

  const basePos = appendixCurve.getPointAt(0.24);
  const baseProxy = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 10, 8), proxyMat);
  baseProxy.position.copy(basePos);
  baseProxy.userData.targetId = 'appendix_base';
  group.add(baseProxy);

  // เยื่อแขวนไส้ติ่ง (mesoappendix) ระหว่างไส้ติ่งกับขอบลำไส้เล็ก
  const rootA = P(-0.012, 0.0, 0.066);
  const rootB = P(0.02, -0.004, 0.061);
  const memPoint = (a: number, b: number, out: THREE.Vector3) => {
    const t = 0.22 + 0.72 * a;
    const ap = appendixCurve.getPointAt(t);
    const root = rootA.clone().lerp(rootB, a);
    const toward = root.clone().sub(ap).setY(0).normalize().multiplyScalar(appendixRadius(t) * 0.5);
    ap.add(toward);
    out.copy(ap).lerp(root, b);
    out.y -= 0.0035 * Math.sin(Math.PI * b);
  };
  const meso = new THREE.Mesh(
    paramSurface(memPoint, 18, 8),
    tissueMaterial({ color: 0xe3c068, side: THREE.DoubleSide }, 'fat', 0.025),
  );
  meso.userData.targetId = 'mesoappendix';
  group.add(meso);

  // หลอดเลือดแดงที่เลี้ยงไส้ติ่ง (appendicular artery)
  const ap: THREE.Vector3[] = [];
  for (const [a, b] of [
    [0.04, 1.0],
    [0.22, 0.72],
    [0.42, 0.44],
    [0.6, 0.2],
    [0.7, 0.02],
  ]) {
    const v = new THREE.Vector3();
    memPoint(a, b, v);
    v.y += 0.0019;
    ap.push(v);
  }
  const arteryCurve = new THREE.CatmullRomCurve3(ap);
  const artery = new THREE.Mesh(varTube(arteryCurve, () => 0.0017, { tubular: 30, radial: 8 }), organMat(0xc0283a, 0.35, 'vessel', 0.006));
  artery.userData.targetId = 'appendicular_artery';
  const arteryProxy = new THREE.Mesh(varTube(arteryCurve, () => 0.0055, { tubular: 20, radial: 8 }), proxyMat);
  arteryProxy.userData.targetId = 'appendicular_artery';
  group.add(artery, arteryProxy);

  // ขดลำไส้เล็กที่บังไส้ติ่งอยู่
  const loopCurve = new THREE.CatmullRomCurve3([
    P(0.08, -0.024, 0.05),
    P(0.045, -0.01, 0.048),
    P(0.022, 0.006, 0.047),
    P(0.011, 0.021, 0.048),
    P(0.022, 0.031, 0.049),
    P(0.04, 0.022, 0.048),
    P(0.058, 0.012, 0.049),
    P(0.082, 0.02, 0.05),
  ]);
  const loops = new THREE.Mesh(varTube(loopCurve, () => 0.0118, { tubular: 110, radial: 18 }), organMat(0xdb9188, undefined, 'bowel', 0.03));
  loops.geometry.userData.arcLength = loopCurve.getLength();
  loops.userData.targetId = 'bowel_loops';
  group.add(loops);

  // จุดเลือดออกในชั้นไขมัน
  const bu = 0.0078;
  const bv = -0.0007;
  const by = surfaceY(WIN.cx + bu, WIN.cz + bv) - 0.012;
  const bleeder = new THREE.Group();
  bleeder.position.set(WIN.cx + bu, by, WIN.cz + bv);
  const blob = new THREE.Mesh(
    new THREE.SphereGeometry(0.0055, 14, 10),
    new THREE.MeshStandardMaterial({ color: bloodColor, roughness: 0.15 }),
  );
  blob.scale.set(1, 0.35, 1);
  const vessel = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 6), organMat(0x6e0b14, 0.2, 'vessel', 0.004));
  vessel.position.y = 0.0012;
  bleeder.add(blob, vessel);
  bleeder.visible = false;
  bleeder.userData.blob = blob;
  group.add(bleeder);
  const bleederProxy = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), proxyMat);
  bleederProxy.position.copy(bleeder.position);
  bleederProxy.userData.targetId = 'bleeder_fat';
  bleederProxy.visible = false;
  group.add(bleederProxy);

  // แอ่งของเหลวในช่องท้อง: เลือด / น้ำเกลือล้าง / หนอง
  const pool = (color: THREE.ColorRepresentation, opacity: number, id: string, depth: number) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.03, 36),
      new THREE.MeshStandardMaterial({ color, roughness: 0.08, transparent: true, opacity, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(P(0.004, 0.012, depth));
    m.userData.targetId = id;
    m.userData.volume = 1;
    m.visible = false;
    m.renderOrder = 2;
    group.add(m);
    return m;
  };
  const pools = {
    blood_pool: pool(bloodColor, 0.88, 'blood_pool', 0.05),
    field_fluid: pool(reducedGore ? 0xcfe6ff : 0xe8c0b4, 0.62, 'field_fluid', 0.0505),
    // หนองขังอยู่ก้นโพรงช่องท้อง ไม่บังหลอดเลือดและไส้ติ่งที่ต้องหา
    pus: pool(0xcbbf5a, 0.88, 'pus', 0.063),
  };

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material !== proxyMat) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  for (const p of Object.values(pools)) p.castShadow = false;

  // พิกัดลวดลายเนื้อเยื่อของแต่ละชิ้น
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(m.material as THREE.Material).userData?.tissue) return;
    const box = new THREE.Box3().setFromObject(m);
    bakeRest(m, box.getCenter(new THREE.Vector3()), longAxis(box));
  });

  const anchors: Record<string, THREE.Vector3> = {
    cecum: colonCurve.getPointAt(0.28).add(new THREE.Vector3(0, 0.03, 0)),
    appendix: appendixCurve.getPointAt(0.65).add(new THREE.Vector3(0, 0.01, 0)),
    appendix_base: basePos.clone().add(new THREE.Vector3(0, 0.008, 0)),
    ileum: ileumCurve.getPointAt(0.45).add(new THREE.Vector3(0, 0.012, 0)),
    appendicular_artery: arteryCurve.getPointAt(0.5).add(new THREE.Vector3(0, 0.003, 0)),
    bowel_loops: loopCurve.getPointAt(0.45).add(new THREE.Vector3(0, 0.012, 0)),
    bleeder_fat: bleeder.position.clone().add(new THREE.Vector3(0, 0.003, 0)),
    blood_pool: pools.blood_pool.position.clone(),
    field_fluid: pools.field_fluid.position.clone(),
    pus: pools.pus.position.clone(),
  };

  return {
    group,
    colon,
    ileum,
    appendixBody,
    appendixStump,
    appendixMat,
    appendixCurve,
    appendixRadius,
    meso,
    artery,
    arteryProxy,
    arteryCurve,
    baseProxy,
    loops,
    bleeder,
    bleederProxy,
    pools,
    anchors,
  };
}
