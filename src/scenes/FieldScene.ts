import * as THREE from 'three';
import type { FieldDef, FieldObjectDef, FieldPathDef, ToolId, V3 } from '../types';
import type { LabelAnchor, PickResult, SurgeryScene } from '../core/SurgeryScene';
import { openingHalfWidth, openingInside } from '../core/IncisionSystem';
import { buildCavity, buildDrape, buildLayer, buildTowels, fatTexture, muscleTexture, surfaceY, WIN, type Layer, type Win } from '../procedural/patient';
import { buildTool } from '../procedural/tools';
import { capEnds, varTube } from '../procedural/geom';
import { loadModel } from '../core/AssetLoader';

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
  private smokeT = 0;
  private anims: Anim[] = [];
  private organLabels = new Set<string>();
  private bleedRate = 0;
  private stretch = 0;
  private closeFrom = new Map<string, number>();
  private pose: { pos: THREE.Vector3; target: THREE.Vector3 };
  private camera: THREE.Camera | null = null;

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
    });

    if (def.cavity !== null) {
      const cav = def.cavity ?? { color: '#6e2a28', depth: 0.062 * this.unit };
      const top = (def.layers[def.layers.length - 1]?.depth ?? 0) + 0.006 * this.unit;
      const cavity = buildCavity(this.W, cav.color, cav.depth, top);
      cavity.userData.targetId = 'cavity';
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
    const pivot = d.at ? this.P(d.at) : d.points ? this.P(d.points[0]) : this.P([0, 0, 0.04]);
    group.position.copy(pivot);
    const opacity = d.opacity ?? 1;
    const mat = new THREE.MeshStandardMaterial({
      color: d.color,
      roughness: d.rough ?? 0.42,
      metalness: d.metal ?? 0,
      transparent: opacity < 1,
      opacity,
      emissive: d.emissive ?? 0x000000,
      emissiveIntensity: d.emissive ? 0.2 : 0,
      side: d.inside ? THREE.BackSide : d.shape === 'disc' || d.shape === 'sheet' || d.shape === 'ring' ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: opacity >= 0.95,
    });
    const meshes: THREE.Mesh[] = [];
    const add = (geo: THREE.BufferGeometry, pos?: THREE.Vector3) => {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.copy(pos);
      m.castShadow = !d.inside && opacity > 0.5;
      m.receiveShadow = true;
      m.userData.targetId = d.id;
      group.add(m);
      meshes.push(m);
      return m;
    };
    const s = d.size ?? [d.r ?? 0.01, d.r ?? 0.01, d.r ?? 0.01];
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
        const radius = d.caps ? (t: number) => rf(t) * capEnds(t, 0.08, 0.08) : rf;
        add(varTube(curve, radius, { tubular: Math.max(24, pts.length * 16), radial: d.inside ? 24 : 14 }));
        center = curve.getPointAt(0.5);
        anchor = center.clone().add(new THREE.Vector3(0, rf(0.5) + 0.003 * this.unit, 0));
        if (d.hit) {
          const proxy = new THREE.Mesh(varTube(curve, () => d.hit!, { tubular: 24, radial: 8 }), proxyMat);
          proxy.userData.targetId = d.id;
          group.add(proxy);
          meshes.push(proxy);
        }
        break;
      }
    }
    if (d.rot) group.rotation.set(THREE.MathUtils.degToRad(d.rot[0]), THREE.MathUtils.degToRad(d.rot[1]), THREE.MathUtils.degToRad(d.rot[2]));
    if (d.hit && d.shape !== 'tube') {
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(d.hit, 10, 8), proxyMat);
      proxy.userData.targetId = d.id;
      group.add(proxy);
      meshes.push(proxy);
    }
    if (d.hidden) group.visible = false;
    this.root.add(group);
    if (!d.noPick) this.pickables.push(...meshes);
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
    };
    this.objs.set(d.id, o);
    if (d.model) {
      // ระยะ 2: โมเดลจริงจาก Z-Anatomy แทนที่รูปทรงพื้นฐาน (ถ้าโหลดไม่ได้ก็ใช้รูปทรงเดิมต่อ)
      loadModel(d.model, s).then((model) => {
        if (!model) return;
        model.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.userData.targetId = d.id;
            m.material = mat;
            m.castShadow = true;
            this.pickables.push(m);
          }
        });
        for (const m of meshes) if (m.material !== proxyMat) m.visible = false;
        group.add(model);
      });
    }
  }

  private anchorOf(id: string): THREE.Vector3 | null {
    const o = this.objs.get(id);
    if (o) {
      o.group.updateWorldMatrix(true, false);
      if (this.camera && this.camera.position.y < this.Y0) {
        // มุมกล้องส่อง (อยู่ใต้ผิว): ใช้จุดกึ่งกลางวัตถุ ขยับเข้าหากล้องเล็กน้อย
        const c = o.centerLocal.clone().applyMatrix4(o.group.matrixWorld);
        return c.lerp(this.camera.position, o.def.shape === 'tube' ? 0.04 : 0.15);
      }
      if (o.def.shape === 'cylinder') {
        // ทรงกระบอกอาจวางนอน (กระดูก): ใช้จุดบนสุดของกล่องขอบเขต แทนปลายแกน
        const box = new THREE.Box3().setFromObject(o.meshes[0]);
        const c = box.getCenter(new THREE.Vector3());
        return c.setY(box.max.y + 0.002 * this.unit);
      }
      return o.anchorLocal.clone().applyMatrix4(o.group.matrixWorld);
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
      const id = (o.userData.targetId as string | undefined) ?? null;
      if (!id) continue;
      return { targetId: id, point: h.point.clone(), uv: uv ?? new THREE.Vector2(h.point.x - this.W.cx, h.point.z - this.W.cz) };
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
    if (Math.abs(uv.x) > this.W.hw * 1.6 || Math.abs(uv.y) > this.W.hd * 1.6) return null;
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
    if (!o || !o.def.draggable) return;
    const d = delta.clone().clampLength(0, 0.05 * this.unit);
    o.group.position.set(o.home.x + d.x, o.home.y + progress * 0.01 * this.unit, o.home.z + d.y);
  }

  dragEnd(target: string, success: boolean): void {
    this.stretch = 0;
    const o = this.objs.get(target);
    if (!o || !o.def.draggable) return;
    if (!success) this.tweenPos(o.group, o.home.clone(), 0.3);
    else o.home.copy(o.group.position);
  }

  rotateUpdate(target: string, deg: number): void {
    const o = this.objs.get(target);
    if (!o) return;
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
  }

  effect(name: string): void {
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
      case 'trail':
        this.clearTrail();
        break;
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
      const p = this.anchorOf(id);
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
    this.layers.forEach((L, i) => {
      const goal = L.layer.openTarget + (i === 0 ? this.stretch : 0);
      L.layer.uniforms.uOpen.value += (goal - L.layer.uniforms.uOpen.value) * Math.min(1, dt * 4.5);
    });
    for (const s of this.stitches.children) {
      const idx = this.layers.findIndex((d) => d.layer.id === s.userData.layer);
      const above = this.layers[idx - 1];
      s.visible = !above || !above.layer.mesh.visible || above.layer.uniforms.uOpen.value > 0.004 * this.unit;
    }

    for (const o of this.objs.values()) {
      if (o.pulse) {
        const k = 1 + 0.035 * Math.max(0, Math.sin(t * 7.5)) ** 3;
        o.meshes[0]?.scale && o.group.scale.set(k, k, k);
      }
      if (o.def.blood && o.group.visible && this.bleedRate > 0) this.setVolume(o, Math.max(o.volume, 0.08) + this.bleedRate * 0.011 * dt);
    }

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
