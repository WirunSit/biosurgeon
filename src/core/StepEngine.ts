import * as THREE from 'three';
import type { ChoiceDef, MinigameDef, MistakeDef, StepDef, ToolId } from '../types';
import { TraceTracker } from './IncisionSystem';
import type { PickResult, SurgeryScene } from './SurgeryScene';

export interface EngineHooks {
  stepStart(step: StepDef, index: number, total: number): void;
  stepComplete(step: StepDef, info: { accuracy?: number; correct?: boolean }): void;
  progress(p: number): void;
  mistake(m: MistakeDef, step: StepDef, repeated: boolean): void;
  wrongTool(tool: ToolId, step: StepDef, first: boolean): void;
  wrongTarget(target: string | null, step: StepDef): void;
  info(msg: string, who: 'nurse' | 'attending'): void;
  asepsis(msg: string): void;
  choice(c: ChoiceDef): Promise<boolean>;
  minigame(m: MinigameDef): Promise<boolean>;
  finished(): void;
}

interface StepState {
  tracker: TraceTracker | null;
  lastUv: THREE.Vector2 | null;
  holding: boolean;
  holdT: number;
  dragStart: THREE.Vector2 | null;
  seqIdx: number;
  sutPts: THREE.Vector2[];
  sutIdx: number;
  scrubbing: boolean;
  scrubFirst: boolean;
  angle: number;
  rotStart: THREE.Vector2 | null;
  rotBase: number;
  scrubLast: THREE.Vector2 | null;
}

const freshState = (): StepState => ({
  tracker: null,
  lastUv: null,
  holding: false,
  holdT: 0,
  dragStart: null,
  seqIdx: 0,
  sutPts: [],
  sutIdx: 0,
  scrubbing: false,
  scrubFirst: true,
  angle: 0,
  rotStart: null,
  rotBase: 0,
  scrubLast: null,
});

/**
 * Step Engine (แผนข้อ 3.4) — อ่านขั้นตอนจาก JSON แล้วตรวจเงื่อนไขของแต่ละการกระทำ
 * ไม่รู้จักอวัยวะใด ๆ โดยตรง ทุกอย่างผ่าน SurgeryScene จึงใช้ซ้ำกับฉากอื่นได้
 */
export class StepEngine {
  private steps: StepDef[];
  private i = -1;
  private st: StepState = freshState();
  private fired = new Set<string>();
  private stepStartedAt = 0;
  enabled = true;

  constructor(
    steps: StepDef[],
    private scene: SurgeryScene,
    private hooks: EngineHooks,
  ) {
    this.steps = steps.map((s) => structuredClone(s));
  }

  /** ระยะยอมรับปรับตามสเกลฉาก (ผ่าตัดตาเล็กกว่าช่องท้องหลายเท่า) */
  private get u(): number {
    return this.scene.unit ?? 1;
  }

  get current(): StepDef | null {
    return this.steps[this.i] ?? null;
  }
  get index(): number {
    return this.i;
  }
  get total(): number {
    return this.steps.length;
  }

  start(): void {
    this.i = 0;
    this.startStep();
  }

  /** แทรกขั้นตอนก่อนขั้นปัจจุบัน (เช่น ต้องดูดเลือดก่อนเมื่อทำหลอดเลือดขาด) */
  insertNow(steps: StepDef[]): void {
    this.cleanup();
    this.steps.splice(this.i, 0, ...steps.map((s) => structuredClone(s)));
    this.startStep();
  }

  insertAfter(id: string, steps: StepDef[]): void {
    const idx = this.steps.findIndex((s) => s.id === id);
    const at = idx < 0 ? this.steps.length : idx + 1;
    this.steps.splice(at, 0, ...steps.map((s) => structuredClone(s)));
  }

