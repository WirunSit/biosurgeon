import * as THREE from 'three';
import type { ToolId } from '../types';
import type { LabelAnchor, PickResult, SurgeryScene } from '../core/SurgeryScene';
import { openingHalfWidth, openingInside } from '../core/IncisionSystem';
import {
  WIN,
  Y0,
  buildCavity,
  buildDrape,
  buildLayer,
  buildTowels,
  fatTexture,
  muscleTexture,
  surfaceY,
  type Layer,
} from '../procedural/patient';
import { buildAnatomy, type Anatomy } from '../procedural/anatomy';
import { buildTool } from '../procedural/tools';
import { varTube } from '../procedural/geom';

/** ทิศตามแนวแผล (ไปทางเท้าและเข้าหาแนวกลางลำตัว) และทิศตั้งฉาก */
const D = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2);
const N = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
const HALF_LEN = 0.05;
const A = D.clone().multiplyScalar(-HALF_LEN);
const B = D.clone().multiplyScalar(HALF_LEN);

const LAYER_DEFS: { id: string; name: string; depth: number }[] = [
  { id: 'skin', name: 'ผิวหนัง', depth: 0 },
  { id: 'fat', name: 'ไขมันใต้ผิวหนัง', depth: 0.012 },
  { id: 'muscle', name: 'กล้ามเนื้อหน้าท้อง', depth: 0.022 },
  { id: 'peritoneum', name: 'เยื่อบุช่องท้อง', depth: 0.032 },
];

const ORGAN_LABELS: Record<string, string> = {
  cecum: 'ซีคัม (ลำไส้ใหญ่)',
  appendix: 'ไส้ติ่ง',
  ileum: 'ลำไส้เล็กส่วนปลาย (ไอเลียม)',
  appendicular_artery: 'หลอดเลือดเลี้ยงไส้ติ่ง',
};

const PAINT = 512;

function toWorld(uv: THREE.Vector2, depth = 0, lift = 0): THREE.Vector3 {
  const x = WIN.cx + uv.x;
  const z = WIN.cz + uv.y;
  return new THREE.Vector3(x, surfaceY(x, z) - depth + lift, z);
}

function segInfo(p: THREE.Vector2): { t: number; d: number } {
  const ab = B.clone().sub(A);
  const t = THREE.MathUtils.clamp(p.clone().sub(A).dot(ab) / ab.lengthSq(), 0, 1);
  const d = p.distanceTo(A.clone().addScaledVector(ab, t));
  return { t, d };
}

