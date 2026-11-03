/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ตัวเล่นอัตโนมัติ (ใช้เฉพาะโหมดพัฒนา) — ตรวจว่าไฟล์เคส JSON เล่นได้ครบทุกขั้นจนจบ
 * เปิด http://localhost:5173/?autoplay=<รหัสเคส> หรือเรียก __bs.autoplay('digestive-02') ในคอนโซล
 * จะเล่นตามคำตอบที่ถูกทุกข้อ แล้วรายงานขั้นที่ติด (ถ้ามี)
 */
import type { CaseDef, ChoiceDef, MinigameDef, StepDef } from '../types';

const w = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bs = (): any => (window as any).__bs;
const tick = (n = 1, dt = 1 / 30) => {
  for (let i = 0; i < n; i++) bs().sm.step(dt);
};
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

function ptr(type: string, x: number, y: number): void {
  bs().sm.canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'mouse' }),
  );
}
type P = { x: number; y: number };
const press = (p: P) => {
  ptr('pointermove', p.x, p.y);
  ptr('pointerdown', p.x, p.y);
};
const tap = (p: P) => {
  press(p);
  ptr('pointerup', p.x, p.y);
  tick(2);
};
function dragPath(pts: P[], every = 1): void {
  press(pts[0]);
  pts.slice(1).forEach((p, i) => {
    ptr('pointermove', p.x, p.y);
    if (i % every === 0) tick(1);
  });
  const l = pts[pts.length - 1];
  ptr('pointerup', l.x, l.y);
  tick(2);
}

function anchor(id: string): P | null {
  const sc = bs().scene;
  const v = sc.anchorOf ? sc.anchorOf(id) : sc.anat?.anchors?.[id] ?? (sc.anchor ? sc.anchor(id) : null);
  if (!v) return null;
  const p: P = bs().worldToScreen(v);
  const onScreen = (q: P) => q.x > 0 && q.y > 0 && q.x < innerWidth && q.y < innerHeight;
  if (onScreen(p)) return p;
  // มุมกล้องส่องมองจากด้านข้าง: ใช้จุดกึ่งกลางวัตถุแทนจุดบนสุด
  const o = sc.objs?.get(id);
  if (o) {
    const q: P = bs().worldToScreen(o.group.getWorldPosition(new (bs().THREE.Vector3)()));
    if (onScreen(q)) return q;
  }
  return p;
}

function answersOf(c: CaseDef): Map<string, string> {
  const m = new Map<string, string>();
  const add = (q?: ChoiceDef) => q && m.set(q.q, q.choices[q.answer]);
  add(c.diagnosis?.bioQuestion);
  add(c.preOp?.anesthesia);
  add(c.preOp?.decision);
  add(c.postOp?.advice);
  c.postOp?.quiz.forEach(add);
  const walk = (steps: StepDef[]) => steps.forEach((s) => add(s.choice));
  walk(c.surgery.steps);
  (c.events ?? []).forEach((e) => walk(e.steps ?? []));
  return m;
}

function minigamesOf(c: CaseDef): Map<string, MinigameDef> {
  const m = new Map<string, MinigameDef>();
  const add = (g?: MinigameDef) => g && m.set(g.title, g);
  c.exam.forEach((e) => add(e.minigame));
  c.preOp?.minigames?.forEach(add);
  c.surgery.steps.forEach((s) => add(s.minigame));
  return m;
}

