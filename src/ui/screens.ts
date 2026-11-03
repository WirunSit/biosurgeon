import type { CaseDef, CaseIndexEntry, Difficulty, ToolId } from '../types';
import type { Session } from '../core/Session';
import type { VitalsSim } from '../core/VitalsSim';
import type { Progress } from '../core/Progress';
import { saveStudent, type Student, type TeacherSettings } from '../core/Results';
import type { ScoreResult } from '../core/Scoring';
import { sfx } from '../core/Audio';
import { TOOL_NAMES, TOOL_ORDER } from '../procedural/tools';
import { TOOL_ICONS, avatarSVG, distractorIcon } from './art';
import { bodyMapSVG } from './bodymaps';
import { playMinigame } from './minigames';
import { askChoice, h, modal, screen, shuffleInPlace, stars, toast } from './dom';

// =====================================================================
// ล็อบบี้โรงพยาบาล — บอร์ดผู้ป่วย 9 ระบบ × 2 เคส
// =====================================================================

export interface LobbyChoice {
  kind: 'case';
  caseId: string;
  difficulty: Difficulty;
  reducedGore: boolean;
  sound: boolean;
}

export type LobbyResult = LobbyChoice | { kind: 'teacher' };

/** เคสนี้นักเรียนเล่นได้หรือยัง (ครูเปิดด่าน / ต้องผ่านด่านก่อนหน้า) */
export function caseLock(e: CaseIndexEntry, index: CaseIndexEntry[], prog: Progress, t: TeacherSettings): string | null {
  if (!e.available) return 'กำลังพัฒนา';
  if (t.unlockAll) return null;
  if (!t.stages.includes(e.stage)) return 'ครูยังไม่เปิดด่านนี้';
  if (t.sequential && e.stage > 0) {
    const prevStages = [...new Set(index.filter((x) => x.available && x.stage < e.stage && t.stages.includes(x.stage)).map((x) => x.stage))];
    const prev = prevStages.length ? Math.max(...prevStages) : -1;
    if (prev >= 0 && !index.some((x) => x.stage === prev && prog.best[x.id])) return `ผ่านด่าน ${prev} ก่อน`;
  }
  return null;
}

