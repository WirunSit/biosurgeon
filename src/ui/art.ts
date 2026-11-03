import type { CaseDef, ToolId } from '../types';

/** ไอคอนเครื่องมือแบบ SVG (คมชัดทุกขนาด — แผนข้อ 6) */
const S = (body: string) =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const TOOL_ICONS: Record<ToolId, string> = {
  antiseptic: S('<path d="M10 40 L30 20"/><path d="M14 40 L34 20"/><circle cx="35" cy="14" r="7" fill="#b45a1c" stroke="#7c3a10"/><circle cx="8" cy="42" r="3"/><circle cx="16" cy="42" r="3"/>'),
  marker: S('<path d="M12 36 L32 12 L38 18 L18 42 Z" fill="#7c3aed33"/><path d="M12 36 L8 44 L18 42"/><path d="M30 14 L36 20"/>'),
  scalpel: S('<path d="M6 42 L26 22"/><path d="M26 22 C32 12 40 8 42 6 C40 14 34 22 28 26 Z" fill="#cbd5e1"/>'),
  scissors: S('<circle cx="12" cy="36" r="5"/><circle cx="22" cy="40" r="5"/><path d="M15 32 L40 8"/><path d="M20 35 L42 14"/>'),
  forceps: S('<path d="M8 40 L40 10"/><path d="M8 40 L36 6"/><path d="M8 40 L6 44"/>'),
  clamp: S('<circle cx="10" cy="36" r="5"/><circle cx="20" cy="41" r="5"/><path d="M13 32 L30 16 Q36 10 42 10"/><path d="M18 36 L32 20 Q36 14 42 12"/><path d="M22 30 l4 4"/>'),
  retractor: S('<path d="M10 42 L10 14 Q10 8 16 8 L30 8"/><path d="M30 8 L30 16"/><path d="M6 42 L14 42"/>'),
  suction: S('<path d="M8 42 Q14 30 22 24 T40 8"/><circle cx="40" cy="8" r="2.5" fill="currentColor"/><path d="M6 44 l4 -4"/>'),
  cautery: S('<rect x="14" y="10" width="10" height="26" rx="4" transform="rotate(30 19 23)"/><path d="M30 36 L36 44"/><path d="M38 30 l4 -2 M36 24 l5 0 M40 36 l3 3" stroke="#f59e0b"/>'),
  needle: S('<circle cx="10" cy="36" r="5"/><circle cx="20" cy="41" r="5"/><path d="M13 32 L30 15"/><path d="M18 36 L33 19"/><path d="M30 15 A8 8 0 0 1 42 22" stroke="#7c3aed"/>'),
  gauze: S('<rect x="8" y="10" width="32" height="28" rx="3"/><path d="M8 20 H40 M8 29 H40 M18 10 V38 M29 10 V38" stroke-width="1.4"/>'),
  syringe: S('<rect x="16" y="10" width="10" height="24" rx="2" transform="rotate(35 21 22)"/><path d="M10 40 L15 33"/><path d="M28 10 L33 4 M30 14 L38 8"/>'),
  saw: S('<rect x="20" y="6" width="14" height="22" rx="3"/><path d="M22 28 v10 l3 3 l3 -3 l3 3 l3 -3 v-10"/>'),
  spreader: S('<path d="M8 12 H40"/><path d="M14 12 V36 M34 12 V36"/><path d="M10 36 H18 M30 36 H38"/><circle cx="38" cy="12" r="3"/>'),
  drill: S('<rect x="14" y="6" width="16" height="22" rx="4"/><path d="M22 28 V42" stroke-width="1.8"/><path d="M19 32 l6 2 M19 36 l6 2"/>'),
  scope: S('<path d="M8 40 L36 12"/><rect x="34" y="6" width="9" height="9" rx="2" transform="rotate(45 38 10)"/><circle cx="8" cy="40" r="3" fill="#60a5fa"/>'),
  chest_tube: S('<path d="M8 40 Q10 24 24 20 T42 8" stroke-width="4" stroke="#94a3b8"/><path d="M8 40 Q10 24 24 20 T42 8"/>'),
  cannula: S('<path d="M8 40 Q12 22 26 20 T42 8" stroke="#dc2626" stroke-width="4"/>'),
  clip: S('<circle cx="10" cy="36" r="5"/><circle cx="20" cy="41" r="5"/><path d="M13 32 L32 14 M18 36 L34 18"/><path d="M33 8 q8 0 8 8" stroke="#c0a062" stroke-width="3"/>'),
  probe: S('<rect x="14" y="30" width="20" height="10" rx="2" fill="#0f172a"/><path d="M24 30 V8"/><path d="M14 44 q10 4 20 0" stroke="#38bdf8"/>'),
  laser: S('<path d="M8 40 L32 16"/><circle cx="34" cy="14" r="4" fill="#4ade80" stroke="#16a34a"/><path d="M40 6 l3 -3 M42 12 h4 M36 4 v-3" stroke="#4ade80"/>'),
  basket: S('<path d="M8 40 L26 22"/><ellipse cx="33" cy="15" rx="9" ry="6" transform="rotate(-45 33 15)"/><path d="M27 21 L39 9 M29 13 L37 19"/>'),
  stent: S('<path d="M10 8 Q4 14 10 18 L36 30 Q44 34 38 40" stroke="#2563eb" stroke-width="3"/>'),
  phaco: S('<rect x="14" y="8" width="10" height="26" rx="4" transform="rotate(35 19 21)"/><path d="M8 42 L13 35" stroke-width="2"/><path d="M4 38 q2 -3 0 -6 M6 44 q3 -1 4 -4" stroke="#38bdf8"/>'),
  iol: S('<ellipse cx="24" cy="24" rx="10" ry="10" fill="#e0f2fe"/><path d="M14 24 Q6 10 16 6 M34 24 Q42 38 32 42"/>'),
  plate: S('<rect x="20" y="4" width="8" height="40" rx="3"/><circle cx="24" cy="10" r="1.8"/><circle cx="24" cy="18" r="1.8"/><circle cx="24" cy="30" r="1.8"/><circle cx="24" cy="38" r="1.8"/>'),
  patch: S('<ellipse cx="24" cy="24" rx="14" ry="10" fill="#f5f5f4"/><path d="M10 24 h-4 M38 24 h4 M24 14 v-4 M24 34 v4" stroke-dasharray="2 2"/>'),
};

