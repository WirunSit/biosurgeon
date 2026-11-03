import type { GraphGame, HotspotGame, MatchGame, MicroscopeGame, MinigameDef, MultiGame, OrderGame } from '../types';
import { sfx } from '../core/Audio';
import { h, modal, shuffleInPlace, toast, ui } from './dom';

/**
 * มินิเกม 2 มิติที่ไฟล์เคสเรียกใช้ได้ (ตรวจร่างกาย / ก่อนผ่าตัด / ระหว่างผ่าตัด)
 * คืนค่า true ถ้าทำถูก — แสดงคำอธิบายชีววิทยาทุกครั้งหลังจบ
 */
export async function playMinigame(def: MinigameDef, speaker = 'อาจารย์หมอ'): Promise<boolean> {
  const result = await new Promise<{ ok: boolean; detail?: Node }>((resolve) => {
    const back = h('div', { class: 'modal-back' });
    const body = h('div', { class: 'mg-body' });
    const card = h(
      'div',
      { class: 'modal mg', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'speaker' }, speaker),
      h('h2', {}, def.title),
      h('p', { class: 'question' }, def.prompt),
      body,
    );
    back.append(card);
    ui().append(back);
    const done = (ok: boolean, detail?: Node) => {
      back.remove();
      resolve({ ok, detail });
    };
    switch (def.type) {
      case 'order':
        orderGame(def, body, done);
        break;
      case 'multi':
        multiGame(def, body, done);
        break;
      case 'match':
        matchGame(def, body, done);
        break;
      case 'hotspot':
        hotspotGame(def, body, done);
        break;
      case 'graph':
        graphGame(def, body, done);
        break;
      case 'microscope':
        microscopeGame(def, body, done);
        break;
    }
  });
  if (result.ok) sfx.good();
  else sfx.bad();
  await modal({
    title: result.ok ? 'ถูกต้อง!' : 'ยังไม่ถูกทั้งหมด',
    tone: result.ok ? 'good' : 'bad',
    speaker,
    body: h('div', {}, result.detail ?? null, h('p', {}, def.explain)),
    buttons: [{ label: 'ไปต่อ', value: 0, primary: true }],
  });
  return result.ok;
}

type Done = (ok: boolean, detail?: Node) => void;

function actions(...btns: HTMLButtonElement[]): HTMLDivElement {
  return h('div', { class: 'modal-actions' }, ...btns);
}

function orderGame(def: OrderGame, body: HTMLElement, done: Done): void {
  const picked: string[] = [];
  const pool = h('div', { class: 'mg-pool' });
  const seq = h('ol', { class: 'mg-seq' });
  const submit = h('button', { class: 'btn primary', disabled: true }, 'ตรวจคำตอบ');
  const reset = h('button', { class: 'btn' }, 'เริ่มเรียงใหม่');
  const items = shuffleInPlace([...def.items]);
  const render = () => {
    pool.innerHTML = '';
    seq.innerHTML = '';
    for (const it of items) {
      if (picked.includes(it)) continue;
      pool.append(
        h(
          'button',
          {
            class: 'chip',
            onclick: () => {
              picked.push(it);
              sfx.click();
              render();
            },
          },
          it,
        ),
      );
    }
    picked.forEach((it) => seq.append(h('li', {}, it)));
    if (!picked.length) seq.append(h('li', { class: 'muted empty' }, 'แตะข้อด้านบนตามลำดับที่ถูกต้อง'));
    submit.disabled = picked.length !== def.items.length;
  };
  reset.addEventListener('click', () => {
    picked.length = 0;
    render();
  });
  submit.addEventListener('click', () => {
    const ok = picked.every((p, i) => p === def.items[i]);
    done(ok, ok ? undefined : h('div', {}, h('b', {}, 'ลำดับที่ถูกต้อง:'), h('ol', {}, ...def.items.map((x) => h('li', {}, x)))));
  });
  body.append(pool, seq, actions(reset, submit));
  render();
}