  pointerDown(hit: PickResult, ray: THREE.Raycaster, tool: ToolId | null): void {
    const step = this.current;
    if (!step || !this.enabled || step.action === 'choice' || step.action === 'minigame') return;
    const onField = hit.targetId !== null && hit.targetId !== 'drape';
    if (!tool) {
      if (onField) this.hooks.info('หยิบเครื่องมือจากถาดด้านขวาก่อนนะคะหมอ', 'nurse');
      return;
    }
    if (!onField) return;
    if (tool !== step.tool) {
      // เพิ่งขึ้นขั้นใหม่ ผู้เล่นอาจยังลากเครื่องมือเดิมค้างอยู่ — ไม่นับเป็นความผิด
      if (performance.now() - this.stepStartedAt < 1500) return;
      const m = this.findMistake(step, tool, hit);
      if (m) this.fireMistake(step, m);
      else {
        const key = `${step.id}:${tool}`;
        this.hooks.wrongTool(tool, step, !this.fired.has(key));
        this.fired.add(key);
      }
      return;
    }

    const st = this.st;
    switch (step.action) {
      case 'scrub':
        st.scrubbing = true;
        this.doScrub(step, hit, ray);
        break;
      case 'trace': {
        if (!hit.uv || !st.tracker) return;
        if (st.tracker.begin(hit.uv)) {
          st.lastUv = hit.uv.clone();
        } else {
          this.hooks.info('เริ่มลากจากปลายเส้นด้านใดด้านหนึ่ง แล้วลากไปให้สุดอีกปลาย', 'nurse');
        }
        break;
      }
      case 'click':
        if (this.scene.matches(step.target!, hit)) this.complete({});
        else this.missTarget(step, tool, hit);
        break;
      case 'hold':
        if (this.scene.matches(step.target!, hit)) {
          st.holding = true;
          st.holdT = 0;
          this.scene.holdFx(step.target!, true);
        } else this.missTarget(step, tool, hit);
        break;
      case 'drag':
        if (this.scene.matches(step.target!, hit) && hit.uv) st.dragStart = hit.uv.clone();
        else this.missTarget(step, tool, hit);
        break;
      case 'rotate':
        if (this.scene.matches(step.target!, hit) && hit.uv) {
          st.rotStart = hit.uv.clone();
          st.rotBase = st.angle;
        } else this.missTarget(step, tool, hit);
        break;
      case 'sequence': {
        const targets = step.targets ?? [];
        const want = targets[st.seqIdx];
        if (want && this.scene.matches(want, hit)) {
          st.seqIdx++;
          this.scene.effect(`label:${want}`);
          this.hooks.progress(st.seqIdx / targets.length);
          if (st.seqIdx >= targets.length) this.complete({});
          else this.hooks.info('ใช่แล้ว! ต่อไปหาเป้าหมายถัดไป', 'attending');
        } else this.missTarget(step, tool, hit);
        break;
      }
      case 'suture': {
        const uv = this.scene.layerUV(step.layer!, ray);
        const p = st.sutPts[st.sutIdx];
        if (uv && p && uv.distanceTo(p) < 0.011 * this.u) {
          st.sutIdx++;
          if (st.sutIdx % 2 === 0) {
            const frac = st.sutIdx / st.sutPts.length;
            this.scene.placeStitch(step.layer!, st.sutPts[st.sutIdx - 2], st.sutPts[st.sutIdx - 1], frac);
          }
          this.hooks.progress(st.sutIdx / st.sutPts.length);
          if (st.sutIdx >= st.sutPts.length) {
            this.scene.showSuturePoints(step.layer!, [], 0);
            this.complete({});
          } else this.scene.showSuturePoints(step.layer!, st.sutPts, st.sutIdx);
        } else {
          this.hooks.info('แทงเข็มที่จุดวงกลมที่กะพริบ สลับซ้าย-ขวาของแผล', 'nurse');
        }
        break;
      }
    }
  }

