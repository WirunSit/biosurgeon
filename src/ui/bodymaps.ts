import { abdomenSVG } from './art';

/**
 * แผนภาพร่างกายสำหรับตรวจร่างกาย — แต่ละโซนมี data-zone ตรงกับ exam[].zone ในไฟล์เคส
 * ด้านขวาของผู้ป่วยอยู่ทางซ้ายของจอเสมอ (มองจากด้านหน้า)
 * โซนที่ไม่มีบนแผนภาพจะแสดงเป็นปุ่มด้านล่างแทน
 */

const SKIN = 'fill="#e8b996" stroke="#b9876a" stroke-width="3"';

const sides = `<text x="16" y="326" font-size="12" fill="#475569">◀ ด้านขวาของผู้ป่วย</text>
  <text x="196" y="326" font-size="12" fill="#475569">ด้านซ้ายของผู้ป่วย ▶</text>`;

function chest(): string {
  return `<svg viewBox="0 0 300 330" class="abdomen" role="img" aria-label="แผนภาพทรวงอก">
  <path d="M40 300 C30 200 34 90 70 40 Q110 14 150 16 Q190 14 230 40 C266 90 270 200 260 300 Z" ${SKIN}/>
  <path d="M150 30 V290" stroke="#b9876a" stroke-width="2" opacity="0.5"/>
  ${[60, 100, 140, 180, 220].map((y) => `<path d="M70 ${y} Q110 ${y + 12} 145 ${y} M155 ${y} Q190 ${y + 12} 230 ${y}" stroke="#b9876a" fill="none" opacity="0.35"/>`).join('')}
  <g class="zones">
    <path data-zone="R_UPPER" d="M72 50 L145 40 L145 130 L58 135 C58 100 62 70 72 50 Z"/>
    <path data-zone="L_UPPER" d="M228 50 L155 40 L155 130 L242 135 C242 100 238 70 228 50 Z"/>
    <path data-zone="R_LOWER" d="M58 140 L145 135 L145 230 L50 240 C50 200 52 170 58 140 Z"/>
    <path data-zone="L_LOWER" d="M242 140 L195 138 L195 230 L250 240 C250 200 248 170 242 140 Z"/>
    <path data-zone="HEART" d="M150 140 L192 140 L192 232 L150 232 Z"/>
    <path data-zone="R_SIDE" d="M50 245 L110 240 L110 295 L44 300 Z"/>
    <path data-zone="L_SIDE" d="M250 245 L190 240 L190 295 L256 300 Z"/>
  </g>
  <g font-size="12" font-weight="700" fill="#33415588" text-anchor="middle" pointer-events="none">
    <text x="100" y="92">ปอดขวาบน</text><text x="200" y="92">ปอดซ้ายบน</text>
    <text x="98" y="190">ปอดขวาล่าง</text><text x="222" y="190">ปอดซ้าย</text><text x="171" y="190">หัวใจ</text>
    <text x="78" y="275">ข้างลำตัวขวา</text><text x="222" y="275">ข้างลำตัวซ้าย</text>
  </g>
  ${sides}
</svg>`;
}

function leg(): string {
  return `<svg viewBox="0 0 300 330" class="abdomen" role="img" aria-label="แผนภาพขา">
  <path d="M110 8 C100 60 104 110 112 150 C116 180 108 220 112 262 C114 284 104 300 96 312 L180 316 C170 300 162 286 164 262 C168 220 160 180 166 150 C176 110 186 60 182 8 Z" ${SKIN}/>
  <g class="zones">
    <path data-zone="THIGH" d="M110 10 L182 10 C186 60 178 110 168 140 L112 140 C104 100 100 60 110 10 Z"/>
    <path data-zone="KNEE" d="M112 142 L168 142 C166 160 164 172 166 182 L112 182 C114 170 114 158 112 142 Z"/>
    <path data-zone="CALF" d="M112 184 L166 184 C162 210 164 236 164 250 L112 250 C108 230 110 206 112 184 Z"/>
    <path data-zone="ACHILLES" d="M112 252 L164 252 C164 268 166 282 170 294 L104 294 C110 282 114 268 112 252 Z"/>
    <path data-zone="FOOT" d="M100 296 L172 296 L180 316 L96 314 Z"/>
  </g>
  <g font-size="12" font-weight="700" fill="#33415588" text-anchor="middle" pointer-events="none">
    <text x="146" y="76">ต้นขา</text><text x="140" y="166">เข่า</text><text x="138" y="220">น่อง</text><text x="138" y="276">ข้อเท้า/เอ็น</text><text x="138" y="310">เท้า</text>
  </g>
  <text x="200" y="60" font-size="12" fill="#475569">ขาข้างที่บาดเจ็บ</text>
</svg>`;
}

function pelvis(): string {
  return `<svg viewBox="0 0 300 330" class="abdomen" role="img" aria-label="แผนภาพท้องและสีข้าง">
  <path d="M40 10 C24 90 26 160 40 230 C52 280 90 316 150 320 C210 316 248 280 260 230 C274 160 276 90 260 10 Z" ${SKIN}/>
  <g class="zones">
    <path data-zone="FLANK_R" d="M40 20 L82 20 L82 170 L34 170 C30 120 32 70 40 20 Z"/>
    <path data-zone="FLANK_L" d="M260 20 L218 20 L218 170 L266 170 C270 120 268 70 260 20 Z"/>
    <path data-zone="ABD" d="M86 20 L214 20 L214 170 L86 170 Z"/>
    <path data-zone="RLQ" d="M36 174 L148 174 L148 262 L58 262 C46 240 38 210 36 174 Z"/>
    <path data-zone="LLQ" d="M264 174 L152 174 L152 262 L242 262 C254 240 262 210 264 174 Z"/>
    <path data-zone="SUPRA" d="M64 266 L236 266 C220 296 190 314 150 316 C110 314 80 296 64 266 Z"/>
  </g>
  <g font-size="12" font-weight="700" fill="#33415588" text-anchor="middle" pointer-events="none">
    <text x="58" y="96">สีข้าง/เอวขวา</text><text x="242" y="96">สีข้าง/เอวซ้าย</text><text x="150" y="96">ท้องส่วนบน</text>
    <text x="96" y="222">ท้องน้อยขวา</text><text x="204" y="222">ท้องน้อยซ้าย</text><text x="150" y="294">เหนือหัวหน่าว</text>
  </g>
  ${sides}
</svg>`;
}

export function bodyMapSVG(kind: string | undefined): string | null {
  switch (kind ?? 'abdomen') {
    case 'abdomen':
      return abdomenSVG();
    case 'chest':
      return chest();
    case 'leg':
      return leg();
    case 'pelvis':
      return pelvis();
    default:
      return null;
  }
}
