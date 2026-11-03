// โครงสร้างข้อมูลเคส (ตามแผนข้อ 8.1) — เพิ่มเคสใหม่ได้ด้วยการเขียน JSON โดยไม่แก้โค้ด

export type ToolId =
  | 'antiseptic'
  | 'marker'
  | 'scalpel'
  | 'scissors'
  | 'forceps'
  | 'clamp'
  | 'retractor'
  | 'suction'
  | 'cautery'
  | 'needle'
  | 'gauze'
  // เครื่องมือเฉพาะเคส (แผนข้อ 3.1)
  | 'syringe'
  | 'saw'
  | 'spreader'
  | 'drill'
  | 'scope'
  | 'chest_tube'
  | 'cannula'
  | 'clip'
  | 'probe'
  | 'laser'
  | 'basket'
  | 'stent'
  | 'phaco'
  | 'iol'
  | 'plate'
  | 'patch';

/**
 * ประเภทการกระทำในห้องผ่าตัด
 * scrub    ลากถูให้ทั่วบริเวณ (ทาน้ำยา / ดูดของเหลว)
 * trace    ลากตามเส้น วัดความแม่นยำ
 * click    คลิกเป้าหมาย
 * hold     กดค้างที่เป้าหมาย
 * drag     กดที่เป้าหมายแล้วลาก
 * sequence คลิกหลายเป้าหมายตามลำดับ
 * suture   มินิเกมเย็บ: คลิกสลับซ้าย-ขวาของแผล
 * choice   ตัดสินใจระหว่างผ่าตัด
 * rotate   ลากซ้าย-ขวาเพื่อหมุนวัตถุให้ได้มุมที่กำหนด (จัดกระดูก / แก้อัณฑะบิด)
 * minigame มินิเกม 2 มิติ (เรียงลำดับ จับคู่ เลือกหลายข้อ หาจุด กราฟ กล้องจุลทรรศน์)
 */
export type ActionType =
  | 'scrub'
  | 'trace'
  | 'click'
  | 'hold'
  | 'drag'
  | 'sequence'
  | 'suture'
  | 'choice'
  | 'rotate'
  | 'minigame';

export type Difficulty = 'easy' | 'normal' | 'challenge';

export interface ChoiceDef {
  q: string;
  choices: string[];
  answer: number;
  explain: string;
}

export interface VitalsDelta {
  bloodLoss?: number;
  infectionRisk?: number;
  organDamage?: number;
}

export interface MistakeDef {
  /** เป้าหมายที่ทำผิด (ไม่ระบุ = ทุกเป้าหมาย) */
  target?: string;
  /** เครื่องมือที่ทำผิด (ไม่ระบุ = เครื่องมือของขั้นตอนนั้น) */
  tool?: ToolId;
  penalty: number;
  vitals?: VitalsDelta;
  /** ทำให้เลือดออกต่อเนื่อง (มล./วินาที) จนกว่าขั้นตอนปัจจุบันจะสำเร็จ และแทรกขั้นตอนแก้ไขก่อน */
  bleed?: { rate: number; fix: StepDef[] };
  effects?: string[];
  explain: string;
}

export interface StepDef {
  id: string;
  /** คำสั่งที่แสดงให้นักเรียน */
  say: string;
  /** คำใบ้แบบคำถามชวนคิด (อาจารย์หมอ) */
  hint?: string;
  /** ความรู้ชีววิทยาที่แสดงหลังทำขั้นตอนสำเร็จ */
  learn?: string;
  tool?: ToolId;
  action: ActionType;
  target?: string;
  targets?: string[];
  path?: string;
  /** trace: ความแม่นยำขั้นต่ำ 0–1 ถ้าต่ำกว่านี้ต้องลากใหม่ */
  minAccuracy?: number;
  /** scrub: สัดส่วนพื้นที่ที่ต้องทำให้ทั่ว 0–1 */
  coverage?: number;
  holdSec?: number;
  /** drag: ระยะลากขั้นต่ำ (เมตร ในพิกัดแผล) */
  minDrag?: number;
  layer?: string;
  stitches?: number;
  choice?: ChoiceDef;
  /** rotate: มุมเป้าหมาย (องศา, ลบ = ทวนเข็ม) และความคลาดเคลื่อนที่ยอมรับ */
  angle?: number;
  angleTol?: number;
  minigame?: MinigameDef;
  /** เลือดออกระหว่างขั้นตอนนี้ (มล./วินาที) หยุดเมื่อขั้นตอนสำเร็จ */
  bleed?: number;
  onStart?: string[] | string;
  onSuccess?: string[] | string;
  mistakes?: MistakeDef[];
}

export type ClueFlag = boolean | 'rule-out';

export interface HistoryItem {
  id: string;
  q: string;
  a: string;
  clue: ClueFlag;
  minutes?: number;
  /** ข้อความสั้นสำหรับบันทึกหลักฐาน */
  ev?: string;
}

