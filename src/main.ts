import './style.css';
import * as THREE from 'three';
import type { CaseDef, CaseIndexEntry } from './types';
import { SceneManager } from './core/SceneManager';
import { InputManager } from './core/InputManager';
import { VitalsSim } from './core/VitalsSim';
import { Session } from './core/Session';
import { computeScore } from './core/Scoring';
import { loadProgress, saveProgress } from './core/Progress';
import { sfx } from './core/Audio';
import type { SurgeryScene } from './core/SurgeryScene';
import { buildRoom } from './procedural/room';
import { TOOL_NAMES } from './procedural/tools';
import { WIN, surfaceY } from './procedural/patient';
import { AbdomenRLQScene } from './scenes/AbdomenRLQ';
import { FieldScene } from './scenes/FieldScene';
import { VitalsMonitor } from './ui/Monitor';
import { runSurgery } from './game/Surgery';
import { showDebrief, showDiagnose, showInvestigate, showLobby, showPostOp, showPreOp, type LobbyChoice } from './ui/screens';
import { applyUrlSettings, loadStudent, loadTeacher, recordResult } from './core/Results';
import { askPin, showTeacher } from './ui/teacher';
import { h, modal, toast } from './ui/dom';
import { applyBodyClasses, device, deviceLabel } from './core/Device';
import { preloadModels } from './core/AssetLoader';
import { preloadCase, prefetchSystem } from './core/Preload';
import { LoadingScreen, nextPaint } from './ui/loading';
import { canFullscreen, enterFullscreen } from './ui/fullscreen';

/** ฉากผ่าตัดที่มีให้ใช้ — ไฟล์เคส JSON อ้างถึงด้วย surgery.scene ("field" = สร้างจาก surgery.field ในไฟล์เคส) */
const SCENES: Record<string, (c: CaseDef, reducedGore: boolean) => SurgeryScene> = {
  'abdomen-rlq': (_c, r) => new AbdomenRLQScene(r),
  field: (c, r) => {
    if (!c.surgery.field) throw new Error(`เคส ${c.id} ไม่มี surgery.field`);
    return new FieldScene(c.surgery.field, r);
  },
};