async function solveMinigame(g: MinigameDef): Promise<void> {
  const card = $('.modal.mg')!;
  switch (g.type) {
    case 'order':
      for (const it of g.items) $$('.mg-pool .chip', card).find((b) => b.textContent === it)?.click();
      $<HTMLButtonElement>('.btn.primary', card)!.click();
      break;
    case 'multi':
      g.cards.forEach((c) => c.correct && $$('.mg-card', card).find((b) => $('b', b)?.textContent === c.text)?.click());
      $<HTMLButtonElement>('.btn.primary', card)!.click();
      break;
    case 'match':
      for (const row of $$('.mg-row', card)) {
        const sel = $<HTMLSelectElement>('select', row)!;
        sel.value = g.pairs.find((p) => p.left === $('b', row)!.textContent)!.right;
        sel.dispatchEvent(new Event('change'));
      }
      $<HTMLButtonElement>('.btn.primary', card)!.click();
      break;
    case 'hotspot': {
      const box = $('.mg-hot', card)!;
      const r = box.getBoundingClientRect();
      for (const z of g.zones.filter((z) => z.correct))
        box.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + (z.x / 100) * r.width, clientY: r.top + (z.y / 100) * r.height }));
      await w(900);
      break;
    }
    case 'graph':
      $(`.mg-pt[data-i="${g.answer[0]}"]`, card)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      break;
    case 'microscope': {
      const cv = $<HTMLCanvasElement>('.mg-scope', card)! as any;
      const focus = $<HTMLInputElement>('.mg-focus', card)!;
      focus.value = String(Math.round(cv.__target));
      focus.dispatchEvent(new Event('input'));
      const r = cv.getBoundingClientRect();
      for (const f of g.find) {
        let n = 0;
        for (const c of cv.__cells) {
          if (c.kind !== f.kind || n >= f.need) continue;
          cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + (c.x / 360) * r.width, clientY: r.top + (c.y / 360) * r.height }));
          n++;
        }
      }
      await w(800);
      break;
    }
  }
  await w(60);
}

/** กดปุ่มในหน้าต่างเด้งทั้งหมดที่ค้างอยู่ (ตอบถูกทุกข้อ) */
async function drainModals(ans: Map<string, string>, games: Map<string, MinigameDef>, log: string[]): Promise<void> {
  for (let guard = 0; guard < 30; guard++) {
    await w(40);
    const modal = $('.modal-back .modal');
    if (!modal) return;
    const title = $('h2', modal)?.textContent ?? '';
    if (modal.classList.contains('mg')) {
      const g = games.get(title);
      if (!g) {
        log.push(`✘ ไม่รู้จักมินิเกม "${title}"`);
        return;
      }
      await solveMinigame(g);
      continue;
    }
    const choices = $$('.choice', modal);
    if (choices.length) {
      const q = $('.question', modal)?.textContent ?? '';
      const a = ans.get(q);
      const btn = choices.find((c) => c.lastElementChild?.textContent === a) ?? choices[0];
      if (!a) log.push(`? ไม่พบเฉลยของ "${q.slice(0, 40)}"`);
      btn.click();
      continue;
    }
    if (/ยังไม่ถูก|ผิดพลาด/.test(title)) log.push(`! ${title}: ${$('.modal-body', modal)?.textContent?.slice(0, 80)}`);
    const input = $<HTMLInputElement>('input', modal);
    if (input) return;
    ($<HTMLButtonElement>('.btn.primary', modal) ?? $<HTMLButtonElement>('.btn', modal))?.click();
  }
}

function selectTool(id: string): void {
  const name = bs().TOOL_NAMES[id];
  const btn = $$<HTMLButtonElement>('.tray .tool').find((b) => b.title.startsWith(name));
  btn?.click();
}

