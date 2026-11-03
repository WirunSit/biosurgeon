# Prompt สำหรับเจนภาพด้วย GPT — BioSurgeon

รายการภาพทั้งหมดที่เกมใช้ พร้อม prompt สำหรับคัดลอกไปวางใน ChatGPT (สร้างภาพ)
ภาพที่ได้จะใช้แทนภาพกราฟิก SVG ที่มีอยู่ตอนนี้ (`public/img/*.svg`) และภาพผู้ป่วยการ์ตูนที่วาดด้วยโค้ด

---

## 0. อ่านก่อนเริ่ม

### ข้อควรระวังเรื่องภาพทางการแพทย์
แผนข้อ 6 เคยเตือนไว้ว่า AI มักวาดภาพ X-ray/CT/อัลตราซาวนด์**ผิดกายวิภาค** ถ้านักเรียนจำภาพผิดจะเสียมากกว่าได้ จึงทำแบบนี้:
- ภาพทางการแพทย์ทุกภาพมี **"ตรวจก่อนใช้"** ถ้าข้อใดไม่ผ่าน ให้เจนใหม่ (ระบุจุดที่ผิดให้ GPT แก้) หรือใช้ SVG เดิมต่อไป
- ทางเลือกที่แม่นยำกว่า: ภาพจริงสัญญาอนุญาตเปิดจาก [Wikimedia Commons](https://commons.wikimedia.org) หรือ [Radiopaedia](https://radiopaedia.org) (ตรวจสัญญาอนุญาตทุกภาพ และบันทึกเครดิตใน `CREDITS.md`)
- ให้แพทย์ช่วยดูภาพชุดสุดท้ายก่อนใช้กับนักเรียน

### กติกาที่ใส่ไว้ในทุก prompt แล้ว
- **ไม่มีตัวอักษรในภาพ** (GPT เขียนภาษาไทยเพี้ยน) — ป้ายชื่อและลูกศรภาษาไทยจะให้ Claude วาดซ้อนด้วยโค้ดภายหลัง
- **ด้านขวาของผู้ป่วยอยู่ทางซ้ายของภาพ** ในภาพ X-ray/CT (มาตรฐานรังสีวิทยา) — สำคัญมาก เพราะเกมสอนเรื่องซ้าย-ขวา
- ไม่มีภาพอวัยวะเพศหรือภาพเลือดสยอง ผู้ป่วยทุกคนสวมชุดผู้ป่วย

### ขั้นตอน
1. คัดลอก **บล็อกสไตล์** (หัวข้อ 1) วางเป็นข้อความแรกในแชท ChatGPT ใหม่ 1 แชทต่อ 1 หมวด (ภาพผู้ป่วยอยู่แชทเดียวกันทั้งหมด สไตล์จะคงที่)
2. วาง prompt ทีละภาพ ขนาดตามที่ระบุ (สี่เหลี่ยมจัตุรัส 1024×1024 หรือแนวนอน 1536×1024)
3. บันทึกไฟล์ตามชื่อที่กำหนดไว้ในโฟลเดอร์ `biosurgeon/public/img/gen/` (นามสกุล .png หรือ .webp ก็ได้)
4. บอก Claude ว่า "ใส่ภาพที่เจนแล้วใน public/img/gen" แล้ว Claude จะ:
   - เปลี่ยนให้แฟ้มผู้ป่วยใช้ภาพจริง (ถ้าไม่มีไฟล์ จะใช้ภาพการ์ตูนเดิม)
   - เปลี่ยน `image` ในไฟล์เคสให้ชี้ไปที่ภาพใหม่ และวาดป้ายชื่อ/ลูกศรภาษาไทยซ้อนบนภาพ
   - ปรับตำแหน่งจุดคลิกของมินิเกม (ภาพรูม่านตา ทดสอบบีบน่อง เอกซเรย์ระหว่างผ่าตัด) ให้ตรงกับภาพใหม่
   - ย่อไฟล์ให้เหลือไม่เกิน ~200 KB ต่อภาพ

ลำดับที่แนะนำ: ภาพผู้ป่วย (ได้ผลคุ้มที่สุด) → ภาพตรวจร่างกาย 3 ภาพ → ภาพ X-ray/CT/อัลตราซาวนด์

---

## 1. บล็อกสไตล์ (วางเป็นข้อความแรกของแชท)

### 1A. สำหรับภาพผู้ป่วย
```
I will ask you for a series of patient portraits for an educational biology game for Thai high-school students.
Keep ONE consistent style for every image in this chat:
- Semi-realistic digital illustration (painterly, soft shading, like a modern visual novel), not a photo, not anime-chibi
- Thai people with natural Southeast Asian features and skin tones
- Head-and-shoulders to upper-body portrait, subject centered, face fully inside the middle 70% of the frame (the image will be cropped to a circle)
- Plain light pastel teal hospital background with soft blur, soft daylight
- Patients wear a light blue hospital gown unless I say otherwise
- Expression shows their symptom, but respectful and not frightening; no blood, no wounds shown
- Absolutely no text, letters, numbers, logos or watermarks
- Square 1024x1024
Reply "ready" and wait for my first patient.
```

### 1B. สำหรับภาพ X-ray / CT / อัลตราซาวนด์
```
I will ask you for medical imaging illustrations for an educational biology game for Thai high-school students.
Rules for every image in this chat:
- Make it look like a realistic clinical image of the stated type (X-ray, CT, ultrasound, angiogram, slit-lamp photo)
- Anatomically correct; the abnormality must be clearly visible but not exaggerated
- Radiology convention: the patient's RIGHT side is on the LEFT of the image for X-ray and CT
- Absolutely no text, letters, numbers, measurement marks, logos, arrows or watermarks (I will add labels myself)
- Landscape 1536x1024, the important finding near the center, nothing important in the outer 8% margin
Reply "ready" and wait for my first request.
```

---

## 2. ภาพผู้ป่วย (18 คน) — ขนาด 1024×1024

บันทึกเป็น `public/img/gen/patient-<รหัสเคส>.png`

| เคส | ไฟล์ | prompt (วางต่อจากบล็อก 1A) |
|---|---|---|
| 1.1 | `patient-digestive-01.png` | `A 17-year-old Thai male high-school student, short black hair, slightly pale, bending forward with one hand pressing his lower right abdomen, wincing in pain, sitting on an emergency room bed.` |
| 1.2 | `patient-digestive-02.png` | `A 45-year-old Thai woman who sells chicken rice, slightly plump, hair tied back, hand on her upper right abdomen under the ribs, nauseous uncomfortable expression.` |
| 2.1 | `patient-respiratory-01.png` | `A 19-year-old Thai male basketball player, very tall and thin, wearing a sports jersey under an open hospital gown, sitting upright, one hand on the left side of his chest, breathing fast with mouth slightly open, worried.` |
| 2.2 | `patient-respiratory-02.png` | `A 62-year-old retired Thai carpenter, thin face, grey stubble, tired eyes, coughing into a tissue held near his mouth (no blood visible), slightly hunched.` |
| 3.1 | `patient-circulatory-01.png` | `An 8-month-old Thai baby girl held in the arms of her young mother; the baby looks small for her age, slightly sweaty forehead, breathing a bit fast, mother looks gently worried. Both faces visible, warm and tender mood.` |
| 3.2 | `patient-circulatory-02.png` | `A 58-year-old Thai businessman, overweight, receding hair, wearing a shirt and loosened tie, pressing his fist against the center of his chest, short of breath after climbing stairs.` |
| 4.1 | `patient-immune-01.png` | `A 16-year-old Thai male school football player in sports shorts and a team shirt, sitting on an exam bed, looking down at his swollen red right thigh with a bandage on his knee, feverish flushed cheeks, embarrassed smile.` |
| 4.2 | `patient-immune-02.png` | `An 18-year-old Thai male vocational student lying on an ambulance stretcher with a cervical collar, very pale and sweaty, eyes half-open, holding his left side under the ribs, small scrape on his cheek.` |
| 5.1 | `patient-excretory-01.png` | `A 40-year-old Thai rice farmer with sun-tanned skin and a farmer's shirt (mor hom style, indigo blue), restless, gripping his right lower back with both hands, grimacing in severe colicky pain.` |
| 5.2 | `patient-excretory-02.png` | `A 30-year-old Thai woman bank employee, pale skin, slightly puffy face, tired but hopeful smile, a dialysis access bandage on her left forearm; her older brother (34, healthy, short hair) stands behind her with a hand on her shoulder.` |
| 6.1 | `patient-nervous-01.png` | `A 17-year-old Thai male student lying on a hospital bed, drowsy, eyes half-closed, a bruise and bandage on the left side of his head above the ear, a nurse's hand adjusting the bed rail. No blood.` |
| 6.2 | `patient-nervous-02.png` | `A 70-year-old Thai grandmother who works in a fruit orchard, grey hair in a bun, deep smile lines, squinting with her right eye which looks slightly cloudy white in the pupil, holding a straw hat.` |
| 7.1 | `patient-musculoskeletal-01.png` | `A 20-year-old Thai delivery rider still in a rider jacket, lying on an emergency stretcher, right leg in a temporary splint (only upper body and the splint edge visible), pale, gritting teeth in pain.` |
| 7.2 | `patient-musculoskeletal-02.png` | `A 38-year-old Thai male mathematics teacher wearing badminton sportswear and glasses, sitting on an exam bed, holding the back of his right ankle, surprised and embarrassed expression.` |
| 8.1 | `patient-endocrine-01.png` | `A 35-year-old Thai female office worker, slim, slightly sweaty, wide alert eyes, a visibly enlarged smooth swelling at the front of her neck (goiter), hands slightly trembling, fanning herself as if feeling hot.` |
| 8.2 | `patient-endocrine-02.png` | `A 42-year-old Thai male office worker, slightly overweight, pale and sweaty, confused distant look, holding a bottle of red sweet drink (sala syrup) brought by his wife; wife's hand visible on his arm.` |
| 9.1 | `patient-reproductive-01.png` | `A 28-year-old Thai woman market vendor, pale and sweaty, both hands pressing her lower right abdomen, worried expression; her husband's hand holding her shoulder. Fully clothed in hospital gown, modest.` |
| 9.2 | `patient-reproductive-02.png` | `A 15-year-old Thai boy in a hospital gown with a blanket over his lap, sitting hunched forward, teary eyes, embarrassed and in pain, his mother sitting beside him comforting him. Modest, nothing below the waist shown.` |

ภาพเสริม (ไม่บังคับ — ตอนนี้เกมยังไม่ได้ใช้ แต่ Claude ใส่เพิ่มได้ในกล่องข้อความ):
| ไฟล์ | prompt |
|---|---|
| `npc-attending.png` | `A friendly Thai female attending surgeon in her 40s, green scrubs, surgical cap, stethoscope, short hair, glasses, warm encouraging smile, arms crossed.` |
| `npc-nurse.png` | `A cheerful Thai male scrub nurse in his 30s, blue scrubs, surgical cap and mask pulled down to the chin, holding a stainless instrument tray.` |
| `npc-anesth.png` | `A calm Thai male anesthesiologist in his 50s, green scrubs, patterned surgical cap, standing next to an anesthesia monitor, thoughtful expression.` |

**ตรวจก่อนใช้ (ภาพผู้ป่วย):** สไตล์ทั้งชุดเหมือนกัน • ใบหน้าอยู่กลางภาพ (จะถูกตัดเป็นวงกลม) • อายุ/เพศตรงกับเคส • ไม่มีตัวอักษร • ไม่มีเลือด

---

## 3. ภาพตรวจร่างกายในมินิเกม (3 ภาพ) — ขนาด 1536×1024

ภาพเหล่านี้ผู้เล่นต้อง "คลิกจุด" จึงต้องวางองค์ประกอบตามตำแหน่งที่กำหนด (Claude ปรับจุดคลิกให้ตรงภายหลังได้ ถ้าคลาดเล็กน้อย)
ใช้แชทของบล็อก 1A แต่ขึ้นต้นด้วย `Landscape 1536x1024, ignore the portrait framing rule for this one.`

### `exam-pupils.png` — เคส 6.1 ตรวจรูม่านตา
```
Landscape 1536x1024, ignore the portrait framing rule for this one.
Close-up of both eyes of a 17-year-old Thai boy lying on a hospital pillow, eyes open, looking straight at the viewer, lit by a small penlight from below.
The patient's RIGHT eye is on the LEFT of the image, centered at about 25% of the width and 50% of the height.
The patient's LEFT eye is on the RIGHT of the image, centered at about 75% of the width and 50% of the height.
The right eye (image left) has a normal small pupil about 3 mm, constricted by the light.
The left eye (image right) has a clearly dilated round pupil about 6 mm, much larger than the other.
Both irises the same dark brown color. No text.
```
ตรวจก่อนใช้: รูม่านตาขยายอยู่ข้าง**ขวาของภาพ** (ตาซ้ายผู้ป่วย) • อีกข้างเล็กชัดเจน • ตาทั้งสองอยู่ประมาณ 25% และ 75% ของความกว้าง

### `exam-thompson.png` — เคส 7.2 ทดสอบบีบน่อง
```
Landscape 1536x1024, ignore the portrait framing rule for this one.
Clinical teaching illustration: a man lying face-down (prone) on an examination bed, viewed from the foot end of the bed, showing only both lower legs from knees to feet hanging over the edge of the bed, wearing shorts.
The patient's LEFT leg is on the LEFT of the image (calf centered at about 27% width, 40% height).
The patient's RIGHT leg is on the RIGHT of the image (calf centered at about 74% width, 40% height).
A doctor's gloved hand is squeezing the right calf (image right). The right foot hangs limp and does not point down, and there is a subtle dip just above the right heel.
The left foot is in a relaxed neutral position. Plain background. No text.
```
ตรวจก่อนใช้: เห็นน่องสองข้างชัด แยกซ้าย-ขวาตามตำแหน่ง • มีรอยบุ๋มเหนือส้นเท้าขวาเล็กน้อย • ไม่มีส่วนอื่นของร่างกายนอกจากขา

### `xray-femur-plate.png` — เคส 7.1 เอกซเรย์ระหว่างผ่าตัด (ใช้แชทบล็อก 1B)
```
Intraoperative fluoroscopy (C-arm) image of a femoral shaft, oriented HORIZONTALLY across the image: hip side on the LEFT, knee side on the RIGHT.
A transverse fracture at the exact center of the image (50% width), now perfectly aligned and reduced, with a thin faint fracture line.
A straight metal plate lies along the top surface of the bone, fixed with exactly 6 screws: 3 screws on the left of the fracture and 3 on the right, evenly spaced, the first screw at about 23% of the width.
Metal appears bright white, bone light grey, soft tissue dark grey, round fluoroscopy field with black corners.
```
ตรวจก่อนใช้: สกรู 6 ตัว ฝั่งละ 3 • รอยหักอยู่กลางภาพ แนวตรง • แผ่นโลหะไม่ทะลุกระดูก

---

## 4. ภาพผลตรวจ (16 ภาพ) — ขนาด 1536×1024 ใช้แชทบล็อก 1B

บันทึกเป็น `public/img/gen/<ชื่อไฟล์>.png` (ชื่อเดียวกับ SVG เดิม เปลี่ยนแค่นามสกุล)

### `us-appendix` — 1.1 ไส้ติ่งอักเสบ
```
Abdominal ultrasound, right lower quadrant, longitudinal view with a graded-compression linear probe, grayscale fan/rectangular field.
A blind-ended, non-compressible tubular structure (inflamed appendix) about 10 mm in diameter, with a layered "target" wall pattern, surrounded by a bright echogenic inflamed fat and a small amount of dark free fluid.
```
ตรวจก่อนใช้: ท่อปลายตันขนาดใหญ่กว่าลำไส้ปกติ • ผนังเป็นชั้น • มีของเหลวสีดำเล็กน้อย

### `us-gallstones` — 1.2 นิ่วในถุงน้ำดี
```
Abdominal ultrasound of the gallbladder, right upper quadrant, grayscale sector image.
Dark fluid-filled gallbladder with a thickened wall (about 5 mm). Several bright echogenic stones in the dependent part with clear black posterior acoustic shadowing behind them. Liver tissue visible above.
```
ตรวจก่อนใช้: ก้อนสว่างอยู่ส่วนล่างของถุง • มี**เงาดำทอดหลังก้อน** • ผนังหนา

### `xray-pneumothorax` — 2.1 ปอดแฟบ
```
Frontal (PA) chest X-ray of a tall thin young man.
Left-sided pneumothorax: a thin white visceral pleural line separates the partially collapsed left lung (near the hilum) from a completely black outer zone with NO lung markings. The right lung is normal with visible vascular markings. Heart and trachea remain in the midline (no tension). Patient's right on the image left.
```
ตรวจก่อนใช้: ด้าน**ขวาของภาพ**ผิดปกติ • เห็นเส้นขอบปอด • นอกเส้นดำสนิทไม่มีลาย • หัวใจไม่เลื่อน

### `ct-lung` — 2.2 มะเร็งปอด
```
Axial chest CT in lung window.
A 2.5 cm irregular spiculated solid nodule in the RIGHT upper lobe (on the LEFT side of the image), surrounded by normal aerated lung. Mild emphysema changes in both lungs (smoker). No enlarged lymph nodes.
```
ตรวจก่อนใช้: ก้อนอยู่**ซ้ายของภาพ** (ปอดขวา) • ขอบขรุขระเป็นแฉก • ส่วนอื่นปกติ

### `echo-vsd` — 3.1 ผนังกั้นหัวใจห้องล่างรั่ว
```
Pediatric echocardiogram, apical four-chamber view, grayscale sector image with a color Doppler box.
A small defect in the muscular ventricular septum, with a red-orange color Doppler jet flowing from the left ventricle into the right ventricle through the defect. Left atrium and left ventricle mildly enlarged.
```
ตรวจก่อนใช้: เห็นหัวใจ 4 ห้อง • สีของการไหลผ่าน**ผนังกั้นห้องล่าง** ไปทางห้องล่างขวา

### `angio-cad` — 3.2 หลอดเลือดหัวใจตีบ
```
Coronary angiogram (cardiac catheterization) in grayscale, contrast-filled coronary arteries appearing dark on a lighter background, catheter visible entering from the aorta.
Three coronary branches each show a clear focal severe narrowing (70–90%), with the contrast column becoming thin at those points.
```
ตรวจก่อนใช้: เห็นสายสวน • จุดตีบ 3 จุดชัด • ลักษณะเป็นแขนงหลอดเลือดบนหัวใจ

### `ct-ureter-stone` — 5.1 นิ่วในท่อไต
```
Non-contrast CT of the abdomen, CORONAL view showing both kidneys, ureters and bladder.
An 8 mm very bright (white) stone in the upper RIGHT ureter (on the LEFT side of the image). The right ureter above the stone and the right renal pelvis are dilated (hydronephrosis, dark fluid). The left kidney and ureter are normal.
```
ตรวจก่อนใช้: นิ่วและไตบวมอยู่**ซ้ายของภาพ** • ไตอีกข้างปกติ • เห็นกระเพาะปัสสาวะด้านล่าง

### `us-kidney-ckd` — 5.2 ไตวายเรื้อรัง
```
Renal ultrasound, two side-by-side longitudinal panels.
Left panel: a normal adult kidney about 11 cm long with thick darker cortex.
Right panel: a small shrunken kidney about 7 cm long with thin, bright (echogenic) cortex and poor corticomedullary differentiation. No stones, no hydronephrosis.
```
ตรวจก่อนใช้: เทียบขนาดได้ชัด • ไตผู้ป่วยเล็กและสว่างกว่า

### `ct-epidural` — 6.1 เลือดคั่งเหนือเยื่อหุ้มสมอง
```
Axial non-contrast head CT in brain window.
A biconvex (lens-shaped) bright white hematoma under the skull on the patient's LEFT side (on the RIGHT side of the image), in the temporal region, about 3 cm thick, with a small skull fracture above it.
It compresses the left brain hemisphere and shifts the midline toward the image left. Ventricles slightly compressed on the affected side.
```
ตรวจก่อนใช้: ก้อนเลือด**รูปเลนส์นูนสองด้าน** (ไม่ใช่รูปจันทร์เสี้ยว) • อยู่**ขวาของภาพ** • เส้นกลางเลื่อน

### `slitlamp-cataract` — 6.2 ต้อกระจก
```
Slit-lamp clinical photograph of the right eye of an elderly Thai woman, eyelids held open.
Dilated pupil showing a dense yellow-white cloudy lens (mature nuclear cataract) filling the pupil. Clear cornea, white sclera with fine vessels, brown iris. Thin vertical slit beam of light crossing the lens.
```
ตรวจก่อนใช้: ความขุ่นอยู่**หลังรูม่านตา** (ที่เลนส์) ไม่ใช่บนกระจกตา • ตาขาวไม่แดง

### `xray-femur` — 7.1 กระดูกต้นขาหัก
```
AP (frontal) X-ray of the right thigh including hip and knee.
A transverse fracture through the middle of the femoral shaft. The lower fragment is displaced upward so the two ends overlap by about 3 cm (shortening), and it is angulated outward. Swollen soft tissue around the fracture. Hip and knee joints normal.
```
ตรวจก่อนใช้: หักกลางลำกระดูกต้นขา • ชิ้นล่าง**เกยขึ้น**และเอียง • ข้อสะโพก/เข่าปกติ

### `us-achilles` — 7.2 เอ็นร้อยหวายขาด
```
Musculoskeletal ultrasound of the Achilles tendon, longitudinal view with a linear probe, heel (calcaneus) at the right edge of the image.
The normally bright fibrillar tendon is completely torn about 4 cm above the heel: a dark (hypoechoic) gap about 3 cm wide between the frayed upper and lower tendon ends. The calcaneus bone surface is a bright curved line at the bottom right.
```
ตรวจก่อนใช้: เห็นลายเส้นใยเอ็นสองฝั่ง • ช่องว่างดำตรงกลาง • กระดูกส้นเท้าปกติ

### `us-thyroid` — 8.1 ไทรอยด์โตหลายก้อน
```
Neck ultrasound, transverse view of the thyroid gland, linear probe.
Both thyroid lobes are enlarged with multiple round nodules of varying brightness. The trachea is in the center as a curved bright arc with dark shadow behind it, slightly narrowed by the enlarged gland. Common carotid arteries visible as dark circles on each side.
```
ตรวจก่อนใช้: หลอดลมอยู่กลาง • ต่อมโตทั้งสองกลีบ • มีหลายก้อน

### `ct-insulinoma` — 8.2 เนื้องอกตับอ่อน
```
Axial contrast-enhanced abdominal CT in the arterial phase.
A small 1.5 cm round brightly enhancing nodule in the TAIL of the pancreas, near the spleen, on the patient's LEFT (the RIGHT side of the image). Liver on the image left, stomach anterior, spine posterior in the middle. Rest of the pancreas normal.
```
ตรวจก่อนใช้: ก้อนอยู่**หางตับอ่อนใกล้ม้าม** (ขวาของภาพ) • ก้อนสว่างกว่าตับอ่อนรอบ ๆ

### `us-ectopic` — 9.1 ตั้งครรภ์นอกมดลูก
```
Pelvic ultrasound (transvaginal style), two side-by-side grayscale panels.
Left panel: the uterus in long axis with a thick bright endometrium and NO gestational sac inside the uterine cavity.
Right panel: the right adnexa showing a small round "tubal ring" (a bright ring with a tiny dark center) next to the ovary, and a large amount of dark free fluid with some echoes (blood) around it.
```
ตรวจก่อนใช้: มดลูก**ว่าง** ไม่มีถุงการตั้งครรภ์ • มีก้อนวงแหวนนอกมดลูก • มีของเหลวมาก

### `us-torsion` — 9.2 อัณฑะบิดขั้ว
```
Scrotal ultrasound with color Doppler, two side-by-side panels, purely clinical grayscale ultrasound appearance.
Left panel: the right testis, homogeneous oval, with normal red and blue color Doppler flow signals inside.
Right panel: the left testis, slightly enlarged and darker (hypoechoic) with NO color flow at all; above it the spermatic cord appears twisted in a spiral "whirlpool" pattern.
```
ตรวจก่อนใช้: เป็นภาพอัลตราซาวนด์ล้วน • ข้างขวามีสี ข้างซ้ายไม่มีสี • เห็นเกลียวของสายสเปิร์ม

---

## 5. ภาพที่**ไม่ต้อง**เจน

| ภาพ | เหตุผล |
|---|---|
| แผนภาพร่างกายสำหรับตรวจ (หน้าท้อง ทรวงอก ขา ท้องและสีข้าง) | เป็น SVG ที่มีโซนให้คลิก ต้องวาดด้วยโค้ด |
| กล้องจุลทรรศน์ (เคส 4.1) | เซลล์วาดด้วยโค้ดและสุ่มตำแหน่งทุกครั้ง นับจำนวนได้ |
| กราฟ (เคส 8.1, 8.2) จอสัญญาณชีพ ECG | ค่าตัวเลขต้องตรงกับเคส และเปลี่ยนตามเวลาจริง |
| ไอคอนเครื่องมือ ปุ่ม | SVG คมชัดทุกขนาด |
| ฉากผ่าตัด 3 มิติ | เป็นโมเดล 3 มิติ (ระยะ 2 ใช้ Z-Anatomy) |

---

## 6. ภาพบรรยากาศ (ไม่บังคับ — ถ้าต้องการให้ล็อบบี้สวยขึ้น)

ใช้แชทบล็อก 1A ขึ้นต้นด้วย `Landscape 1536x1024, no people's faces needed.`

| ไฟล์ | prompt |
|---|---|
| `lobby-bg.png` | `A bright modern Thai hospital training center lobby at morning, soft teal and white colors, large windows, an operating room door with a green light in the distance, slightly blurred so text can be placed on top. No text.` |
| `cover-<ระบบ>.png` ×9 | `Stylized educational illustration of the human [digestive / respiratory / circulatory / lymphatic and immune / urinary / nervous system and eye / skeletal and muscular / endocrine glands / reproductive organs (simple textbook diagram style, modest)] glowing softly inside a translucent human silhouette, teal background, clean flat-shaded style. No text.` |

---

## 7. Checklist ก่อนส่งให้ Claude

- [ ] ไฟล์อยู่ใน `biosurgeon/public/img/gen/` ชื่อตรงตามตาราง
- [ ] ภาพผู้ป่วยสไตล์เดียวกันทั้งชุด
- [ ] ภาพทางการแพทย์ผ่าน "ตรวจก่อนใช้" ทุกข้อ (โดยเฉพาะ**ซ้าย-ขวา**)
- [ ] ไม่มีตัวอักษรหรือลายน้ำในภาพ
- [ ] ภาพที่ไม่ผ่านให้ข้ามไป — เกมจะใช้ SVG เดิมแทนอัตโนมัติ
