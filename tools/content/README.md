# สคริปต์สร้างเนื้อหา (ห้องปฏิบัติการกายวิภาค และเคส x.3)

ไฟล์เคส `public/cases/anatomy-0*.json` และ `digestive-03`, `respiratory-03`, `circulatory-03` สร้างจากสคริปต์เหล่านี้
ใช้ `A(u, v_ที่ต้องการให้เห็น, d)` ชดเชยพารัลแลกซ์ของกล้องให้อัตโนมัติ (v_จริง = v − 0.387·d)

```bash
cd tools/content
python lab1.py            # anatomy-01   (lab2.py = 02–03, lab4.py = 04–05, lab6.py = 06–07, lab8.py = 08, lab9.py = 09)
python c1.py              # digestive-03, respiratory-03, circulatory-03
python addindex.py anatomy-01         # เพิ่ม/อัปเดตรายการใน index.json
python attach_models.py anatomy-01    # ⚠️ ต้องรันซ้ำหลังสร้างใหม่ทุกครั้ง เพื่อใส่ "model" (โมเดล BodyParts3D)
```

- `attach_models.py` ใส่โมเดลในไฟล์ที่สร้างจากสคริปต์ (เขียนไฟล์ใหม่ทั้งไฟล์)
- `attach_text.py` ใส่โมเดลในไฟล์เคสที่เขียนด้วยมือแบบแทรกข้อความ (รักษารูปแบบเดิม)
- บน Windows ให้ตั้ง `PYTHONIOENCODING=utf-8` ก่อนรัน