function performStep(step: StepDef): void {
  const sc = bs().scene;
  const unit = sc.unit ?? 1;
  const toS = (u: number, v: number, d = 0) => bs().toScreen(u, v, d);
  switch (step.action) {
    case 'scrub': {
      if (step.target === 'zone' || step.target === 'zone_rlq') {
        const cells: { x: number; y: number }[] = (sc.coverCells ?? []).map((c: any) => ({ x: c.x, y: c.y }));
        const c0 = sc.openingCenter ? sc.openingCenter() : { x: 0, y: 0 };
        cells.sort((a, b) => Math.hypot(a.x - c0.x, a.y - c0.y) - Math.hypot(b.x - c0.x, b.y - c0.y));
        dragPath([toS(c0.x, c0.y), ...cells.map((c) => toS(c.x, c.y))], 3);
      } else {
        const p = anchor(step.target!);
        if (!p) return;
        const R = 45;
        const pts: P[] = [p];
        for (let i = 0; i < 260; i++) {
          const a = i * 0.35;
          const rr = R * (0.2 + 0.8 * ((i % 30) / 30));
          pts.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr * 0.6 });
        }
        dragPath(pts, 4);
      }
      break;
    }
    case 'trace': {
      const pts: { x: number; y: number }[] = sc.path(step.path);
      const closed = sc.isClosedPath?.(step.path) ?? false;
      const dense: P[] = [];
      const src = closed ? [...pts, ...pts.slice(1, 6)] : pts;
      for (let i = 0; i < src.length - 1; i++)
        for (let k = 0; k < 4; k++) {
          const t = k / 4;
          dense.push(toS(src[i].x + (src[i + 1].x - src[i].x) * t, src[i].y + (src[i + 1].y - src[i].y) * t));
        }
      dense.push(toS(src[src.length - 1].x, src[src.length - 1].y));
      dragPath(dense, 2);
      break;
    }
    case 'click': {
      const p = anchor(step.target!);
      if (p) tap(p);
      break;
    }
    case 'hold': {
      const p = anchor(step.target!);
      if (!p) return;
      press(p);
      tick(Math.ceil(((step.holdSec ?? 1) + 0.4) * 30));
      ptr('pointerup', p.x, p.y);
      tick(2);
      break;
    }
    case 'drag': {
      const p = anchor(step.target!);
      if (!p) return;
      const dist = (step.minDrag ?? 0.02 * unit) * 1.6;
      const a = toS(0, 0);
      const b = toS(dist, -dist * 0.3);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const pts: P[] = [];
      for (let i = 0; i <= 10; i++) pts.push({ x: p.x + (dx * i) / 10, y: p.y + (dy * i) / 10 });
      dragPath(pts);
      break;
    }
    case 'rotate': {
      const p = anchor(step.target!);
      if (!p) return;
      const du = ((step.angle ?? 90) / 120) * 0.03 * unit;
      const a = toS(0, 0);
      const b = toS(du, 0);
      const pts: P[] = [];
      for (let i = 0; i <= 12; i++) pts.push({ x: p.x + ((b.x - a.x) * i) / 12, y: p.y + ((b.y - a.y) * i) / 12 });
      dragPath(pts);
      break;
    }
    case 'sequence':
      for (const t of step.targets ?? []) {
        const p = anchor(t);
        if (p) tap(p);
      }
      break;
    case 'suture': {
      for (let g = 0; g < 20 && sc.sutureNext >= 0; g++) tap(bs().worldToScreen(sc.sutureMarks[sc.sutureNext].position));
      break;
    }
  }
}

/** stopAt = หยุดก่อนทำขั้นที่ระบุ (ค้างฉากไว้ให้ตรวจ) */
export async function autoplay(caseId: string, stopAt?: string): Promise<string> {
  // เก็บข้อมูลผู้เล่นจริงไว้ก่อน แล้วคืนค่าหลังทดสอบ (ไม่ให้คะแนน/ชื่อทดสอบค้างในเครื่อง)
  const saved = new Map<string, string>();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith('biosurgeon.')) saved.set(k, localStorage.getItem(k)!);
  }
  try {
    return await run(caseId, stopAt);
  } finally {
    for (const k of Object.keys(localStorage)) if (k.startsWith('biosurgeon.')) localStorage.removeItem(k);
    for (const [k, v] of saved) localStorage.setItem(k, v);
  }
}