function multiGame(def: MultiGame, body: HTMLElement, done: Done): void {
  const sel = new Set<number>();
  const order = shuffleInPlace(def.cards.map((_, i) => i));
  const grid = h('div', { class: 'mg-cards' });
  const submit = h('button', { class: 'btn primary', disabled: true }, 'ยืนยัน');
  for (const i of order) {
    const c = def.cards[i];
    const b = h('button', { class: 'mg-card' }, c.svg ? h('span', { class: 'mg-svg', html: c.svg }) : null, h('b', {}, c.text), c.sub ? h('small', {}, c.sub) : null);
    b.addEventListener('click', () => {
      if (def.single) {
        sel.clear();
        grid.querySelectorAll('.mg-card').forEach((x) => x.classList.remove('on'));
      }
      if (sel.has(i)) sel.delete(i);
      else sel.add(i);
      b.classList.toggle('on', sel.has(i));
      submit.disabled = sel.size === 0;
      sfx.click();
    });
    grid.append(b);
  }
  submit.addEventListener('click', () => {
    const ok = def.cards.every((c, i) => c.correct === sel.has(i));
    const list = h('ul', { class: 'ev-feedback' });
    for (const i of order) {
      const c = def.cards[i];
      if (!c.correct && !sel.has(i) && !c.why) continue;
      list.append(h('li', { class: c.correct ? 'ok' : 'no' }, `${c.correct ? '✔' : '✘'} ${c.text}${c.why ? ` — ${c.why}` : ''}`));
    }
    done(ok, list);
  });
  body.append(h('p', { class: 'muted' }, def.single ? 'เลือก 1 ข้อ' : 'เลือกได้หลายข้อ — เลือกทุกข้อที่ถูก'), grid, actions(submit));
}

function matchGame(def: MatchGame, body: HTMLElement, done: Done): void {
  const rights = shuffleInPlace(def.pairs.map((p) => p.right));
  const selects: HTMLSelectElement[] = [];
  const table = h('div', { class: 'mg-match' });
  const submit = h('button', { class: 'btn primary', disabled: true }, 'ตรวจคำตอบ');
  for (const p of def.pairs) {
    const s = h('select', {}, h('option', { value: '' }, '— เลือก —'), ...rights.map((r) => h('option', { value: r }, r)));
    s.addEventListener('change', () => (submit.disabled = selects.some((x) => !x.value)));
    selects.push(s);
    table.append(h('div', { class: 'mg-row' }, h('b', {}, p.left), s));
  }
  submit.addEventListener('click', () => {
    const ok = def.pairs.every((p, i) => selects[i].value === p.right);
    done(ok, ok ? undefined : h('ul', {}, ...def.pairs.map((p) => h('li', {}, `${p.left} → ${p.right}`))));
  });
  body.append(table, actions(submit));
}

function hotspotGame(def: HotspotGame, body: HTMLElement, done: Done): void {
  const need = def.need ?? def.zones.filter((z) => z.correct).length;
  let found = 0;
  let wrong = 0;
  const box = h('div', { class: 'mg-hot', style: `aspect-ratio:${def.aspect ?? 1.5}` });
  if (def.svg) box.innerHTML = def.svg;
  else if (def.img) box.append(h('img', { src: def.img, alt: def.title }));
  const status = h('p', { class: 'muted' }, `พบแล้ว 0 / ${need}`);
  const log = h('div', { class: 'findings' });
  const hit = new Set<number>();
  box.addEventListener('click', (e) => {
    const r = box.getBoundingClientRect();
    // พิกัดโซนเป็น % ของกว้าง (x) และสูง (y) รัศมีเป็น % ของความกว้าง
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const idx = def.zones.findIndex((z) => Math.hypot(z.x - x, (z.y - y) * (r.height / r.width)) < z.r);
    if (idx < 0) {
      toast('ยังไม่พบสิ่งที่น่าสนใจตรงนี้', 'info', 1200);
      return;
    }
    if (hit.has(idx)) return;
    hit.add(idx);
    const z = def.zones[idx];
    const mark = h('span', { class: `mg-mark ${z.correct ? 'ok' : 'no'}`, style: `left:${z.x}%;top:${z.y}%` }, z.correct ? '✓' : '✗');
    box.append(mark);
    log.append(h('div', { class: `finding ${z.correct ? 'pos' : ''}` }, h('b', {}, z.label), z.text ? h('p', {}, z.text) : null));
    if (z.correct) {
      found++;
      sfx.good();
    } else {
      wrong++;
      sfx.bad();
    }
    status.textContent = `พบแล้ว ${found} / ${need}`;
    if (found >= need) setTimeout(() => done(wrong <= 1), 700);
  });
  body.append(box, status, log);
}

