import * as THREE from 'three';
import type { CaseDef, StepDef, ToolId } from '../types';
import type { SceneManager } from '../core/SceneManager';
import type { InputManager } from '../core/InputManager';
import type { SurgeryScene, PickResult } from '../core/SurgeryScene';
import type { VitalsSim, VitalsAlert } from '../core/VitalsSim';
import type { Session } from '../core/Session';
import type { VitalsMonitor } from '../ui/Monitor';
import { StepEngine } from '../core/StepEngine';
import { ToolSystem } from '../core/ToolSystem';
import { fmtTime } from '../core/Scoring';
import { sfx } from '../core/Audio';
import { SurgeryHUD } from '../ui/SurgeryHUD';
import { askChoice, h, modal } from '../ui/dom';
import { BASIC_TOOLS, SPECIAL_TOOLS, TOOL_NAMES } from '../procedural/tools';
import { playMinigame } from '../ui/minigames';

/** เครื่องมือในถาด: ชุดพื้นฐาน + เครื่องมือเฉพาะที่เคสนี้ใช้ */
export function caseTools(c: CaseDef): ToolId[] {
  const used = new Set<ToolId>();
  const walk = (steps: StepDef[]) => {
    for (const st of steps) {
      if (st.tool) used.add(st.tool);
      for (const m of st.mistakes ?? []) {
        if (m.tool) used.add(m.tool);
        if (m.bleed) walk(m.bleed.fix);
      }
    }
  };
  walk(c.surgery.steps);
  for (const ev of c.events ?? []) walk(ev.steps ?? []);
  return [...BASIC_TOOLS, ...SPECIAL_TOOLS.filter((t) => used.has(t))];
}

const TARGET_NAMES: Record<string, string> = {
  skin: 'ผิวหนัง',
  fat: 'ชั้นไขมันใต้ผิวหนัง',
  muscle: 'กล้ามเนื้อหน้าท้อง',
  peritoneum: 'เยื่อบุช่องท้อง',
  cecum: 'ลำไส้ใหญ่ส่วนซีคัม',
  ileum: 'ลำไส้เล็กส่วนปลาย (ไอเลียม)',
  bowel_loops: 'ขดลำไส้เล็ก',
  appendix: 'ไส้ติ่ง',
  appendix_base: 'โคนไส้ติ่ง',
  mesoappendix: 'เยื่อแขวนไส้ติ่ง',
  appendicular_artery: 'หลอดเลือดที่เลี้ยงไส้ติ่ง',
  cavity: 'ผนังช่องท้องด้านหลัง',
};

const ALERT_TEXT: Record<VitalsAlert, [string, string]> = {
  tachycardia: [
    'ชีพจรเร็วขึ้นแล้วนะหมอ!',
    'เมื่อเสียเลือด ปริมาตรเลือดในร่างกายลดลง หัวใจจึงเต้นเร็วขึ้นเพื่อชดเชย ให้เลือดยังไปเลี้ยงสมองและอวัยวะสำคัญได้เพียงพอ',
  ],
  hypotension: [
    'ความดันลดลงนะหมอ! ต้องหยุดเลือดให้เร็วที่สุด',
    'ความดันเลือดขึ้นกับปริมาตรเลือดและแรงบีบตัวของหัวใจ เมื่อเลือดหายไปมาก หัวใจบีบเร็วแค่ไหนก็ชดเชยไม่ทัน ความดันจึงตก',
  ],
  desaturation: [
    'ออกซิเจนในเลือดเริ่มลดลง',
    'ฮีโมโกลบินในเม็ดเลือดแดงเป็นตัวขนส่งออกซิเจน เมื่อเสียเลือดมาก เลือดจึงขนออกซิเจนไปเลี้ยงเนื้อเยื่อได้น้อยลง',
  ],
  recovering: [
    'สัญญาณชีพเริ่มดีขึ้นแล้ว',
    'เมื่อต้นเหตุของการอักเสบถูกกำจัดออก ร่างกายหลั่งสารกระตุ้นการอักเสบน้อยลง ชีพจรจึงค่อย ๆ ช้าลงและไข้เริ่มลด',
  ],
  transfusion: [
    'เสียเลือดมาก! ให้เลือดทดแทน 1 ยูนิตแล้ว',
    'การให้เลือดต้องเลือกหมู่เลือดที่เข้ากันได้ ถ้าให้ผิดหมู่ แอนติบอดีในเลือดผู้รับจะจับกับแอนติเจนบนเม็ดเลือดแดงที่ได้รับ ทำให้เลือดจับกลุ่ม (ด่าน 4)',
  ],
};

