import type { CaseDef, CaseIndexEntry, Difficulty } from '../types';
import { clearResults, commonMistakes, loadResults, saveTeacher, toCSV, type TeacherSettings } from '../core/Results';
import { TOOL_NAMES } from '../procedural/tools';
import { h, modal, screen, toast } from './dom';

/** ถามรหัสครู (ป้องกันนักเรียนกดเข้าโดยบังเอิญ — ไม่ใช่ระบบความปลอดภัย) */
export function askPin(t: TeacherSettings): Promise<boolean> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', inputmode: 'numeric', class: 'text-in', placeholder: 'รหัสครู', 'aria-label': 'รหัสครู' }) as HTMLInputElement;
    const back = h('div', { class: 'modal-back' });
    const ok = () => {
      back.remove();
      resolve(input.value === t.pin);
      if (input.value !== t.pin) toast('รหัสไม่ถูกต้อง', 'bad');
    };
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') ok();
    });
    back.append(
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('h2', {}, 'โหมดครู'),
        h('p', { class: 'muted' }, 'รหัสเริ่มต้นคือ 1234 — เปลี่ยนได้ในหน้าตั้งค่า'),
        input,
        h(
          'div',
          { class: 'modal-actions' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                back.remove();
                resolve(false);
              },
            },
            'ยกเลิก',
          ),
          h('button', { class: 'btn primary', onclick: ok }, 'เข้าสู่โหมดครู'),
        ),
      ),
    );
    document.getElementById('ui')!.append(back);
    input.focus();
  });
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function showTeacher(index: CaseIndexEntry[], t: TeacherSettings, fetchCase: (id: string) => Promise<CaseDef>): Promise<void> {
  return new Promise((resolve) => {
    const sc = screen('teacher');
    const panes: HTMLElement[] = [];
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const names = ['ตั้งค่าห้องเรียน', 'ผลการเรียน', 'ข้อผิดพลาดที่พบบ่อย', 'เฉลย/สาธิตเคส'];
    names.forEach((n, i) => {
      const b = h('button', { class: `tab ${i === 0 ? 'on' : ''}`, role: 'tab' }, n);
      b.addEventListener('click', () => {
        tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        panes.forEach((p, j) => p.classList.toggle('hidden', j !== i));
        if (i === 1) renderResults();
        if (i === 2) renderMistakes();
      });
      tabs.append(b);
    });

    // ---------- ตั้งค่า ----------
    const set = h('div', { class: 'pane' });
    const cls = h('input', { class: 'text-in', value: t.classCode, placeholder: 'เช่น ม5-1' }) as HTMLInputElement;
    const url = h('input', { class: 'text-in', value: t.sheetUrl, placeholder: 'https://script.google.com/macros/s/.../exec' }) as HTMLInputElement;
    const pin = h('input', { class: 'text-in', value: t.pin, inputmode: 'numeric' }) as HTMLInputElement;
    const unlock = h('input', { type: 'checkbox' }) as HTMLInputElement;
    unlock.checked = t.unlockAll;
    const seq = h('input', { type: 'checkbox' }) as HTMLInputElement;
    seq.checked = t.sequential;
    const diff = h(
      'select',
      { class: 'text-in' },
      h('option', { value: '' }, 'ให้นักเรียนเลือกเอง'),
      h('option', { value: 'easy' }, 'บังคับ: ง่าย'),
      h('option', { value: 'normal' }, 'บังคับ: ปกติ'),
      h('option', { value: 'challenge' }, 'บังคับ: ท้าทาย'),
    ) as HTMLSelectElement;
    diff.value = t.forceDifficulty ?? '';
    const stageBox = h('div', { class: 'chips' });
    const stageNames = new Map<number, string>([[0, 'ด่าน 0 ฝึกพื้นฐาน']]);
    for (const e of index) if (!stageNames.has(e.stage)) stageNames.set(e.stage, `ด่าน ${e.stage} ${e.systemName}`);
    const stageChecks = new Map<number, HTMLInputElement>();
    for (const [n, name] of [...stageNames].sort((a, b) => a[0] - b[0])) {
      const c = h('input', { type: 'checkbox' }) as HTMLInputElement;
      c.checked = t.stages.includes(n);
      stageChecks.set(n, c);
      stageBox.append(h('label', { class: 'chip check-chip' }, c, ` ${name}`));
    }
    const link = h('input', { class: 'text-in', readonly: true }) as HTMLInputElement;
    const updateLink = () => {
      const u = new URL(location.href.split('?')[0]);
      if (cls.value) u.searchParams.set('class', cls.value.trim());
      if (url.value) u.searchParams.set('sheet', url.value.trim());
      const st = [...stageChecks].filter(([, c]) => c.checked).map(([n]) => n);
      if (st.length !== stageChecks.size) u.searchParams.set('stages', st.join(','));
      if (diff.value) u.searchParams.set('difficulty', diff.value);
      link.value = u.toString();
    };
    for (const el of [cls, url, diff]) el.addEventListener('input', updateLink);
    for (const c of stageChecks.values()) c.addEventListener('change', updateLink);
    updateLink();
    const save = h('button', { class: 'btn primary' }, 'บันทึกการตั้งค่า');
    save.addEventListener('click', () => {
      t.classCode = cls.value.trim();
      t.sheetUrl = url.value.trim();
      t.pin = pin.value.trim() || '1234';
      t.unlockAll = unlock.checked;
      t.sequential = seq.checked;
      t.forceDifficulty = (diff.value || null) as Difficulty | null;
      t.stages = [...stageChecks].filter(([, c]) => c.checked).map(([n]) => n);
      saveTeacher(t);
      toast('บันทึกแล้ว', 'good');
    });
    const copy = h('button', { class: 'btn' }, 'คัดลอกลิงก์');
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(link.value).then(() => toast('คัดลอกลิงก์แล้ว', 'good'));
    });
    set.append(
      h('div', { class: 'form-grid' },
        h('label', { class: 'field-label' }, 'รหัสห้องเรียน'), cls,
        h('label', { class: 'field-label' }, 'URL ของ Google Apps Script (ส่งคะแนนเข้า Sheets)'), url,
        h('p', { class: 'muted small' }, 'วิธีสร้าง URL อยู่ในไฟล์ teacher/คู่มือครู.md — ถ้าเว้นว่าง คะแนนจะเก็บไว้เฉพาะในเครื่องนี้'),
        h('label', { class: 'field-label' }, 'ด่านที่เปิดให้เล่น (ตามแผนการสอน)'), stageBox,
        h('label', { class: 'check' }, seq, ' ต้องผ่านด่านก่อนหน้าก่อน (ปลดล็อกทีละด่าน)'),
        h('label', { class: 'check' }, unlock, ' ปลดล็อกทุกเคสในเครื่องนี้ (สาธิตหน้าห้อง)'),
        h('label', { class: 'field-label' }, 'ระดับความยาก'), diff,
        h('label', { class: 'field-label' }, 'รหัสครู'), pin,
        h('label', { class: 'field-label' }, 'ลิงก์สำหรับแจกนักเรียน (ตั้งค่าห้องให้อัตโนมัติ)'), link,
      ),
      h('div', { class: 'row end' }, copy, save),
    );
    panes.push(set);

    // ---------- ผลการเรียน ----------
    const res = h('div', { class: 'pane hidden' });
    const renderResults = () => {
      const rows = loadResults().filter((r) => !cls.value || r.classCode === cls.value.trim() || !r.classCode);
      res.innerHTML = '';
      const table = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['เวลา', 'นักเรียน', 'เคส', 'ระดับ', 'คะแนน', 'ดาว', 'วินิจฉัย', 'ผ่าตัด', 'ปลอดภัย', 'ชีวะ'].map((x) => h('th', {}, x)))));
      const tb = h('tbody');
      for (const r of [...rows].reverse())
        tb.append(h('tr', {}, ...[new Date(r.time).toLocaleString('th-TH'), r.student, r.caseTitle, r.difficulty, r.total, '★'.repeat(r.stars), r.diagnosis, r.surgery, r.safety, r.biology].map((x) => h('td', {}, String(x)))));
      table.append(tb);
      const csv = h('button', { class: 'btn primary' }, 'ส่งออก CSV');
      csv.addEventListener('click', () => download(`biosurgeon-${cls.value || 'ผล'}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), 'text/csv;charset=utf-8'));
      const clr = h('button', { class: 'btn' }, 'ล้างผลในเครื่องนี้');
      clr.addEventListener('click', async () => {
        const yes = await modal({ title: 'ล้างผลการเรียน?', tone: 'warn', body: 'ผลที่ส่งเข้า Google Sheets แล้วจะไม่ถูกลบ', buttons: [{ label: 'ยกเลิก', value: false }, { label: 'ล้าง', value: true, primary: true }] });
        if (yes) {
          clearResults();
          renderResults();
        }
      });
      const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.total, 0) / rows.length) : 0;
      res.append(
        h('p', {}, `ทั้งหมด ${rows.length} ครั้ง • คะแนนเฉลี่ย ${avg}`, cls.value ? ` • ห้อง ${cls.value}` : ''),
        rows.length ? h('div', { class: 'tbl-wrap' }, table) : h('p', { class: 'muted' }, 'ยังไม่มีผลการเล่นในเครื่องนี้'),
        h('div', { class: 'row end' }, clr, csv),
      );
    };
    panes.push(res);

    // ---------- ข้อผิดพลาดที่พบบ่อย ----------
    const mis = h('div', { class: 'pane hidden' });
    const renderMistakes = () => {
      mis.innerHTML = '';
      const list = commonMistakes(loadResults());
      if (!list.length) {
        mis.append(h('p', { class: 'muted' }, 'ยังไม่มีข้อมูล'));
        return;
      }
      mis.append(h('p', { class: 'muted' }, 'ร้อยละของนักเรียนที่ทำผิดเรื่องนี้ (ใช้ทำวิจัยในชั้นเรียน / วางแผนสอนซ่อมเสริม)'));
      for (const m of list)
        mis.append(
          h('div', { class: 'score-line' }, h('div', { class: 'sl-head' }, h('b', {}, m.mistake), h('span', {}, `${m.pct}% (${m.n} คน)`)), h('div', { class: 'sl-bar warn' }, h('i', { style: `width:${m.pct}%` })), h('small', {}, m.caseTitle)),
        );
    };
    panes.push(mis);

    // ---------- เฉลย ----------
    const ans = h('div', { class: 'pane hidden' });
    const pickCase = h('select', { class: 'text-in' }, ...index.filter((e) => e.available).map((e) => h('option', { value: e.id }, `ด่าน ${e.stage} • ${e.title}`))) as HTMLSelectElement;
    const out = h('div', { class: 'answer-key' });
    const renderKey = async () => {
      out.innerHTML = '<p class="muted">กำลังโหลด…</p>';
      try {
        const c = await fetchCase(pickCase.value);
        out.innerHTML = '';
        out.append(h('h3', {}, `${c.title} — ${c.diseaseName}`));
        if (c.curriculum?.length) out.append(h('p', { class: 'muted' }, `ตัวชี้วัด: ${c.curriculum.join(', ')}`));
        if (c.diagnosis) {
          const dx = c.diagnosis;
          out.append(h('p', {}, h('b', {}, 'คำตอบ: '), dx.options[dx.answer]), h('p', {}, h('b', {}, 'หลักฐานสำคัญ: '), dx.evidenceRequired.join(', ')));
        }
        out.append(h('h4', {}, 'ขั้นตอนผ่าตัด'), h('ol', {}, ...c.surgery.steps.map((s) => h('li', {}, s.say, s.tool ? h('span', { class: 'muted' }, ` [${TOOL_NAMES[s.tool]}]`) : null))));
        const qs = [...(c.diagnosis ? [c.diagnosis.bioQuestion] : []), ...(c.postOp?.advice ? [c.postOp.advice] : []), ...(c.postOp?.quiz ?? [])];
        out.append(h('h4', {}, 'เฉลยคำถาม'), h('ol', {}, ...qs.map((q) => h('li', {}, q.q, h('br'), h('b', {}, `✔ ${q.choices[q.answer]}`)))));
      } catch (e) {
        out.textContent = String(e);
      }
    };
    pickCase.addEventListener('change', () => void renderKey());
    ans.append(h('p', { class: 'muted' }, 'ใช้สาธิตหน้าห้องผ่านโปรเจกเตอร์ — อย่าเปิดหน้านี้ให้นักเรียนเห็นก่อนเล่น'), pickCase, out);
    panes.push(ans);
    void renderKey();

    const close = h('button', { class: 'btn primary' }, 'ออกจากโหมดครู');
    close.addEventListener('click', () => {
      sc.remove();
      resolve();
    });
    sc.append(h('div', { class: 'panel wide' }, h('div', { class: 'debrief-head' }, h('h2', {}, 'โหมดครู'), close), tabs, ...panes));
  });
}