export function showLobby(index: CaseIndexEntry[], prog: Progress, t: TeacherSettings, student: Student): Promise<LobbyResult> {
  return new Promise((resolve) => {
    const sc = screen('lobby');
    const st = { ...prog.settings };
    if (t.forceDifficulty) st.difficulty = t.forceDifficulty;

    const diffRow = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'ระดับความช่วยเหลือ' });
    const diffs: [Difficulty, string, string][] = [
      ['easy', 'ง่าย', 'ไฮไลต์เป้าหมาย + บอกเครื่องมือ'],
      ['normal', 'ปกติ', 'บอกแค่คำสั่ง'],
      ['challenge', 'ท้าทาย', 'ต้องจำขั้นตอนเอง'],
    ];
    const renderDiff = () => {
      diffRow.innerHTML = '';
      for (const [id, name, desc] of diffs)
        diffRow.append(
          h(
            'button',
            {
              class: `seg-btn ${st.difficulty === id ? 'on' : ''}`,
              role: 'radio',
              'aria-checked': String(st.difficulty === id),
              disabled: !!t.forceDifficulty && t.forceDifficulty !== id,
              onclick: () => {
                st.difficulty = id;
                renderDiff();
              },
            },
            h('b', {}, name),
            h('small', {}, desc),
          ),
        );
    };
    renderDiff();

    const gore = h('input', { type: 'checkbox', id: 'gore' }) as HTMLInputElement;
    gore.checked = st.reducedGore;
    gore.addEventListener('change', () => (st.reducedGore = gore.checked));
    const snd = h('input', { type: 'checkbox', id: 'snd' }) as HTMLInputElement;
    snd.checked = st.sound;
    snd.addEventListener('change', () => (st.sound = snd.checked));

    const nameIn = h('input', { class: 'text-in', value: student.name, placeholder: 'เลขที่ / ชื่อเล่น เช่น 12 ต้น', maxlength: 30 }) as HTMLInputElement;
    const clsIn = h('input', { class: 'text-in', value: student.classCode || t.classCode, placeholder: 'รหัสห้อง (ครูบอก)', maxlength: 20 }) as HTMLInputElement;
    const saveId = () => saveStudent({ name: nameIn.value.trim(), classCode: clsIn.value.trim() });
    nameIn.addEventListener('change', saveId);
    clsIn.addEventListener('change', saveId);

    const start = (e: CaseIndexEntry) => {
      saveId();
      if (!nameIn.value.trim() && (t.classCode || t.sheetUrl)) {
        toast('กรอกเลขที่/ชื่อเล่นก่อนเข้าเวร เพื่อให้ครูเห็นคะแนน', 'bad');
        nameIn.focus();
        return;
      }
      sfx.unlock();
      sc.remove();
      resolve({ kind: 'case', caseId: e.id, ...st });
    };

    const board = h('div', { class: 'board' });
    const stages = [...new Set(index.map((e) => e.stage))].sort((a, b) => a - b);
    for (const stg of stages) {
      const entries = index.filter((e) => e.stage === stg);
      const col = h('div', { class: `stage ${stg === 0 ? 'tutorial' : ''}` }, h('div', { class: 'stage-head' }, h('span', { class: 'stage-no' }, `ด่าน ${stg}`), entries[0].systemName));
      entries.forEach((e, i) => {
        const best = prog.best[e.id];
        const lock = caseLock(e, index, prog, t);
        const card = h(
          'button',
          { class: `case-card ${lock ? 'locked' : ''}`, disabled: !!lock },
          h('span', { class: 'bed' }, stg === 0 ? 'ห้องฝึก' : `เตียง ${stg}${'AB'[i] ?? i + 1}`),
          h('b', {}, `“${e.title}”`),
          h('small', {}, lock ?? (best ? `ดีที่สุด ${best.score} คะแนน ${stars(best.stars)}` : stg === 0 ? 'เริ่มที่นี่ก่อน!' : 'ผู้ป่วยรายใหม่ — รอการตรวจ')),
        );
        if (!lock) card.addEventListener('click', () => start(e));
        col.append(card);
      });
      board.append(col);
    }

    const codexBtn = h('button', { class: 'btn' }, `สมุดกายวิภาค (${prog.codex.length})`);
    codexBtn.addEventListener('click', () => {
      const body = prog.codex.length
        ? h('div', { class: 'codex' }, ...prog.codex.map((c) => h('div', { class: 'codex-item' }, h('b', {}, c.title), h('p', {}, c.text))))
        : 'ยังไม่มีบันทึก — ผ่าตัดสำเร็จเพื่อปลดล็อกความรู้กายวิภาคของอวัยวะ';
      void modal({ title: 'สมุดกายวิภาค (Anatomy Codex)', body, buttons: [{ label: 'ปิด', value: 0, primary: true }] });
    });
    const creditBtn = h('button', { class: 'btn ghost' }, 'เครดิต');
    creditBtn.addEventListener('click', () => {
      void modal({
        title: 'เครดิต',
        body: h(
          'div',
          {},
          h('p', {}, 'โมเดลสร้างด้วยโค้ด (procedural) ด้วย three.js (MIT License) — โมเดลอวัยวะจาก Z-Anatomy (CC BY-SA 4.0) จะแสดงเครดิตที่นี่เมื่อนำมาใช้'),
          h('p', {}, 'ฟอนต์ Sarabun (SIL Open Font License) • เสียงสังเคราะห์ด้วย Web Audio • แผนภาพทั้งหมดวาดเพื่อการศึกษา ไม่ใช่ภาพทางการแพทย์จริง'),
          h('p', {}, 'รายละเอียดในไฟล์ CREDITS.md'),
        ),
        buttons: [{ label: 'ปิด', value: 0, primary: true }],
      });
    });
    const teacherBtn = h('button', { class: 'btn ghost' }, 'โหมดครู');
    teacherBtn.addEventListener('click', () => {
      sc.remove();
      resolve({ kind: 'teacher' });
    });

    sc.append(
      h(
        'div',
        { class: 'lobby-wrap' },
        h(
          'header',
          { class: 'brand' },
          h('div', { class: 'logo', html: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#0f8b8d"/><path d="M24 11v26M11 24h26" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>' }),
          h('div', {}, h('h1', {}, 'BioSurgeon'), h('p', {}, 'ศัลยแพทย์ชีววิทยา — โรงพยาบาลจำลองสำหรับชีววิทยา ม.ปลาย')),
        ),
        h(
          'div',
          { class: 'disclaimer' },
          '⚠️ เกมนี้เป็นสื่อการเรียนรู้ชีววิทยา ขั้นตอนถูกลดทอนให้ง่าย ',
          h('b', {}, 'ไม่ใช่การฝึกทางการแพทย์จริง'),
          ' • ค่าตัวเลขเป็นค่าโดยประมาณเพื่อการศึกษา',
        ),
        h(
          'div',
          { class: 'lobby-grid' },
          h(
            'section',
            { class: 'panel settings' },
            h('h2', {}, 'ลงชื่อเข้าเวร'),
            nameIn,
            clsIn,
            h('label', { class: 'field-label' }, 'ระดับความช่วยเหลือ'),
            diffRow,
            h('label', { class: 'check' }, gore, ' โหมดลดความสมจริง (เลือดเป็นสีฟ้าพาสเทล)'),
            h('label', { class: 'check' }, snd, ' เปิดเสียงมอนิเตอร์และเอฟเฟกต์'),
            h('div', { class: 'row' }, codexBtn, creditBtn, teacherBtn),
          ),
          h('section', { class: 'panel board-panel' }, h('h2', {}, 'บอร์ดผู้ป่วย — เลือกเคส'), board),
        ),
      ),
    );
  });
}