function graphGame(def: GraphGame, body: HTMLElement, done: Done): void {
  const W = 560;
  const H = 260;
  const pad = 40;
  const all = def.series.flatMap((s) => s.values);
  const max = Math.max(...all) * 1.1;
  const min = Math.min(0, ...all);
  const n = def.xLabels.length;
  const X = (i: number) => pad + ((W - pad * 1.5) * i) / (n - 1);
  const Y = (v: number) => H - pad - ((H - pad * 1.6) * (v - min)) / (max - min);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="mg-graph"><line x1="${pad}" y1="${H - pad}" x2="${W - 10}" y2="${H - pad}" stroke="#94a3b8"/><line x1="${pad}" y1="10" x2="${pad}" y2="${H - pad}" stroke="#94a3b8"/>`;
  svg += `<text x="8" y="16" font-size="12" fill="#475569">${def.yLabel}</text>`;
  def.xLabels.forEach((l, i) => (svg += `<text x="${X(i)}" y="${H - pad + 18}" font-size="11" text-anchor="middle" fill="#475569">${l}</text>`));
  def.series.forEach((s, si) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join(' ');
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="3" ${s.dashed ? 'stroke-dasharray="6 5"' : ''}/>`;
    svg += `<text x="${W - 150}" y="${22 + si * 16}" font-size="12" fill="${s.color}">— ${s.name}</text>`;
  });
  const main = def.series[0];
  main.values.forEach((v, i) => (svg += `<circle data-i="${i}" cx="${X(i)}" cy="${Y(v)}" r="9" fill="${main.color}" fill-opacity="0.25" stroke="${main.color}" class="mg-pt"/>`));
  svg += '</svg>';
  const box = h('div', { html: svg });
  box.querySelectorAll<SVGCircleElement>('.mg-pt').forEach((c) =>
    c.addEventListener('click', () => {
      const i = Number(c.dataset.i);
      const ok = def.answer.includes(i);
      done(ok, ok ? undefined : h('p', { class: 'answer' }, `จุดที่ผิดปกติคือช่วง ${def.answer.map((a) => def.xLabels[a]).join(', ')}`));
    }),
  );
  body.append(box, h('p', { class: 'muted' }, `คลิกจุดบนเส้น “${main.name}” ที่ผิดปกติที่สุด`));
}

function drawCell(x: CanvasRenderingContext2D, shape: string, cx: number, cy: number, color: string, rot: number): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.fillStyle = color;
  x.strokeStyle = 'rgba(40,20,60,0.5)';
  switch (shape) {
    case 'neutrophil': {
      x.globalAlpha = 0.55;
      x.beginPath();
      x.arc(0, 0, 13, 0, Math.PI * 2);
      x.fillStyle = '#f5d0e6';
      x.fill();
      x.globalAlpha = 1;
      x.fillStyle = color;
      for (const [a, b] of [
        [-5, -3],
        [3, -5],
        [5, 4],
        [-3, 5],
      ]) {
        x.beginPath();
        x.arc(a, b, 3.6, 0, Math.PI * 2);
        x.fill();
      }
      break;
    }
    case 'lymph':
      x.globalAlpha = 0.5;
      x.beginPath();
      x.arc(0, 0, 10, 0, Math.PI * 2);
      x.fillStyle = '#dbeafe';
      x.fill();
      x.globalAlpha = 1;
      x.fillStyle = color;
      x.beginPath();
      x.arc(0, 0, 8, 0, Math.PI * 2);
      x.fill();
      break;
    case 'rbc':
      x.beginPath();
      x.arc(0, 0, 9, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.beginPath();
      x.arc(0, 0, 4, 0, Math.PI * 2);
      x.fill();
      break;
    case 'coccus':
      for (let i = 0; i < 6; i++) {
        x.beginPath();
        x.arc((i % 3) * 4.5 - 4.5, Math.floor(i / 3) * 4.5 - 2, 2.2, 0, Math.PI * 2);
        x.fill();
      }
      break;
    case 'rod':
      x.beginPath();
      x.roundRect(-6, -2, 12, 4, 2);
      x.fill();
      break;
    default:
      x.globalAlpha = 0.6;
      x.beginPath();
      x.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
      x.fill();
  }
  x.restore();
}