const BEDSIDE = { pos: new THREE.Vector3(0.95, 1.55, 1.25), target: new THREE.Vector3(-0.05, 1.0, 0.05) };

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลด ${url} ไม่สำเร็จ (${res.status})`);
  return (await res.json()) as T;
}

/** ให้ผู้เล่นบนจอสัมผัสแตะเริ่มก่อน: ขอเต็มจอได้ (ต้องมาจากการแตะ) และปลดล็อกเสียง */
function startGate(ld: LoadingScreen): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (!device.touch || params.has('autoplay') || params.has('nogate')) return Promise.resolve();
  return new Promise((resolve) => {
    const go = (full: boolean) => {
      if (full) void enterFullscreen();
      sfx.unlock();
      resolve();
    };
    const row = h('div', { class: 'row boot-go-row' });
    if (canFullscreen()) {
      row.append(
        h('button', { class: 'btn primary big boot-go', onclick: () => go(true) }, '⛶ เล่นแบบเต็มจอ'),
        h('button', { class: 'btn big', onclick: () => go(false) }, 'เล่นในหน้าต่าง'),
      );
    } else row.append(h('button', { class: 'btn primary big boot-go', onclick: () => go(false) }, 'แตะเพื่อเริ่มเล่น'));
    ld.append(row);
    if (device.kind === 'phone') ld.append(h('p', { class: 'muted small' }, 'แนะนำ: เล่นแนวนอนจะเห็นแผลผ่าตัดกว้างกว่า'));
  });
}

async function main(): Promise<void> {
  // ---------- ตรวจอุปกรณ์ + โหลดพื้นฐานก่อนเข้าเกม ----------
  applyBodyClasses();
  document.getElementById('loading')?.remove();
  const boot = new LoadingScreen('BioSurgeon', 'ศัลยแพทย์ชีววิทยา');
  boot.set(0.05, 'กำลังตรวจสอบอุปกรณ์…');
  boot.append(h('p', { class: 'device-badge' }, deviceLabel()));
  await nextPaint();
  const sm = new SceneManager(document.getElementById('gl')!);
  sm.covered = 'screen';
  const monitor = new VitalsMonitor();
  boot.set(0.2, 'กำลังสร้างห้องผ่าตัด…');
  await nextPaint();
  const room = buildRoom(sm.scene, monitor.canvas);
  const input = new InputManager(sm.canvas);
  if (import.meta.env.DEV) {
    // ตัวช่วยทดสอบอัตโนมัติ: แปลงพิกัดแผล (u, v, ความลึก) เป็นพิกัดจอ
    const toScreen = (u: number, v: number, depth = 0) => {
      const W = ((window as unknown as { __bs: { scene?: { W?: { cx: number; cz: number } } } }).__bs.scene?.W) ?? WIN;
      const x = W.cx + u;
      const z = W.cz + v;
      const p = new THREE.Vector3(x, surfaceY(x, z) - depth, z).project(sm.camera);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    };
    const worldToScreen = (p: THREE.Vector3) => {
      const q = p.clone().project(sm.camera);
      return { x: ((q.x + 1) / 2) * window.innerWidth, y: ((1 - q.y) / 2) * window.innerHeight };
    };
    (window as unknown as { __bs: unknown }).__bs = { sm, input, toScreen, worldToScreen, THREE, TOOL_NAMES };
  }
  const sound = { on: true };
  let vitals: VitalsSim | null = null;
  let inSurgery = false;

  monitor.onBeat = () => {
    if (inSurgery && sound.on && vitals) sfx.beep(vitals.display().SpO2);
  };
  let monUpload = 0;
  sm.addUpdater((dt) => {
    if (!vitals) return;
    if (!inSurgery) vitals.update(dt);
    monitor.update(dt, vitals.display());
    // จอมอนิเตอร์ในห้อง (พื้นผิว 3 มิติ) ส่งขึ้น GPU แค่ 15 ครั้ง/วินาที ก็ลื่นพอ
    monUpload += dt;
    if (monUpload >= 1 / 15) {
      monUpload = 0;
      room.monitorTexture.needsUpdate = true;
    }
  });

  boot.set(0.35, 'กำลังโหลดรายชื่อผู้ป่วย…');
  const index = await fetchJSON<CaseIndexEntry[]>('cases/index.json');
  const caseCache = new Map<string, Promise<CaseDef>>();
  const fetchCase = (id: string) => {
    if (!caseCache.has(id)) caseCache.set(id, fetchJSON<CaseDef>(`cases/${id}.json`));
    return caseCache.get(id)!;
  };
  // ตัวถอดรหัสโมเดล (Draco) โหลดครั้งแรกใช้เวลา — เตรียมด้วยโมเดลชิ้นเล็กตั้งแต่ตอนนี้
  boot.set(0.5, 'กำลังเตรียมตัวโหลดโมเดลอวัยวะ…');
  await preloadModels([`${import.meta.env.BASE_URL}models/organs/appendix.glb`]);
  boot.set(0.75, 'กำลังเตรียมกราฟิก…');
  await nextPaint();
  await sm.warmUp();
  await document.fonts?.ready.catch(() => undefined);
  boot.set(1, 'พร้อมแล้ว');
  if (import.meta.env.DEV) {
    const { autoplay, probe } = await import('./dev/autoplay');
    Object.assign((window as unknown as { __bs: object }).__bs, { autoplay, probe });
    const auto = new URLSearchParams(location.search).get('autoplay');
    if (auto) setTimeout(() => void autoplay(auto).then((r) => console.log(r)), 500);
  }
  await startGate(boot);
  await boot.close();
  // หน้าจอเมนูบังฉาก 3 มิติ: วาดช้าลงมาก (ประหยัดแบต/ลดความร้อน)
  const uiRoot = document.getElementById('ui')!;
  const syncCovered = () => {
    sm.covered = uiRoot.querySelector(':scope > .screen, :scope > .loading-screen') ? 'screen' : uiRoot.querySelector('.modal-back') ? 'modal' : null;
  };
  new MutationObserver(syncCovered).observe(uiRoot, { childList: true });
  syncCovered();

  const prog = loadProgress();
  let teacher = applyUrlSettings(loadTeacher());
  let choice: LobbyChoice | null = null;

  for (;;) {
    if (!choice) {
      sm.startIdleOrbit();
      const res = await showLobby(index, prog, teacher, loadStudent());
      if (res.kind === 'teacher') {
        if (await askPin(teacher)) await showTeacher(index, teacher, fetchCase);
        teacher = loadTeacher();
        continue;
      }
      choice = res;
      prog.settings = { difficulty: choice.difficulty, reducedGore: choice.reducedGore, sound: choice.sound };
      saveProgress(prog);
    }
    sound.on = choice.sound;
    sfx.enabled = choice.sound;

    // ---------- โหลดก่อนเข้าเคส: อวัยวะ/รูปของระบบนั้น + คอมไพล์เชดเดอร์ + โครงสร้างค้นหาการคลิก ----------
    const entry = index.find((e) => e.id === choice!.caseId);
    const ld = new LoadingScreen(entry?.systemName ?? 'กำลังเตรียมเคส', entry ? `“${entry.title}”` : '', uiRoot);
    ld.set(0.05, 'กำลังเปิดแฟ้มผู้ป่วย…');
    const c = await fetchCase(choice.caseId);
    await preloadCase(c, (p) => ld.set(0.08 + p * 0.62, 'กำลังโหลดอวัยวะและภาพผลตรวจ…'));
    const tutorial = c.mode === 'tutorial' || c.mode === 'anatomy';
    const s = new Session(c, choice.difficulty, choice.reducedGore);
    vitals = new VitalsSim(c.vitals);
    const makeScene = SCENES[c.surgery.scene];
    if (!makeScene) throw new Error(`ไม่พบฉากผ่าตัด "${c.surgery.scene}"`);
    ld.set(0.72, 'กำลังจัดห้องผ่าตัด…');
    await nextPaint();
    const scene = makeScene(c, choice.reducedGore);
    sm.scene.add(scene.root);
    if (import.meta.env.DEV) (window as unknown as { __bs: Record<string, unknown> }).__bs.scene = scene;
    await scene.ready?.();
    ld.set(0.85, 'กำลังเตรียมกราฟิกเนื้อเยื่อ…');
    await nextPaint();
    await sm.warmUp();
    await ld.close();
    prefetchSystem(index, entry, fetchCase);
    void sm.flyTo(BEDSIDE, 1.6);

    if (tutorial) {
      // ด่าน 0 และห้องปฏิบัติการกายวิภาค: ไม่มีการสืบสวน/วินิจฉัย เข้าห้องผ่าตัดเลย
      s.dxCorrect = true;
      s.evidenceScore = 1;
      s.budgetScore = 1;
      s.anesthesiaCorrect = true;
      await modal({
        title: c.title,
        speaker: 'อาจารย์หมอ',
        body: h('div', {}, h('p', {}, c.background ?? ''), h('p', { class: 'muted' }, c.chiefComplaint)),
        buttons: [{ label: c.mode === 'anatomy' ? 'เข้าห้องปฏิบัติการ' : 'เข้าห้องฝึก', value: 0, primary: true }],
      });
    } else {
      await showInvestigate(c, s, vitals);
      await showDiagnose(c, s);
      await showPreOp(c, s);
    }

    inSurgery = true;
    await runSurgery({ sm, input, scene, monitor, vitals, caseDef: c, session: s, sound });
    inSurgery = false;
    void sm.flyTo(BEDSIDE, 1.6);

    await showPostOp(c, s);
    const r = computeScore(s);
    const prev = prog.best[c.id];
    const newBest = !prev || r.total > prev.score;
    if (newBest) prog.best[c.id] = { score: r.total, stars: r.stars };
    if (c.codex && !prog.codex.some((x) => x.id === c.codex.id)) prog.codex.push(c.codex);
    saveProgress(prog);

    const student = loadStudent();
    const line = (n: string) => r.lines.find((l) => l.name === n)?.score ?? 0;
    void recordResult(
      {
        time: new Date().toISOString(),
        classCode: student.classCode || teacher.classCode,
        student: student.name || '(ไม่ระบุ)',
        caseId: c.id,
        caseTitle: c.title,
        difficulty: s.difficulty,
        total: r.total,
        stars: r.stars,
        diagnosis: line('การวินิจฉัย'),
        surgery: line('ความถูกต้องของการผ่าตัด'),
        safety: line('ความปลอดภัยของผู้ป่วย'),
        biology: line('ความรู้ชีววิทยา'),
        timeScore: line('เวลา'),
        minutes: Math.round(s.surgeryTimeSec / 6) / 10,
        bloodLoss: Math.round(s.bloodLoss),
        ruptured: s.ruptured,
        mistakes: s.mistakes.map((m) => m.title),
      },
      teacher,
    ).then((st) => {
      if (st === 'sent') toast('ส่งคะแนนให้ครูแล้ว', 'good');
      else if (st === 'failed') toast('ส่งคะแนนไม่สำเร็จ (บันทึกไว้ในเครื่องแล้ว)', 'bad');
    });

    const action = await showDebrief(c, s, r, newBest);
    scene.dispose();
    vitals = null;
    if (action === 'lobby') choice = null;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  document.querySelectorAll('.loading-screen').forEach((x) => x.remove());
  let el = document.getElementById('loading');
  if (!el) document.body.append((el = h('div', { id: 'loading' })));
  const msg = err instanceof Error ? err.message : String(err);
  el.innerHTML = `<div class="load-card"><h2>เปิดเกมไม่สำเร็จ</h2><p>${msg}</p><p>ต้องเปิดผ่านเว็บเซิร์ฟเวอร์ (เช่น <code>npm run dev</code>) ไม่ใช่ดับเบิลคลิกไฟล์ index.html</p></div>`;
});