// =====================================================================
// ① BRIEFING + ② INVESTIGATE — แฟ้มผู้ป่วย ซักประวัติ ตรวจร่างกาย สั่งตรวจ
// =====================================================================

export function showInvestigate(c: CaseDef, s: Session, vitals: VitalsSim): Promise<void> {
  return new Promise((resolve) => {
    const sc = screen('investigate');
    const cur = { ...c.vitals };
    const ev = (c.events ?? []).find((e) => e.trigger === 'investigateMinutes');
    let warned = false;

    const vitalsBox = h('div', { class: 'pt-vitals' });
    const renderVitals = () => {
      vitalsBox.innerHTML = '';
      const items: [string, string, boolean][] = [
        ['อุณหภูมิ', `${cur.T.toFixed(1)} °C`, cur.T >= 37.5],
        ['ชีพจร', `${cur.HR} /นาที`, cur.HR > 100],
        ['ความดัน', `${cur.BP} มม.ปรอท`, Number(cur.BP.split('/')[0]) < 100],
        ['หายใจ', `${cur.RR} /นาที`, cur.RR > 20],
        ['SpO₂', `${cur.SpO2}%`, cur.SpO2 < 95],
      ];
      for (const [k, v, ab] of items) vitalsBox.append(h('div', { class: `pv ${ab ? 'abn' : ''}` }, h('span', {}, k), h('b', {}, v)));
    };
    renderVitals();

    const clock = h('div', { class: 'clock' });
    const budget = h('div', { class: 'budget' });
    const notes = h('ul', { class: 'notes' });
    const refreshMeta = () => {
      clock.innerHTML = '';
      clock.append(h('span', {}, 'เวลาตั้งแต่มาถึง ER'), h('b', {}, `${Math.floor(s.minutes / 60)} ชม. ${s.minutes % 60} นาที`));
      clock.classList.toggle('warn', !!ev && s.minutes >= (ev.warnAt ?? 1e9) && !s.ruptured);
      clock.classList.toggle('bad', s.ruptured);
      budget.innerHTML = '';
      budget.append(h('span', {}, 'งบประมาณตรวจ'));
      const coins = h('span', { class: 'coins' });
      for (let i = 0; i < c.budget; i++) coins.append(h('i', { class: i < c.budget - s.budgetUsed ? 'on' : '' }));
      budget.append(coins, h('b', {}, `${c.budget - s.budgetUsed}/${c.budget}`));
      notes.innerHTML = '';
      if (!s.found.size) notes.append(h('li', { class: 'empty' }, 'ยังไม่มีข้อมูล — เริ่มซักประวัติหรือตรวจร่างกาย'));
      for (const [, text] of s.found) notes.append(h('li', {}, text));
    };

    const spend = (min: number) => {
      s.minutes += min;
      if (ev && !warned && ev.warnAt && s.minutes >= ev.warnAt && !s.ruptured) {
        warned = true;
        if (ev.warn) toast(ev.warn, 'bad', 5200);
      }
      if (ev && !s.ruptured && s.minutes >= ev.threshold) {
        s.ruptured = true;
        Object.assign(cur, ev.vitals ?? {});
        vitals.setBase(ev.vitals ?? {});
        vitals.infectionRisk += ev.infectionRisk ?? 0;
        renderVitals();
        sfx.alarm();
        s.mistakes.push({ phase: 'วินิจฉัย', title: 'ใช้เวลาสืบสวนนานเกินไป', explain: ev.message });
        void modal({ title: 'อาการทรุดลง!', tone: 'bad', speaker: 'พยาบาล ER', body: ev.message, buttons: [{ label: 'รับทราบ', value: 0, primary: true }] });
      }
      refreshMeta();
    };

    // --- แท็บซักประวัติ ---
    const histPane = h('div', { class: 'pane' });
    const chat = h('div', { class: 'chat' }, h('div', { class: 'bubble pt' }, c.background ?? c.chiefComplaint));
    const qList = h('div', { class: 'q-list' });
    for (const item of c.history) {
      const b = h('button', { class: 'q-btn' }, h('span', {}, item.q), h('small', {}, `⏱ ${item.minutes ?? 4} นาที`));
      b.addEventListener('click', () => {
        b.disabled = true;
        sfx.click();
        chat.append(h('div', { class: 'bubble dr' }, item.q), h('div', { class: 'bubble pt' }, item.a));
        chat.scrollTop = chat.scrollHeight;
        s.found.set(`history:${item.id}`, `ประวัติ: ${item.ev ?? item.a}`);
        spend(item.minutes ?? 4);
      });
      qList.append(b);
    }
    histPane.append(chat, qList);

    // --- แท็บตรวจร่างกาย ---
    const examPane = h('div', { class: 'pane hidden' });
    const svg = bodyMapSVG(c.examMap);
    const findings = h(
      'div',
      { class: 'findings' },
      h('p', { class: 'muted' }, svg ? 'คลิกบริเวณบนแผนภาพเพื่อตรวจ (มองจากด้านหน้าผู้ป่วย: ด้านขวาของผู้ป่วยอยู่ทางซ้ายของจอ)' : 'เลือกการตรวจร่างกายที่ต้องการ'),
    );
    const examDone = new Set<string>();
    const doExam = async (item: CaseDef['exam'][number], el?: Element) => {
      if (examDone.has(item.zone)) return;
      if (item.minigame) {
        const ok = await playMinigame(item.minigame, 'อาจารย์หมอ');
        if (item.minigame.bio !== false) s.bio(ok);
        if (!ok) s.mistakes.push({ phase: 'วินิจฉัย', title: item.minigame.title, explain: item.minigame.explain });
      }
      examDone.add(item.zone);
      el?.classList.add('done');
      sfx.click();
      findings.append(h('div', { class: `finding ${item.clue === true ? 'pos' : ''}` }, h('b', {}, item.label), h('p', {}, item.finding)));
      s.found.set(`exam:${item.zone}`, `ตรวจร่างกาย: ${item.ev ?? item.finding}`);
      spend(item.minutes ?? 3);
    };
    const abd = h('div', { class: 'abd-wrap', html: svg ?? '' });
    const onMap = new Set<string>();
    abd.querySelectorAll<SVGPathElement>('[data-zone]').forEach((z) => {
      const item = c.exam.find((e) => e.zone === z.dataset.zone);
      if (!item) {
        z.classList.add('inactive');
        return;
      }
      onMap.add(item.zone);
      z.setAttribute('tabindex', '0');
      z.setAttribute('role', 'button');
      z.setAttribute('aria-label', item.label);
      z.addEventListener('click', () => void doExam(item, z));
      z.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') void doExam(item, z);
      });
    });
    const extra = h('div', { class: 'q-list exam-list' });
    for (const item of c.exam.filter((e) => !onMap.has(e.zone))) {
      const b = h('button', { class: 'q-btn' }, h('span', {}, item.label), h('small', {}, `⏱ ${item.minutes ?? 3} นาที${item.minigame ? ' • มีมินิเกม' : ''}`));
      b.addEventListener('click', async () => {
        b.disabled = true;
        await doExam(item, b);
      });
      extra.append(b);
    }
    examPane.append(svg ? h('div', { class: 'exam-grid' }, abd, findings) : findings, extra);

    // --- แท็บสั่งตรวจ ---
    const testPane = h('div', { class: 'pane hidden' });
    const testList = h('div', { class: 'tests' });
    for (const t of c.tests) {
      const result = h('div', { class: 'result hidden' });
      const btn = h('button', { class: 'btn small primary' }, `สั่งตรวจ (${t.cost} งบ)`);
      btn.addEventListener('click', () => {
        if (c.budget - s.budgetUsed < t.cost) {
          toast('งบประมาณตรวจไม่พอแล้ว — เลือกตรวจเฉพาะที่จำเป็น', 'bad');
          sfx.bad();
          return;
        }
        btn.disabled = true;
        btn.textContent = 'ได้ผลแล้ว';
        s.budgetUsed += t.cost;
        sfx.click();
        result.classList.remove('hidden');
        result.append(h('p', {}, t.result));
        if (t.image) result.append(h('img', { src: t.image, alt: `ผล${t.name}`, class: 'test-img' }));
        if (t.explain) result.append(h('p', { class: 'muted' }, `หมายเหตุ: ${t.explain}`));
        s.found.set(`test:${t.id}`, `ผลตรวจ: ${t.ev ?? t.result}`);
        spend(t.minutes);
      });
      testList.append(
        h(
          'div',
          { class: 'test' },
          h('div', { class: 'test-head' }, h('b', {}, t.name), h('small', {}, `⏱ ${t.minutes} นาที`), btn),
          result,
        ),
      );
    }
    testPane.append(h('p', { class: 'muted' }, 'การตรวจแต่ละอย่างใช้งบประมาณและเวลา — ตรวจที่ไม่จำเป็นจะเสียทั้งงบและเวลา'), testList);

    const panes = [histPane, examPane, testPane];
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    ['ซักประวัติ', 'ตรวจร่างกาย', 'สั่งตรวจแล็บ/ภาพถ่าย'].forEach((name, i) => {
      const b = h('button', { class: `tab ${i === 0 ? 'on' : ''}`, role: 'tab' }, name);
      b.addEventListener('click', () => {
        tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        panes.forEach((p, j) => p.classList.toggle('hidden', j !== i));
      });
      tabs.append(b);
    });

    const go = h('button', { class: 'btn primary big' }, 'สรุปและวินิจฉัย →');
    go.addEventListener('click', async () => {
      if (s.found.size < 2) {
        toast('ข้อมูลยังน้อยเกินไป ลองซักประวัติหรือตรวจร่างกายเพิ่ม', 'bad');
        return;
      }
      sc.remove();
      resolve();
    });

    sc.append(
      h(
        'div',
        { class: 'inv-grid' },
        h(
          'aside',
          { class: 'panel patient' },
          h('div', { class: 'pt-top' }, h('div', { class: 'avatar', html: avatarSVG(c) }), h('div', {}, h('h2', {}, c.patient.name), h('p', {}, `อายุ ${c.patient.age} ปี • ${c.patient.job}`), h('span', { class: 'tag' }, `${c.systemName} • เคส “${c.title}”`))),
          h('div', { class: 'cc' }, h('b', {}, 'อาการสำคัญ'), h('p', {}, c.chiefComplaint)),
          vitalsBox,
        ),
        h('section', { class: 'panel work' }, tabs, ...panes),
        h('aside', { class: 'panel notebook' }, clock, budget, h('h3', {}, 'บันทึกหลักฐาน'), notes, go),
      ),
    );
    refreshMeta();
  });
}

