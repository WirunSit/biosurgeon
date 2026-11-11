import * as THREE from 'three';
import type { FieldDef, FieldObjectDef, FieldPathDef, ToolId, V3 } from '../types';
import type { LabelAnchor, PickResult, SurgeryScene } from '../core/SurgeryScene';
import { openingHalfWidth, openingInside } from '../core/IncisionSystem';
import { buildCavity, buildDrape, buildLayer, buildTowels, fatTexture, muscleTexture, surfaceY, WIN, type Layer, type Win } from '../procedural/patient';
import { buildTool } from '../procedural/tools';
import { capEnds, varTube } from '../procedural/geom';
import { loadModel, loadModelRaw } from '../core/AssetLoader';
import { bakeRest, longAxis, tissueKindOf, tissueMaterial, TissueDyn } from '../procedural/tissue';
import { CutWall, wallKindOf } from '../procedural/cutwall';
import { ensureBVH } from '../core/fastPick';

/**
 * ฉากผ่าตัดทั่วไปที่สร้างทั้งหมดจากข้อมูล JSON (field ในไฟล์เคส)
 * ครูเพิ่มเคสใหม่ได้โดยกำหนด: ขนาดหน้าต่าง ชั้นเนื้อเยื่อ แนวกรีด อวัยวะ (รูปทรงพื้นฐาน หรือไฟล์ .glb) และมุมกล้อง
 * พิกัดทุกอย่างเป็น (u, v, d): u = ไปทางซ้ายของผู้ป่วย, v = ไปทางเท้า, d = ลึกจากผิว (เมตร)
 */

interface Obj {
  def: FieldObjectDef;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
  home: THREE.Vector3;
  homeRot: THREE.Euler;
  anchorLocal: THREE.Vector3;
  /** จุดกลางวัตถุ (ท่อ = กึ่งกลางแนวแกน) ใช้เมื่อมองผ่านกล้องส่อง */
  centerLocal: THREE.Vector3;
  baseOpacity: number;
  volume: number;
  pulse: boolean;
  /** กลุ่มชั้นในที่รับการเคลื่อนไหวแบบมีชีวิต (หัวใจเต้น ปอดพอง ฯลฯ) แยกจากการเลื่อน/หมุนของขั้นตอน */
  inner: THREE.Group;
  motion: NonNullable<FieldObjectDef['motion']>;
  /** เฟสสุ่มต่อชิ้น ไม่ให้ลำไส้ทุกส่วนบีบพร้อมกัน */
  seed: number;
  /** รอยกด/รอยดึง/คลื่นกระเพื่อมเฉพาะจุดบนผิว */
  dyn: TissueDyn;
  /** สปริงตอนลากอวัยวะที่หยิบได้ (ตามมือแบบมีน้ำหนัก ไม่ติดเมาส์แข็ง ๆ) */
  spring: { goal: THREE.Vector3; vel: THREE.Vector3; grip: THREE.Vector3 | null } | null;
  /** โมเดลที่วางตามพิกัดจริง (atlas): จุดบนผิว (พิกัดของ inner) ที่ใช้หาจุดที่มองเห็นได้ */
  surf: THREE.Vector3[] | null;
}

interface LayerMeta {
  layer: Layer;
  shape: number;
  a: THREE.Vector2;
  b: THREE.Vector2;
  path: string;
}

interface Anim {
  t: number;
  dur: number;
  step: (k: number) => void;
  done?: () => void;
}

const PAINT = 512;
const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