function isVisibleDeep(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** วางเครื่องมือให้ด้ามชี้ไปทาง dir และด้าน -Z ของเครื่องมือหันไปทาง want */
function orient(obj: THREE.Object3D, dir: THREE.Vector3, want: THREE.Vector3): void {
  const y = dir.clone().normalize();
  const z = want.clone().multiplyScalar(-1);
  z.sub(y.clone().multiplyScalar(z.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

interface Anim {
  t: number;
  dur: number;
  step: (k: number) => void;
  done?: () => void;
}

export class AbdomenRLQScene implements SurgeryScene {
  readonly root = new THREE.Group();
  private layers: Layer[] = [];
  private layerMap = new Map<string, Layer>();
  private anat: Anatomy;
  private pickables: THREE.Object3D[] = [];

  // ผิวหนังวาดได้: น้ำยาฆ่าเชื้อ / เส้นมาร์ก / รอยกรีด
  private paintCanvas = document.createElement('canvas');
  private paintCtx: CanvasRenderingContext2D;
  private paintTex: THREE.CanvasTexture;
  private baseCanvas = document.createElement('canvas');
  private markCanvas = document.createElement('canvas');
  private cutCanvas = document.createElement('canvas');
  private coverCells: THREE.Vector2[] = [];
  private coverHit: boolean[] = [];
  private coverCount = 0;

  private guide: THREE.Line;
  private ring: THREE.Mesh;
  private highlight: string | null = null;
  private sutureMarks: THREE.Mesh[] = [];
  private sutureNext = -1;
  private stitches = new THREE.Group();
  private retractors = new THREE.Group();
  private clamp: THREE.Group;
  private arteryTie: THREE.Mesh;
  private baseTie: THREE.Mesh;
  private dressing: THREE.Group;
  private smoke: { m: THREE.Mesh; life: number }[] = [];
  private smokeOn = false;
  private smokeT = 0;
  private anims: Anim[] = [];
  private organLabels = new Set<string>();
  private bleedRate = 0;
  private loopsHome = new THREE.Vector3();
  private loopsAside = false;
  private appendixHome = new THREE.Vector3();
  private appendixRemoved = false;
  private ruptured = false;
  private closeFrom = new Map<string, number>();
  /** ขอบแผลที่ถูกดึงชั่วคราวระหว่างลากตะขอถ่าง */
  private stretch = 0;

  constructor(private reducedGore: boolean) {
    this.root.name = 'abdomen-rlq';

    // ผ้าคลุม + ผ้าขนหนูรอบหน้าต่างผ่าตัด
    const drape = buildDrape();
    const towels = buildTowels();
    this.root.add(drape, towels);
    this.pickables.push(drape, ...towels.children);

    // ชั้นเนื้อเยื่อ
    this.paintCtx = this.paintCanvas.getContext('2d')!;
    for (const c of [this.paintCanvas, this.baseCanvas, this.markCanvas, this.cutCanvas]) c.width = c.height = PAINT;
    this.initSkinPaint();
    this.paintTex = new THREE.CanvasTexture(this.paintCanvas);
    this.paintTex.colorSpace = THREE.SRGBColorSpace;

    const params: Record<string, THREE.MeshStandardMaterialParameters> = {
      skin: { map: this.paintTex, roughness: 0.62 },
      fat: { map: fatTexture(), roughness: 0.5 },
      muscle: { map: muscleTexture(), roughness: 0.48 },
      peritoneum: { color: 0xe2bcb1, roughness: 0.22 },
    };
    const edges: Record<string, number> = { skin: 0xa8473f, fat: 0xd5a23f, muscle: 0x74201c, peritoneum: 0xc4958c };
    for (const d of LAYER_DEFS) {
      const L = buildLayer(d.id, d.name, d.depth, params[d.id], edges[d.id], A, B);
      this.layers.push(L);
      this.layerMap.set(d.id, L);
      this.root.add(L.mesh);
      this.pickables.push(L.mesh);
    }

    const cavity = buildCavity();
    cavity.userData.targetId = 'cavity';
    this.root.add(cavity);
    this.pickables.push(cavity);

    // อวัยวะ
    this.anat = buildAnatomy(reducedGore);
    this.root.add(this.anat.group);
    const a = this.anat;
    this.pickables.push(
      a.arteryProxy,
      a.baseProxy,
      a.bleederProxy,
      a.artery,
      a.appendixBody,
      a.appendixStump,
      a.meso,
      a.loops,
      a.ileum,
      a.colon,
      ...a.group.children.filter((c) => c.userData.targetId === 'cecum' && c !== a.colon),
    );
    this.loopsHome.copy(a.loops.position);
    this.appendixHome.copy(a.appendixBody.position);

    // เส้นประนำแนวกรีด
    const gpts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) gpts.push(toWorld(A.clone().lerp(B, i / 40), 0, 0.0012));
    this.guide = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(gpts),
      new THREE.LineDashedMaterial({ color: 0x1e1b4b, dashSize: 0.004, gapSize: 0.003 }),
    );
    this.guide.computeLineDistances();
    this.guide.visible = false;
    this.root.add(this.guide);

    // วงแหวนไฮไลต์เป้าหมาย (โหมดง่าย)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.0085, 0.011, 40),
      new THREE.MeshBasicMaterial({ color: 0x2ee6d6, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    this.root.add(this.ring);

    this.root.add(this.stitches, this.retractors);

    // คีมหนีบหลอดเลือด + ปมไหม
    this.clamp = buildTool('clamp');
    this.clamp.scale.setScalar(0.62);
    (this.clamp.userData.jaws as THREE.Object3D).scale.x = 0.3;
    const cp = a.arteryCurve.getPointAt(0.42);
    this.clamp.position.copy(cp);
    orient(this.clamp, new THREE.Vector3(0.55, 1, -0.25), new THREE.Vector3(1, 0, 0));
    this.clamp.visible = false;
    this.root.add(this.clamp);

    const tieMat = new THREE.MeshStandardMaterial({ color: 0x3730a3, roughness: 0.5 });
    this.arteryTie = new THREE.Mesh(new THREE.TorusGeometry(0.0026, 0.0008, 6, 16), tieMat);
    this.arteryTie.position.copy(a.arteryCurve.getPointAt(0.3));
    this.arteryTie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.arteryCurve.getTangentAt(0.3));
    this.arteryTie.visible = false;
    this.baseTie = new THREE.Mesh(new THREE.TorusGeometry(a.appendixRadius(0.2) + 0.0009, 0.0012, 8, 20), tieMat);
    this.baseTie.position.copy(a.appendixCurve.getPointAt(0.2));
    this.baseTie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.appendixCurve.getTangentAt(0.2));
    this.baseTie.visible = false;
    this.root.add(this.arteryTie, this.baseTie);

    // ผ้าก๊อซปิดแผล
    this.dressing = new THREE.Group();
    const gauze = buildTool('gauze');
    gauze.scale.set(2.2, 1, 0.85);
    this.dressing.add(gauze);
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0015, 0.06), tapeMat);
      tape.position.set(s * 0.04, 0.0055, 0);
      this.dressing.add(tape);
    }
    this.dressing.position.copy(toWorld(new THREE.Vector2(0, 0), 0, 0.001));
    this.dressing.rotation.y = -Math.atan2(D.y, D.x);
    this.dressing.visible = false;
    this.root.add(this.dressing);

    this.buildCoverGrid();
  }

  // ---------- การเลือกเป้าหมาย ----------

  pick(ray: THREE.Raycaster): PickResult {
    const uv = this.skinUV(ray);
    const hits = ray.intersectObjects(this.pickables, false);
    for (const h of hits) {
      const o = h.object;
      if (!isVisibleDeep(o)) continue;
      const layerId = o.userData.layer as string | undefined;
      if (layerId) {
        const L = this.layerMap.get(layerId)!;
        const local = new THREE.Vector2(h.point.x - WIN.cx, h.point.z - WIN.cz);
        if (openingInside(local, A, B, L.uniforms.uOpen.value) > 0) continue;
      }
      const id = (o.userData.targetId as string | undefined) ?? null;
      if (!id) continue;
      return { targetId: id, point: h.point.clone(), uv };
    }
    return { targetId: null, point: null, uv };
  }

  private skinUV(ray: THREE.Raycaster): THREE.Vector2 | null {
    return this.layerUV('skin', ray);
  }

  layerUV(layer: string, ray: THREE.Raycaster): THREE.Vector2 | null {
    const L = this.layerMap.get(layer);
    if (!L) return null;
    const h = ray.intersectObject(L.mesh, false)[0];
    if (!h) return null;
    return new THREE.Vector2(h.point.x - WIN.cx, h.point.z - WIN.cz);
  }

  matches(wanted: string, hit: PickResult): boolean {
    const id = hit.targetId;
    if (wanted === 'zone_rlq') return !!hit.uv && segInfo(hit.uv).d < 0.045 && id !== 'drape';
    if (wanted === 'incision') return !!hit.uv && segInfo(hit.uv).d < 0.018 && id !== 'drape' && id !== null;
    if (wanted === 'appendix') return id === 'appendix' || (id === 'appendix_base' && !this.baseTie.visible);
    return id === wanted;
  }

  path(id: string): THREE.Vector2[] {
    void id;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) pts.push(A.clone().lerp(B, i / 10));
    return pts;
  }

  // ---------- ทาน้ำยา / ดูดของเหลว ----------

  private initSkinPaint(): void {
    const x = this.baseCanvas.getContext('2d')!;
    x.fillStyle = '#d9a383';
    x.fillRect(0, 0, PAINT, PAINT);
    for (let i = 0; i < 1600; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(170,110,80,0.10)' : 'rgba(240,190,160,0.10)';
      x.fillRect(Math.random() * PAINT, Math.random() * PAINT, 2, 2);
    }
    this.composite();
  }

  private composite(): void {
    const c = this.paintCtx;
    c.drawImage(this.baseCanvas, 0, 0);
    c.drawImage(this.markCanvas, 0, 0);
    c.drawImage(this.cutCanvas, 0, 0);
    if (this.paintTex) this.paintTex.needsUpdate = true;
  }

  private px(uv: THREE.Vector2): [number, number] {
    return [((uv.x + WIN.hw) / (2 * WIN.hw)) * PAINT, ((uv.y + WIN.hd) / (2 * WIN.hd)) * PAINT];
  }

  private buildCoverGrid(): void {
    const step = 0.006;
    for (let u = -WIN.hw; u <= WIN.hw; u += step)
      for (let v = -WIN.hd; v <= WIN.hd; v += step) {
        const p = new THREE.Vector2(u, v);
        if (segInfo(p).d < 0.034) this.coverCells.push(p);
      }
    this.coverHit = this.coverCells.map(() => false);
  }

  scrub(target: string, hit: PickResult, ray: THREE.Raycaster, first: boolean) {
    if (target === 'zone_rlq') {
      const uv = hit.uv;
      if (!uv || segInfo(uv).d > 0.045 || hit.targetId === 'drape') return { progress: this.coverCount / this.coverCells.length, inside: false };
      const x = this.baseCanvas.getContext('2d')!;
      const [px, py] = this.px(uv);
      const r = (0.013 / (2 * WIN.hw)) * PAINT;
      const g = x.createRadialGradient(px, py, r * 0.2, px, py, r);
      g.addColorStop(0, 'rgba(150,62,12,0.32)');
      g.addColorStop(1, 'rgba(150,62,12,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, Math.PI * 2);
      x.fill();
      this.composite();
      this.coverCells.forEach((c, i) => {
        if (!this.coverHit[i] && c.distanceTo(uv) < 0.013) {
          this.coverHit[i] = true;
          this.coverCount++;
        }
      });
      const warn =
        first && uv.length() > 0.03
          ? 'ควรเริ่มทาจากกลางแนวผ่าตัดแล้ววนออกด้านนอก — การทาจากขอบเข้าหาแผลอาจลากเชื้อเข้ามาที่แผล'
          : undefined;
      return { progress: this.coverCount / this.coverCells.length, inside: true, warn };
    }
    const pool = this.anat.pools[target as 'blood_pool' | 'field_fluid' | 'pus'];
    if (!pool) return { progress: 0, inside: false };
    const vol = pool.userData.volume as number;
    if (!pool.visible) return { progress: 1, inside: true };
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -pool.position.y);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return { progress: 1 - vol, inside: false };
    const r = 0.03 * Math.sqrt(Math.max(vol, 0.05)) + 0.008;
    if (Math.hypot(p.x - pool.position.x, p.z - pool.position.z) > r) return { progress: 1 - vol, inside: false };
    this.setPool(pool, vol - 0.016);
    if (target === 'field_fluid') {
      const bp = this.anat.pools.blood_pool;
      if (bp.visible) this.setPool(bp, (bp.userData.volume as number) - 0.03);
    }
    return { progress: 1 - (pool.userData.volume as number), inside: true };
  }

  private setPool(pool: THREE.Mesh, vol: number): void {
    const v = THREE.MathUtils.clamp(vol, 0, 1);
    pool.userData.volume = v < 0.06 ? 0 : v;
    pool.visible = pool.userData.volume > 0;
    const s = Math.sqrt(Math.max(0.05, pool.userData.volume));
    pool.scale.set(s, s, 1);
  }

  // ---------- ลากตามเส้น ----------

  traceDraw(tool: ToolId, from: THREE.Vector2, to: THREE.Vector2): void {
    const cv = tool === 'marker' ? this.markCanvas : this.cutCanvas;
    const x = cv.getContext('2d')!;
    const [x0, y0] = this.px(from);
    const [x1, y1] = this.px(to);
    x.lineCap = 'round';
    if (tool === 'marker') {
      x.strokeStyle = '#5b21b6';
      x.lineWidth = 5;
    } else {
      x.strokeStyle = this.reducedGore ? '#3b5bdb' : '#7f1d1d';
      x.lineWidth = 3.5;
    }
    x.beginPath();
    x.moveTo(x0, y0);
    x.lineTo(x1, y1);
    x.stroke();
    this.composite();
  }

  traceReset(tool: ToolId): void {
    const cv = tool === 'marker' ? this.markCanvas : this.cutCanvas;
    cv.getContext('2d')!.clearRect(0, 0, PAINT, PAINT);
    this.composite();
  }

  // ---------- ลากวัตถุ ----------

  dragUpdate(target: string, delta: THREE.Vector2, progress: number): void {
    const a = this.anat;
    if (target === 'incision') {
      this.stretch = progress * 0.012;
    } else if (target === 'bowel_loops') {
      const d = delta.clone().clampLength(0, 0.05);
      a.loops.position.set(this.loopsHome.x + d.x, this.loopsHome.y + progress * 0.004, this.loopsHome.z + d.y);
    } else if (target === 'appendix') {
      const d = delta.clone().clampLength(0, 0.05);
      a.appendixBody.position.set(this.appendixHome.x + d.x, this.appendixHome.y + 0.004 + progress * 0.02, this.appendixHome.z + d.y);
    }
  }

  dragEnd(target: string, success: boolean): void {
    this.stretch = 0;
    if (success) return;
    const a = this.anat;
    if (target === 'bowel_loops' && !this.loopsAside) this.tweenPos(a.loops, this.loopsHome.clone(), 0.3);
    if (target === 'appendix' && !this.appendixRemoved)
      this.tweenPos(a.appendixBody, this.appendixHome.clone().add(new THREE.Vector3(0, 0.002, 0)), 0.3);
  }

  private tweenPos(o: THREE.Object3D, to: THREE.Vector3, dur: number, done?: () => void): void {
    const from = o.position.clone();
    this.anims.push({ t: 0, dur, step: (k) => o.position.lerpVectors(from, to, k), done });
  }

  // ---------- เย็บแผล ----------

  suturePoints(layer: string, stitches: number): THREE.Vector2[] {
    const L = this.layerMap.get(layer)!;
    const open = Math.max(L.openTarget, 0.008);
    this.closeFrom.set(layer, L.openTarget);
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k < stitches; k++) {
      const t = 0.5 + ((k + 0.5) / stitches - 0.5) * 0.78;
      const s = (t - 0.5) * 2 * HALF_LEN;
      const w = openingHalfWidth(open, t) * 0.92 + 0.0035;
      const c = D.clone().multiplyScalar(s);
      pts.push(c.clone().addScaledVector(N, w), c.clone().addScaledVector(N, -w));
    }
    return pts;
  }

  showSuturePoints(layer: string, pts: THREE.Vector2[], next: number): void {
    const L = this.layerMap.get(layer);
    while (this.sutureMarks.length < pts.length) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.0022, 0.0048, 28),
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
      m.position.copy(toWorld(pts[i], L.depth, 0.0008));
      (m.material as THREE.MeshBasicMaterial).color.set(i === next ? 0xfacc15 : 0xe0f2fe);
      (m.material as THREE.MeshBasicMaterial).opacity = i === next ? 1 : 0.7;
    });
    this.sutureNext = pts.length ? next : -1;
  }

  placeStitch(layer: string, a: THREE.Vector2, b: THREE.Vector2, frac: number): void {
    const L = this.layerMap.get(layer)!;
    const pa = toWorld(a, L.depth, 0.0006);
    const pb = toWorld(b, L.depth, 0.0006);
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y += layer === 'skin' ? 0.0035 : 0.002;
    const color = layer === 'skin' ? 0x1d4ed8 : 0x7c3aed;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const s = new THREE.Mesh(varTube(new THREE.CatmullRomCurve3([pa, mid, pb]), () => 0.00055, { tubular: 16, radial: 5 }), mat);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 8, 6), mat);
    knot.position.copy(pa);
    s.userData.layer = layer;
    knot.userData.layer = layer;
    this.stitches.add(s, knot);
    const from = this.closeFrom.get(layer) ?? L.openTarget;
    L.openTarget = from * (1 - 0.82 * frac);
  }

  // ---------- เอฟเฟกต์ ----------

  holdFx(target: string, active: boolean): void {
    void target;
    this.smokeOn = active;
  }

  effect(name: string): void {
    const [cmd, arg, val] = name.split(':');
    const a = this.anat;
    switch (cmd) {
      case 'open': {
        const L = this.layerMap.get(arg);
        if (L) L.openTarget = Number(val);
        break;
      }
      case 'close': {
        const L = this.layerMap.get(arg);
        if (L) L.openTarget = 0;
        break;
      }
      case 'show':
      case 'hide': {
        const on = cmd === 'show';
        if (arg === 'bleeder_fat') {
          a.bleeder.visible = on;
          a.bleederProxy.visible = on;
          a.bleeder.scale.setScalar(1);
        } else if (arg in a.pools) {
          const pool = a.pools[arg as keyof typeof a.pools];
          if (on) this.setPool(pool, Math.max(pool.userData.volume as number, arg === 'blood_pool' ? 0.65 : 1));
          else this.setPool(pool, 0);
        }
        break;
      }
      case 'place_retractors':
        this.placeRetractors();
        break;
      case 'remove_retractors':
        this.retractors.clear();
        break;
      case 'move_aside':
        this.loopsAside = true;
        this.tweenPos(a.loops, this.loopsHome.clone().add(new THREE.Vector3(0.05, -0.004, -0.028)), 0.6);
        break;
      case 'attach_clamp':
        this.clamp.visible = true;
        this.arteryTie.visible = true;
        break;
      case 'tie':
        this.baseTie.visible = true;
        break;
      case 'detach': {
        const tan = a.appendixCurve.getTangentAt(0.24);
        const to = this.appendixHome.clone().addScaledVector(tan, 0.0035);
        to.y += 0.002;
        this.appendixHome.copy(to);
        this.tweenPos(a.appendixBody, to, 0.4);
        break;
      }
      case 'remove': {
        this.appendixRemoved = true;
        const o = a.appendixBody;
        const to = o.position.clone().add(new THREE.Vector3(0.02, 0.2, 0.12));
        this.tweenPos(o, to, 0.9, () => (o.visible = false));
        this.clamp.visible = false;
        a.meso.scale.set(1, 1, 1);
        break;
      }
      case 'label':
        this.organLabels.add(arg);
        break;
      case 'dress':
        this.dressing.visible = true;
        break;
      case 'rupture_state':
        this.ruptured = true;
        a.appendixMat.color.set(0x7d3b2b);
        a.appendixMat.emissive.set(0x552200);
        this.setPool(a.pools.pus, 1);
        break;
    }
  }

  private placeRetractors(): void {
    this.retractors.clear();
    const skin = this.layerMap.get('skin')!;
    for (const side of [1, -1]) {
      const r = buildTool('retractor');
      r.scale.setScalar(0.8);
      const edge = N.clone().multiplyScalar(side * (skin.openTarget * 0.92));
      r.position.copy(toWorld(edge, 0.006));
      const n3 = new THREE.Vector3(N.x * side, 0, N.y * side);
      orient(r, n3.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.55, 0)), n3.clone().multiplyScalar(-1));
      this.retractors.add(r);
    }
  }

  setHighlight(target: string | null): void {
    this.highlight = target;
    this.ring.visible = !!target;
    this.highlightMeshes(null);
  }

  showGuide(path: string | null): void {
    this.guide.visible = !!path;
  }

  setBleeding(rate: number): void {
    this.bleedRate = rate;
  }

  private meshesFor(target: string): THREE.Mesh[] {
    const a = this.anat;
    switch (target) {
      case 'cecum':
        return [a.colon];
      case 'appendix':
        return [a.appendixBody];
      case 'appendix_base':
        return [a.appendixStump];
      case 'appendicular_artery':
        return [a.artery];
      case 'bowel_loops':
        return [a.loops];
      case 'ileum':
        return [a.ileum];
    }
    const L = this.layerMap.get(target);
    return L ? [L.mesh] : [];
  }

  private highlightMeshes(level: number | null): void {
    const all = ['cecum', 'appendix_base', 'appendicular_artery', 'bowel_loops', 'ileum', 'peritoneum'];
    for (const t of all) {
      for (const m of this.meshesFor(t)) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (t === this.highlight && level !== null) {
          mat.emissive.set(0x1fb5a8);
          mat.emissiveIntensity = level;
        } else {
          mat.emissive.set(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    }
  }

  private anchor(target: string): THREE.Vector3 | null {
    const a = this.anat.anchors[target];
    if (a) return a;
    if (target === 'zone_rlq' || target === 'incision') return toWorld(new THREE.Vector2(0, 0), 0, 0.004);
    const L = this.layerMap.get(target);
    if (L) return toWorld(new THREE.Vector2(0, 0), L.depth, 0.004);
    return null;
  }

  labels(): LabelAnchor[] {
    const out: LabelAnchor[] = [];
    this.layers.forEach((L, i) => {
      const above = this.layers[i - 1];
      if (above && above.uniforms.uOpen.value < 0.006) return;
      const t = 0.14 + i * 0.19;
      const open = L.uniforms.uOpen.value;
      const w = open > 0.004 ? openingHalfWidth(open, t) + 0.01 : 0.01;
      const uv = D.clone().multiplyScalar((t - 0.5) * 2 * HALF_LEN).addScaledVector(N, -w);
      out.push({ key: L.id, text: L.name, pos: toWorld(uv, L.depth, 0.001), kind: 'layer' });
    });
    const peri = this.layerMap.get('peritoneum')!.uniforms.uOpen.value;
    if (peri > 0.006) {
      for (const id of this.organLabels) {
        if (id === 'appendix' && this.appendixRemoved) continue;
        const pos = this.anat.anchors[id];
        if (pos && ORGAN_LABELS[id]) out.push({ key: id, text: ORGAN_LABELS[id], pos, kind: 'organ' });
      }
    }
    return out;
  }

  fieldPose(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    return {
      // เลื่อนจุดมองไปทางซ้ายของผู้ป่วยเล็กน้อย เพื่อให้แผลไม่ถูกถาดเครื่องมือด้านขวาจอบัง
      pos: new THREE.Vector3(WIN.cx + 0.05, Y0 + 0.31, WIN.cz + 0.12),
      target: new THREE.Vector3(WIN.cx + 0.038, Y0 - 0.03, WIN.cz + 0.004),
    };
  }

  // ---------- อัปเดตทุกเฟรม ----------

  update(dt: number, t: number, camera: THREE.Camera): void {
    for (const L of this.layers) {
      const goal = L.openTarget + (L.id === 'skin' ? this.stretch : 0);
      L.uniforms.uOpen.value += (goal - L.uniforms.uOpen.value) * Math.min(1, dt * 4.5);
    }
    // ซ่อนไหมของชั้นที่อยู่ใต้ชั้นที่ปิดแล้ว
    for (const s of this.stitches.children) {
      const layer = s.userData.layer as string;
      const idx = LAYER_DEFS.findIndex((d) => d.id === layer);
      const above = this.layers[idx - 1];
      s.visible = !above || above.uniforms.uOpen.value > 0.004;
    }

    const a = this.anat;
    if (!this.ruptured && this.highlight !== 'appendix') a.appendixMat.emissiveIntensity = 0.1 + 0.07 * Math.sin(t * 2.6);

    // ไฮไลต์
    if (this.highlight) {
      const p = this.anchor(this.highlight);
      if (p) {
        this.ring.position.copy(p);
        this.ring.quaternion.copy(camera.quaternion);
        const big = this.highlight === 'zone_rlq' || this.highlight === 'incision';
        this.ring.scale.setScalar((big ? 3.6 : 1) * (1 + 0.15 * Math.sin(t * 5)));
      } else this.ring.visible = false;
      this.highlightMeshes(0.35 + 0.25 * Math.sin(t * 5));
      if (this.highlight === 'appendix') {
        a.appendixMat.emissive.set(0x1fb5a8);
        a.appendixMat.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 5);
      }
    } else if (!this.ruptured) a.appendixMat.emissive.set(0xff2a12);

    // จุดเย็บถัดไปกะพริบ
    if (this.sutureNext >= 0) {
      const m = this.sutureMarks[this.sutureNext];
      if (m) m.scale.setScalar(1 + 0.3 * Math.sin(t * 7));
    }

    // เลือดออก
    if (a.bleeder.visible) {
      const blob = a.bleeder.userData.blob as THREE.Mesh;
      const k = this.smokeOn ? 0.6 : 1 + 0.25 * Math.sin(t * 7);
      blob.scale.set(k, 0.35 * k, k);
    } else if (this.bleedRate > 0 && this.layerMap.get('peritoneum')!.uniforms.uOpen.value > 0.006) {
      const bp = a.pools.blood_pool;
      this.setPool(bp, Math.max(bp.userData.volume as number, 0.08) + this.bleedRate * 0.011 * dt);
    }

    // ควันจากจี้ไฟฟ้า
    this.smokeT += dt;
    if (this.smokeOn && this.smokeT > 0.07) {
      this.smokeT = 0;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.0028, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      m.position.copy(a.bleeder.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.004, 0.002, (Math.random() - 0.5) * 0.004));
      this.root.add(m);
      this.smoke.push({ m, life: 0 });
    }
    this.smoke = this.smoke.filter((s) => {
      s.life += dt;
      s.m.position.y += dt * 0.03;
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
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Line).isLine) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      }
    });
  }
}