// =====================================================================
// ③ DIAGNOSE — เลือกโรค + หลักฐานสนับสนุน 2–3 ข้อ + คำถามชีววิทยา
// =====================================================================

export function showDiagnose(c: CaseDef, s: Session): Promise<void> {
  return new Promise((resolve) => {
    const sc = screen('diagnose');
    const dx = c.diagnosis!;
    let pickedDx = -1;
    const pickedEv = new Set<string>();
    const order = shuffleInPlace(dx.options.map((_, i) => i));

    const dxRow = h('div', { class: 'dx-options' });
    const submit = h('button', { class: 'btn primary big', disabled: true }, 'ยืนยันการวินิจฉัย');
    const check = () => {
      submit.disabled = !(pickedDx >= 0 && pickedEv.size >= 2);
    };
    for (const i of order) {
      const b = h('button', { class: 'dx' }, dx.options[i]);
      b.addEventListener('click', () => {
        pickedDx = i;
        dxRow.querySelectorAll('.dx').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        check();
      });
      dxRow.append(b);
    }

    const evRow = h('div', { class: 'chips' });
    for (const [id, text] of s.found) {
      const b = h('button', { class: 'chip', 'data-id': id }, text);
      b.addEventListener('click', () => {
        if (pickedEv.has(id)) pickedEv.delete(id);
        else if (pickedEv.size < 3) pickedEv.add(id);
        else toast('เลือกได้สูงสุด 3 ข้อ', 'info');
        b.classList.toggle('on', pickedEv.has(id));
        check();
      });
      evRow.append(b);
    }

    submit.addEventListener('click', async () => {
      sc.remove();
      const correct = pickedDx === dx.answer;
      s.dxCorrect = correct;
      const support = new Set(dx.evidenceRequired);
      const good = [...pickedEv].filter((e) => support.has(e)).length;
      const bad = pickedEv.size - good;
      s.evidenceScore = Math.max(0, Math.min(1, (good - bad) / Math.max(2, pickedEv.size)));
      const minUseful = c.tests.filter((t) => t.clue === true).reduce((a, t) => a + t.cost, 0);
      s.budgetScore = Math.max(0, Math.min(1, 1 - Math.max(0, s.budgetUsed - minUseful) * 0.34));
      if (correct) sfx.good();
      else {
        sfx.bad();
        s.mistakes.push({ phase: 'วินิจฉัย', title: `วินิจฉัยว่า “${dx.options[pickedDx]}”`, explain: dx.explains[pickedDx] });
      }
      const evList = h('ul', { class: 'ev-feedback' });
      for (const id of pickedEv)
        evList.append(h('li', { class: support.has(id) ? 'ok' : 'no' }, `${support.has(id) ? '✔' : '✘'} ${s.found.get(id)}`));
      await modal({
        title: correct ? `วินิจฉัยถูกต้อง: ${dx.options[dx.answer]}` : `ยังไม่ถูก — โรคที่ถูกคือ “${dx.options[dx.answer]}”`,
        tone: correct ? 'good' : 'bad',
        speaker: 'อาจารย์หมอ',
        body: h(
          'div',
          {},
          !correct ? h('p', {}, dx.explains[pickedDx]) : null,
          h('p', {}, dx.explains[dx.answer]),
          h('h4', {}, 'หลักฐานที่เลือก'),
          evList,
          h('p', { class: 'muted' }, `ใช้งบตรวจ ${s.budgetUsed}/${c.budget} (การตรวจที่จำเป็นจริงใช้ ${minUseful})`),
        ),
        buttons: [{ label: 'ตอบคำถามชีววิทยา', value: 0, primary: true }],
      });
      const bq = dx.bioQuestion;
      const ok = await askChoice({ title: 'เชื่อมโยงความรู้ชีววิทยา', speaker: 'อาจารย์หมอ', ...bq });
      s.bio(ok);
      if (!ok) s.mistakes.push({ phase: 'วินิจฉัย', title: bq.q, explain: bq.explain });
      resolve();
    });

    sc.append(
      h(
        'div',
        { class: 'panel narrow' },
        h('h2', {}, 'วินิจฉัยโรค'),
        h('p', { class: 'muted' }, `${c.patient.name} อายุ ${c.patient.age} ปี — ${c.chiefComplaint}`),
        h('h3', {}, '1. ผู้ป่วยเป็นโรคอะไร?'),
        dxRow,
        h('h3', {}, '2. เลือกหลักฐานที่สนับสนุนการวินิจฉัย 2–3 ข้อ'),
        s.found.size ? evRow : h('p', { class: 'muted' }, 'ไม่มีหลักฐาน'),
        h('div', { class: 'row end' }, submit),
      ),
    );
  });
}

