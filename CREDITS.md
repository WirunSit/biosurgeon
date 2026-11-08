# เครดิต

## ซอฟต์แวร์และฟอนต์
| รายการ | สัญญาอนุญาต | ใช้ทำอะไร |
|---|---|---|
| [three.js](https://threejs.org) | MIT | เรนเดอร์ 3 มิติ (รวม RoomEnvironment สำหรับแสงสะท้อน) |
| [Vite](https://vitejs.dev) | MIT | เครื่องมือพัฒนาและ build |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 | ภาษา |
| [Sarabun](https://fonts.google.com/specimen/Sarabun) (Google Fonts) | SIL Open Font License 1.1 | ฟอนต์ภาษาไทย |

## โมเดลอวัยวะ 3 มิติ (BodyParts3D)
โมเดลอวัยวะใน `public/models/organs/*.glb` (31 ไฟล์ เช่น ตับ กระเพาะ ม้าม ตับอ่อน ไต ปอดแต่ละกลีบ หัวใจ สมองใหญ่ สมองน้อย ก้านสมอง ต่อมไทมัส กล้ามเนื้อต้นแขน)
ดัดแปลงจาก **BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan**
- แหล่ง: [BodyParts3D / DBCLS](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html) ผ่านสำเนาบน GitHub [Kevin-Mattheus-Moerman/BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D) (ข้อมูลรุ่น 3.0 / 20110915)
- อ้างอิง: Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37:D782–5. doi:10.1093/nar/gkn613
- การดัดแปลง: รวมชิ้นย่อย ลดจำนวนสามเหลี่ยม ปรับผิวเรียบ หมุนแกน และแปลงเป็น .glb ด้วย `tools/bp3d-to-glb.mjs`
- **ไฟล์โมเดลที่ดัดแปลงแล้วเผยแพร่ภายใต้สัญญาอนุญาตเดียวกัน (CC BY-SA 2.1 JP)** — ผู้นำไปใช้ต่อต้องให้เครดิตและใช้สัญญาเดียวกัน

## โมเดล ภาพ และเสียง
- โมเดล 3 มิติอื่นทั้งหมด (ห้องผ่าตัด เครื่องมือ 27 ชิ้น ผ้าคลุม ชั้นเนื้อเยื่อ อวัยวะ) สร้างด้วยโค้ดในโปรเจกต์นี้ — ยังไม่มีไฟล์โมเดลจากภายนอก
- ไอคอนเครื่องมือ ภาพผู้ป่วยชั่วคราว แผนภาพร่างกาย (หน้าท้อง ทรวงอก ขา ท้องและสีข้าง) และแผนภาพผลตรวจทั้งหมดใน `public/img/`
  (อัลตราซาวนด์ เอกซเรย์ CT echo ฉีดสีหลอดเลือด กล้องตรวจตา รูม่านตา ทดสอบบีบน่อง) เป็น SVG ที่วาดขึ้นในโปรเจกต์นี้ — เป็นแผนภาพเพื่อการศึกษา ไม่ใช่ภาพทางการแพทย์จริง
- ตัวถอดรหัส [Draco](https://github.com/google/draco) (`public/draco/`, Google, Apache-2.0) คัดลอกจากแพ็กเกจ three.js
- เสียงสังเคราะห์ด้วย Web Audio API (ไม่มีไฟล์เสียงภายนอก)

## เมื่อเริ่มใช้โมเดลภายนอก (ระยะ 2)
เมื่อนำโมเดลจาก Z-Anatomy / BodyParts3D (CC BY-SA 4.0) หรือแหล่งอื่นมาใช้ ให้บันทึกชื่อชิ้น แหล่ง ผู้สร้าง และสัญญาอนุญาตในไฟล์นี้ทุกชิ้น
และแสดงในหน้าจอเครดิตของเกม (โมเดลที่ดัดแปลงจากงาน CC BY-SA ต้องเผยแพร่ด้วยสัญญาเดียวกัน)