  pointerMove(hit: PickResult, ray: THREE.Raycaster, tool: ToolId | null, down: boolean): void {
    const step = this.current;
    if (!step || !this.enabled || !down || tool !== step.tool) return;
    const st = this.st;
    switch (step.action) {
      case 'scrub':
        if (st.scrubbing) {
          // เมาส์ที่ลากเร็วส่งเหตุการณ์ห่างกัน: เติมจุดระหว่างทางให้ทาน้ำยาต่อเนื่อง
          if (hit.uv && st.scrubLast && (step.target === 'zone' || step.target === 'zone_rlq')) {
            const n = Math.min(20, Math.floor(hit.uv.distanceTo(st.scrubLast) / (0.005 * this.u)));
            for (let i = 1; i < n; i++) this.doScrub(step, { ...hit, uv: st.scrubLast.clone().lerp(hit.uv, i / n) }, ray);
          }
          this.doScrub(step, hit, ray);
        }
        break;
      case 'trace':
        if (st.tracker?.started && hit.uv && st.lastUv) {
          const n = Math.min(20, Math.floor(hit.uv.distanceTo(st.lastUv) / (0.004 * this.u)));
          for (let i = 1; i < n; i++) st.tracker.add(st.lastUv.clone().lerp(hit.uv, i / n));
          st.tracker.add(hit.uv);
          this.scene.traceDraw(tool, st.lastUv, hit.uv, step.layer);
          st.lastUv.copy(hit.uv);
          this.hooks.progress(st.tracker.progress);
        }
        break;
      case 'drag':
        if (st.dragStart && hit.uv) {
          const delta = hit.uv.clone().sub(st.dragStart);
          const p = Math.min(1, delta.length() / (step.minDrag ?? 0.02 * this.u));
          this.scene.dragUpdate(step.target!, delta, p);
          this.hooks.progress(p);
        }
        break;
      case 'rotate':
        if (st.rotStart && hit.uv) {
          // ลากไปทางขวา 3 ซม. (ตามสเกลฉาก) = หมุน 120°
          st.angle = st.rotBase + ((hit.uv.x - st.rotStart.x) / (0.03 * this.u)) * 120;
          this.scene.rotateUpdate?.(step.target!, st.angle);
          const goal = step.angle ?? 90;
          this.hooks.progress(Math.max(0, 1 - Math.abs(goal - st.angle) / Math.max(30, Math.abs(goal))));
        }
        break;
    }
  }

  pointerUp(hit: PickResult, ray: THREE.Raycaster, tool: ToolId | null): void {
    const step = this.current;
    if (!step || !this.enabled) return;
    const st = this.st;
    switch (step.action) {
      case 'scrub':
        st.scrubbing = false;
        st.scrubLast = null;
        break;
      case 'trace': {
        const tr = st.tracker;
        if (!tr?.started) return;
        tr.started = false;
        const acc = tr.accuracy;
        if (tr.progress >= 0.88) {
          if (acc >= (step.minAccuracy ?? 0.5)) {
            this.complete({ accuracy: acc });
          } else {
            this.hooks.info(`แนวเบี้ยวออกนอกเส้นมากเกินไป (แม่นยำ ${Math.round(acc * 100)}%) ลองลากใหม่ช้า ๆ`, 'nurse');
            this.scene.traceReset(tool ?? step.tool!);
            this.hooks.progress(0);
          }
        } else {
          this.hooks.info('ลากให้สุดเส้นในครั้งเดียวนะคะ ลองใหม่อีกครั้ง', 'nurse');
          this.scene.traceReset(tool ?? step.tool!);
          this.hooks.progress(0);
        }
        break;
      }
      case 'drag':
        if (st.dragStart) {
          const ok = hit.uv ? hit.uv.distanceTo(st.dragStart) >= (step.minDrag ?? 0.02 * this.u) : false;
          st.dragStart = null;
          this.scene.dragEnd(step.target!, ok);
          if (ok) this.complete({});
          else this.hooks.progress(0);
        }
        break;
      case 'rotate':
        if (st.rotStart) {
          st.rotStart = null;
          const goal = step.angle ?? 90;
          const tol = step.angleTol ?? 25;
          if (Math.abs(goal - st.angle) <= tol) this.complete({});
          else if (Math.sign(st.angle) !== Math.sign(goal) && Math.abs(st.angle) > tol)
            this.hooks.info('หมุนผิดทิศ! ลองหมุนกลับอีกทาง', 'attending');
          else this.hooks.info(`หมุนแล้ว ${Math.round(st.angle)}° — ยังไม่ถึงตำแหน่งที่ถูกต้อง ลากต่อได้`, 'nurse');
        }
        break;
      case 'hold':
        if (st.holding) {
          st.holding = false;
          st.holdT = 0;
          this.scene.holdFx(step.target!, false);
          this.hooks.progress(0);
        }
        break;
    }
    void ray;
  }