// =====================================================================
// ④ PRE-OP — วิธีระงับความรู้สึก + จัดถาดเครื่องมือ
// =====================================================================

export function requiredTools(c: CaseDef): ToolId[] {
  const set = new Set<ToolId>();
  const walk = (steps: CaseDef['surgery']['steps']) => {
    for (const st of steps) {
      if (st.tool) set.add(st.tool);
      for (const m of st.mistakes ?? []) if (m.bleed) walk(m.bleed.fix);
    }
  };
  walk(c.surgery.steps);
  for (const ev of c.events ?? []) walk(ev.steps ?? []);
  return TOOL_ORDER.filter((t) => set.has(t));
}

export async function showPreOp(c: CaseDef, s: Session): Promise<void> {
  const pre = c.preOp!;
  // ④ ตัดสินใจวิธีรักษา + มินิเกมก่อนผ่าตัด (ให้เลือด จับคู่ผู้บริจาค ฯลฯ)
  if (pre.decision) {
    const ok = await askChoice({ title: 'ตัดสินใจวิธีรักษา', speaker: 'อาจารย์หมอ', ...pre.decision });
    s.bio(ok);
    if (!ok) s.mistakes.push({ phase: 'เตรียมผ่าตัด', title: pre.decision.q, explain: pre.decision.explain });
  }
  for (const m of pre.minigames ?? []) {
    const ok = await playMinigame(m);
    if (m.bio !== false) s.bio(ok);
    if (!ok) s.mistakes.push({ phase: 'เตรียมผ่าตัด', title: m.title, explain: m.explain });
  }
  return preOpScreen(c, s, pre);
}

