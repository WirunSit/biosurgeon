/**
 * BioSurgeon — รับคะแนนนักเรียนเข้า Google Sheets (แผนข้อ 4.2 / 9.4)
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 * 1. สร้าง Google Sheets ใหม่ > ส่วนขยาย > Apps Script
 * 2. ลบโค้ดเดิม แล้ววางโค้ดทั้งไฟล์นี้ > บันทึก
 * 3. ทำให้ใช้งานได้ (Deploy) > การทำให้ใช้งานได้รายการใหม่ > ประเภท: เว็บแอป
 *      เรียกใช้ในฐานะ: ฉัน   |   ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน
 * 4. คัดลอก URL ที่ลงท้ายด้วย /exec ไปใส่ในเกม: โหมดครู > ตั้งค่าห้องเรียน
 *
 * ข้อมูลที่ส่งมา: เวลา รหัสห้อง เลขที่/ชื่อเล่น เคส คะแนนแต่ละหมวด และรายการข้อผิดพลาด (ไม่มีข้อมูลส่วนบุคคลอื่น)
 */
const SHEET_NAME = 'ผลการเรียน';
const HEADERS = ['เวลา', 'รหัสห้อง', 'นักเรียน', 'รหัสเคส', 'ชื่อเคส', 'ระดับ', 'คะแนนรวม', 'ดาว',
  'วินิจฉัย(30)', 'ผ่าตัด(25)', 'ความปลอดภัย(20)', 'ชีววิทยา(20)', 'เวลา(5)', 'นาทีผ่าตัด', 'เสียเลือด(มล.)', 'อาการทรุด', 'ข้อผิดพลาด'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#d7f0ee');
  }
  return sh;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const r = JSON.parse(e.postData.contents);
    const clean = (v, n) => String(v == null ? '' : v).slice(0, n || 200);
    sheet_().appendRow([
      new Date(r.time || Date.now()), clean(r.classCode, 20), clean(r.student, 30), clean(r.caseId, 40), clean(r.caseTitle, 80),
      clean(r.difficulty, 12), Number(r.total) || 0, Number(r.stars) || 0, Number(r.diagnosis) || 0, Number(r.surgery) || 0,
      Number(r.safety) || 0, Number(r.biology) || 0, Number(r.timeScore) || 0, Number(r.minutes) || 0, Number(r.bloodLoss) || 0,
      r.ruptured ? 'ใช่' : '', (r.mistakes || []).map(String).join(' | ').slice(0, 2000),
    ]);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('BioSurgeon score receiver is running. แถวทั้งหมด: ' + (sheet_().getLastRow() - 1));
}
