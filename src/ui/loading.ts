import { h } from './dom';

/**
 * หน้าจอโหลดพร้อมแถบความคืบหน้า — ใช้ทั้งตอนเปิดเกม (เตรียมห้องผ่าตัด) และก่อนเข้าแต่ละเคส (โหลดอวัยวะของระบบนั้น)
 * โหลดทุกอย่างให้ครบก่อนเข้าเล่น เกมจึงไม่กระตุกกลางการผ่าตัด
 */
export class LoadingScreen {
  readonly el: HTMLDivElement;
  private bar = h('i');
  private pct = h('span', { class: 'load-pct' }, '0%');
  private msg = h('p', { class: 'load-msg' });
  private value = 0;

  constructor(title: string, sub = '', host: HTMLElement = document.body) {
    this.el = h(
      'div',
      { class: 'loading-screen' },
      h(
        'div',
        { class: 'load-card' },
        h('div', { class: 'load-logo', html: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#0f8b8d"/><path d="M24 11v26M11 24h26" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>' }),
        h('h2', {}, title),
        sub ? h('p', { class: 'muted' }, sub) : '',
        h('div', { class: 'load-bar' }, this.bar),
        h('div', { class: 'load-row' }, this.msg, this.pct),
      ),
    );
    host.append(this.el);
  }

  /** p = 0–1 (ไม่ถอยหลัง) */
  set(p: number, msg?: string): void {
    this.value = Math.max(this.value, Math.min(1, p));
    this.bar.style.width = `${Math.round(this.value * 100)}%`;
    this.pct.textContent = `${Math.round(this.value * 100)}%`;
    if (msg !== undefined) this.msg.textContent = msg;
  }

  /** เพิ่มเนื้อหาใต้แถบ (เช่น ผลตรวจอุปกรณ์ ปุ่มเริ่มเล่น) */
  append(...nodes: (Node | string)[]): void {
    this.el.querySelector('.load-card')!.append(...nodes);
  }

  async close(): Promise<void> {
    this.set(1);
    this.el.classList.add('out');
    await new Promise((r) => setTimeout(r, 220));
    this.el.remove();
  }
}

/** ให้เบราว์เซอร์ได้วาดหน้าจอโหลดก่อนเริ่มงานหนัก (แถบความคืบหน้าไม่ค้าง) */
export const nextPaint = (): Promise<void> =>
  new Promise((r) => {
    // แท็บที่ถูกซ่อน rAF ไม่ทำงาน — มีตัวจับเวลาสำรองไม่ให้หน้าจอโหลดค้าง
    const t = setTimeout(r, 60);
    requestAnimationFrame(() => setTimeout(() => (clearTimeout(t), r()), 0));
  });