  update(dt: number, hit: PickResult, tool: ToolId | null, down: boolean): void {
    const step = this.current;
    if (!step || !this.enabled) return;
    const st = this.st;
    if (step.action === 'hold' && st.holding) {
      if (down && tool === step.tool && this.scene.matches(step.target!, hit)) {
        st.holdT += dt;
        const p = st.holdT / (step.holdSec ?? 1);
        this.hooks.progress(Math.min(1, p));
        if (p >= 1) {
          this.scene.holdFx(step.target!, false);
          this.complete({});
        }
      } else {
        st.holding = false;
        st.holdT = 0;
        this.scene.holdFx(step.target!, false);
        this.hooks.progress(0);
      }
    }
  }

  private doScrub(step: StepDef, hit: PickResult, ray: THREE.Raycaster): void {
    const st = this.st;
    if (!st.scrubbing) return;
    const res = this.scene.scrub(step.target!, hit, ray, st.scrubFirst);
    st.scrubLast = res.inside && hit.uv ? hit.uv.clone() : null;
    if (!res.inside) return;
    st.scrubFirst = false;
    if (res.warn) this.hooks.asepsis(res.warn);
    this.hooks.progress(Math.min(1, res.progress / (step.coverage ?? 0.92)));
    if (res.progress >= (step.coverage ?? 0.92)) {
      st.scrubbing = false;
      this.complete({});
    }
  }

  private missTarget(step: StepDef, tool: ToolId, hit: PickResult): void {
    const m = this.findMistake(step, tool, hit);
    if (m) this.fireMistake(step, m);
    else this.hooks.wrongTarget(hit.targetId, step);
  }

  private findMistake(step: StepDef, tool: ToolId, hit: PickResult): MistakeDef | null {
    for (const m of step.mistakes ?? []) {
      const toolOk = m.tool ? m.tool === tool : tool === step.tool;
      const targetOk = m.target ? this.scene.matches(m.target, hit) : true;
      if (toolOk && targetOk) return m;
    }
    return null;
  }

  private fireMistake(step: StepDef, m: MistakeDef): void {
    const key = `${step.id}:m${(step.mistakes ?? []).indexOf(m)}`;
    const repeated = this.fired.has(key);
    this.fired.add(key);
    this.hooks.mistake(m, step, repeated);
  }

  private cleanup(): void {
    const step = this.current;
    if (!step) return;
    if (this.st.holding) this.scene.holdFx(step.target!, false);
    if (this.st.dragStart) this.scene.dragEnd(step.target!, false);
    if (step.action === 'suture') this.scene.showSuturePoints(step.layer!, [], 0);
    this.scene.setHighlight(null);
    this.scene.showGuide(null);
  }

  private complete(info: { accuracy?: number; correct?: boolean }): void {
    const step = this.current;
    if (!step) return;
    this.cleanup();
    this.st = freshState();
    this.hooks.stepComplete(step, info);
    this.i++;
    this.startStep();
  }

  private startStep(): void {
    const step = this.current;
    if (!step) {
      this.hooks.finished();
      return;
    }
    this.st = freshState();
    this.stepStartedAt = performance.now();
    this.hooks.stepStart(step, this.i, this.steps.length);
    if (step.action === 'trace' && step.path) {
      this.st.tracker = new TraceTracker(this.scene.path(step.path), 0.011 * this.u, 0.0022 * this.u);
      this.st.tracker.closed = this.scene.isClosedPath?.(step.path) ?? false;
    }
    if (step.action === 'suture' && step.layer) {
      this.st.sutPts = this.scene.suturePoints(step.layer, step.stitches ?? 2);
      this.scene.showSuturePoints(step.layer, this.st.sutPts, 0);
    }
    if (step.action === 'choice' && step.choice) {
      const idx = this.i;
      this.hooks.choice(step.choice).then((correct) => {
        if (this.i === idx) this.complete({ correct });
      });
    }
    if (step.action === 'minigame' && step.minigame) {
      const idx = this.i;
      this.hooks.minigame(step.minigame).then((correct) => {
        if (this.i === idx) this.complete({ correct: step.minigame?.bio === false ? undefined : correct });
      });
    }
  }
}