function preOpScreen(c: CaseDef, s: Session, pre: NonNullable<CaseDef['preOp']>): Promise<void> {
  return new Promise((resolve) => {
    const sc = screen('preop');
    const an = pre.anesthesia;
    let pickedAn = -1;
    const anRow = h('div', { class: 'dx-options col' });
    const anOrder = shuffleInPlace(an.choices.map((_, i) => i));
    const submit = h('button', { class: 'btn primary big', disabled: true }, 'ยืนยันและเข้าห้องผ่าตัด');
    for (const i of anOrder) {
      const b = h('button', { class: 'dx' }, an.choices[i]);
      b.addEventListener('click', () => {
        pickedAn = i;
        anRow.querySelectorAll('.dx').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        submit.disabled = false;
      });
      anRow.append(b);
    }

    const req = requiredTools(c);
    const items: { id: string; name: string; icon: string; need: boolean; why?: string }[] = [
      ...req.map((id) => ({ id, name: TOOL_NAMES[id], icon: TOOL_ICONS[id], need: true })),
      ...pre.tray.distractors.map((d) => ({ id: d.id, name: d.name, icon: distractorIcon(), need: false, why: d.why })),
    ];
    shuffleInPlace(items);
    const picked = new Set<string>();
    const trayGrid = h('div', { class: 'tray-pick' });
    for (const it of items) {
      const b = h('button', { class: 'pick' }, h('span', { class: 'ico', html: it.icon }), h('span', {}, it.name));
      b.addEventListener('click', () => {
        if (picked.has(it.id)) picked.delete(it.id);
        else picked.add(it.id);
        b.classList.toggle('on', picked.has(it.id));
        sfx.click();
      });
      trayGrid.append(b);
    }

    submit.addEventListener('click', async () => {
      sc.remove();
      s.anesthesiaCorrect = pickedAn === an.answer;
      const missing = items.filter((i) => i.need && !picked.has(i.id));
      const extra = items.filter((i) => !i.need && picked.has(i.id));
      s.trayErrors = missing.length + extra.length;
      if (!s.anesthesiaCorrect)
        s.mistakes.push({ phase: 'เตรียมผ่าตัด', title: `เลือกวิธีระงับความรู้สึก “${an.choices[pickedAn]}”`, explain: an.explain });
      if (s.trayErrors)
        s.mistakes.push({
          phase: 'เตรียมผ่าตัด',
          title: 'จัดถาดเครื่องมือไม่ครบ/เกิน',
          explain: [...missing.map((m) => `ขาด: ${m.name}`), ...extra.map((e) => `ไม่จำเป็น: ${e.name} — ${e.why}`)].join(' • '),
        });
      await modal({
        title: s.anesthesiaCorrect && !s.trayErrors ? 'เตรียมพร้อมสมบูรณ์!' : 'ตรวจสอบการเตรียมผ่าตัด',
        tone: s.anesthesiaCorrect && !s.trayErrors ? 'good' : 'warn',
        speaker: 'วิสัญญีแพทย์ และ พยาบาล',
        body: h(
          'div',
          {},
          h('h4', {}, s.anesthesiaCorrect ? '✔ วิธีระงับความรู้สึกถูกต้อง' : `✘ ควรเลือก: ${an.choices[an.answer]}`),
          h('p', {}, an.explain),
          h('h4', {}, s.trayErrors ? '✘ ถาดเครื่องมือ' : '✔ ถาดเครื่องมือครบถ้วน'),
          missing.length ? h('p', {}, `ขาด: ${missing.map((m) => m.name).join(', ')} (พยาบาลนำมาเพิ่มให้แล้ว)`) : null,
          ...extra.map((e) => h('p', {}, `ไม่จำเป็น: ${e.name} — ${e.why}`)),
        ),
        buttons: [{ label: 'เข้าห้องผ่าตัด', value: 0, primary: true }],
      });
      resolve();
    });

    sc.append(
      h(
        'div',
        { class: 'panel narrow' },
        h('h2', {}, 'เตรียมผ่าตัด'),
        h('p', { class: 'muted' }, pre.procedure ?? c.diseaseName),
        h('h3', {}, `1. ${an.q}`),
        anRow,
        h('h3', {}, '2. จัดถาดเครื่องมือ — เลือกเครื่องมือที่ต้องใช้ในการผ่าตัดครั้งนี้'),
        trayGrid,
        h('div', { class: 'row end' }, submit),
      ),
    );
  });
}

