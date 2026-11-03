type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** สร้าง DOM แบบสั้น: h('button', { class: 'btn', onclick: fn }, 'ข้อความ') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export const ui = () => document.getElementById('ui')!;

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** หน้าจอเต็ม (ซ้อนบนฉาก 3 มิติ) */
export function screen(cls = ''): HTMLDivElement {
  const s = h('div', { class: `screen ${cls}` });
  ui().append(s);
  return s;
}

export interface ModalButton<T> {
  label: string;
  value: T;
  primary?: boolean;
}

/** หน้าต่างเด้ง คืนค่าปุ่มที่กด */
export function modal<T>(opts: {
  title: string;
  body: Node | string;
  buttons: ModalButton<T>[];
  tone?: 'info' | 'warn' | 'good' | 'bad';
  speaker?: string;
}): Promise<T> {
  return new Promise((resolve) => {
    const back = h('div', { class: 'modal-back' });
    const card = h(
      'div',
      { class: `modal tone-${opts.tone ?? 'info'}`, role: 'dialog', 'aria-modal': 'true' },
      opts.speaker ? h('div', { class: 'speaker' }, opts.speaker) : null,
      h('h2', {}, opts.title),
      h('div', { class: 'modal-body' }, typeof opts.body === 'string' ? h('p', {}, opts.body) : opts.body),
    );
    const row = h('div', { class: 'modal-actions' });
    for (const b of opts.buttons) {
      row.append(
        h(
          'button',
          {
            class: `btn ${b.primary ? 'primary' : ''}`,
            onclick: () => {
              back.remove();
              resolve(b.value);
            },
          },
          b.label,
        ),
      );
    }
    card.append(row);
    back.append(card);
    ui().append(back);
    (row.querySelector('.primary') as HTMLButtonElement | null)?.focus();
  });
}

/** ถามตัวเลือก (คำถามชีววิทยา) แล้วแสดงเฉลยพร้อมคำอธิบาย */
export async function askChoice(opts: {
  title: string;
  q: string;
  choices: string[];
  answer: number;
  explain: string;
  speaker?: string;
  shuffle?: boolean;
}): Promise<boolean> {
  const order = opts.choices.map((_, i) => i);
  if (opts.shuffle !== false) shuffleInPlace(order);
  const picked = await new Promise<number>((resolve) => {
    const list = h('div', { class: 'choice-list' });
    const back = h('div', { class: 'modal-back' });
    order.forEach((i, n) => {
      list.append(
        h(
          'button',
          {
            class: 'choice',
            onclick: () => {
              back.remove();
              resolve(i);
            },
          },
          h('span', { class: 'choice-key' }, 'กขคง'[n] ?? String(n + 1)),
          h('span', {}, opts.choices[i]),
        ),
      );
    });
    back.append(
      h(
        'div',
        { class: 'modal tone-info', role: 'dialog', 'aria-modal': 'true' },
        opts.speaker ? h('div', { class: 'speaker' }, opts.speaker) : null,
        h('h2', {}, opts.title),
        h('p', { class: 'question' }, opts.q),
        list,
      ),
    );
    ui().append(back);
  });
  const ok = picked === opts.answer;
  await modal({
    title: ok ? 'ถูกต้อง!' : 'ยังไม่ถูก',
    tone: ok ? 'good' : 'bad',
    body: h(
      'div',
      {},
      ok ? null : h('p', { class: 'answer' }, `คำตอบที่ถูก: ${opts.choices[opts.answer]}`),
      h('p', {}, opts.explain),
    ),
    buttons: [{ label: 'ไปต่อ', value: true, primary: true }],
  });
  return ok;
}

export function toast(msg: string, tone: 'info' | 'good' | 'bad' = 'info', ms = 2600): void {
  let wrap = document.getElementById('toasts');
  if (!wrap) {
    wrap = h('div', { id: 'toasts' });
    document.body.append(wrap);
  }
  const t = h('div', { class: `toast tone-${tone}` }, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function shuffleInPlace<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function stars(n: number, max = 5): string {
  return '★'.repeat(n) + '☆'.repeat(max - n);
}