async function run(caseId: string, stopAt?: string): Promise<string> {
  const log: string[] = [`▶ ${caseId}`];
  const c: CaseDef = await (await fetch(`cases/${caseId}.json`)).json();
  const ans = answersOf(c);
  const games = minigamesOf(c);
  for (let i = 0; i < 40 && !$('.lobby'); i++) await w(100);
  $$<HTMLButtonElement>('.seg-btn')[0]?.click();
  const nameIn = $<HTMLInputElement>('.lobby .text-in');
  if (nameIn && !nameIn.value) {
    nameIn.value = 'ทดสอบอัตโนมัติ';
    nameIn.dispatchEvent(new Event('change'));
  }
  const cards = $$<HTMLButtonElement>('.case-card');
  const idx = (await (await fetch('cases/index.json')).json()).findIndex((e: any) => e.id === caseId);
  cards[idx]?.click();
  await w(300);
  await drainModals(ans, games, log);

  if (c.mode !== 'tutorial') {
    // สืบสวน: เลือกเฉพาะข้อที่เป็นเบาะแส
    const qb = $$<HTMLButtonElement>('.investigate .chat ~ .q-list .q-btn');
    c.history.forEach((hh, i) => hh.clue === true && qb[i]?.click());
    for (const e of c.exam.filter((e) => e.clue === true)) {
      const z = $(`[data-zone="${e.zone}"]`);
      if (z && !z.classList.contains('inactive')) z.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      else $$<HTMLButtonElement>('.exam-list .q-btn').find((b) => b.textContent?.startsWith(e.label))?.click();
      await drainModals(ans, games, log);
    }
    const tb = $$<HTMLButtonElement>('.test .btn');
    c.tests.forEach((t, i) => t.clue === true && tb[i]?.click());
    await drainModals(ans, games, log);
    $<HTMLButtonElement>('.notebook .btn.big')!.click();
    await w(200);
    const dx = c.diagnosis!;
    $$<HTMLButtonElement>('.dx').find((b) => b.textContent === dx.options[dx.answer])?.click();
    let n = 0;
    for (const chip of $$<HTMLButtonElement>('.chip[data-id]')) if (n < 3 && dx.evidenceRequired.includes(chip.dataset.id!)) (chip.click(), n++);
    if (n < 2) log.push(`! หาหลักฐานได้ ${n} ข้อ`);
    $<HTMLButtonElement>('.diagnose .btn.primary')!.click();
    await drainModals(ans, games, log);
    await w(200);
    const pre = c.preOp!;
    $$<HTMLButtonElement>('.preop .dx').find((b) => b.textContent === pre.anesthesia.choices[pre.anesthesia.answer])?.click();
    const bad = new Set(pre.tray.distractors.map((d) => d.name));
    for (const b of $$<HTMLButtonElement>('.pick')) if (!bad.has(b.textContent ?? '')) b.click();
    $<HTMLButtonElement>('.preop .btn.primary')!.click();
    await drainModals(ans, games, log);
  }
  // เข้าห้องผ่าตัด
  for (let i = 0; i < 20 && !$('.modal-back'); i++) {
    tick(10);
    await w(30);
  }
  await drainModals(ans, games, log);
  tick(5);
  let lastKey = '';
  let stuck = 0;
  for (let guard = 0; guard < 120; guard++) {
    await drainModals(ans, games, log);
    const eng = bs().engine;
    const step: StepDef | null = eng?.current;
    if (!step) break;
    const key = `${eng.index}:${step.id}`;
    if (key === lastKey) {
      if (++stuck >= 2) {
        log.push(`✘ ติดที่ขั้น ${eng.index + 1} "${step.id}" (${step.action} → ${step.target ?? step.targets ?? step.layer ?? step.path ?? ''})`);
        return log.join('\n');
      }
    } else stuck = 0;
    lastKey = key;
    if (step.tool) selectTool(step.tool);
    if (step.id === stopAt) {
      log.push(`⏸ หยุดก่อนขั้น ${eng.index + 1} "${step.id}"`);
      return log.join('\n');
    }
    tick(2);
    performStep(step);
    tick(35);
    await w(40);
  }
  await drainModals(ans, games, log);
  for (let i = 0; i < 20 && !$('.debrief'); i++) {
    await drainModals(ans, games, log);
    await w(80);
  }
  log.push(`✔ จบเคส — ${$('.debrief .total')?.textContent ?? '(ไม่พบหน้าสรุป)'}`);
  return log.join('\n');
}

/** ตรวจว่าคลิกที่จุดยึด (anchor) ของแต่ละวัตถุในฉากปัจจุบันแล้วโดนวัตถุใด — ใช้หาวัตถุที่ถูกบังขณะเขียนเคส */
export function probe(): Record<string, string> {
  const sc = bs().scene;
  const T = bs().THREE;
  const cam = bs().sm.camera;
  const rc = new T.Raycaster();
  const out: Record<string, string> = {};
  for (const [id, o] of sc.objs ?? []) {
    if (!o.group.visible) continue;
    const a = sc.anchorOf(id);
    if (!a) continue;
    const p = a.clone().project(cam);
    rc.setFromCamera(new T.Vector2(p.x, p.y), cam);
    const hit = sc.pick(rc).targetId;
    out[id] = hit === id ? 'ok' : `→ ${hit}`;
  }
  return out;
}