function microscopeGame(def: MicroscopeGame, body: HTMLElement, done: Done): void {
  const S = 360;
  const cv = h('canvas', { width: S, height: S, class: 'mg-scope' });
  const x = cv.getContext('2d')!;
  const cells: { kind: string; x: number; y: number; c: (typeof def.cells)[number]; rot: number; got: boolean }[] = [];
  for (const c of def.cells)
    for (let i = 0; i < c.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (S / 2 - 24);
      cells.push({ kind: c.kind, x: S / 2 + Math.cos(a) * r, y: S / 2 + Math.sin(a) * r, c, rot: Math.random() * 6, got: false });
    }
  const target = 40 + Math.random() * 40;
  // ให้ตัวทดสอบอัตโนมัติ (โหมดพัฒนา) อ่านตำแหน่งเซลล์ได้
  Object.assign(cv, { __cells: cells, __target: target });
  const focus = h('input', { type: 'range', min: 0, max: 100, value: 5, class: 'mg-focus', 'aria-label': 'ปรับโฟกัส' }) as HTMLInputElement;
  const need = new Map(def.find.map((f) => [f.kind, f.need]));
  const got = new Map<string, number>();
  let wrong = 0;
  const status = h('p', { class: 'muted' });
  const render = () => {
    x.clearRect(0, 0, S, S);
    x.save();
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    x.clip();
    x.fillStyle = '#fdf7fb';
    x.fillRect(0, 0, S, S);
    for (const c of cells) drawCell(x, c.c.shape, c.x, c.y, c.c.color, c.rot);
    for (const c of cells)
      if (c.got) {
        x.strokeStyle = '#16a34a';
        x.lineWidth = 2.5;
        x.beginPath();
        x.arc(c.x, c.y, 16, 0, Math.PI * 2);
        x.stroke();
      }
    x.restore();
    const blur = Math.abs(Number(focus.value) - target) / 9;
    cv.style.filter = `blur(${blur.toFixed(1)}px)`;
    status.textContent =
      `ย้อมสี: ${def.stain} • ` + def.find.map((f) => `${def.cells.find((c) => c.kind === f.kind)?.label ?? f.kind} ${got.get(f.kind) ?? 0}/${f.need}`).join(' • ');
  };
  focus.addEventListener('input', render);
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * S;
    const py = ((e.clientY - r.top) / r.height) * S;
    if (Math.abs(Number(focus.value) - target) > 14) {
      toast('ภาพยังเบลออยู่ — ปรับโฟกัสก่อน', 'info', 1200);
      return;
    }
    let best: (typeof cells)[number] | null = null;
    let bd = 18;
    for (const c of cells) {
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < bd && !c.got) {
        bd = d;
        best = c;
      }
    }
    if (!best) return;
    if (need.has(best.kind) && (got.get(best.kind) ?? 0) < need.get(best.kind)!) {
      best.got = true;
      got.set(best.kind, (got.get(best.kind) ?? 0) + 1);
      sfx.good();
    } else {
      wrong++;
      sfx.bad();
      toast(`นั่นคือ${best.c.label}`, 'bad', 1400);
    }
    render();
    if (def.find.every((f) => (got.get(f.kind) ?? 0) >= f.need)) setTimeout(() => done(wrong <= 2), 600);
  });
  const legend = h('div', { class: 'mg-legend' }, ...def.cells.map((c) => h('span', {}, h('i', { style: `background:${c.color}` }), c.label)));
  body.append(h('div', { class: 'mg-scope-wrap' }, cv), h('label', { class: 'field-label' }, 'ปรับโฟกัส (หมุนปุ่มปรับละเอียด)'), focus, status, legend);
  render();
}
