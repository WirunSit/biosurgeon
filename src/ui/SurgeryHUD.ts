import * as THREE from 'three';
import type { ToolId } from '../types';
import { TOOL_NAMES } from '../procedural/tools';
import { TOOL_ICONS } from './art';
import { h, ui } from './dom';
import type { LabelAnchor } from '../core/SurgeryScene';

export type Speaker = 'nurse' | 'anesth' | 'attending' | 'system';

const SPEAKERS: Record<Speaker, string> = {
  nurse: 'พยาบาลห้องผ่าตัด',
  anesth: 'วิสัญญีแพทย์',
  attending: 'อาจารย์หมอ',
  system: 'ระบบ',
};

/** หน้าจอระหว่างผ่าตัด: คำสั่งขั้นตอน ถาดเครื่องมือ มอนิเตอร์ ข้อความ NPC ป้ายชื่อชั้นเนื้อเยื่อ */
export class SurgeryHUD {
  readonly el: HTMLDivElement;
  private stepCount = h('div', { class: 'step-count' });
  private stepText = h('div', { class: 'step-text' });
  private stepTool = h('div', { class: 'step-tool' });
  private bar = h('i');
  private stepsBar = h('div', { class: 'steps-bar' });
  private log = h('div', { class: 'hud-log', 'aria-live': 'polite' });
  private teach = h('div', { class: 'teach hidden' });
  private timer = h('span', { class: 'timer' }, '0:00');
  private labelsLayer = h('div', { class: 'labels' });
  private labelEls = new Map<string, HTMLDivElement>();
  private toolBtns = new Map<ToolId, HTMLButtonElement>();
  private lastMsg = new Map<string, number>();
  private teachTimer = 0;
  labelsOn: boolean;

  onTool?: (id: ToolId | null) => void;
  onHint?: () => void;
  onZoom?: (dir: number) => void;
  onSound?: (on: boolean) => void;

  private scopeMask = h('div', { class: 'scope-mask hidden' });

