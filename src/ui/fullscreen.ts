import { device } from '../core/Device';
import { h, modal } from './dom';

/** โหมดเต็มจอ (Fullscreen API มีคำนำหน้า webkit บน Safari ของ iPad) — iPhone ไม่รองรับ จึงแนะนำให้เพิ่มไปหน้าจอโฮมแทน */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as FsDoc;
const root = document.documentElement as FsEl;

export const canFullscreen = (): boolean => !!(root.requestFullscreen || root.webkitRequestFullscreen);
export const isFullscreen = (): boolean => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
/** เปิดจากไอคอนบนหน้าจอโฮม (เต็มจออยู่แล้ว) */
const standalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true;

export async function enterFullscreen(): Promise<void> {
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else await root.webkitRequestFullscreen?.();
  } catch {
    /* ผู้ใช้/เบราว์เซอร์ปฏิเสธ — เล่นต่อในหน้าต่างได้ */
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (!canFullscreen()) {
    if (!standalone()) showHomeScreenTip();
    return;
  }
  if (isFullscreen()) await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch(() => undefined);
  else await enterFullscreen();
}

function showHomeScreenTip(): void {
  void modal({
    title: 'เล่นแบบเต็มจอบน iPhone',
    body: h(
      'ol',
      { class: 'howto' },
      h('li', {}, 'แตะปุ่ม แชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบล่างของ Safari'),
      h('li', {}, 'เลือก "เพิ่มไปยังหน้าจอโฮม"'),
      h('li', {}, 'เปิดเกมจากไอคอน BioSurgeon บนหน้าจอโฮม — จะเต็มจอทันที'),
    ),
    buttons: [{ label: 'เข้าใจแล้ว', value: 0, primary: true }],
  });
}

/** ปุ่มเต็มจอ — ข้อความเปลี่ยนตามสถานะ (ซ่อนเองถ้าเปิดจากหน้าจอโฮมอยู่แล้ว) */
export function fullscreenButton(cls = 'btn small', short = false): HTMLButtonElement {
  const b = h('button', { class: `${cls} fs-btn`, title: 'เต็มจอ / ออกจากเต็มจอ', 'aria-label': 'เต็มจอ' }) as HTMLButtonElement;
  const sync = () => {
    const on = isFullscreen();
    b.textContent = short ? (on ? '⤡' : '⛶') : on ? '⤡ ออกจากเต็มจอ' : '⛶ เต็มจอ';
    b.classList.toggle('on', on);
  };
  b.addEventListener('click', () => void toggleFullscreen());
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
  if (standalone() || (!canFullscreen() && !device.ios)) b.classList.add('hidden');
  return b;
}