interface Bleed {
  rate: number;
  stopOn: string;
}

/** ห้องผ่าตัด: เชื่อม StepEngine + ฉาก 3 มิติ + เครื่องมือ + สัญญาณชีพ + HUD */
export async function runSurgery(opts: {
  sm: SceneManager;
  input: InputManager;
  scene: SurgeryScene;
  monitor: VitalsMonitor;
  vitals: VitalsSim;
  caseDef: CaseDef;
  session: Session;
  sound: { on: boolean };
}): Promise<void> {
  const { sm, input, scene, monitor, vitals, caseDef, session: s, sound } = opts;
  const diff = s.difficulty;

  // แทรกขั้นตอนจากเหตุการณ์ (เช่น ไส้ติ่งแตกระหว่างรอ)
  const steps: StepDef[] = caseDef.surgery.steps.map((x) => structuredClone(x));
  if (s.ruptured) {
    for (const ev of caseDef.events ?? []) {
      if (ev.id !== 'rupture' || !ev.steps) continue;
      const at = steps.findIndex((x) => x.id === ev.insertAfter);
      steps.splice(at < 0 ? steps.length : at + 1, 0, ...ev.steps);
      for (const fx of ev.sceneEffects ?? []) scene.effect(fx);
    }
  }

  const trayTools = caseTools(caseDef);
  const hud = new SurgeryHUD(monitor.el, diff === 'easy', sound.on, trayTools);
  // หุ่นจำลองกายวิภาคไม่มีสัญญาณชีพ — ซ่อนจอมอนิเตอร์
  const lab = caseDef.mode === 'anatomy';
  monitor.el.style.display = lab ? 'none' : '';
  const tools = new ToolSystem(sm.scene);
  tools.setScale(scene.toolScale ?? 0.62);
  const ray = new THREE.Raycaster();
  let paused = false;
  let elapsed = 0;
  let overWarned = false;
  let hintLevel = 0;
  let hit: PickResult = { targetId: null, point: null, uv: null };
  const bleeds: Bleed[] = [];
  // จอเกือบจัตุรัสถอยกล้องออกเล็กน้อย ให้เห็นทั้งหน้าต่างผ่าตัดโดยไม่ชนถาดเครื่องมือ
  const aspect = window.innerWidth / window.innerHeight;
  let zoom = aspect >= 1 ? THREE.MathUtils.clamp(1.78 / aspect, 1, 1.4) : 1;
  const unit = scene.unit ?? 1;
  const adjust = (p: { pos: THREE.Vector3; target: THREE.Vector3 }) => {
    if (window.innerWidth < window.innerHeight) {
      // จอแนวตั้ง: ถาดเครื่องมืออยู่ด้านล่าง จึงจัดแผลไว้กลางจอค่อนขึ้นบน
      const shift = new THREE.Vector3(-0.038, 0, 0.03).multiplyScalar(unit);
      p.pos.add(shift);
      p.target.add(shift);
    }
    return p;
  };
  let base = adjust(scene.fieldPose());
  scene.onPose = (p) => {
    base = adjust({ pos: p.pos.clone(), target: p.target.clone() });
    zoom = 1;
    void sm.flyTo(base, 1.2);
  };

  const applyZoom = () => {
    const pos = base.target.clone().add(base.pos.clone().sub(base.target).multiplyScalar(zoom));
    sm.setPose({ pos, target: base.target });
  };

  const pause = async <T,>(p: () => Promise<T>): Promise<T> => {
    paused = true;
    input.release();
    engine.enabled = false;
    try {
      return await p();
    } finally {
      paused = false;
      engine.enabled = true;
    }
  };

  const runEffects = (list: string[] | string | undefined) => {
    for (const fx of typeof list === 'string' ? [list] : list ?? []) {
      const [cmd, a, b] = fx.split(':');
      if (cmd === 'recover') vitals.recovery = Number(a ?? 1) || 1;
      else if (cmd === 'scope') hud.setScope(a !== 'off');
      else if (cmd === 'base') vitals.setBase({ [a]: a === 'BP' ? b : Number(b) });
      else if (cmd === 'stopbleed') {
        bleeds.length = 0;
        refreshBleeding();
      } else scene.effect(fx);
    }
  };

  const refreshBleeding = () => {
    vitals.bleedRate = bleeds.reduce((a, b) => a + b.rate, 0);
    scene.setBleeding(vitals.bleedRate);
  };

  const presentStep = (step: StepDef, index: number, total: number) => {
    const reveal = diff !== 'challenge' || hintLevel >= 2;
    let text = step.say;
    if (!reveal) text = hintLevel === 1 && step.hint ? `คำใบ้: ${step.hint}` : 'ขั้นต่อไปต้องทำอะไร? เลือกเครื่องมือแล้วลงมือได้เลย (กด "ขอคำใบ้" ได้)';
    const showTool = (diff === 'easy' || hintLevel >= 2) && step.tool ? step.tool : null;
    hud.setStep(index, total, text, showTool);
    const lit = diff === 'easy' || hintLevel >= 2;
    const tgt = step.target ?? step.targets?.[0] ?? null;
    scene.setHighlight(lit && step.action !== 'suture' && step.action !== 'trace' ? tgt : null);
  };

  const engine = new StepEngine(steps, scene, {
    stepStart(step, index, total) {
      hintLevel = 0;
      runEffects(step.onStart);
      presentStep(step, index, total);
      scene.showGuide(step.action === 'trace' && step.tool === 'marker' ? step.path ?? null : null);
      if (step.bleed) {
        bleeds.push({ rate: step.bleed, stopOn: step.id });
        refreshBleeding();
      }
      if (diff === 'easy' && step.tool && tools.held !== step.tool)
        hud.say('nurse', `ส่ง${TOOL_NAMES[step.tool]}ให้ค่ะหมอ (เลือกจากถาดด้านขวา)`);
    },
    stepComplete(step, info) {
      sfx.good();
      runEffects(step.onSuccess);
      for (let i = bleeds.length - 1; i >= 0; i--) if (bleeds[i].stopOn === step.id) bleeds.splice(i, 1);
      refreshBleeding();
      if (info.accuracy !== undefined && step.tool === 'scalpel') {
        s.traceAccuracy = info.accuracy;
        hud.say('nurse', `แนวกรีดแม่นยำ ${Math.round(info.accuracy * 100)}%`, 'good');
      }
      if (info.correct !== undefined) {
        s.bio(info.correct);
        if (!info.correct)
          s.mistakes.push({ phase: 'ผ่าตัด', title: `ตอบผิด: ${step.choice?.q ?? ''}`, explain: step.choice?.explain ?? '' });
      }
      if (step.learn) hud.learn('ความรู้ชีววิทยา', step.learn);
    },
    progress(p) {
      hud.setProgress(p);
      const step = engine.current;
      if (step?.action === 'sequence' && step.targets && (diff === 'easy' || hintLevel >= 2)) {
        scene.setHighlight(step.targets[Math.min(step.targets.length - 1, Math.round(p * step.targets.length))]);
      }
    },
    mistake(m, step, repeated) {
      sfx.bad();
      runEffects(m.effects);
      if (m.bleed) {
        bleeds.push({ rate: m.bleed.rate, stopOn: step.id });
        refreshBleeding();
        sfx.alarm();
      }
      if (repeated) {
        hud.say('attending', 'ระวัง! ผิดซ้ำจุดเดิม — ' + m.explain.slice(0, 60) + '…', 'bad');
        return;
      }
      s.surgeryPenalty += m.penalty;
      if (m.vitals?.bloodLoss) vitals.bloodLoss += m.vitals.bloodLoss;
      if (m.vitals?.organDamage) vitals.organDamage += m.vitals.organDamage;
      if (m.vitals?.infectionRisk) {
        vitals.infectionRisk += m.vitals.infectionRisk;
        s.infectionMistake = true;
      }
      const title = m.bleed ? 'เลือดออก!' : 'ผิดพลาด';
      s.mistakes.push({ phase: 'ผ่าตัด', title: `ขั้น “${step.say.split(' — ')[0].split(' (')[0]}”`, explain: m.explain });
      const fix = m.bleed?.fix;
      void pause(() =>
        modal({ title, tone: 'bad', speaker: 'อาจารย์หมอ', body: m.explain, buttons: [{ label: 'เข้าใจแล้ว', value: 1, primary: true }] }),
      ).then(() => {
        if (fix?.length) engine.insertNow(fix);
      });
    },
    wrongTool(tool, step, first) {
      if (first) s.surgeryPenalty += 1;
      const tip = diff === 'easy' && step.tool ? ` ขั้นนี้ใช้${TOOL_NAMES[step.tool]}ค่ะ` : ' ลองคิดว่าขั้นนี้ต้องทำอะไรกับเนื้อเยื่อ';
      hud.say('nurse', `${TOOL_NAMES[tool]}ยังไม่เหมาะกับขั้นนี้ค่ะหมอ${tip}`, 'warn');
      sfx.bad();
    },
    wrongTarget(target) {
      const name = target ? TARGET_NAMES[target] : null;
      hud.say('attending', name ? `นั่นคือ${name} ยังไม่ใช่ตำแหน่งที่ต้องการ` : 'ยังไม่ใช่ตำแหน่งนั้น ลองดูให้ดีอีกครั้ง', 'warn');
    },
    info(msg, who) {
      hud.say(who, msg);
    },
    asepsis(msg) {
      vitals.infectionRisk += 8;
      s.infectionMistake = true;
      s.mistakes.push({ phase: 'ผ่าตัด', title: 'หลักปลอดเชื้อ', explain: msg });
      hud.say('nurse', msg, 'warn');
    },
    choice(c) {
      return pause(() => askChoice({ title: 'ตัดสินใจระหว่างผ่าตัด', speaker: 'อาจารย์หมอ', ...c }));
    },
    minigame(m) {
      return pause(() => playMinigame(m));
    },
    finished() {
      finish();
    },
  });

  if (import.meta.env.DEV) Object.assign((window as unknown as { __bs: object }).__bs, { engine, trayTools, hud });

  // ---------- อินพุต ----------
  const updateHit = () => {
    if (!input.active) {
      hit = { targetId: null, point: null, uv: null };
      return;
    }
    ray.setFromCamera(input.ndc, sm.camera);
    hit = scene.pick(ray);
  };
  const holdTool = (id: ToolId | null) => {
    tools.pick(id);
    hud.setHeld(id);
    if (id) sfx.click();
  };
  hud.onTool = holdTool;
  hud.onSound = (on) => {
    sound.on = on;
    sfx.enabled = on;
  };
  hud.onZoom = (dir) => {
    zoom = THREE.MathUtils.clamp(zoom + dir * 0.12, 0.6, 1.4);
    applyZoom();
  };
  hud.onHint = () => {
    const step = engine.current;
    if (!step || paused) return;
    if (hintLevel === 0) {
      hintLevel = step.hint ? 1 : 2;
      s.hintPenalty += 1;
      if (step.hint) hud.say('attending', `ลองคิดดู: ${step.hint}`);
    } else if (hintLevel === 1) {
      hintLevel = 2;
      s.hintPenalty += 1;
    } else {
      hud.say('attending', step.say);
      return;
    }
    if (hintLevel >= 2) hud.say('attending', `${step.say}${step.tool ? ` (ใช้${TOOL_NAMES[step.tool]})` : ''}`);
    presentStep(step, engine.index, engine.total);
  };
  input.onDown = () => {
    if (paused) return;
    sfx.unlock();
    updateHit();
    if (tools.held) scene.touch?.(hit.targetId);
    engine.pointerDown(hit, ray, tools.held);
  };
  input.onMove = () => {
    if (paused) return;
    updateHit();
    engine.pointerMove(hit, ray, tools.held, input.down);
  };
  input.onUp = () => {
    if (paused) return;
    updateHit();
    engine.pointerUp(hit, ray, tools.held);
  };
  input.onCancel = () => holdTool(null);
  input.onWheel = (dy) => hud.onZoom?.(dy > 0 ? 1 : -1);
  const onKey = (e: KeyboardEvent) => {
    if (paused || document.querySelector('.modal-back')) return;
    if (e.key === 'Escape') holdTool(null);
    else if (e.key === 'h' || e.key === 'H' || e.key === 'ห') hud.onHint?.();
    else if (e.key === 'l' || e.key === 'L' || e.key === 'ส') (hud.el.querySelector('.hud-bar .btn:nth-child(3)') as HTMLButtonElement)?.click();
    else {
      const idx = e.key === '0' ? 9 : e.key === '-' ? 10 : Number(e.key) - 1;
      if (idx >= 0 && idx < trayTools.length && /^[0-9-]$/.test(e.key)) holdTool(trayTools[idx]);
    }
  };
  window.addEventListener('keydown', onKey);

  // ---------- เข้าห้องผ่าตัด ----------
  await sm.flyTo({ pos: base.target.clone().add(base.pos.clone().sub(base.target).multiplyScalar(zoom)), target: base.target }, 1.6);
  vitals.underGA = !lab && caseDef.surgery.anesthesia !== 'local';
  await pause(() =>
    modal({
      title: caseDef.mode === 'tutorial' ? 'ห้องฝึก' : lab ? 'ห้องปฏิบัติการกายวิภาค' : 'ห้องผ่าตัด',
      speaker: caseDef.mode === 'tutorial' || lab ? 'อาจารย์หมอ' : 'วิสัญญีแพทย์',
      body: h(
        'div',
        {},
        h('p', {}, caseDef.mode === 'tutorial' ? 'วันนี้ฝึกบนแผ่นฝึกก่อน ทำตามคำสั่งด้านซ้ายบนทีละขั้น' : lab ? 'วันนี้เราผ่าหุ่นจำลองกายวิภาคเพื่อดูโครงสร้างของระบบนี้ เปิดทีละชั้นแล้วระบุอวัยวะตามคำสั่ง — ไม่มีผู้ป่วยจริง ไม่ต้องรีบ ค่อย ๆ สังเกตตำแหน่งและรูปร่างของแต่ละอวัยวะ' : caseDef.surgery.anesthesia === 'local' ? 'ผู้ป่วยรู้สึกตัวดี จะได้ยาชาเฉพาะที่ อธิบายให้ผู้ป่วยทราบก่อนทุกขั้นนะครับหมอ' : 'ผู้ป่วยหลับดีแล้วครับหมอ สัญญาณชีพคงที่ เริ่มผ่าตัดได้เลย'),
        h(
          'ul',
          { class: 'howto' },
          h('li', {}, 'เลือกเครื่องมือจากถาดด้านขวา (หรือกดปุ่มตัวเลข 1–9, 0, -)'),
          h('li', {}, 'คลิก / แตะ / ลาก บนแผลตามคำสั่ง — คลิกขวาหรือกด Esc เพื่อวางเครื่องมือ'),
          lab ? h('li', {}, 'กด L เพื่อเปิด/ปิดป้ายชื่อ อวัยวะที่ระบุแล้วจะมีป้ายชื่อติดไว้') : h('li', {}, 'ดูจอสัญญาณชีพด้านขวาบน ถ้าเลือดออกต้องรีบแก้ไข'),
          h('li', {}, 'ใช้ล้อเมาส์หรือปุ่ม ＋/－ เพื่อซูม'),
        ),
      ),
      buttons: [{ label: caseDef.mode === 'tutorial' ? 'เริ่มฝึก' : lab ? 'เริ่มผ่า' : 'เริ่มผ่าตัด', value: 1, primary: true }],
    }),
  );

  let finish: () => void = () => {};
  const done = new Promise<void>((r) => (finish = r));

  const stopUpdater = sm.addUpdater((dt, t) => {
    if (!paused) {
      elapsed += dt;
      vitals.update(dt);
      const vd = vitals.display();
      scene.setPhysiology?.({ hr: Number(vd.HR) || 0, rr: Number(vd.RR) || 0, live: caseDef.mode !== 'anatomy' && caseDef.mode !== 'tutorial' });
      engine.update(dt, hit, tools.held, input.down);
      const limit = caseDef.surgery.timeLimitSec;
      hud.setTimer(`${fmtTime(elapsed)} / ${fmtTime(limit)}`, elapsed > limit);
      if (elapsed > limit && !overWarned) {
        overWarned = true;
        vitals.infectionRisk += 5;
        hud.say('anesth', 'ผ่าตัดนานเกินกำหนดแล้ว ผู้ป่วยได้รับยาสลบนานขึ้นและเสี่ยงติดเชื้อมากขึ้น', 'warn');
      }
      for (const a of vitals.takeAlerts()) {
        const [head, why] = ALERT_TEXT[a];
        hud.say('anesth', head, a === 'recovering' ? 'good' : 'bad');
        hud.learn(head, why, 'anesth');
        if (a !== 'recovering') sfx.alarm();
      }
    }
    tools.update(dt, hit.point, input.down && !paused, t);
    scene.update(dt, t, sm.camera);
    hud.updateLabels(scene.labels(), sm.camera);
  });

  if (caseDef.surgery.initialBleed) {
    bleeds.push({ rate: caseDef.surgery.initialBleed.rate, stopOn: caseDef.surgery.initialBleed.stopOn });
    refreshBleeding();
  }
  engine.start();
  await done;

  // ---------- จบการผ่าตัด ----------
  stopUpdater();
  window.removeEventListener('keydown', onKey);
  input.onDown = input.onMove = input.onUp = input.onCancel = undefined;
  input.onWheel = undefined;
  holdTool(null);
  tools.dispose();
  s.surgeryTimeSec = elapsed;
  s.bloodLoss = vitals.bloodLoss;
  s.transfused = vitals.transfusedMl;
  s.infectionRisk = vitals.infectionRisk + (s.ruptured ? 20 : 0);
  s.organDamage = vitals.organDamage;
  vitals.underGA = false;
  sfx.good();
  await modal({
    title: caseDef.mode === 'tutorial' ? 'ฝึกครบทุกขั้นแล้ว!' : lab ? 'สำรวจครบทุกอวัยวะแล้ว!' : 'ผ่าตัดเสร็จสมบูรณ์!',
    tone: 'good',
    speaker: 'อาจารย์หมอ',
    body:
      caseDef.mode === 'tutorial' || lab
        ? `ใช้เวลา ${fmtTime(elapsed)} — ไปตอบคำถามทบทวนกัน`
        : `ใช้เวลา ${fmtTime(elapsed)} • เสียเลือดประมาณ ${Math.round(vitals.bloodLoss)} มล. — ไปดูอาการผู้ป่วยหลังผ่าตัดกัน`,
    buttons: [{ label: caseDef.mode === 'tutorial' || lab ? 'ไปต่อ' : 'ไปหอผู้ป่วย', value: 1, primary: true }],
  });
  monitor.el.style.display = '';
  hud.destroy();
}