export interface ExamItem {
  zone: string;
  label: string;
  finding: string;
  /** มินิเกมตรวจร่างกาย (เช่น ส่องไฟดูรูม่านตา บีบน่อง) ก่อนแสดงผล */
  minigame?: MinigameDef;
  clue: ClueFlag;
  minutes?: number;
  ev?: string;
}

export interface TestItem {
  id: string;
  name: string;
  cost: number;
  minutes: number;
  result: string;
  image?: string;
  clue: ClueFlag;
  ev?: string;
  explain?: string;
}

export interface CaseEvent {
  id: string;
  trigger: 'investigateMinutes';
  threshold: number;
  warnAt?: number;
  warn?: string;
  message: string;
  vitals?: Partial<CaseVitals>;
  infectionRisk?: number;
  sceneEffects?: string[];
  insertAfter?: string;
  steps?: StepDef[];
}

export interface CaseVitals {
  T: number;
  HR: number;
  BP: string;
  RR: number;
  SpO2: number;
}

// ---------------- มินิเกม 2 มิติ ----------------

export interface MinigameBase {
  title: string;
  prompt: string;
  explain: string;
  /** หักคะแนนความรู้ชีววิทยาถ้าผิด (นับเป็นคำถาม 1 ข้อ) */
  bio?: boolean;
}

/** เรียงลำดับให้ถูกต้อง (ล้างมือ ทางเดินอาหาร วงจรเลือด) */
export interface OrderGame extends MinigameBase {
  type: 'order';
  items: string[]; // ลำดับที่ถูก
}

/** เลือกทุกข้อที่ถูก (ถุงเลือดที่ให้ได้ เส้นเลือดดำ ผู้บริจาค) */
export interface MultiGame extends MinigameBase {
  type: 'multi';
  cards: { text: string; sub?: string; svg?: string; correct: boolean; why?: string }[];
  /** เลือกได้ข้อเดียว */
  single?: boolean;
}

/** จับคู่ซ้าย-ขวา */
export interface MatchGame extends MinigameBase {
  type: 'match';
  pairs: { left: string; right: string }[];
}

/** หาจุดบนภาพ (คลิกบริเวณที่ถูกต้อง) */
export interface HotspotGame extends MinigameBase {
  type: 'hotspot';
  /** SVG inline หรือไฟล์ในโฟลเดอร์ public */
  svg?: string;
  img?: string;
  aspect?: number;
  zones: { x: number; y: number; r: number; correct: boolean; label: string; text?: string }[];
  need?: number;
}

/** กราฟ: คลิกช่วงเวลาที่ผิดปกติ */
export interface GraphGame extends MinigameBase {
  type: 'graph';
  xLabels: string[];
  series: { name: string; color: string; values: number[]; dashed?: boolean }[];
  yLabel: string;
  answer: number[]; // index ของจุดที่ถูก (คลิกจุดใดจุดหนึ่ง)
}

/** กล้องจุลทรรศน์: ปรับโฟกัสแล้วคลิกเซลล์ที่โจทย์ต้องการ */
export interface MicroscopeGame extends MinigameBase {
  type: 'microscope';
  stain: string;
  cells: { kind: string; label: string; count: number; color: string; shape: 'neutrophil' | 'rbc' | 'coccus' | 'rod' | 'lymph' | 'debris' }[];
  find: { kind: string; need: number }[];
}

export type MinigameDef = OrderGame | MultiGame | MatchGame | HotspotGame | GraphGame | MicroscopeGame;

// ---------------- ฉากผ่าตัดแบบอ่านจาก JSON (FieldScene) ----------------

export type V3 = [number, number, number];

export interface FieldObjectDef {
  id: string;
  label?: string;
  shape: 'ellipsoid' | 'sphere' | 'tube' | 'box' | 'cylinder' | 'torus' | 'disc' | 'stones' | 'ring' | 'lens' | 'sheet';
  /** ตำแหน่ง (u = ไปทางซ้ายของผู้ป่วย, v = ไปทางเท้า, d = ลึกจากผิว) */
  at?: V3;
  size?: V3;
  r?: number;
  /** tube: จุดผ่าน และรัศมี (ค่าเดียว หรือหลายค่าไล่ตามความยาว) */
  points?: V3[];
  radii?: number[];
  /** ปลายท่อมนปิด */
  caps?: boolean;
  /** มองจากด้านในท่อ (อุโมงค์กล้องส่อง) */
  inside?: boolean;
  h?: number;
  rot?: V3;
  count?: number;
  color: string;
  emissive?: string;
  rough?: number;
  metal?: number;
  opacity?: number;
  hidden?: boolean;
  /** รัศมีตัวรับการคลิก (สำหรับวัตถุเล็ก) */
  hit?: number;
  /** ไม่ให้คลิก (ฉากหลัง) */
  noPick?: boolean;
  /** วิธีตอบสนองเมื่อถู/ดูด: pool = ปริมาตรลดลง, fade = จางหายไป */
  scrub?: 'pool' | 'fade';
  /** ลากได้ (วัตถุเลื่อนตามเมาส์) */
  draggable?: boolean;
  /** เต้นเป็นจังหวะ (หัวใจ) */
  pulse?: boolean;
  /** แกนหมุนสำหรับ action rotate (ค่าเริ่มต้น y) */
  axis?: 'x' | 'y' | 'z';
  parent?: string;
  model?: string;
  /** เป็นแอ่งเลือด: จะขยายเมื่อมีเลือดออก */
  blood?: boolean;
}