const DISTRACTOR_ICON = S('<rect x="8" y="14" width="32" height="20" rx="4"/><path d="M14 24 H34"/><circle cx="24" cy="24" r="3"/>');
export const distractorIcon = () => DISTRACTOR_ICON;

/** ภาพผู้ป่วยชั่วคราว (ระยะ 3 จะแทนด้วยภาพที่เจนด้วย GPT สไตล์เดียวกันทั้งชุด) */
export function avatarSVG(c: CaseDef): string {
  const skin = c.patient.avatar?.skin ?? '#d9a27e';
  const hair = c.patient.avatar?.hair ?? '#222';
  const gown = c.patient.avatar?.gown ?? '#8cbfd1';
  return `<svg viewBox="0 0 160 160" role="img" aria-label="ภาพผู้ป่วย ${c.patient.name}">
  <defs><linearGradient id="bgp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6f4f1"/><stop offset="1" stop-color="#cfe6e2"/></linearGradient></defs>
  <rect width="160" height="160" rx="18" fill="url(#bgp)"/>
  <path d="M28 160 C30 118 52 104 80 104 C108 104 130 118 132 160 Z" fill="${gown}"/>
  <path d="M60 106 L80 126 L100 106" fill="none" stroke="#ffffff88" stroke-width="3"/>
  <rect x="70" y="86" width="20" height="22" rx="8" fill="${skin}"/>
  <ellipse cx="80" cy="64" rx="27" ry="31" fill="${skin}"/>
  <path d="M52 62 C50 36 66 28 82 29 C100 30 110 42 108 62 C104 50 96 44 80 44 C66 44 58 50 52 62 Z" fill="${hair}"/>
  <path d="M66 62 q5 4 10 0 M86 62 q5 4 10 0" stroke="#3b2a20" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M64 55 l9 3 M96 55 l-9 3" stroke="#3b2a20" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M72 80 q8 -5 16 0" stroke="#7a4a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M100 47 q4 6 1 11" stroke="#7fd3ff" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M40 160 C44 140 56 134 66 140 L92 146 C98 148 98 156 92 158 L60 156" fill="${skin}" stroke="#00000022"/>
</svg>`;
}

/** แผนภาพหน้าท้อง 4 ส่วนสำหรับตรวจร่างกาย (ด้านขวาของผู้ป่วยอยู่ทางซ้ายของจอ) */
export function abdomenSVG(): string {
  return `<svg viewBox="0 0 300 330" class="abdomen" role="img" aria-label="แผนภาพหน้าท้อง">
  <path d="M60 10 C40 80 40 150 52 220 C60 270 90 315 150 320 C210 315 240 270 248 220 C260 150 260 80 240 10 Z" fill="#e8b996" stroke="#b9876a" stroke-width="3"/>
  <path d="M70 26 Q150 70 230 26" fill="none" stroke="#b9876a" stroke-width="2" opacity="0.6"/>
  <g class="zones">
    <path data-zone="RUQ" d="M150 40 L150 165 L50 165 C48 120 52 80 64 40 Z"/>
    <path data-zone="LUQ" d="M150 40 L150 165 L250 165 C252 120 248 80 236 40 Z"/>
    <path data-zone="RLQ" d="M150 165 L150 318 C92 312 62 270 54 222 C51 205 50 185 50 165 Z"/>
    <path data-zone="LLQ" d="M150 165 L150 318 C208 312 238 270 246 222 C249 205 250 185 250 165 Z"/>
  </g>
  <circle cx="150" cy="165" r="5" fill="#9c6b52"/>
  <text x="160" y="160" font-size="12" fill="#6b4b3a">สะดือ</text>
  <g font-size="14" font-weight="700" fill="#33415588" text-anchor="middle" pointer-events="none">
    <text x="100" y="110">ขวาบน</text><text x="200" y="110">ซ้ายบน</text>
    <text x="100" y="240">ขวาล่าง</text><text x="200" y="240">ซ้ายล่าง</text>
  </g>
  <text x="16" y="326" font-size="12" fill="#475569">◀ ด้านขวาของผู้ป่วย</text>
  <text x="200" y="326" font-size="12" fill="#475569">ด้านซ้ายของผู้ป่วย ▶</text>
</svg>`;
}