// =====================================================================
// ⑥ POST-OP — ผลหลังผ่าตัด + คำแนะนำ + Quiz
// =====================================================================

export async function showPostOp(c: CaseDef, s: Session): Promise<void> {
  const sc = screen('postop');
  const o = c.postOp.outcomes;
  const stories: { text: string; tone: string }[] = [];
  if (s.ruptured) stories.push({ text: o.ruptured, tone: 'warn' });
  if (s.organDamage >= 10) stories.push({ text: o.damage, tone: 'bad' });
  if (s.infectionRisk >= 35) stories.push({ text: o.infection, tone: 'bad' });
  if (!stories.length) stories.push({ text: o.good, tone: 'good' });
  sc.append(
    h(
      'div',
      { class: 'panel narrow' },
      h('h2', {}, 'หอผู้ป่วย — ติดตามอาการหลังผ่าตัด'),
      h('div', { class: 'pt-top' }, h('div', { class: 'avatar small', html: avatarSVG(c) }), h('div', {}, h('b', {}, c.patient.name), h('p', { class: 'muted' }, c.diseaseName))),
      ...stories.map((st) => h('div', { class: `story tone-${st.tone}` }, st.text)),
      h('p', { class: 'muted' }, 'ต่อไป: ให้คำแนะนำผู้ป่วย และตอบคำถามสรุปความรู้'),
    ),
  );
  const adv = c.postOp.advice;
  const okAdv = await askChoice({ title: 'ให้คำแนะนำหลังผ่าตัด', speaker: 'คุณแม่ของผู้ป่วยถาม', ...adv });
  s.bio(okAdv);
  if (!okAdv) s.mistakes.push({ phase: 'หลังผ่าตัด', title: adv.q, explain: adv.explain });
  let n = 1;
  for (const q of c.postOp.quiz) {
    const ok = await askChoice({ title: `สรุปความรู้ ข้อ ${n++}/${c.postOp.quiz.length}`, speaker: 'อาจารย์หมอ', ...q });
    s.bio(ok);
    if (!ok) s.mistakes.push({ phase: 'หลังผ่าตัด', title: q.q, explain: q.explain });
  }
  sc.remove();
}