export interface FieldLayerDef {
  id: string;
  name: string;
  depth: number;
  color: string;
  edge: string;
  tex?: 'skin' | 'fat' | 'muscle' | 'bone' | 'membrane' | 'none';
  /** ใช้แนวเปิดของ path ใด (ค่าเริ่มต้น = field.opening) */
  path?: string;
}

export interface FieldPathDef {
  points?: [number, number][];
  /** วงกลม [u, v, รัศมี] */
  circle?: [number, number, number];
}

export interface FieldDef {
  /** ครึ่งความกว้าง/ยาวของหน้าต่างผ่าตัด (เมตร) — กำหนดสเกลทั้งฉาก (ตา ≈ 0.02, ช่องท้อง ≈ 0.075) */
  window: { hw: number; hd: number };
  /** ตำแหน่งหน้าต่างบนลำตัว [x, z] (เมตร; สะดือ = [0,0], ขวาของผู้ป่วย = x ลบ, ศีรษะ = z ลบ) ค่าเริ่มต้น = ท้องน้อยขวา */
  center?: [number, number];
  layers: FieldLayerDef[];
  paths: Record<string, FieldPathDef>;
  opening: string;
  cavity?: { color: string; depth: number } | null;
  objects: FieldObjectDef[];
  /** มุมกล้องพิเศษ (กล้องส่อง/อุโมงค์) ใช้ด้วย effect "camera:<ชื่อ>" */
  cameras?: Record<string, { pos: V3; target: V3 }>;
  skinColor?: string;
  drapeColor?: string;
  /** แผ่นฝึกกรีด-เย็บ (ด่าน 0) ไม่มีผ้าคลุมผู้ป่วย */
  practicePad?: boolean;
}

export interface CaseDef {
  id: string;
  /** tutorial = ด่าน 0 ข้ามการสืบสวน/วินิจฉัย */
  mode?: 'case' | 'tutorial';
  system: string;
  systemName: string;
  stage: number;
  title: string;
  diseaseName: string;
  curriculum: string[];
  patient: {
    name: string;
    age: number;
    sex: 'M' | 'F';
    job: string;
    portrait?: string;
    avatar?: { skin?: string; hair?: string; gown?: string };
  };
  chiefComplaint: string;
  background?: string;
  vitals: CaseVitals;
  /** แผนภาพที่ใช้ตรวจร่างกาย */
  examMap?: 'abdomen' | 'chest' | 'head' | 'neck' | 'leg' | 'pelvis' | 'eye' | 'list';
  history: HistoryItem[];
  exam: ExamItem[];
  tests: TestItem[];
  budget: number;
  events?: CaseEvent[];
  /** ไม่มีในด่าน 0 (tutorial) */
  diagnosis?: {
    options: string[];
    answer: number;
    explains: string[];
    evidenceRequired: string[];
    bioQuestion: ChoiceDef;
  };
  preOp?: {
    /** คำถามตัดสินใจก่อนผ่าตัด (เช่น ใส่ขดลวด vs บายพาส) */
    decision?: ChoiceDef;
    /** มินิเกมก่อนผ่าตัด (เช่น ให้เลือด จับคู่ผู้บริจาค) */
    minigames?: MinigameDef[];
    procedure?: string;
    anesthesia: ChoiceDef;
    tray: { distractors: { id: string; name: string; why: string }[] };
  };
  surgery: {
    scene: string;
    field?: FieldDef;
    /** local = ผู้ป่วยรู้สึกตัว (ยาชาเฉพาะที่) ไม่ใช้เครื่องช่วยหายใจ */
    anesthesia?: 'general' | 'local';
    /** เลือดออกเพิ่มเติมตั้งแต่ต้น (เช่น ม้ามแตก) มล./วินาที หยุดเมื่อถึงขั้นที่ระบุ */
    initialBleed?: { rate: number; stopOn: string };
    timeLimitSec: number;
    steps: StepDef[];
  };
  postOp: {
    outcomes: { good: string; infection: string; ruptured: string; damage: string };
    advice: ChoiceDef;
    quiz: ChoiceDef[];
  };
  codex: { id: string; title: string; text: string };
}

export interface CaseIndexEntry {
  id: string;
  stage: number;
  system: string;
  systemName: string;
  title: string;
  available: boolean;
}