function isVisibleDeep(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function orient(obj: THREE.Object3D, dir: THREE.Vector3, want: THREE.Vector3): void {
  const y = dir.clone().normalize();
  const z = want.clone().multiplyScalar(-1);
  z.sub(y.clone().multiplyScalar(z.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export class FieldScene implements SurgeryScene {
  readonly root = new THREE.Group();
  readonly unit: number;
  readonly toolScale: number;
  onPose?: (p: { pos: THREE.Vector3; target: THREE.Vector3 }) => void;

  readonly W: Win;
  private Y0: number;
  private layers: LayerMeta[] = [];
  private layerMap = new Map<string, LayerMeta>();
  private walls: CutWall[] = [];
  private objs = new Map<string, Obj>();
  private pickables: THREE.Object3D[] = [];
  private paths = new Map<string, { pts: THREE.Vector2[]; circle: [number, number, number] | null }>();

  private paintCanvas: HTMLCanvasElement | null = null;
  private paintTex: THREE.CanvasTexture | null = null;
  private baseCanvas = document.createElement('canvas');
  private markCanvas = document.createElement('canvas');
  private cutCanvas = document.createElement('canvas');
  private coverCells: THREE.Vector2[] = [];
  private coverHit: boolean[] = [];
  private coverCount = 0;

  private guides = new Map<string, THREE.Line>();
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private ring: THREE.Mesh;
  private highlight: string | null = null;
  private sutureMarks: THREE.Mesh[] = [];
  private sutureNext = -1;
  private stitches = new THREE.Group();
  private attached = new THREE.Group();
  private dressing: THREE.Group;
  private smoke: { m: THREE.Mesh; life: number }[] = [];
  private smokeAt: THREE.Vector3 | null = null;
  // การเคลื่อนไหวแบบมีชีวิต
  private live = false;
  private hr = 72;
  private rr = 14;
  private beatPhase = 0;
  private breathPhase = 0;
  private jiggles = new Map<string, number>();
  private pressing: string | null = null;
  private tug: { id: string; vec: THREE.Vector2; lift: number } | null = null;
  /** อวัยวะที่ปากคีบจับอยู่ (local = จุดจับในพิกัด inner, y = ความสูงระนาบที่ลากตาม) */
  private grip: { o: Obj; local: THREE.Vector3; start: THREE.Vector3; t: number } | null = null;
  /** วัตถุที่ขั้นตอนแบบลาก (drag) กำลังควบคุมอยู่ — การคีบยกจะไม่แย่งกัน */
  private dragging: string | null = null;
  /** จุดที่เครื่องมือแตะล่าสุด (ใช้เป็นจุดกด/จุดคีบของเนื้อเยื่อ) */
  private lastTouch: { id: string; point: THREE.Vector3 } | null = null;
  private smokeT = 0;
  private anims: Anim[] = [];
  private organLabels = new Set<string>();
  private bleedRate = 0;
  private stretch = 0;
  private closeFrom = new Map<string, number>();
  private pose: { pos: THREE.Vector3; target: THREE.Vector3 };
  private camera: THREE.Camera | null = null;
  /** จุดยึดที่มองเห็นได้จริงของวัตถุ atlas (คำนวณใหม่เมื่อกล้อง/ช่องเปิด/ตำแหน่งวัตถุเปลี่ยน) */
  private visAnchor = new Map<string, { key: string; local: THREE.Vector3; t: number }>();
  private clock = 0;
  /** เพิ่มทุกครั้งที่ฉากเปลี่ยน (effect / แอนิเมชันจบ) — ให้คำนวณจุดที่มองเห็นใหม่ */
  private sceneVer = 0;
  /** เวลาที่กล้องขยับล่าสุด — ระหว่างหมุน/ซูมใช้จุดยึดเดิม ไม่ยิงรังสีคำนวณใหม่ทุกเฟรม */
  private camMovedAt = 0;
  /** เวลาเฟรมล่าสุดที่คำนวณจุดที่มองเห็นได้ใหม่ (จำกัดงานของป้ายชื่อเฟรมละ 1 ชิ้น) */
  private anchorWorkAt = -1;
  private lastCam = new THREE.Vector3();

  constructor(
    private def: FieldDef,
    private reducedGore: boolean,
  ) {
    this.root.name = 'field-scene';
    this.W = { cx: def.center?.[0] ?? WIN.cx, cz: def.center?.[1] ?? WIN.cz, hw: def.window.hw, hd: def.window.hd };
    this.Y0 = surfaceY(this.W.cx, this.W.cz);
    this.unit = def.window.hw / 0.075;
    this.toolScale = 0.62 * Math.max(0.3, Math.min(1, this.unit));
    for (const c of [this.baseCanvas, this.markCanvas, this.cutCanvas]) c.width = c.height = PAINT;

    for (const [id, p] of Object.entries(def.paths)) this.paths.set(id, this.parsePath(p));

    const drape = buildDrape(this.W, def.drapeColor ? new THREE.Color(def.drapeColor).getHex() : 0x3e8c7e);
    const towels = buildTowels(this.W);
    this.root.add(drape, towels);
    this.pickables.push(drape, ...towels.children);

    // ชั้นเนื้อเยื่อ
    def.layers.forEach((ld, i) => {
      const pathId = ld.path ?? def.opening;
      const path = this.paths.get(pathId) ?? { pts: [new THREE.Vector2(-0.01, 0), new THREE.Vector2(0.01, 0)], circle: null };
      const shape = path.circle ? 1 : 0;
      const a = path.circle ? new THREE.Vector2(path.circle[0], path.circle[1]) : path.pts[0].clone();
      const b = path.circle ? a.clone() : path.pts[path.pts.length - 1].clone();
      const params: THREE.MeshStandardMaterialParameters = { color: ld.color, roughness: 0.5 };
      if (i === 0 && (ld.tex ?? 'skin') === 'skin') {
        this.initPaint(ld.color);
        params.map = this.paintTex!;
        params.color = 0xffffff;
        params.roughness = 0.62;
      } else if (ld.tex === 'fat') {
        params.map = fatTexture();
        params.color = 0xffffff;
      } else if (ld.tex === 'muscle') {
        params.map = muscleTexture();
        params.color = 0xffffff;
      } else if (ld.tex === 'membrane') {
        params.roughness = 0.2;
        // เยื่อบาง (เยื่อบุช่องท้อง เยื่อหุ้มปอด ฯลฯ) โปร่งแสง เห็นสีเนื้อเยื่อด้านล่างจาง ๆ ไม่เป็นแผ่นสีครีมทึบ
        if (i > 0) {
          params.transparent = true;
          params.opacity = /fascia|ligament|paratenon|sheath|tunica/.test(ld.id) ? 0.85 : 0.55;
        }
      } else if (ld.tex === 'bone') {
        params.roughness = 0.75;
      }
      // พิกัดชั้นใช้แบบสัมบูรณ์เทียบกับศูนย์กลางหน้าต่าง
      const L = buildLayer(ld.id, ld.name, ld.depth, params, ld.edge, a, b, this.W, shape);
      const meta: LayerMeta = { layer: L, shape, a, b, path: pathId };
      this.layers.push(meta);
      this.layerMap.set(ld.id, meta);
      this.root.add(L.mesh);
      this.pickables.push(L.mesh);
      // ผนังรอยตัด: เห็นความหนาและเนื้อในของชั้นนี้ตรงขอบแผล
      const bottom = def.layers[i + 1]?.depth ?? ld.depth + 0.002 * this.unit;
      const wall = new CutWall(L, a, b, shape, this.W, Math.max(bottom, ld.depth + 0.0015 * this.unit), wallKindOf(ld.tex, i), this.unit, reducedGore);
      this.walls.push(wall);
      this.root.add(wall.mesh);
    });

    if (def.cavity !== null) {
      const cav = def.cavity ?? { color: '#6e2a28', depth: 0.062 * this.unit };
      const top = (def.layers[def.layers.length - 1]?.depth ?? 0) + 0.006 * this.unit;
      const cavity = buildCavity(this.W, cav.color, cav.depth, top);
      cavity.userData.targetId = 'cavity';
      // ผนังโพรง (เยื่อบุช่องท้อง) มีเส้นเลือดและความเปียกเหมือนอวัยวะ
      (cavity.material as THREE.Material).dispose();
      cavity.material = tissueMaterial({ color: cav.color, side: THREE.BackSide }, 'cavity', 0.06 * this.unit);
      cavity.updateMatrixWorld(true);
      bakeRest(cavity, cavity.position.clone(), new THREE.Vector3(0, 0, 1));
      this.root.add(cavity);
      this.pickables.push(cavity);
    }

    for (const od of def.objects) this.buildObject(od);
    for (const o of this.objs.values()) {
      if (o.def.parent && this.objs.has(o.def.parent)) {
        const parent = this.objs.get(o.def.parent)!;
        parent.group.attach(o.group);
        o.home.copy(o.group.position);
        o.homeRot.copy(o.group.rotation);
      }
    }

    // เส้นประนำแนว
    for (const [id, p] of this.paths) {
      const pts = this.samplePath(p, 60).map((q) => this.toWorld(q, 0, 0.0012 * this.unit));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: 0x1e1b4b, dashSize: 0.004 * this.unit, gapSize: 0.003 * this.unit }),
      );
      line.computeLineDistances();
      line.visible = false;
      this.guides.set(id, line);
      this.root.add(line);
    }
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7f1d1d }));
    this.trail.renderOrder = 6;
    this.root.add(this.trail);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.0085 * this.unit, 0.011 * this.unit, 40),
      new THREE.MeshBasicMaterial({ color: 0x2ee6d6, transparent: true, opacity: 0.85, depthTest: false }),
    );
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    this.root.add(this.ring, this.stitches, this.attached);

    this.dressing = new THREE.Group();
    const gauze = buildTool('gauze');
    const span = this.openingSpan();
    gauze.scale.set((span / 0.05) * 1.1, 1, 0.85 * this.unit + 0.2);
    this.dressing.add(gauze);
    const op = this.paths.get(def.opening);
    const mid = op ? (op.circle ? new THREE.Vector2(op.circle[0], op.circle[1]) : op.pts[0].clone().lerp(op.pts[op.pts.length - 1], 0.5)) : new THREE.Vector2();
    this.dressing.position.copy(this.toWorld(mid, 0, 0.001));
    if (op && !op.circle) {
      const d = op.pts[op.pts.length - 1].clone().sub(op.pts[0]);
      this.dressing.rotation.y = -Math.atan2(d.y, d.x);
    }
    this.dressing.visible = false;
    this.root.add(this.dressing);

    this.buildCoverGrid();
    this.pose = this.defaultPose();
  }

  // ---------- การสร้าง ----------

  private P(p: V3): THREE.Vector3 {
    return new THREE.Vector3(this.W.cx + p[0], this.Y0 - p[2], this.W.cz + p[1]);
  }

  private toWorld(uv: THREE.Vector2, depth = 0, lift = 0): THREE.Vector3 {
    const x = this.W.cx + uv.x;
    const z = this.W.cz + uv.y;
    return new THREE.Vector3(x, surfaceY(x, z) - depth + lift, z);
  }

  private parsePath(p: FieldPathDef): { pts: THREE.Vector2[]; circle: [number, number, number] | null } {
    if (p.circle) {
      const [cu, cv, r] = p.circle;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(new THREE.Vector2(cu + Math.cos(a) * r, cv + Math.sin(a) * r));
      }
      return { pts, circle: p.circle };
    }
    return { pts: (p.points ?? [[-0.01, 0], [0.01, 0]]).map(([u, v]) => new THREE.Vector2(u, v)), circle: null };
  }

  private samplePath(p: { pts: THREE.Vector2[] }, n: number): THREE.Vector2[] {
    if (p.pts.length > 2) return p.pts;
    const out: THREE.Vector2[] = [];
    for (let i = 0; i <= n; i++) out.push(p.pts[0].clone().lerp(p.pts[1], i / n));
    return out;
  }

  private openingSpan(): number {
    const op = this.paths.get(this.def.opening);
    if (!op) return 0.05;
    if (op.circle) return op.circle[2] * 2;
    return op.pts[0].distanceTo(op.pts[op.pts.length - 1]);
  }

  private buildObject(d: FieldObjectDef): void {
    const group = new THREE.Group();
    group.name = d.id;
    const inner = new THREE.Group();
    group.add(inner);
    const pivot = d.at ? this.P(d.at) : d.points ? this.P(d.points[0]) : this.P([0, 0, 0.04]);
    group.position.copy(pivot);
    const opacity = d.opacity ?? 1;
    const s = d.size ?? [d.r ?? 0.01, d.r ?? 0.01, d.r ?? 0.01];
    // วัสดุเนื้อเยื่อ: สีด่าง เส้นเลือด ผิวขรุขระ ชั้นเมือกเปียก และยุบ/ยืดเฉพาะจุดได้ (ชนิดเดาจากรหัส/โมเดล/ป้ายชื่อ)
    const kind = d.tissue ?? tissueKindOf(`${d.id} ${d.model ?? ''} ${d.label ?? ''}`, { metal: d.metal, blood: d.blood });
    const flat = d.shape === 'ring' || d.shape === 'sheet' || d.shape === 'disc';
    const mat = tissueMaterial(
      {
        color: d.color,
        ...(d.rough !== undefined ? { roughness: d.rough } : {}),
        ...(d.inside || kind === 'synthetic' ? { clearcoat: 0, sheen: 0 } : {}),
        metalness: d.metal ?? 0,
        transparent: opacity < 1,
        opacity,
        emissive: d.emissive ?? 0x000000,
        emissiveIntensity: d.emissive ? 0.2 : 0,
        side: d.inside ? THREE.BackSide : flat ? THREE.DoubleSide : THREE.FrontSide,
        depthWrite: opacity >= 0.95,
      },
      kind,
      this.tissueSize(d, s),
    );
    const meshes: THREE.Mesh[] = [];
    const add = (geo: THREE.BufferGeometry, pos?: THREE.Vector3) => {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.copy(pos);
      m.castShadow = !d.inside && opacity > 0.5;
      m.receiveShadow = true;
      m.userData.targetId = d.id;
      inner.add(m);
      meshes.push(m);
      return m;
    };
    let anchor = new THREE.Vector3(0, s[1], 0);
    let center = new THREE.Vector3();
    switch (d.shape) {
      case 'ellipsoid':
      case 'sphere':
      case 'lens': {
        const m = add(new THREE.SphereGeometry(1, 28, 18));
        if (d.shape === 'sphere') m.scale.setScalar(d.r ?? s[0]);
        else if (d.shape === 'lens') m.scale.set(d.r ?? s[0], (d.r ?? s[0]) * 0.38, d.r ?? s[0]);
        else m.scale.set(s[0], s[1], s[2]);
        anchor = new THREE.Vector3(0, m.scale.y + 0.004 * this.unit, 0);
        break;
      }
      case 'box':
        add(new THREE.BoxGeometry(s[0], s[1], s[2]));
        break;
      case 'cylinder': {
        add(new THREE.CylinderGeometry(d.r ?? s[0], d.r ?? s[0], d.h ?? s[1], 24, 1, false));
        anchor = new THREE.Vector3(0, (d.h ?? s[1]) / 2, 0);
        break;
      }
      case 'torus': {
        const m = add(new THREE.TorusGeometry(d.r ?? 0.01, s[0] === d.r ? 0.002 : s[0], 10, 32));
        m.rotation.x = Math.PI / 2;
        break;
      }
      case 'disc': {
        const m = add(new THREE.CircleGeometry(d.r ?? 0.02, 36));
        m.rotation.x = -Math.PI / 2;
        anchor = new THREE.Vector3(0, 0.002 * this.unit, 0);
        break;
      }
      case 'ring': {
        const r = d.r ?? 0.006;
        const m = add(new THREE.RingGeometry(r * 0.55, r, 28));
        m.rotation.x = -Math.PI / 2;
        anchor = new THREE.Vector3(0, 0.002, 0);
        break;
      }
      case 'sheet': {
        const m = add(new THREE.PlaneGeometry(s[0], s[2]));
        m.rotation.x = -Math.PI / 2;
        anchor = new THREE.Vector3(0, 0.002, 0);
        break;
      }
      case 'stones': {
        const n = d.count ?? 4;
        const r = d.r ?? 0.004;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + i;
          const m = add(new THREE.DodecahedronGeometry(r * (0.75 + 0.5 * ((i * 37) % 10) / 10), 0));
          m.position.set(Math.cos(a) * s[0] * 0.6, ((i % 3) - 1) * r * 0.6, Math.sin(a) * s[2] * 0.6);
          m.rotation.set(i, i * 2, i * 3);
        }
        break;
      }
      case 'tube': {
        const pts = (d.points ?? []).map((p) => this.P(p).sub(pivot));
        const curve = new THREE.CatmullRomCurve3(pts);
        const radii = d.radii ?? [d.r ?? 0.008];
        const rf = (t: number) => {
          if (radii.length === 1) return radii[0];
          const x = t * (radii.length - 1);
          const i = Math.min(radii.length - 2, Math.floor(x));
          return THREE.MathUtils.lerp(radii[i], radii[i + 1], x - i);
        };
        // ท่อเนื้อเยื่อจริงไม่กลมเรียบสม่ำเสมอ: รัศมีเปลี่ยนเล็กน้อยตามความยาว (ลำไส้ใหญ่เป็นกระเปาะ)
        const len = curve.getLength();
        const ph = Math.random() * 6.28;
        const organic =
          d.inside || kind === 'synthetic'
            ? () => 1
            : /colon|cecum|ลำไส้ใหญ่/.test(`${d.id} ${d.label ?? ''}`)
              ? (t: number) => 1 + 0.1 * Math.abs(Math.sin((t * len) / (rf(t) * 1.1) + ph)) - 0.05
              : (t: number) => 1 + 0.035 * Math.sin((t * len) / (rf(t) * 2.3) + ph) + 0.025 * Math.sin((t * len) / (rf(t) * 0.9) + ph * 2);
        const radius = d.caps ? (t: number) => rf(t) * organic(t) * capEnds(t, 0.08, 0.08) : (t: number) => rf(t) * organic(t);
        const tube = add(varTube(curve, radius, { tubular: THREE.MathUtils.clamp(Math.ceil(len / (rf(0.5) * 0.35)), 40, 220), radial: d.inside ? 24 : 18 }));
        tube.geometry.userData.arcLength = len;
        center = curve.getPointAt(0.5);
        anchor = center.clone().add(new THREE.Vector3(0, rf(0.5) + 0.003 * this.unit, 0));
        if (d.hit) {
          const proxy = new THREE.Mesh(varTube(curve, () => d.hit!, { tubular: 24, radial: 8 }), proxyMat);
          proxy.userData.targetId = d.id;
          inner.add(proxy);
          meshes.push(proxy);
        }
        break;
      }
    }
    if (d.rot) group.rotation.set(THREE.MathUtils.degToRad(d.rot[0]), THREE.MathUtils.degToRad(d.rot[1]), THREE.MathUtils.degToRad(d.rot[2]));
    if (d.hit && d.shape !== 'tube') {
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(d.hit, 10, 8), proxyMat);
      proxy.userData.targetId = d.id;
      inner.add(proxy);
      meshes.push(proxy);
    }
    if (d.hidden) group.visible = false;
    this.root.add(group);
    if (!d.noPick) this.pickables.push(...meshes);
    // พิกัดลวดลายเนื้อเยื่อ (ติดไปกับวัตถุเมื่อขยับ)
    group.updateMatrixWorld(true);
    const visual = meshes.filter((m) => m.material === mat);
    const box = new THREE.Box3();
    for (const m of visual) box.expandByObject(m);
    const origin = box.isEmpty() ? group.position.clone() : box.getCenter(new THREE.Vector3());
    const axis = box.isEmpty() ? new THREE.Vector3(0, 0, 1) : longAxis(box);
    (mat.userData.tissue.tAxis.value as THREE.Vector3).copy(axis);
    for (const m of visual) bakeRest(m, origin, axis);
    const o: Obj = {
      def: d,
      group,
      meshes,
      mats: [mat],
      home: group.position.clone(),
      homeRot: group.rotation.clone(),
      anchorLocal: anchor,
      centerLocal: center,
      baseOpacity: opacity,
      volume: d.hidden ? 0 : 1,
      pulse: !!d.pulse,
      inner,
      motion: this.motionOf(d),
      seed: Math.random() * Math.PI * 2,
      dyn: new TissueDyn(mat.userData.tissue, this.tissueSize(d, s)),
      spring: null,
      surf: null,
    };
    this.objs.set(d.id, o);
    // ฉากแบบ atlas: รูปทรงประกอบ (ภาพตัด ต่อมน้ำเหลือง ท่อ) ก็หาจุดที่มองเห็นได้จริงเหมือนโมเดล
    if (this.def.atlas && !d.model && visual.length) {
      const surf: THREE.Vector3[] = [];
      const v = new THREE.Vector3();
      inner.updateWorldMatrix(true, true);
      for (const m of visual) {
        const pos = m.geometry.getAttribute('position');
        const step = Math.max(1, Math.floor(pos.count / 300));
        for (let i = 0; i < pos.count; i += step) surf.push(inner.worldToLocal(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)).clone());
      }
      surf.sort((a, b) => b.y - a.y);
      o.surf = surf.slice(0, Math.ceil(surf.length * 0.6));
    }
    this.setupWave(o, d.shape === 'tube' ? Math.max(...(d.radii ?? [d.r ?? 0.008])) : 0);
    if (d.model && d.atlas && (d.atlasFrame || this.def.atlas)) this.loadAtlas(o, mat);
    else if (d.model) {
      // โมเดลอวัยวะจริง (BodyParts3D) แทนรูปทรงพื้นฐาน — ถ้าโหลดไม่ได้ก็ใช้รูปทรงเดิมต่อ
      // โมเดลใช้แสดงผลอย่างเดียว การคลิกยังใช้รูปทรงเดิม (มองไม่เห็น) ขั้นตอนที่ทดสอบไว้จึงคลิกได้เหมือนเดิม
      // และโมเดลชิ้นใหญ่จะไม่บังการคลิกอวัยวะข้างเคียง
      loadModel(`${import.meta.env.BASE_URL}${d.model}`, s).then((model) => {
        if (!model) return;
        if (d.modelRot) model.rotation.set(...(d.modelRot.map((x) => THREE.MathUtils.degToRad(x)) as [number, number, number]));
        // กันอวัยวะโผล่ทะลุชั้นเนื้อเยื่อ: ถ้าส่วนบนของโมเดลจะสูงกว่าชั้นล่างสุด ให้ย่อทั้งชิ้น (คงสัดส่วนจริง)
        const halfY = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y / 2;
        const depth = this.Y0 - (group.position.y + o.centerLocal.y);
        const deepest = this.def.layers[this.def.layers.length - 1]?.depth ?? 0;
        const limit = depth - deepest - 0.003 * this.unit;
        if (limit > 0 && halfY > limit) model.scale.multiplyScalar(limit / halfY);
        model.position.add(o.centerLocal);
        for (const m of meshes) if (m.material !== proxyMat) m.material = proxyMat;
        inner.add(model);
        model.updateMatrixWorld(true);
        const mbox = new THREE.Box3().setFromObject(model);
        const morigin = mbox.getCenter(new THREE.Vector3());
        const maxis = longAxis(mbox);
        (mat.userData.tissue.tAxis.value as THREE.Vector3).copy(maxis);
        if (!d.inside) {
          // โมเดลที่ลดโพลีกอนมีรูและสามเหลี่ยมกลับด้านบ้าง: วาดสองด้าน + ใช้ normal ชี้ออกเสมอ (ไม่เห็นเป็นจุดดำทะลุ)
          mat.side = THREE.DoubleSide;
          mat.defines = { ...mat.defines, TISSUE_NOFLIP: '' };
          mat.needsUpdate = true;
        }
        model.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.userData.targetId = d.id;
            m.material = mat;
            m.castShadow = true;
            m.receiveShadow = true;
            // เรขาคณิตใช้ร่วมกันในแคช → โคลนก่อนใส่พิกัดลวดลายของชิ้นนี้
            bakeRest(m, morigin, maxis, { clone: true });
          }
        });
        if (o.motion === 'bowel') {
          const ms = mbox.getSize(new THREE.Vector3());
          o.dyn.waveAmp = Math.min(ms.x, ms.y, ms.z) * 0.035;
          o.dyn.waveLen = Math.max(ms.x, ms.y, ms.z) * 0.45;
        }
      });
    }
  }

  /**
   * โมเดลวางตามพิกัดจริงของร่างกาย: ไม่ย่อ/ขยายแยกชิ้น ทุกชิ้นใช้จุดอ้างอิงเดียวกัน อวัยวะจึงต่อกันและขนาดสัมพันธ์กันถูกต้อง
   * ผิวโมเดลเป็นตัวรับการคลิกเอง (แทนรูปทรงพื้นฐานที่มองไม่เห็น) จึงคีบได้ตรงตำแหน่งที่เห็น
   */
  private loadAtlas(o: Obj, mat: THREE.MeshPhysicalMaterial): void {
    const d = o.def;
    const A = d.atlasFrame ?? this.def.atlas!;
    const k = A.scale ?? 1;
    loadModelRaw(`${import.meta.env.BASE_URL}${d.model}`).then((model) => {
      if (!model) return;
      // จุด native p → โลก: O + R·(p − origin)·k  (O = ใต้กึ่งกลางหน้าต่าง ลึก depth)
      o.inner.updateWorldMatrix(true, false);
      const pivot = new THREE.Group();
      pivot.position.copy(o.inner.worldToLocal(new THREE.Vector3(this.W.cx, this.Y0 - A.depth, this.W.cz)));
      if (A.rot) pivot.rotation.set(...(A.rot.map((x) => THREE.MathUtils.degToRad(x)) as [number, number, number]));
      model.scale.setScalar(k);
      model.position.copy(new THREE.Vector3(...A.origin).sub(new THREE.Vector3(...(d.atlasShift ?? [0, 0, 0]))).multiplyScalar(-k));
      pivot.add(model);
      // รูปทรงพื้นฐาน/ตัวรับคลิกเดิมเลิกใช้ทั้งหมด
      for (const m of o.meshes) {
        m.visible = false;
        const i = this.pickables.indexOf(m);
        if (i >= 0) this.pickables.splice(i, 1);
      }
      o.inner.add(pivot);
      pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const axis = longAxis(box);
      mat.userData.tissue.tAxis.value.copy(axis);
      mat.side = THREE.DoubleSide;
      mat.defines = { ...mat.defines, TISSUE_NOFLIP: '' };
      mat.needsUpdate = true;
      const meshes: THREE.Mesh[] = [];
      const surf: THREE.Vector3[] = [];
      const v = new THREE.Vector3();
      model.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.userData.targetId = d.id;
        m.material = mat;
        m.castShadow = true;
        m.receiveShadow = true;
        bakeRest(m, box.getCenter(new THREE.Vector3()), axis, { clone: true });
        meshes.push(m);
        const pos = m.geometry.getAttribute('position');
        const step = Math.max(1, Math.floor(pos.count / 500));
        for (let i = 0; i < pos.count; i += step) surf.push(o.inner.worldToLocal(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)).clone());
      });
      o.meshes = meshes;
      if (!d.noPick) this.pickables.push(...meshes);
      o.centerLocal = o.inner.worldToLocal(box.getCenter(new THREE.Vector3()));
      o.anchorLocal = o.centerLocal.clone().setY(o.inner.worldToLocal(box.max.clone()).y);
      // ด้านหน้า (หันหากล้อง) ก่อน — แต่เก็บทั้งผิว เพราะกล้องส่องในช่องท้องมองเห็นผิวด้านล่าง/ด้านใน
      surf.sort((a, b) => b.y - a.y);
      o.surf = surf;
      const size = box.getSize(new THREE.Vector3());
      if (o.motion === 'bowel') {
        o.dyn.waveAmp = Math.min(size.x, size.y, size.z) * 0.03;
        o.dyn.waveLen = Math.max(size.x, size.y, size.z) * 0.35;
      }
      this.visAnchor.delete(d.id);
    });
  }

  /**
   * จุดบนผิววัตถุ atlas ที่กล้องมองเห็นได้จริง (ไม่ถูกอวัยวะอื่น/ผนังหน้าท้องบัง) ใกล้กลางส่วนที่เห็นที่สุด
   * ใช้เป็นจุดคลิกของตัวเล่นอัตโนมัติ วงแหวนไฮไลต์ และป้ายชื่อ — คำนวณใหม่เมื่อมุมกล้องหรือฉากเปลี่ยน (ไม่เกิน 3 ครั้ง/วินาที)
   */
  private visibleAnchor(o: Obj, lazy = false): THREE.Vector3 | null {
    if (!o.surf || !this.camera) return null;
    const cam = this.camera.position;
    const r = (x: number) => Math.round(x * 500);
    const opens = this.layers.map((L) => r(L.layer.uniforms.uOpen.value)).join(',');
    const gp = o.group.position;
    const key = `${r(cam.x)},${r(cam.y)},${r(cam.z)}|${r(gp.x)},${r(gp.y)},${r(gp.z)}|${opens}|${o.group.visible}|${this.sceneVer}`;
    const c = this.visAnchor.get(o.def.id);
    if (c && (c.key === key || this.clock - c.t < 0.33 || this.clock - this.camMovedAt < 0.25)) return c.local;
    // ป้ายชื่อ (lazy): คำนวณใหม่ไม่เกินเฟรมละ 1 ชิ้น กันเฟรมกระตุกตอนกล้องหยุดแล้วทุกป้ายคำนวณพร้อมกัน
    if (c && lazy && this.anchorWorkAt === this.clock) return c.local;
    this.anchorWorkAt = this.clock;
    const ray = new THREE.Raycaster();
    const seen: THREE.Vector3[] = [];
    const edge: THREE.Vector3[] = [];
    const w = new THREE.Vector3();
    const n = o.surf.length;
    const step = Math.max(1, Math.floor(n / 50));
    o.inner.updateWorldMatrix(true, false);
    const center = o.centerLocal.clone().applyMatrix4(o.inner.matrixWorld);
    for (let i = 0; i < n; i += step) {
      // เล็งเข้าไปในเนื้อเล็กน้อย (ไม่เล็งจุดยอดซึ่งมักอยู่บนขอบเงาพอดี ขยับนิดเดียวก็พลาด) แล้วใช้จุดที่รังสีชนผิวจริง
      w.copy(o.surf[i]).applyMatrix4(o.inner.matrixWorld).lerp(center, 0.06);
      // เฉพาะจุดที่อยู่ในกรอบภาพ (อวัยวะใหญ่อย่างตับมีส่วนที่มองเห็นได้แต่อยู่นอกจอ)
      const ndc = w.clone().project(this.camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95) continue;
      ray.set(cam, w.clone().sub(cam).normalize());
      const hit = this.pick(ray);
      if (hit.point && this.matches(o.def.id, hit) && hit.point.distanceTo(w) < 0.02 * this.unit) {
        // จุดที่มองเห็นได้มั่นคง: เล็งเฉียงไปรอบ ๆ 1.5 มม. แล้วยังโดนวัตถุเดิม
        const ok = [-1, 1].every((sx) => {
          ray.set(cam, hit.point!.clone().add(new THREE.Vector3(sx, 0, -sx).multiplyScalar(0.001 * this.unit)).sub(cam).normalize());
          return this.matches(o.def.id, this.pick(ray));
        });
        // ส่วนที่โผล่ให้เห็นแค่แถบบาง ๆ อาจไม่มีจุดที่ผ่านการเล็งเฉียง — เก็บไว้ใช้สำรอง
        (ok ? seen : edge).push(o.inner.worldToLocal(hit.point.clone()));
        if (seen.length >= 16) break;
      }
    }
    let local = c?.local ?? o.anchorLocal;
    if (!seen.length) seen.push(...edge);
    if (seen.length) {
      const mid = seen.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(seen.length);
      local = seen.reduce((a, b) => (b.distanceToSquared(mid) < a.distanceToSquared(mid) ? b : a));
    }
    this.visAnchor.set(o.def.id, { key, local, t: this.clock });
    return local;
  }

  /** ขนาดอ้างอิงของลวดลาย/การยุบตัว (เมตร) ≈ เส้นผ่านศูนย์กลางของวัตถุ */
  private tissueSize(d: FieldObjectDef, s: [number, number, number] | V3): number {
    const r = d.shape === 'tube' ? Math.max(...(d.radii ?? [d.r ?? 0.008])) * 2.6 : 2 * Math.max(s[0], s[1], s[2], d.r ?? 0);
    return Math.max(r, 0.004 * this.unit);
  }

  /** ท่อ: คีบแล้วยกขึ้นมาทั้งช่วง และ (ลำไส้) คลื่นหดเป็นวงเคลื่อนไปตามความยาวท่อ */
  private setupWave(o: Obj, tubeR: number): void {
    if (tubeR) o.dyn.grabR = o.dyn.size * 1.3;
    if (o.motion !== 'bowel' || !tubeR) return;
    o.dyn.waveAmp = tubeR * 0.13;
    o.dyn.waveLen = tubeR * 7;
    o.dyn.waveSpeed = 1.4;
  }

  private anchorOf(id: string, lazy = false): THREE.Vector3 | null {
    const o = this.objs.get(id);
    if (o) {
      o.inner.updateWorldMatrix(true, false);
      if (this.camera && this.camera.position.y < this.Y0 && !o.surf) {
        // มุมกล้องส่อง (อยู่ใต้ผิว): ใช้จุดกึ่งกลางวัตถุ ขยับเข้าหากล้องเล็กน้อย
        const c = o.centerLocal.clone().applyMatrix4(o.inner.matrixWorld);
        return c.lerp(this.camera.position, o.def.shape === 'tube' ? 0.04 : 0.15);
      }
      if (o.surf) {
        // atlas: จุดบนผิวส่วนที่มองเห็น ยกเข้าหากล้องเล็กน้อย
        const local = this.visibleAnchor(o, lazy);
        if (local) {
          const p = local.clone().applyMatrix4(o.inner.matrixWorld);
          return this.camera ? p.add(this.camera.position.clone().sub(p).setLength(0.002 * this.unit)) : p;
        }
      }
      if (o.def.shape === 'cylinder') {
        // ทรงกระบอกอาจวางนอน (กระดูก): ใช้จุดบนสุดของกล่องขอบเขต แทนปลายแกน
        const box = new THREE.Box3().setFromObject(o.meshes[0]);
        const c = box.getCenter(new THREE.Vector3());
        return c.setY(box.max.y + 0.002 * this.unit);
      }
      // ใช้กลุ่มชั้นใน: จุดยึด (และวงแหวนไฮไลต์) ขยับตามการเต้น/การหายใจของอวัยวะ
      o.inner.updateWorldMatrix(true, false);
      return o.anchorLocal.clone().applyMatrix4(o.inner.matrixWorld);
    }
    if (id === 'zone' || id === 'incision') return this.toWorld(this.openingCenter(), 0, 0.004 * this.unit);
    const L = this.layerMap.get(id);
    if (L) return this.toWorld(this.openingCenter(L.path), L.layer.depth, 0.004 * this.unit);
    return null;
  }

  private openingCenter(path = this.def.opening): THREE.Vector2 {
    const p = this.paths.get(path);
    if (!p) return new THREE.Vector2();
    if (p.circle) return new THREE.Vector2(p.circle[0], p.circle[1]);
    return p.pts[0].clone().lerp(p.pts[p.pts.length - 1], 0.5);
  }

  /** ระยะจากแนวเปิดหลัก (สำหรับพื้นที่ทาน้ำยา / แนวแผล) */
  private zoneDist(uv: THREE.Vector2): number {
    const p = this.paths.get(this.def.opening);
    if (!p) return uv.length();
    if (p.circle) return Math.max(0, uv.distanceTo(new THREE.Vector2(p.circle[0], p.circle[1])) - p.circle[2]);
    let best = Infinity;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i];
      const ab = p.pts[i + 1].clone().sub(a);
      const t = THREE.MathUtils.clamp(uv.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      best = Math.min(best, uv.distanceTo(a.clone().addScaledVector(ab, t)));
    }
    return best;
  }

  // ---------- ผิวหนังวาดได้ ----------

  private initPaint(color: string): void {
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.width = this.paintCanvas.height = PAINT;
    const x = this.baseCanvas.getContext('2d')!;
    x.fillStyle = color;
    x.fillRect(0, 0, PAINT, PAINT);
    for (let i = 0; i < 1600; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(120,80,60,0.10)' : 'rgba(255,230,210,0.10)';
      x.fillRect(Math.random() * PAINT, Math.random() * PAINT, 2, 2);
    }
    this.paintTex = new THREE.CanvasTexture(this.paintCanvas);
    this.paintTex.colorSpace = THREE.SRGBColorSpace;
    this.composite();
  }

  private composite(): void {
    if (!this.paintCanvas) return;
    const c = this.paintCanvas.getContext('2d')!;
    c.drawImage(this.baseCanvas, 0, 0);
    c.drawImage(this.markCanvas, 0, 0);
    c.drawImage(this.cutCanvas, 0, 0);
    if (this.paintTex) this.paintTex.needsUpdate = true;
  }

  private px(uv: THREE.Vector2): [number, number] {
    return [((uv.x + this.W.hw) / (2 * this.W.hw)) * PAINT, ((uv.y + this.W.hd) / (2 * this.W.hd)) * PAINT];
  }

  private buildCoverGrid(): void {
    const step = 0.006 * this.unit;
    for (let u = -this.W.hw; u <= this.W.hw; u += step)
      for (let v = -this.W.hd; v <= this.W.hd; v += step) {
        const p = new THREE.Vector2(u, v);
        if (this.zoneDist(p) < 0.03 * this.unit) this.coverCells.push(p);
      }
    this.coverHit = this.coverCells.map(() => false);
  }

  // ---------- SurgeryScene ----------

  pick(ray: THREE.Raycaster): PickResult {
    ensureBVH(this.pickables);
    const uv = this.planeUV(ray);
    const hits = ray.intersectObjects(this.pickables, false);
    for (const h of hits) {
      const o = h.object;
      if (!isVisibleDeep(o)) continue;
      const layerId = o.userData.layer as string | undefined;
      if (layerId) {
        const L = this.layerMap.get(layerId)!;
        const local = new THREE.Vector2(h.point.x - this.W.cx, h.point.z - this.W.cz);
        if (openingInside(local, L.a, L.b, L.layer.uniforms.uOpen.value, L.shape) > 0) continue;
      } else {
        const obj = this.objs.get(o.userData.targetId as string);
        if (obj && obj.mats[0].opacity < 0.12) continue;
      }
      let id = (o.userData.targetId as string | undefined) ?? null;
      if (!id) continue;
      let point = h.point;
      // โครงสร้างเล็กที่แนบผิวอวัยวะ (หลอดเลือดโคโรนารี เส้นประสาท) มักจมอยู่ใต้ผิวเล็กน้อย:
      // ถ้าด้านหลังจุดที่โดนไม่เกิน 4 มม. มีส่วนย่อย (parent = อวัยวะนี้) ที่เล็กกว่ามาก ให้เลือกชิ้นเล็กนั้น
      const big = this.objs.get(id);
      if (big && !layerId) {
        for (const h2 of hits) {
          if (h2.distance <= h.distance || h2.distance - h.distance > 0.004 * this.unit) continue;
          const id2 = h2.object.userData.targetId as string | undefined;
          const small = id2 ? this.objs.get(id2) : undefined;
          if (small && id2 !== id && small.def.parent === id && isVisibleDeep(h2.object) && small.mats[0].opacity >= 0.12 && small.dyn.size < big.dyn.size * 0.4) {
            id = id2!;
            point = h2.point;
            break;
          }
        }
      }
      return { targetId: id, point: point.clone(), uv: uv ?? new THREE.Vector2(point.x - this.W.cx, point.z - this.W.cz) };
    }
    return { targetId: null, point: null, uv };
  }

  /** พิกัดบนผิว (หรือบนระนาบในโพรง เมื่อกล้องอยู่ใต้ผิว เช่น กล้องส่อง) */
  private planeUV(ray: THREE.Raycaster): THREE.Vector2 | null {
    const camY = ray.ray.origin.y;
    if (camY > this.Y0 && this.layers[0] && this.layers[0].layer.mesh.visible) {
      const h = ray.intersectObject(this.layers[0].layer.mesh, false)[0];
      if (h) return new THREE.Vector2(h.point.x - this.W.cx, h.point.z - this.W.cz);
    }
    const y = camY > this.Y0 ? this.Y0 : camY - 0.05 * this.unit;
    const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    if (!p) return null;
    const uv = new THREE.Vector2(p.x - this.W.cx, p.z - this.W.cz);
    if (Math.abs(uv.x) > this.W.hw * 2.5 || Math.abs(uv.y) > this.W.hd * 2.5) return null;
    return uv;
  }

  layerUV(layer: string, ray: THREE.Raycaster): THREE.Vector2 | null {
    const L = this.layerMap.get(layer);
    if (!L) return null;
    const h = ray.intersectObject(L.layer.mesh, false)[0];
    if (!h) return null;
    return new THREE.Vector2(h.point.x - this.W.cx, h.point.z - this.W.cz);
  }

  matches(wanted: string, hit: PickResult): boolean {
    const id = hit.targetId;
    if (wanted === 'zone') return !!hit.uv && this.zoneDist(hit.uv) < 0.045 * this.unit && id !== 'drape';
    if (wanted === 'incision') return !!hit.uv && this.zoneDist(hit.uv) < 0.016 * this.unit && id !== 'drape' && id !== null;
    if (id === wanted) return true;
    // ส่วนประกอบของอวัยวะ (parent) นับเป็นอวัยวะนั้น
    const o = id ? this.objs.get(id) : undefined;
    return !!o && o.def.parent === wanted;
  }

  path(id: string): THREE.Vector2[] {
    const p = this.paths.get(id);
    return p ? (p.circle ? p.pts : this.samplePath(p, 10)) : [];
  }

  isClosedPath(id: string): boolean {
    return !!this.paths.get(id)?.circle;
  }

  scrub(target: string, hit: PickResult, ray: THREE.Raycaster, first: boolean) {
    if (target === 'zone') {
      const uv = hit.uv;
      if (!uv || this.zoneDist(uv) > 0.045 * this.unit || hit.targetId === 'drape')
        return { progress: this.coverCount / Math.max(1, this.coverCells.length), inside: false };
      if (this.paintCanvas) {
        const x = this.baseCanvas.getContext('2d')!;
        const [px, py] = this.px(uv);
        const r = ((0.013 * this.unit) / (2 * this.W.hw)) * PAINT;
        const g = x.createRadialGradient(px, py, r * 0.2, px, py, r);
        g.addColorStop(0, 'rgba(150,62,12,0.32)');
        g.addColorStop(1, 'rgba(150,62,12,0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(px, py, r, 0, Math.PI * 2);
        x.fill();
        this.composite();
      }
      this.coverCells.forEach((c, i) => {
        if (!this.coverHit[i] && c.distanceTo(uv) < 0.013 * this.unit) {
          this.coverHit[i] = true;
          this.coverCount++;
        }
      });
      const warn =
        first && uv.distanceTo(this.openingCenter()) > 0.03 * this.unit + this.openingSpan() * 0.25
          ? 'ควรเริ่มทาจากกลางแนวผ่าตัดแล้ววนออกด้านนอก — การทาจากขอบเข้าหาแผลอาจลากเชื้อเข้ามาที่แผล'
          : undefined;
      return { progress: this.coverCount / Math.max(1, this.coverCells.length), inside: true, warn };
    }
    const o = this.objs.get(target);
    if (!o) return { progress: 0, inside: false };
    if (!o.group.visible || o.volume <= 0) return { progress: 1, inside: true };
    let inside = false;
    if (o.def.scrub === 'pool' || o.def.shape === 'disc') {
      const wp = o.group.getWorldPosition(new THREE.Vector3());
      const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -wp.y), new THREE.Vector3());
      const r = (o.def.r ?? 0.03) * Math.sqrt(Math.max(o.volume, 0.05)) + 0.008 * this.unit;
      inside = !!p && Math.hypot(p.x - wp.x, p.z - wp.z) < r;
    } else {
      inside = this.matches(target, hit) || (!!hit.point && !!this.anchorOf(target) && hit.point.distanceTo(this.anchorOf(target)!) < 0.015 * this.unit);
    }
    if (!inside) return { progress: 1 - o.volume, inside: false };
    this.setVolume(o, o.volume - (o.def.scrub === 'fade' ? 0.012 : 0.016));
    // ล้างน้ำเกลือก็ช่วยดูดเลือดที่ค้างอยู่
    for (const other of this.objs.values()) if (other !== o && other.def.blood && other.group.visible && target !== other.def.id && o.def.scrub === 'pool') this.setVolume(other, other.volume - 0.02);
    return { progress: 1 - o.volume, inside: true };
  }

  private setVolume(o: Obj, vol: number): void {
    const v = THREE.MathUtils.clamp(vol, 0, 1);
    o.volume = v < 0.06 ? 0 : v;
    if (o.def.scrub === 'fade') {
      for (const m of o.mats) {
        m.transparent = true;
        m.opacity = o.baseOpacity * o.volume;
      }
      o.group.visible = o.volume > 0;
    } else {
      o.group.visible = o.volume > 0;
      const s = Math.sqrt(Math.max(0.05, o.volume));
      o.group.scale.set(s, 1, s);
    }
  }

  traceDraw(tool: ToolId, from: THREE.Vector2, to: THREE.Vector2, layer?: string): void {
    const top = this.layers[0];
    const onSkin = !layer || layer === top?.layer.id;
    if (onSkin && this.paintCanvas && top && top.layer.uniforms.uOpen.value < 0.001) {
      const cv = tool === 'marker' ? this.markCanvas : this.cutCanvas;
      const x = cv.getContext('2d')!;
      const [x0, y0] = this.px(from);
      const [x1, y1] = this.px(to);
      x.lineCap = 'round';
      x.strokeStyle = tool === 'marker' ? '#5b21b6' : this.reducedGore ? '#3b5bdb' : '#7f1d1d';
      x.lineWidth = tool === 'marker' ? 5 : 3.5;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x1, y1);
      x.stroke();
      this.composite();
      return;
    }
    // รอยลากบนชั้นลึก/วัตถุ (เช่น เปิดถุงหุ้มเลนส์เป็นวงกลม)
    const depth = layer ? (this.layerMap.get(layer)?.layer.depth ?? this.objDepth(layer)) : 0;
    if (!this.trailPts.length) this.trailPts.push(this.toWorld(from, depth, 0.0008 * this.unit));
    this.trailPts.push(this.toWorld(to, depth, 0.0008 * this.unit));
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPts);
    (this.trail.material as THREE.LineBasicMaterial).color.set(tool === 'marker' ? 0x5b21b6 : 0xfacc15);
  }

  private objDepth(id: string): number {
    const o = this.objs.get(id);
    if (!o) return 0;
    const wp = o.group.getWorldPosition(new THREE.Vector3());
    const top = o.anchorLocal.y * o.group.scale.y;
    return this.Y0 - (wp.y + top) + 0.003 * this.unit;
  }

  traceReset(tool: ToolId): void {
    const cv = tool === 'marker' ? this.markCanvas : this.cutCanvas;
    cv.getContext('2d')!.clearRect(0, 0, PAINT, PAINT);
    this.composite();
    this.clearTrail();
  }

  private clearTrail(): void {
    this.trailPts = [];
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry();
  }

  dragUpdate(target: string, delta: THREE.Vector2, progress: number): void {
    if (target === 'incision') {
      this.stretch = progress * 0.012 * this.unit;
      return;
    }
    const o = this.objs.get(target);
    if (!o) return;
    this.dragging = target;
    const grip = this.gripOf(o);
    if (!o.def.draggable) {
      // เนื้อเยื่อที่ไม่ได้หลุดออกมา: ผิวรอบปากคีบยืดเป็นกระโจมตามแรงดึง ทั้งก้อนขยับตามเพียงเล็กน้อย แล้วดีดกลับเมื่อปล่อย
      const v = delta.clone().clampLength(0, 0.014 * this.unit).multiplyScalar(0.7);
      o.dyn.grab(grip, new THREE.Vector3(v.x, (0.25 + progress) * 0.006 * this.unit, v.y));
      this.tug = { id: target, vec: delta.clone().clampLength(0, 0.008 * this.unit).multiplyScalar(0.15), lift: progress * 0.001 * this.unit };
      return;
    }
    // อวัยวะที่หยิบได้: ตามปากคีบแบบมีน้ำหนัก (สปริง) จุดที่คีบนำหน้า ส่วนอื่นห้อยตาม
    const d = delta.clone().clampLength(0, 0.05 * this.unit);
    const goal = new THREE.Vector3(o.home.x + d.x, o.home.y + progress * 0.01 * this.unit, o.home.z + d.y);
    // จุดคีบเก็บเป็นพิกัดของวัตถุ จึงเลื่อนไปกับอวัยวะ
    if (!o.spring) o.spring = { goal, vel: new THREE.Vector3(), grip: grip ? o.inner.worldToLocal(grip.clone()) : null };
    else o.spring.goal.copy(goal);
    o.dyn.grab(o.spring.grip ? o.inner.localToWorld(o.spring.grip.clone()) : grip, new THREE.Vector3(0, (0.3 + progress) * 0.004 * this.unit, 0));
  }

  /** จุดบนผิววัตถุที่เครื่องมือแตะไว้ (ถ้าไม่มีใช้จุดยึด) ในพิกัดโลก */
  private gripOf(o: Obj): THREE.Vector3 | null {
    const t = this.lastTouch;
    if (t && (t.id === o.def.id || this.objs.get(t.id)?.def.parent === o.def.id)) return t.point.clone();
    return this.anchorOf(o.def.id);
  }

  dragEnd(target: string, success: boolean): void {
    this.stretch = 0;
    if (this.dragging === target) this.dragging = null;
    const o = this.objs.get(target);
    o?.dyn.grab(null);
    if (this.tug?.id === target) {
      this.tug = null;
      this.touch(target, this.lastTouch?.point);
    }
    if (!o || !o.def.draggable) return;
    if (!o.spring) {
      if (!success) this.tweenPos(o.group, o.home.clone(), 0.3);
      else o.home.copy(o.group.position);
      return;
    }
    // ปล่อย: วางลงตรงนั้น (สำเร็จ) หรือไหลกลับที่เดิมแบบสปริง
    if (success) o.home.copy(o.spring.goal);
    else o.spring.goal.copy(o.home);
  }

  rotateUpdate(target: string, deg: number): void {
    const o = this.objs.get(target);
    if (!o) return;
    // ขั้นหมุนควบคุมวัตถุนี้อยู่ — การคีบยกไม่แย่ง
    this.dragging = target;
    if (o.spring) {
      o.spring = null;
      o.group.position.copy(o.home);
    }
    const axis = o.def.axis ?? 'y';
    o.group.rotation.copy(o.homeRot);
    o.group.rotation[axis] = o.homeRot[axis] + THREE.MathUtils.degToRad(deg);
  }

  private tweenPos(o: THREE.Object3D, to: THREE.Vector3, dur: number, done?: () => void): void {
    const from = o.position.clone();
    this.anims.push({ t: 0, dur, step: (k) => o.position.lerpVectors(from, to, k), done });
  }

  suturePoints(layer: string, stitches: number): THREE.Vector2[] {
    const L = this.layerMap.get(layer);
    if (!L) return [];
    const open = Math.max(L.layer.openTarget, 0.008 * this.unit);
    this.closeFrom.set(layer, L.layer.openTarget);
    const pts: THREE.Vector2[] = [];
    const off = 0.0035 * this.unit;
    if (L.shape === 1) {
      for (let k = 0; k < stitches; k++) {
        const a = (k / stitches) * Math.PI * 2 + 0.4;
        const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
        pts.push(L.a.clone().addScaledVector(dir, open + off), L.a.clone().addScaledVector(dir, Math.max(0.002, open - off * 1.5)));
      }
      return pts;
    }
    const ab = L.b.clone().sub(L.a);
    const half = ab.length() / 2;
    const D = ab.clone().normalize();
    const N = new THREE.Vector2(D.y, -D.x);
    const c = L.a.clone().lerp(L.b, 0.5);
    // จุดเย็บต้องอยู่ในช่องเปิดของชั้นที่อยู่เหนือขึ้นไป ผู้เล่นจึงมองเห็นและคลิกได้
    const idx = this.layers.indexOf(L);
    const above = idx > 0 ? this.layers[idx - 1].layer.openTarget : Infinity;
    for (let k = 0; k < stitches; k++) {
      const t = 0.5 + ((k + 0.5) / stitches - 0.5) * 0.78;
      const s = (t - 0.5) * 2 * half;
      const limit = openingHalfWidth(above, t) - 0.0025 * this.unit;
      const w = Math.min(openingHalfWidth(open, t) * 0.92 + off, Math.max(limit, openingHalfWidth(open, t) * 0.6));
      const p = c.clone().addScaledVector(D, s);
      pts.push(p.clone().addScaledVector(N, w), p.clone().addScaledVector(N, -w));
    }
    return pts;
  }

  showSuturePoints(layer: string, pts: THREE.Vector2[], next: number): void {
    const L = this.layerMap.get(layer);
    while (this.sutureMarks.length < pts.length) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.0022 * this.unit, 0.0048 * this.unit, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 15;
      this.root.add(m);
      this.sutureMarks.push(m);
    }
    this.sutureMarks.forEach((m, i) => {
      if (i >= pts.length || i < next || !L) {
        m.visible = false;
        return;
      }
      m.visible = true;
      m.position.copy(this.toWorld(pts[i], L.layer.depth, 0.0008 * this.unit));
      (m.material as THREE.MeshBasicMaterial).color.set(i === next ? 0xfacc15 : 0xe0f2fe);
      (m.material as THREE.MeshBasicMaterial).opacity = i === next ? 1 : 0.7;
    });
    this.sutureNext = pts.length ? next : -1;
  }

  placeStitch(layer: string, a: THREE.Vector2, b: THREE.Vector2, frac: number): void {
    const L = this.layerMap.get(layer);
    if (!L) return;
    const pa = this.toWorld(a, L.layer.depth, 0.0006 * this.unit);
    const pb = this.toWorld(b, L.layer.depth, 0.0006 * this.unit);
    const mid = pa.clone().lerp(pb, 0.5);
    const isTop = L === this.layers[0];
    mid.y += (isTop ? 0.0035 : 0.002) * this.unit;
    const mat = new THREE.MeshStandardMaterial({ color: isTop ? 0x1d4ed8 : 0x7c3aed, roughness: 0.5 });
    const s = new THREE.Mesh(varTube(new THREE.CatmullRomCurve3([pa, mid, pb]), () => 0.00055 * this.unit, { tubular: 16, radial: 5 }), mat);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.0012 * this.unit, 8, 6), mat);
    knot.position.copy(pa);
    s.userData.layer = layer;
    knot.userData.layer = layer;
    this.stitches.add(s, knot);
    L.layer.openTarget = (this.closeFrom.get(layer) ?? L.layer.openTarget) * (1 - 0.82 * frac);
  }

  holdFx(target: string, active: boolean): void {
    this.smokeAt = active ? this.anchorOf(target) : null;
    this.pressing = active ? target : null;
    // กดค้าง: ผิวบุ๋มลงตรงปลายเครื่องมือ ตามทิศที่มองลงไป
    const o = this.objs.get(target);
    if (!o) return;
    const p = active ? this.gripOf(o) : null;
    const dir = p && this.camera ? p.clone().sub(this.camera.position).normalize() : undefined;
    o.dyn.press(p, dir);
  }

  effect(name: string): void {
    this.sceneVer++;
    const parts = name.split(':');
    const [cmd, arg] = parts;
    const o = this.objs.get(arg);
    const L = this.layerMap.get(arg);
    switch (cmd) {
      case 'open':
        if (L) L.layer.openTarget = Number(parts[2]);
        break;
      case 'close':
        if (L) L.layer.openTarget = 0;
        break;
      case 'show':
      case 'hide': {
        const on = cmd === 'show';
        if (L) L.layer.mesh.visible = on;
        if (o) {
          o.group.visible = on;
          if (on) this.setVolume(o, Math.max(o.volume, o.def.blood ? 0.6 : 1));
          else o.volume = 0;
        }
        break;
      }
      case 'move':
        if (o) {
          o.spring = null;
          const to = o.home.clone().add(new THREE.Vector3(Number(parts[2] || 0), -Number(parts[4] || 0), Number(parts[3] || 0)));
          o.home.copy(to);
          this.tweenPos(o.group, to, 0.7);
        }
        break;
      case 'rotate':
        if (o) {
          const axis = (parts[3] as 'x' | 'y' | 'z') || o.def.axis || 'y';
          const from = o.group.rotation[axis];
          const to = from + THREE.MathUtils.degToRad(Number(parts[2]));
          o.homeRot[axis] = to;
          this.anims.push({ t: 0, dur: 0.8, step: (k) => (o.group.rotation[axis] = THREE.MathUtils.lerp(from, to, k)) });
        }
        break;
      case 'color':
        if (o) {
          const from = o.mats[0].color.clone();
          const to = new THREE.Color(parts[2]);
          this.anims.push({ t: 0, dur: 1.6, step: (k) => o.mats[0].color.lerpColors(from, to, k) });
        }
        break;
      case 'opacity':
        if (o) {
          const m = o.mats[0];
          const from = m.opacity;
          const to = Number(parts[2]);
          m.transparent = true;
          m.depthWrite = to > 0.95;
          o.baseOpacity = to;
          this.anims.push({ t: 0, dur: 1.0, step: (k) => (m.opacity = THREE.MathUtils.lerp(from, to, k)) });
        }
        break;
      case 'scale':
        if (o) {
          const from = o.group.scale.x;
          const to = Number(parts[2]);
          this.anims.push({ t: 0, dur: 0.8, step: (k) => o.group.scale.setScalar(THREE.MathUtils.lerp(from, to, k)) });
        }
        break;
      case 'emissive':
        if (o) {
          o.mats[0].emissive.set(parts[2] ?? '#000000');
          o.mats[0].emissiveIntensity = Number(parts[3] ?? 0.3);
        }
        break;
      case 'pool':
        if (o) {
          o.group.visible = true;
          this.setVolume(o, Number(parts[2] ?? 1));
        }
        break;
      case 'pulse':
        if (o) o.pulse = parts[2] !== 'off';
        break;
      case 'remove':
        if (o) {
          o.spring = null;
          const to = o.group.position.clone().add(new THREE.Vector3(0.02, 0.2, 0.12).multiplyScalar(this.unit));
          this.tweenPos(o.group, to, 0.9, () => (o.group.visible = false));
        }
        break;
      case 'label':
        this.organLabels.add(arg);
        break;
      case 'attach': {
        const tool = arg as ToolId;
        const at = this.anchorOf(parts[2]);
        if (!at) break;
        const t = buildTool(tool);
        t.scale.setScalar(this.toolScale * 0.95);
        t.position.copy(at).add(new THREE.Vector3(0, -0.003 * this.unit, 0));
        if (!t.userData.flat) orient(t, new THREE.Vector3(0.5, 1, -0.3), new THREE.Vector3(1, 0, 0));
        const jaws = t.userData.jaws as THREE.Object3D | undefined;
        if (jaws) jaws.scale.x = 0.3;
        t.userData.attachTool = tool;
        t.userData.attachTarget = parts[2];
        this.attached.add(t);
        break;
      }
      case 'detach':
        for (const c of [...this.attached.children])
          if (c.userData.attachTool === arg && (!parts[2] || c.userData.attachTarget === parts[2])) this.attached.remove(c);
        break;
      case 'camera': {
        const p = arg === 'field' ? this.defaultPose() : this.def.cameras?.[arg] ? this.poseFrom(this.def.cameras[arg]) : null;
        if (p) {
          this.pose = p;
          this.onPose?.(p);
        }
        break;
      }
      case 'dress':
        this.dressing.visible = true;
        break;
      case 'spin': {
        // spin:<แกน>:<องศา>:<ความลึกจุดหมุน> — หมุนวัตถุทั้งชุดรอบจุดเดียวกันใต้กึ่งกลางหน้าต่าง
        // (เช่น ยกสมองออกมาวางตะแคงให้เห็นภาพตัดแนวกลาง) ส่วนประกอบที่มี parent หมุนตามชิ้นแม่เอง
        const axis = new THREE.Vector3(arg === 'x' ? 1 : 0, arg === 'y' ? 1 : 0, arg === 'z' ? 1 : 0);
        const ang = THREE.MathUtils.degToRad(Number(parts[2] ?? 0));
        const pivot = new THREE.Vector3(this.W.cx, this.Y0 - Number(parts[3] ?? this.def.atlas?.depth ?? 0), this.W.cz);
        const tops = [...this.objs.values()].filter((x) => x.group.parent === this.root);
        const from = tops.map((x) => ({ x, p: x.group.position.clone(), q: x.group.quaternion.clone() }));
        const step = (k: number) => {
          const q = new THREE.Quaternion().setFromAxisAngle(axis, ang * k);
          for (const f of from) {
            f.x.group.position.copy(f.p).sub(pivot).applyQuaternion(q).add(pivot);
            f.x.group.quaternion.copy(q).multiply(f.q);
          }
        };
        this.anims.push({
          t: 0,
          dur: 1.4,
          step,
          done: () => {
            for (const f of from) {
              f.x.home.copy(f.x.group.position);
              f.x.homeRot.copy(f.x.group.rotation);
              f.x.spring = null;
            }
          },
        });
        break;
      }
      case 'trail':
        this.clearTrail();
        break;
    }
  }

  private motionOf(d: FieldObjectDef): Obj['motion'] {
    if (d.motion) return d.motion;
    if (d.pulse) return d.shape === 'tube' ? 'artery' : 'heart';
    const key = `${d.id} ${d.model ?? ''}`.toLowerCase();
    if (/lung|lobe/.test(key)) return 'lung';
    if (/small_int|bowel|colon|duoden|jejun|ileum|intestine|omentum|stomach/.test(key)) return 'bowel';
    const depth = d.at?.[2] ?? d.points?.[0]?.[2] ?? 0;
    if (d.inside || depth <= 0.004 * this.unit || d.shape === 'ring' || d.shape === 'sheet') return 'none';
    return 'drift';
  }

  setPhysiology(p: { hr: number; rr: number; live: boolean }): void {
    this.live = p.live;
    this.hr = THREE.MathUtils.clamp(p.hr, 0, 200);
    this.rr = THREE.MathUtils.clamp(p.rr, 0, 50);
  }

  touch(targetId: string | null, point?: THREE.Vector3 | null): void {
    if (!targetId) return;
    const o = this.objs.get(targetId);
    if (!o) return;
    // ส่วนย่อยของอวัยวะ (parent) ให้ทั้งอวัยวะกระเพื่อม
    this.jiggles.set(o.def.parent && this.objs.has(o.def.parent) ? o.def.parent : targetId, 0);
    // คลื่นกระเพื่อมวิ่งออกจากจุดที่แตะ
    const p = point ?? this.anchorOf(targetId);
    if (p) {
      this.lastTouch = { id: targetId, point: p.clone() };
      o.dyn.ripple(p);
    }
  }

  /** หัวใจเต้นตามชีพจร ปอดพองตามการหายใจ ลำไส้บีบตัว อวัยวะขยับตามกะบังลม และเนื้อเยื่อตอบสนองต่อเครื่องมือ */
  private animateLife(dt: number, t: number): void {
    this.beatPhase = (this.beatPhase + (dt * this.hr) / 60) % 1;
    this.breathPhase = (this.breathPhase + (dt * this.rr) / 60) % 1;
    const u = this.unit;
    // รูปคลื่น: หายใจเข้า (0→1) แล้วออก, หัวใจห้องบนบีบก่อน ตามด้วยห้องล่าง
    const breath = (1 - Math.cos(this.breathPhase * Math.PI * 2)) / 2;
    const c = this.beatPhase;
    const systole = c > 0.1 && c < 0.42 ? Math.sin((Math.PI * (c - 0.1)) / 0.32) ** 1.5 : 0;
    const atrial = c < 0.1 ? Math.sin((Math.PI * c) / 0.1) * 0.35 : 0;
    const throb = Math.max(0, Math.sin(Math.PI * 2 * (c - 0.12))) ** 3;
    const S = new THREE.Vector3();
    const O = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (const [id, t0] of this.jiggles) if (t0 > 0.9) this.jiggles.delete(id);
    for (const o of this.objs.values()) {
      S.set(1, 1, 1);
      O.set(0, 0, 0);
      if (this.live) {
        const m = o.motion;
        if (m === 'heart' && o.pulse) {
          S.x *= 1 - 0.07 * systole - 0.02 * atrial;
          S.z *= 1 - 0.07 * systole - 0.02 * atrial;
          S.y *= 1 - 0.03 * systole;
          O.y += 0.0008 * u * systole;
        } else if (o.pulse) S.multiplyScalar(1 + 0.045 * throb);
        if (m === 'lung') {
          S.x *= 1 + 0.05 * breath;
          S.y *= 1 + 0.07 * breath;
          S.z *= 1 + 0.035 * breath;
          O.y += 0.0015 * u * breath;
        }
        if (m === 'bowel') {
          // คลื่นบีบตัวจริงอยู่ในเชดเดอร์ (dyn.wave) ที่นี่เหลือแค่การเลื่อนไหลช้า ๆ ของขดลำไส้
          const w = Math.sin(t * 0.9 + o.seed);
          S.x *= 1 + 0.008 * w;
          S.z *= 1 - 0.006 * w;
          O.x += 0.0004 * u * Math.sin(t * 0.6 + o.seed);
        }
        if (m !== 'none') {
          // กะบังลมเลื่อนลงเมื่อหายใจเข้า ดันอวัยวะไปทางเท้าเล็กน้อย
          O.z += 0.0011 * u * breath;
          O.y += 0.0004 * u * breath;
        }
      }
      // เนื้อเยื่อกระเพื่อมเมื่อเครื่องมือแตะ (สปริงหน่วง) — มีทั้งในผู้ป่วยและหุ่นจำลอง
      const jt = this.jiggles.get(o.def.id);
      if (jt !== undefined) {
        this.jiggles.set(o.def.id, jt + dt);
        const a = Math.exp(-jt * 6) * Math.sin(jt * 30);
        S.y *= 1 - 0.02 * a;
        S.x *= 1 + 0.01 * a;
        S.z *= 1 + 0.01 * a;
      }
      if (this.pressing === o.def.id) S.y *= 0.985;
      if (this.tug?.id === o.def.id) {
        O.x += this.tug.vec.x;
        O.z += this.tug.vec.y;
        O.y += this.tug.lift;
        S.y *= 1 + this.tug.lift / (0.01 * u);
      }
      o.dyn.update(dt, t, this.live && o.motion === 'bowel');
      // ขยาย/หดรอบจุดกลางวัตถุ และแปลงการเลื่อนจากแกนโลกเป็นแกนของวัตถุ
      const cl = o.centerLocal;
      q.copy(o.group.quaternion).invert();
      O.applyQuaternion(q).divideScalar(o.group.scale.x || 1);
      o.inner.scale.copy(S);
      o.inner.position.set(cl.x - cl.x * S.x + O.x, cl.y - cl.y * S.y + O.y, cl.z - cl.z * S.z + O.z);
    }
  }

  gripStart(targetId: string, point: THREE.Vector3): boolean {
    const o = this.objs.get(targetId);
    if (!o || !o.group.visible || o.def.scrub || o.def.blood || o.def.inside || o.def.shape === 'sheet' || o.def.shape === 'disc' || o.def.shape === 'ring') return false;
    if ((o.def.metal ?? 0) >= 0.5 || this.layerMap.has(targetId)) return false;
    o.inner.updateWorldMatrix(true, false);
    this.grip = { o, local: o.inner.worldToLocal(point.clone()), start: point.clone(), t: 0 };
    o.dyn.grab(point, new THREE.Vector3(0, 0.003 * this.unit, 0));
    return true;
  }

  /**
   * ลากขณะคีบ: อวัยวะยกขึ้นและเลื่อนตามปากคีบ — ชิ้นเล็กติดตามมาเกือบทั้งชิ้น ชิ้นใหญ่ (ตับ) ขยับได้น้อย
   * แต่ผิวตรงที่คีบยืดตามเป็นกระโจม; ระยะจำกัด เพราะอวัยวะยังมีเยื่อยึดอยู่
   */
  gripMove(ray: THREE.Raycaster): void {
    const g = this.grip;
    if (!g || this.dragging === g.o.def.id) return;
    const o = g.o;
    // คลิกเฉย ๆ ไม่ยก — ยกขึ้นตามระยะที่ลากจริง (สูงสุด 1.4 ซม.)
    const p0 = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -g.start.y), new THREE.Vector3());
    if (!p0) return;
    const moved = Math.hypot(p0.x - g.start.x, p0.z - g.start.z);
    if (moved < 0.003 * this.unit) return;
    const lift = Math.min(0.014 * this.unit, moved * 1.2);
    const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(g.start.y + lift)), new THREE.Vector3());
    if (!p) return;
    const lab = !this.live;
    const off = p.sub(g.start);
    const flat = new THREE.Vector2(off.x, off.z).clampLength(0, (lab ? 0.05 : 0.025) * this.unit);
    const size = o.dyn.size;
    const follow = THREE.MathUtils.clamp((0.035 * this.unit) / size, 0.3, 1);
    const D = new THREE.Vector3(flat.x, lift, flat.y);
    if (!o.spring) o.spring = { goal: o.home.clone(), vel: new THREE.Vector3(), grip: null };
    o.spring.goal.copy(o.home).addScaledVector(D, follow);
    o.dyn.grab(o.inner.localToWorld(g.local.clone()), D.clone().multiplyScalar(1 - follow).add(new THREE.Vector3(0, 0.002 * this.unit, 0)));
  }

  gripEnd(): void {
    const g = this.grip;
    this.grip = null;
    if (!g) return;
    g.o.dyn.grab(null);
    const rotating = this.dragging === g.o.def.id && !g.o.def.draggable;
    if (rotating) this.dragging = null;
    if (g.o.spring && this.dragging !== g.o.def.id && !rotating) g.o.spring.goal.copy(g.o.home);
    this.touch(g.o.def.id, g.o.inner.localToWorld(g.local.clone()));
  }

  gripPoint(): THREE.Vector3 | null {
    const g = this.grip;
    return g ? g.o.inner.localToWorld(g.local.clone()) : null;
  }

  /** อวัยวะที่กำลังถูกลาก: เร่งเข้าหาเป้าแบบสปริงหน่วง (มีน้ำหนัก แกว่งเล็กน้อยเมื่อหยุด) และเอียงตามทิศที่ลาก */
  private updateSprings(dt: number): void {
    const h = Math.min(dt, 1 / 30);
    for (const o of this.objs.values()) {
      const sp = o.spring;
      if (!sp) continue;
      const k = 150;
      const lag = sp.goal.clone().sub(o.group.position);
      sp.vel.addScaledVector(lag, k * h).multiplyScalar(Math.max(0, 1 - 2 * Math.sqrt(k) * 0.42 * h));
      o.group.position.addScaledVector(sp.vel, h);
      // ปลายที่คีบนำหน้า ตัวอวัยวะยืดตามทิศที่ถูกลาก
      if (o.dyn.busy && sp.grip) o.dyn.grab(o.inner.localToWorld(sp.grip.clone()), lag.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.003 * this.unit, 0)));
      o.group.rotation.z = o.homeRot.z - THREE.MathUtils.clamp(sp.vel.x / this.unit, -2, 2) * 0.05;
      o.group.rotation.x = o.homeRot.x + THREE.MathUtils.clamp(sp.vel.z / this.unit, -2, 2) * 0.05;
      if (lag.length() < 1e-5 * this.unit && sp.vel.length() < 1e-4 * this.unit) {
        o.group.position.copy(sp.goal);
        o.group.rotation.copy(o.homeRot);
        o.spring = null;
      }
    }
  }

  setHighlight(target: string | null): void {
    this.highlight = target;
    this.ring.visible = !!target;
    if (!target) for (const o of this.objs.values()) this.restoreEmissive(o);
    for (const L of this.layers) L.layer.material.emissive.set(0x000000);
  }

  private restoreEmissive(o: Obj): void {
    o.mats[0].emissive.set(o.def.emissive ?? 0x000000);
    o.mats[0].emissiveIntensity = o.def.emissive ? 0.2 : 0;
  }

  showGuide(path: string | null): void {
    for (const [id, g] of this.guides) g.visible = id === path;
  }

  setBleeding(rate: number): void {
    this.bleedRate = rate;
  }

  labels(): LabelAnchor[] {
    const out: LabelAnchor[] = [];
    this.layers.forEach((L, i) => {
      if (!L.layer.mesh.visible) return;
      const above = this.layers[i - 1];
      if (above && above.layer.mesh.visible && above.layer.uniforms.uOpen.value < 0.006 * this.unit) return;
      const open = L.layer.uniforms.uOpen.value;
      let uv: THREE.Vector2;
      if (L.shape === 1) {
        const a = 3.6 + i * 0.5;
        uv = L.a.clone().add(new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(open + 0.004 * this.unit));
      } else {
        const t = 0.14 + i * 0.19;
        const ab = L.b.clone().sub(L.a);
        const D = ab.clone().normalize();
        const N = new THREE.Vector2(D.y, -D.x);
        const w = open > 0.004 * this.unit ? openingHalfWidth(open, t) + 0.011 * this.unit : 0.011 * this.unit;
        uv = L.a.clone().addScaledVector(ab, t).addScaledVector(N, -w);
      }
      out.push({ key: L.layer.id, text: L.layer.name, pos: this.toWorld(uv, L.layer.depth, 0.001), kind: 'layer' });
    });
    for (const [id, o] of this.objs) {
      if (!o.def.label || !o.group.visible) continue;
      if (!this.organLabels.has(id)) continue;
      const p = this.anchorOf(id, true);
      if (p) out.push({ key: id, text: o.def.label, pos: p, kind: 'organ' });
    }
    return out;
  }

  private defaultPose(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const { cx, cz, hw } = this.W;
    return {
      pos: new THREE.Vector3(cx + 0.67 * hw, this.Y0 + 4.13 * hw, cz + 1.6 * hw),
      target: new THREE.Vector3(cx + 0.5 * hw, this.Y0 - 0.4 * hw, cz + 0.05 * hw),
    };
  }

  private poseFrom(c: { pos: V3; target: V3 }): { pos: THREE.Vector3; target: THREE.Vector3 } {
    // pos: [u, ความสูงเหนือผิว, v]  target: [u, ความลึก, v]
    return {
      pos: new THREE.Vector3(this.W.cx + c.pos[0], this.Y0 + c.pos[1], this.W.cz + c.pos[2]),
      target: new THREE.Vector3(this.W.cx + c.target[0], this.Y0 - c.target[1], this.W.cz + c.target[2]),
    };
  }

  fieldPose(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    return { pos: this.pose.pos.clone(), target: this.pose.target.clone() };
  }

  update(dt: number, t: number, camera: THREE.Camera): void {
    this.camera = camera;
    this.clock = t;
    if (camera.position.distanceToSquared(this.lastCam) > 1e-8) {
      this.camMovedAt = t;
      this.lastCam.copy(camera.position);
    }
    this.layers.forEach((L, i) => {
      const goal = L.layer.openTarget + (i === 0 ? this.stretch : 0);
      L.layer.uniforms.uOpen.value += (goal - L.layer.uniforms.uOpen.value) * Math.min(1, dt * 4.5);
    });
    for (const w of this.walls) w.update();
    for (const s of this.stitches.children) {
      const idx = this.layers.findIndex((d) => d.layer.id === s.userData.layer);
      const above = this.layers[idx - 1];
      s.visible = !above || !above.layer.mesh.visible || above.layer.uniforms.uOpen.value > 0.004 * this.unit;
    }

    for (const o of this.objs.values()) {
      if (o.def.blood && o.group.visible && this.bleedRate > 0) this.setVolume(o, Math.max(o.volume, 0.08) + this.bleedRate * 0.011 * dt);
    }
    this.updateSprings(dt);
    this.animateLife(dt, t);

    if (this.highlight) {
      const p = this.anchorOf(this.highlight);
      if (p) {
        this.ring.visible = true;
        this.ring.position.copy(p);
        this.ring.quaternion.copy(camera.quaternion);
        const big = this.highlight === 'zone' || this.highlight === 'incision';
        this.ring.scale.setScalar((big ? 3.6 : 1) * (1 + 0.15 * Math.sin(t * 5)));
      } else this.ring.visible = false;
      const lvl = 0.35 + 0.25 * Math.sin(t * 5);
      const o = this.objs.get(this.highlight);
      if (o) {
        o.mats[0].emissive.set(0x1fb5a8);
        o.mats[0].emissiveIntensity = lvl;
      }
      const L = this.layerMap.get(this.highlight);
      if (L) {
        L.layer.material.emissive.set(0x1fb5a8);
        L.layer.material.emissiveIntensity = lvl;
      }
    }

    if (this.sutureNext >= 0) {
      const m = this.sutureMarks[this.sutureNext];
      if (m) m.scale.setScalar(1 + 0.3 * Math.sin(t * 7));
    }

    this.smokeT += dt;
    if (this.smokeAt && this.smokeT > 0.07) {
      this.smokeT = 0;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.0028 * this.unit, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      m.position.copy(this.smokeAt).add(new THREE.Vector3((Math.random() - 0.5) * 0.004, 0, (Math.random() - 0.5) * 0.004).multiplyScalar(this.unit));
      this.root.add(m);
      this.smoke.push({ m, life: 0 });
    }
    this.smoke = this.smoke.filter((s) => {
      s.life += dt;
      s.m.position.y += dt * 0.03 * this.unit;
      s.m.scale.setScalar(1 + s.life * 3);
      (s.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 - s.life * 0.6);
      if (s.life > 0.9) {
        this.root.remove(s.m);
        s.m.geometry.dispose();
        (s.m.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });

    this.anims = this.anims.filter((an) => {
      an.t = Math.min(1, an.t + dt / an.dur);
      const k = an.t < 0.5 ? 2 * an.t * an.t : 1 - (-2 * an.t + 2) ** 2 / 2;
      an.step(k);
      if (an.t >= 1) {
        this.sceneVer++;
        an.done?.();
        return false;
      }
      return true;
    });
    void this.camera;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Line).isLine) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          if (mat === proxyMat) continue;
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      }
    });
  }
}