  constructor(monitorEl: HTMLElement, labelsOn: boolean, soundOn: boolean, toolList: ToolId[]) {
    this.labelsOn = labelsOn;
    const tray = h('div', { class: 'tray', role: 'toolbar', 'aria-label': 'ถาดเครื่องมือ' });
    toolList.forEach((id, i) => {
      const key = i < 9 ? String(i + 1) : i === 9 ? '0' : '-';
      const b = h(
        'button',
        { class: 'tool', title: `${TOOL_NAMES[id]} (${key})`, onclick: () => this.onTool?.(id) },
        h('span', { class: 'ico', html: TOOL_ICONS[id] }),
        h('span', { class: 'nm' }, TOOL_NAMES[id]),
        h('kbd', {}, key),
      );
      this.toolBtns.set(id, b);
      tray.append(b);
    });

    const labelBtn = h('button', { class: `btn small ${labelsOn ? 'on' : ''}` }, 'ป้ายชื่อ (L)');
    labelBtn.addEventListener('click', () => {
      this.labelsOn = !this.labelsOn;
      labelBtn.classList.toggle('on', this.labelsOn);
    });
    const soundBtn = h('button', { class: `btn small ${soundOn ? 'on' : ''}` }, 'เสียง');
    let snd = soundOn;
    soundBtn.addEventListener('click', () => {
      snd = !snd;
      soundBtn.classList.toggle('on', snd);
      this.onSound?.(snd);
    });

    this.el = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-top' }, h('div', { class: 'step-card' }, this.stepCount, this.stepText, this.stepTool, h('div', { class: 'step-progress' }, this.bar)), this.stepsBar),
      h('div', { class: 'hud-right' }, monitorEl, tray),
      this.log,
      this.teach,
      h(
        'div',
        { class: 'hud-bar' },
        h('button', { class: 'btn small hint', onclick: () => this.onHint?.() }, 'ขอคำใบ้ (H)'),
        h('button', { class: 'btn small', onclick: () => this.onTool?.(null) }, 'วางเครื่องมือ (Esc)'),
        labelBtn,
        h('button', { class: 'btn small', onclick: () => this.onZoom?.(-1), 'aria-label': 'ซูมเข้า' }, '＋'),
        h('button', { class: 'btn small', onclick: () => this.onZoom?.(1), 'aria-label': 'ซูมออก' }, '－'),
        soundBtn,
        this.timer,
      ),
      this.labelsLayer,
    );
    this.el.prepend(this.scopeMask);
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    ui().append(this.el);
  }

  setStep(index: number, total: number, text: string, tool: ToolId | null): void {
    this.stepCount.textContent = `ขั้นที่ ${index + 1} / ${total}`;
    this.stepText.textContent = text;
    this.stepTool.innerHTML = '';
    if (tool) this.stepTool.append(h('span', { class: 'ico', html: TOOL_ICONS[tool] }), `เครื่องมือ: ${TOOL_NAMES[tool]}`);
    this.stepTool.classList.toggle('hidden', !tool);
    for (const [id, b] of this.toolBtns) b.classList.toggle('suggest', id === tool);
    this.setProgress(0);
    this.stepsBar.innerHTML = '';
    for (let i = 0; i < total; i++) this.stepsBar.append(h('span', { class: i < index ? 'done' : i === index ? 'now' : '' }));
  }

  /** มุมมองผ่านกล้องส่อง: ขอบจอมืดเป็นวงกลม */
  setScope(on: boolean): void {
    this.scopeMask.classList.toggle('hidden', !on);
  }

  setProgress(p: number): void {
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
  }

  setHeld(id: ToolId | null): void {
    for (const [t, b] of this.toolBtns) b.classList.toggle('active', t === id);
  }

  setTimer(text: string, over: boolean): void {
    this.timer.textContent = `⏱ ${text}`;
    this.timer.classList.toggle('over', over);
  }

  /** ข้อความจาก NPC (กันข้อความซ้ำถี่ ๆ) */
  say(who: Speaker, msg: string, tone: 'info' | 'warn' | 'good' | 'bad' = 'info'): void {
    const key = who + msg;
    const now = performance.now();
    if (now - (this.lastMsg.get(key) ?? -1e9) < 2500) return;
    this.lastMsg.set(key, now);
    const item = h('div', { class: `msg ${who} tone-${tone}` }, h('b', {}, SPEAKERS[who]), h('span', {}, msg));
    this.log.append(item);
    while (this.log.children.length > 4) this.log.firstChild!.remove();
    setTimeout(() => item.classList.add('old'), 9000);
  }

  /** การ์ดความรู้ชีววิทยา (ไม่บังการเล่น หายเองหลังไม่กี่วินาที) */
  learn(title: string, text: string, who: Speaker = 'attending'): void {
    this.teach.innerHTML = '';
    this.teach.append(
      h('div', { class: 'teach-head' }, h('b', {}, title), h('span', {}, SPEAKERS[who])),
      h('p', {}, text),
      h('button', { class: 'btn tiny', onclick: () => this.teach.classList.add('hidden') }, 'ปิด'),
    );
    this.teach.classList.remove('hidden');
    clearTimeout(this.teachTimer);
    this.teachTimer = window.setTimeout(() => this.teach.classList.add('hidden'), 14000);
  }

  updateLabels(anchors: LabelAnchor[], camera: THREE.Camera): void {
    const seen = new Set<string>();
    if (this.labelsOn) {
      const w = window.innerWidth;
      const hgt = window.innerHeight;
      const v = new THREE.Vector3();
      for (const a of anchors) {
        v.copy(a.pos).project(camera);
        if (v.z > 1) continue;
        let el = this.labelEls.get(a.key);
        if (!el) {
          el = h('div', { class: `label ${a.kind}` }, a.text);
          this.labelEls.set(a.key, el);
          this.labelsLayer.append(el);
        }
        el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * hgt}px)`;
        seen.add(a.key);
      }
    }
    for (const [k, el] of this.labelEls) el.style.display = seen.has(k) ? '' : 'none';
  }

  destroy(): void {
    this.el.remove();
  }
}