// =====================================================================
// ⑦ DEBRIEF — สรุปคะแนน ดาว ข้อผิดพลาด ปลดล็อกสมุดกายวิภาค
// =====================================================================

export function showDebrief(c: CaseDef, s: Session, r: ScoreResult, newBest: boolean): Promise<'replay' | 'lobby'> {
  return new Promise((resolve) => {
    const sc = screen('debrief');
    const table = h('div', { class: 'score-table' });
    for (const l of r.lines)
      table.append(
        h(
          'div',
          { class: 'score-line' },
          h('div', { class: 'sl-head' }, h('b', {}, l.name), h('span', {}, `${l.score} / ${l.max}`)),
          h('div', { class: 'sl-bar' }, h('i', { style: `width:${(l.score / l.max) * 100}%` })),
          h('small', {}, l.note),
        ),
      );
    const mistakes = s.mistakes.length
      ? h('div', { class: 'mistakes' }, ...s.mistakes.map((m) => h('details', {}, h('summary', {}, h('span', { class: 'phase' }, m.phase), m.title), h('p', {}, m.explain))))
      : h('p', { class: 'muted' }, 'ไม่มีข้อผิดพลาด ยอดเยี่ยมมาก!');
    const replay = h('button', { class: 'btn' }, 'เล่นเคสนี้อีกครั้ง');
    const lobby = h('button', { class: 'btn primary' }, 'กลับล็อบบี้');
    replay.addEventListener('click', () => {
      sc.remove();
      resolve('replay');
    });
    lobby.addEventListener('click', () => {
      sc.remove();
      resolve('lobby');
    });
    sc.append(
      h(
        'div',
        { class: 'panel wide' },
        h(
          'div',
          { class: 'debrief-head' },
          h('div', {}, h('p', { class: 'muted' }, `${c.systemName} • “${c.title}”`), h('h2', {}, c.diseaseName), h('p', {}, `ยศ: ${r.rank}`)),
          h('div', { class: 'total' }, h('div', { class: 'stars', 'aria-label': `${r.stars} ดาว` }, stars(r.stars)), h('b', {}, `${r.total}`), h('span', {}, newBest ? 'คะแนนสูงสุดใหม่!' : '/ 100 คะแนน')),
        ),
        h(
          'div',
          { class: 'debrief-grid' },
          h('div', {}, h('h3', {}, 'คะแนน'), table, r.badges.length ? h('h3', {}, 'เหรียญพิเศษ') : null, h('div', { class: 'badges' }, ...r.badges.map((b) => h('div', { class: 'badge' }, h('b', {}, `🏅 ${b.name}`), h('small', {}, b.desc))))),
          h(
            'div',
            {},
            h('h3', {}, 'สิ่งที่ควรทบทวน'),
            mistakes,
            h('div', { class: 'codex-unlock' }, h('b', {}, `📖 ปลดล็อกสมุดกายวิภาค: ${c.codex.title}`), h('p', {}, c.codex.text)),
          ),
        ),
        h('div', { class: 'row end' }, replay, lobby),
      ),
    );
  });
}
