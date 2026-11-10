# แปลงเคสผ่าตัดให้ใช้อวัยวะ BodyParts3D ตามพิกัดจริง — รัน: python cases_atlas.py [รหัสเคส ...]
# แต่ละฟังก์ชันอ่านไฟล์เคสปัจจุบัน แทนอวัยวะด้วยโมเดล (organ) และวางรูปทรงประกอบใหม่บนผิวจริง (surf) แล้วบันทึก
# ⚠️ รันซ้ำได้ (ตำแหน่งทุกชิ้นคำนวณจากพิกัดโมเดล ไม่ขึ้นกับค่าเดิม)
import sys
from caseatlas import *


def move_to(atlas, obj_native, target_native, lift=0.0):
    """effect move:<id>:du:dv:dd ที่พาวัตถุจากจุดหนึ่งไปอีกจุด (พิกัดโมเดล)"""
    a, b = atlas_pt(atlas, obj_native), atlas_pt(atlas, target_native)
    return [round(b[0] - a[0], 4), round(b[1] - a[1], 4), round(b[2] - a[2] - lift, 4)]


# ---------------- 1.3 แผลลำไส้เล็กส่วนต้นทะลุ (เปิดหน้าท้องส่วนบน) ----------------
def digestive_03():
    c = load("digestive-03")
    f = c["surgery"]["field"]
    A = {"origin": [-0.015, 0.2, -1.085], "depth": 0.034}
    f["atlas"] = A
    f["cavity"]["depth"] = 0.17
    o = objs(c)
    perf = surf("duodenum", -0.03, -1.093, lift=0.001)
    s1 = surf("duodenum", -0.043, -1.093, lift=0.001)
    s2 = surf("duodenum", -0.017, -1.093, lift=0.001)
    om = [0.03, 0.19, -1.035]
    new = [
        organ(o["liver"], "liver", A),
        organ(o["stomach"], "stomach", A),
        organ(o["duodenum"], "duodenum", A),
        {**o["perf"], "at": at(A, perf), "r": 0.004, "hit": 0.005},
        {**o["s1"], "at": at(A, s1), "r": 0.0025, "hit": 0.005},
        {**o["s2"], "at": at(A, s2), "r": 0.0025, "hit": 0.005},
        # โอเมนตัมใหญ่ห้อยจากความโค้งใหญ่ของกระเพาะ คลุมลำไส้ (แผ่นไขมันบาง)
        {**o["omentum"], "at": at(A, om), "size": [0.05, 0.005, 0.03]},
        organ(o["small_int"], "jejunum", A),
        {**o["spill"], "at": at(A, [-0.02, perf[1] + 0.008, -1.08]), "r": 0.045},
        {**o["field_fluid"], "at": at(A, [-0.02, perf[1] + 0.009, -1.08]), "r": 0.042},
    ]
    f["objects"] = new
    # ปะโอเมนตัม: ลากแผ่นไขมันไปคลุมรูทะลุ
    d = move_to(A, om, perf, lift=0.004)
    for s in c["surgery"]["steps"]:
        if s["id"] == "patch":
            s["onSuccess"] = [f"move:omentum:{d[0]}:{d[1]}:{d[2]}" if e.startswith("move:omentum") else e for e in s["onSuccess"]]
        # ตับคลุมลำไส้เล็กส่วนต้น: ยกขอบตับขึ้นก่อนหารูทะลุ (เหมือนใช้ตะขอดึงตับในการผ่าตัดจริง)
        if s["id"] == "find":
            s["onStart"] = ["move:liver:0:-0.03:-0.004"]
    save("digestive-03", c)


# ---------------- 4.2 ม้ามแตก ตัดม้าม ----------------
def immune_02():
    c = load("immune-02")
    f = c["surgery"]["field"]
    A = {"origin": [0.06, 0.2, -1.1], "depth": 0.034}
    f["atlas"] = A
    f["cavity"]["depth"] = 0.19
    # ม้ามอยู่ลึกใต้ชายโครงซ้าย ต้องเปิดแผลกว้างกว่าแบบจำลองเดิม
    scale_open(c, 1.5)
    o = objs(c)
    hil_a = frac("spleen", 0.12, 0.55, 0.5)
    tear = surf("spleen", 0.09, -1.11, lift=0.0005)
    new = [
        organ(o["spleen"], "spleen", A),
        {**o["tear"], "at": at(A, tear), "size": [0.004, 0.003, 0.03], "rot": [0, 30, 0]},
        {**o["hilum"], "points": tube_pts(A, [hil_a, [hil_a[0] - 0.012, hil_a[1] + 0.01, hil_a[2] + 0.004], [hil_a[0] - 0.022, hil_a[1] + 0.016, hil_a[2] + 0.008]]), "r": 0.004, "hit": 0.009, "parent": "spleen"},
        organ(o["stomach"], "stomach", A),
        organ(o["pancreas_tail"], "pancreas", A),
        organ(o["liver"], "liver", A),
        organ(o["bowel"], "jejunum", A),
        {**o["blood_pool"], "at": at(A, [0.06, 0.16, -1.09]), "r": 0.05},
        {**o["field_fluid"], "at": at(A, [0.06, 0.161, -1.09]), "r": 0.045},
    ]
    f["objects"] = new
    for s in c["surgery"]["steps"]:
        # ม้ามอยู่ลึกด้านหลังซ้ายใต้กระเพาะ: ดึงกระเพาะไปทางขวาก่อนสำรวจ
        if s["id"] == "explore":
            s["onStart"] = ["move:stomach:-0.065:0:-0.006"]
        # ศัลยแพทย์พลิกม้ามขึ้นมาที่แผล (mobilize) ให้เห็นขั้วม้ามก่อนหนีบหลอดเลือด
        if s["id"] == "clamp":
            s["onStart"] = ["move:stomach:-0.03:0:0", "move:spleen:-0.01:0:-0.05"]
    save("immune-02", c)



# ---------------- 3.1 ผนังกั้นห้องหัวใจรั่ว (ผ่ากลางอก เปิดห้องบนขวา) ----------------
def circulatory_01():
    c = load("circulatory-01")
    f = c["surgery"]["field"]
    A = {"origin": [0.02, 0.18, -1.24], "depth": 0.022}
    f["atlas"] = A
    f["window"] = {"hw": 0.075, "hd": 0.11}
    f["paths"]["incision"]["points"] = [[0.0, -0.09], [0.0, 0.09]]
    f["cavity"]["depth"] = 0.16
    scale_open(c, 1.7)
    o = objs(c)
    ra_s = surf("heart", -0.022, -1.24)
    ra = lift_pt(ra_s, -0.011)
    vsd = [ra_s[0] + 0.004, ra_s[1] + 0.003, ra_s[2]]
    f["objects"] = [
        organ(o["heart"], "heart", A),
        # ห้องบนขวา (ผนังด้านหน้าขวาของหัวใจ) — เปิดผนังแล้วเห็นรูรั่วที่ผนังกั้นห้องผ่านลิ้นไตรคัสปิด
        {**o["right_atrium"], "at": at(A, ra), "size": [0.016, 0.012, 0.02], "rot": [0, 0, 0]},
        organ(o["aorta"], "aorta", A),
        organ(o["vena_cava"], "svc", A),
        {**o["vsd"], "at": at(A, vsd), "r": 0.006, "hit": 0.008},
        {**o["patch_mesh"], "at": at(A, lift_pt(vsd, 0.0005)), "r": 0.007},
        {**o["blood_pool"], "at": at(A, [0.02, 0.182, -1.235]), "r": 0.035},
    ]
    save("circulatory-01", c)


# ---------------- 3.2 หลอดเลือดหัวใจตีบ ผ่าตัดทำทางเบี่ยง ----------------
def circulatory_02():
    c = load("circulatory-02")
    f = c["surgery"]["field"]
    A = {"origin": [0.035, 0.18, -1.24], "depth": 0.026}
    f["atlas"] = A
    f["window"] = {"hw": 0.075, "hd": 0.11}
    f["paths"]["incision"]["points"] = [[0.0, -0.09], [0.0, 0.09]]
    f["cavity"]["depth"] = 0.16
    scale_open(c, 1.5)
    o = objs(c)
    sten = lift_pt(nearest("lad", [0.042, 0.178, -1.25]), 0.001)
    tgt = lift_pt(nearest("lad", [0.052, 0.172, -1.228]), 0.0015)
    ao = surf("aorta", 0.012, -1.275, lift=0.001)
    f["objects"] = [
        organ(o["heart"], "heart", A),
        organ(o["aorta"], "aorta", A),
        organ(o["vena_cava"], "svc", A),
        organ(o["lad"], "lad", A, parent="heart", motion="none"),
        {**o["stenosis"], "at": at(A, sten), "r": 0.0035, "hit": 0.006},
        {**o["target_site"], "at": at(A, tgt), "r": 0.004, "hit": 0.006},
        # หลอดเลือดดำขาที่นำมาต่อ: จากเอออร์ตาโค้งข้ามหน้าหัวใจไปยังหลอดเลือดโคโรนารีใต้จุดตีบ
        {**o["graft"], "points": tube_pts(A, [ao, [0.04, 0.2, -1.26], [0.055, 0.19, -1.235], tgt]), "r": 0.0026},
        {**o["blood_pool"], "at": at(A, [0.02, 0.184, -1.235]), "r": 0.035},
    ]
    save("circulatory-02", c)


def _ports(o):
    return [o[k] for k in o if k.startswith("port")]


# ---------------- 1.2 ถุงน้ำดีอักเสบ ผ่าตัดส่องกล้อง ----------------
def digestive_02():
    c = load("digestive-02")
    f = c["surgery"]["field"]
    A = {"origin": [-0.045, 0.2, -1.075], "depth": 0.03}
    f["atlas"] = A
    f["cavity"]["depth"] = 0.17
    o = objs(c)
    neck = nearest("gallbladder", [-0.04, 0.14, -1.1])
    # สามเหลี่ยมคาโลต์ (เหนือลำไส้เล็กส่วนต้น): ท่อน้ำดีใหญ่ลงไปหาลำไส้ ท่อน้ำดีจากถุงน้ำดีมาบรรจบ หลอดเลือดแดงเลี้ยงถุงน้ำดีอยู่เหนือท่อ
    cbd = [[-0.03, 0.126, -1.15], [-0.034, 0.128, -1.13], [-0.04, 0.129, -1.112]]
    cd = [neck, [-0.037, 0.134, -1.12], [-0.034, 0.129, -1.13]]
    ca = [[-0.024, 0.126, -1.14], [-0.033, 0.134, -1.132], lift_pt(nearest("gallbladder", [-0.045, 0.15, -1.1]), 0.001)]
    f["objects"] = _ports(o) + [
        organ(o["liver"], "liver", A),
        # ถุงน้ำดีติดใต้ตับ: ยกตับแล้วถุงน้ำดียกตามด้วย
        organ(o["gallbladder"], "gallbladder", A, parent="liver"),
        {**o["cystic_duct"], "points": tube_pts(A, cd), "r": 0.0025, "hit": 0.006},
        {**o["cbd"], "points": tube_pts(A, cbd), "r": 0.0035, "hit": 0.006},
        {**o["cystic_artery"], "points": tube_pts(A, ca), "r": 0.0012, "hit": 0.005},
        organ(o["duodenum"], "duodenum", A),
        # กระเพาะอาหารต่อกับลำไส้เล็กส่วนต้นที่ไพลอรัส (โมเดลลำไส้เป็นท่อปลายเปิด ถ้าไม่มีกระเพาะจะเห็นปลายท่อขาด)
        atlas_obj("stomach", None, "stomach", "#d9928a", A, noPick=True, rough=0.45),
        {**o["blood_pool"], "at": at(A, [-0.04, 0.135, -1.095]), "r": 0.025},
        {**o["field_fluid"], "at": at(A, [-0.04, 0.136, -1.095]), "r": 0.03},
    ]
    f["cameras"] = {"scope": scope_cam(A, [-0.02, 0.19, -1.035], [-0.04, 0.128, -1.12])}
    for st in c["surgery"]["steps"]:
        if st["id"] == "lift":
            st["onSuccess"] = ["move:liver:0:-0.03:-0.012" if e.startswith("move:liver") else e for e in st["onSuccess"]]
    save("digestive-02", c)


# ---------------- 8.2 เนื้องอกตับอ่อนสร้างอินซูลิน ผ่าตัดส่องกล้อง ----------------
def endocrine_02():
    c = load("endocrine-02")
    f = c["surgery"]["field"]
    A = {"origin": [0.01, 0.2, -1.065], "depth": 0.03}
    f["atlas"] = A
    f["cavity"]["depth"] = 0.17
    o = objs(c)
    duct = ridge("pancreas", [-0.04, -0.02, 0.0, 0.02, 0.04, 0.055], lift=0.0012)
    tum = lift_pt(surf("pancreas", 0.032, -1.07), -0.002)
    f["objects"] = _ports(o) + [
        organ(o["stomach"], "stomach", A),
        organ(o["pancreas"], "pancreas", A),
        {**o["duct"], "points": tube_pts(A, duct), "r": 0.0012, "hit": 0.004},
        {**o["us_area"], "at": at(A, lift_pt(tum, 0.006)), "r": 0.02},
        {**o["tumor"], "at": at(A, tum), "r": 0.007, "hit": 0.009},
        organ(o["spleen"], "spleen", A),
        {**o["field_fluid"], "at": at(A, lift_pt(tum, 0.007)), "r": 0.024},
    ]
    f["cameras"] = {"scope": scope_cam(A, [0.01, 0.175, -0.985], [0.02, 0.13, -1.07])}
    for st in c["surgery"]["steps"]:
        if st["id"] == "lift":
            st["onSuccess"] = ["move:stomach:0:-0.055:-0.02" if e.startswith("move:stomach") else e for e in st["onSuccess"]]
    save("endocrine-02", c)


# ---------------- 8.3 เนื้องอกต่อมหมวกไต ผ่าตัดส่องกล้อง ----------------
def endocrine_03():
    c = load("endocrine-03")
    f = c["surgery"]["field"]
    A = {"origin": [-0.04, 0.2, -1.08], "depth": 0.03}
    f["atlas"] = A
    f["cavity"]["depth"] = 0.19
    o = objs(c)
    adr = frac("adrenal_r", 0.5, 0.5, 0.5)
    tum = [adr[0], adr[1] + 0.006, adr[2]]
    vein = [[tum[0] + 0.013, tum[1] + 0.004, tum[2] + 0.004], [-0.031, 0.115, -1.088], surf("ivc", -0.024, -1.088, r=0.004)]
    f["objects"] = _ports(o) + [
        organ(o["liver"], "liver", A),
        organ(o["kidney"], "kidney_r", A),
        # ฟีโอโครโมไซโตมา: ก้อนกลมขนาด ~3.5 ซม. แทนต่อมหมวกไตขวา (เหนือขั้วบนไต ชิดหลอดเลือดดำใหญ่)
        {**o["tumor"], "at": at(A, tum), "r": 0.017, "hit": 0.018},
        organ(o["ivc"], "ivc", A),
        {**o["adr_vein"], "points": tube_pts(A, vein), "r": 0.0022, "hit": 0.005},
    ]
    f["cameras"] = {"scope": scope_cam(A, [-0.02, 0.175, -0.99], [-0.04, 0.09, -1.09])}
    for st in c["surgery"]["steps"]:
        if st["id"] == "lift":
            st["onSuccess"] = ["move:liver:0:-0.06:-0.02" if e.startswith("move:liver") else e for e in st["onSuccess"]]
    save("endocrine-03", c)


# ---------------- 2.1 ลมรั่วในช่องเยื่อหุ้มปอด ใส่ท่อระบายทรวงอก (ข้างซ้าย แนวรักแร้) ----------------
def respiratory_01():
    c = load("respiratory-01")
    f = c["surgery"]["field"]
    # ช่องซี่โครงที่ระดับ z ≈ −1.1975 (แนว x 11 ซม.): ขอบบนซี่ล่าง −1.19, ขอบล่างซี่บน −1.205
    A = {"origin": [0.11, 0.174, -1.197], "depth": 0.016}
    f["atlas"] = A
    f["center"] = [0.11, -0.25]
    f["cavity"]["depth"] = 0.14
    o = objs(c)
    f["objects"] = [
        # ช่องซี่โครงแคบ (~5 มม.) — ให้คลิกทะลุซี่โครงลงไปถึงเยื่อหุ้มปอดได้
        organ(o["rib_upper"], "ribs_l", A, motion="none", noPick=True),
        {**o["rib_lower"], "hidden": True, "noPick": True},
        {**o["bundle"], "points": tube_pts(A, [[0.09, 0.163, -1.206], [0.11, 0.165, -1.206], [0.13, 0.155, -1.206]]), "r": 0.002},
        {**o["site_safe"], "at": [0.0, round(-1.192 + 1.197, 4), -0.001], "r": 0.0035, "hit": 0.004},
        {**o["site_danger"], "at": [0.0, round(-1.203 + 1.197, 4), -0.001], "r": 0.0035, "hit": 0.004},
        organ(o["lung"], "lung_l", A),
    ]
    save("respiratory-01", c)


# ---------------- 2.2 มะเร็งปอดกลีบบนขวา ผ่าตัดกลีบปอด ----------------
def respiratory_02():
    c = load("respiratory-02")
    f = c["surgery"]["field"]
    A = {"origin": [-0.05, 0.19, -1.285], "depth": 0.034}
    f["atlas"] = A
    f["center"] = [-0.05, -0.3]
    f["cavity"]["depth"] = 0.17
    o = objs(c)
    tum = lift_pt(surf("lung_r_upper", -0.085, -1.31), -0.008)
    f["objects"] = [
        organ(o["lobe_upper"], "lung_r_upper", A),
        organ(o["lobe_middle"], "lung_r_middle", A),
        organ(o["lobe_lower"], "lung_r_lower", A),
        {**o["tumor"], "at": at(A, tum), "r": 0.012},
        # ขั้วปอดกลีบบน (เรียงจากหน้าไปหลัง): หลอดเลือดดำปอด → หลอดเลือดแดงปอด → หลอดลมแขนงกลีบบน
        {**o["pulm_vein"], "points": tube_pts(A, [[-0.02, 0.14, -1.262], [-0.035, 0.143, -1.266], [-0.05, 0.14, -1.27]]), "r": 0.005, "hit": 0.008},
        {**o["pulm_artery"], "points": tube_pts(A, [[-0.02, 0.127, -1.285], [-0.035, 0.13, -1.288], [-0.05, 0.127, -1.292]]), "r": 0.006, "hit": 0.008},
        {**o["bronchus"], "points": tube_pts(A, [[-0.025, 0.112, -1.3], [-0.04, 0.115, -1.303], [-0.055, 0.112, -1.306]]), "r": 0.006, "hit": 0.008},
        {**o["field_fluid"], "at": at(A, [-0.06, 0.16, -1.28]), "r": 0.045},
    ]
    for st in c["surgery"]["steps"]:
        # ดึงกลีบบนออกด้านข้าง-ขึ้นบน ให้เห็นขั้วปอด
        if st["id"] == "hilum":
            st["onStart"] = ["move:lobe_upper:-0.04:-0.01:-0.02"]
    save("respiratory-02", c)


# ---------------- 5.2 ไตวายเรื้อรัง ปลูกถ่ายไตในแอ่งอุ้งเชิงกรานขวา ----------------
def excretory_02():
    c = load("excretory-02")
    f = c["surgery"]["field"]
    A = {"origin": [-0.06, 0.16, -0.85], "depth": 0.03}
    f["atlas"] = A
    f["center"] = [-0.06, 0.14]
    f["window"] = {"hw": 0.075, "hd": 0.09}
    f["window"] = {"hw": 0.08, "hd": 0.1}
    f["paths"]["incision"]["points"] = [[-0.035, -0.065], [0.035, 0.08]]
    f["cavity"]["depth"] = 0.14
    o = objs(c)
    # ไตที่ปลูกถ่ายวางในแอ่งอุ้งเชิงกรานขวา ข้างหลอดเลือดแดง/ดำอิลิแอกภายนอก (ไม่ใช่ตำแหน่งไตเดิม)
    kc = [(-0.095 + -0.035) / 2, (0.045 + 0.098) / 2, (-1.102 + -1.0) / 2]
    kt = [-0.085, 0.125, -0.87]
    shift = [round(kt[i] - kc[i], 4) for i in range(3)]
    hil = [kt[0] + 0.022, kt[1] + 0.005, kt[2]]
    art = surf("iliac_ext_artery_r", -0.042, -0.87, r=0.006)
    vein = surf("iliac_ext_vein_r", -0.034, -0.885, r=0.006)
    low = [kt[0] + 0.006, kt[1], kt[2] + 0.045]
    dome = surf("bladder", -0.018, -0.808)
    f["objects"] = [
        organ(o["iliac_artery"], "iliac_ext_artery_r", A),
        organ(o["iliac_vein"], "iliac_ext_vein_r", A),
        {**o["fossa"], "at": at(A, lift_pt(kt, 0.03)), "r": 0.02, "hit": 0.02},
        organ(o["kidney"], "kidney_r", A, atlasShift=shift, motion="none"),
        {**o["renal_artery"], "points": tube_pts(A, [hil, [(hil[0] + art[0]) / 2, art[1] + 0.006, (hil[2] + art[2]) / 2], art]), "r": 0.003, "hit": 0.006},
        {**o["renal_vein"], "points": tube_pts(A, [[hil[0], hil[1] - 0.004, hil[2] + 0.01], [(hil[0] + vein[0]) / 2, vein[1] + 0.004, (hil[2] + vein[2]) / 2 + 0.006], vein]), "r": 0.0035, "hit": 0.006},
        {**o["kidney_ureter"], "points": tube_pts(A, [low, [(low[0] + dome[0]) / 2, dome[1] + 0.01, (low[2] + dome[2]) / 2], dome]), "r": 0.0022, "hit": 0.005},
        organ(o["bladder"], "bladder", A),
        {**o["urine"], "at": at(A, lift_pt(dome, 0.002)), "r": 0.006},
        {**o["field_fluid"], "at": at(A, lift_pt(kt, 0.035)), "r": 0.04},
    ]
    save("excretory-02", c)


# ---------------- 9.2 อัณฑะบิดขั้ว ----------------
def reproductive_02():
    c = load("reproductive-02")
    f = c["surgery"]["field"]
    A = {"origin": [0.0, 0.17, -0.705], "depth": 0.012}
    f["atlas"] = A
    f["cavity"]["depth"] = 0.06
    o = objs(c)
    f["objects"] = [
        organ(o["testis_L"], "testis_l", A, motion="none"),
        organ(o["epid_L"], "epididymis_l", A, motion="none"),
        {**o["cord_L"], "points": tube_pts(A, [[0.018, 0.155, -0.719], [0.02, 0.152, -0.745], [0.026, 0.148, -0.78]]), "r": 0.004},
        {**o["twist1"], "at": at(A, [0.0185, 0.155, -0.727]), "r": 0.0055, "size": [0.0016, 0.0016, 0.0016]},
        {**o["twist2"], "at": at(A, [0.019, 0.154, -0.737]), "r": 0.0055, "size": [0.0016, 0.0016, 0.0016]},
        organ(o["testis_R"], "testis_r", A, motion="none"),
        {**o["cord_R"], "points": tube_pts(A, [[-0.02, 0.155, -0.719], [-0.022, 0.152, -0.745], [-0.028, 0.148, -0.78]]), "r": 0.004},
        {**o["fix_L1"], "at": at(A, surf("testis_l", 0.01, -0.713, lift=0.002)), "r": 0.002, "hit": 0.003},
        {**o["fix_L2"], "at": at(A, surf("testis_l", 0.01, -0.697, lift=0.002)), "r": 0.002, "hit": 0.003},
        {**o["fix_R1"], "at": at(A, surf("testis_r", -0.013, -0.713, lift=0.002)), "r": 0.002, "hit": 0.003},
        {**o["fix_R2"], "at": at(A, surf("testis_r", -0.013, -0.697, lift=0.002)), "r": 0.002, "hit": 0.003},
    ]
    save("reproductive-02", c)


# ---------------- 7.1 กระดูกต้นขาหัก ยึดด้วยแผ่นโลหะ ----------------
def musculoskeletal_01():
    c = load("musculoskeletal-01")
    f = c["surgery"]["field"]
    FX = -0.62  # ระดับรอยหักกลางกระดูก (กระดูกต้นขาขวาแบ่งเป็นสองท่อนที่ระดับนี้)
    A = {"origin": [-0.096, 0.107, FX], "depth": 0.04}
    f["atlas"] = A
    f["center"] = [-0.1, 0.4]
    f["cavity"]["depth"] = 0.09
    o = objs(c)
    top = surf("femur_r", -0.096, FX, r=0.006)
    screws = [-0.045, -0.03, -0.015, 0.015, 0.03, 0.045]
    # แผ่นโลหะวางบนผิวกระดูกส่วนที่นูนที่สุดตลอดแนว หมุดอยู่บนแผ่น
    ytop = max(surf("femur_r", top[0], FX + dz, r=0.005)[1] for dz in screws + [0.0])
    pl = [top[0], ytop + 0.002, FX]
    f["window"] = {"hw": 0.07, "hd": 0.09}
    f["paths"]["incision"]["points"] = [[0.0, -0.065], [0.0, 0.065]]
    f["objects"] = [
        organ(o["bone_prox"], "femur_r_prox", A, motion="none"),
        {**o["marrow_prox"], "at": at(A, [top[0], top[1] - 0.012, FX - 0.001]), "r": 0.006},
        # ท่อนปลายหมุนรอบรอยหัก (จุดหมุน = ปลายบนของท่อนปลาย) — เริ่มต้นเบี้ยว 25° ต้องดึงและจัดให้ตรง
        organ(o["bone_dist"], "femur_r_dist", A, at=at(A, [top[0], top[1] - 0.012, FX + 0.002]), rot=[0, 25, 0], axis="y", hit=0.012, motion="none"),
        {**o["fx_blood"], "at": at(A, lift_pt(top, 0.006)), "r": 0.03},
        {**o["plate"], "at": at(A, pl), "size": [0.012, 0.003, 0.11], "rot": [0, 0, 0]},
    ] + [{**o[f"screw{i + 1}"], "at": at(A, [pl[0], pl[1] + 0.0018, FX + dz]), "r": 0.003, "hit": 0.005} for i, dz in enumerate(screws)] + [
        {**o["field_fluid"], "at": at(A, lift_pt(top, 0.007)), "r": 0.03},
    ]
    save("musculoskeletal-01", c)


# ---------------- 6.1 ก้อนเลือดเหนือเยื่อหุ้มสมอง เปิดกะโหลก ----------------
def nervous_01():
    c = load("nervous-01")
    f = c["surgery"]["field"]
    # สมองจริงอยู่ใต้เยื่อหุ้มสมองชั้นนอก (เห็นจาง ๆ ผ่านเยื่อดูราที่โปร่งแสง) หมุนให้ด้านบนศีรษะหันหากล้องเหมือนแล็บ 6
    A = {"origin": [0.0, 0.094, -1.633], "depth": 0.024, "rot": [90, 0, 0]}
    f["atlas"] = A
    keep = [x for x in f["objects"] if x["id"] != "brain_sulci"]
    brain = [atlas_obj("cerebrum_R", None, "cerebrum_r", "#e8b7b0", A, noPick=True, motion="none"),
             atlas_obj("cerebrum_L", None, "cerebrum_l", "#e8b7b0", A, noPick=True, motion="none")]
    f["objects"] = keep + brain
    save("nervous-01", c)


# ---------------- 8.1 คอพอกเป็นพิษ ผ่าตัดต่อมไทรอยด์ ----------------
def endocrine_01():
    c = load("endocrine-01")
    f = c["surgery"]["field"]
    # หลอดลมเป็นโมเดลจริง ต่อมไทรอยด์ไม่มีในชุดข้อมูล — วางตามตำแหน่งจริงรอบหลอดลม (คอดคร่อมวงกระดูกอ่อนวงที่ 2–4 กลีบละ ~5 ซม.)
    A = {"origin": [0.0, 0.125, -1.385], "depth": 0.02}
    f["atlas"] = A
    f["cavity"]["depth"] = 0.08
    o = objs(c)
    lobe = lambda sx: [0.021 * sx, 0.111, -1.385]
    f["paths"]["incision"]["points"] = [[-0.05, 0.0], [0.05, 0.0]]
    f["objects"] = [
        organ(o["trachea"], "trachea", A, motion="none"),
        {**o["lobe_R"], "at": at(A, lobe(-1)), "size": [0.011, 0.009, 0.025], "rot": [0, -6, 0]},
        {**o["nod_R"], "at": at(A, [-0.024, 0.12, -1.39]), "r": 0.007},
        {**o["lobe_L"], "at": at(A, lobe(1)), "size": [0.011, 0.009, 0.025], "rot": [0, 6, 0]},
        {**o["nod_L"], "at": at(A, [0.023, 0.12, -1.378]), "r": 0.008},
        {**o["isthmus"], "at": at(A, [0.0, 0.123, -1.392]), "size": [0.012, 0.004, 0.007]},
        # เส้นประสาทกล่องเสียงวิ่งในร่องระหว่างหลอดลมกับหลอดอาหาร (ใต้กลีบไทรอยด์) — ต่อมพาราไทรอยด์อยู่ด้านหลังขอบนอกของกลีบ บน-ล่าง
        {**o["rln_R"], "points": tube_pts(A, [[-0.013, 0.098, -1.415], [-0.013, 0.1, -1.385], [-0.012, 0.099, -1.355]]), "r": 0.0012, "hit": 0.004},
        {**o["rln_L"], "points": tube_pts(A, [[0.013, 0.098, -1.415], [0.013, 0.1, -1.385], [0.012, 0.099, -1.355]]), "r": 0.0012, "hit": 0.004},
        {**o["pt_RU"], "at": at(A, [-0.022, 0.104, -1.397]), "r": 0.003, "hit": 0.004},
        {**o["pt_RL"], "at": at(A, [-0.022, 0.104, -1.373]), "r": 0.003, "hit": 0.004},
        {**o["pt_LU"], "at": at(A, [0.022, 0.104, -1.397]), "r": 0.003, "hit": 0.004},
        {**o["pt_LL"], "at": at(A, [0.022, 0.104, -1.373]), "r": 0.003, "hit": 0.004},
        {**o["field_fluid"], "at": at(A, [0.0, 0.128, -1.385]), "r": 0.03},
    ]
    for st in c["surgery"]["steps"]:
        # ยกกลีบไทรอยด์ขึ้นและออกด้านข้าง ให้เห็นเส้นประสาทและพาราไทรอยด์ที่อยู่ใต้กลีบ
        if st["id"] == "id-right":
            st["onStart"] = ["move:lobe_R:-0.02:0:-0.014"]
        if st["id"] == "id-left":
            st["onStart"] = ["move:lobe_L:0.02:0:-0.014"]
    save("endocrine-01", c)


# ---------------- 9.1 ท้องนอกมดลูก (ท่อนำไข่ขวา) ผ่าตัดส่องกล้อง ----------------
def reproductive_01():
    c = load("reproductive-01")
    f = c["surgery"]["field"]
    # อวัยวะเพศหญิงจาก tools/female-pelvis.mjs (ขนาดตามตำรา ในพิกัดเดียวกับ BodyParts3D) + กระเพาะปัสสาวะจริง
    A = {"origin": [0.0, 0.13, -0.86], "depth": 0.03}
    f["atlas"] = A
    f["center"] = [0.0, 0.16]
    f["cavity"]["depth"] = 0.16
    o = objs(c)
    amp = nearest("tube_r", [-0.07, 0.095, -0.878])
    f["objects"] = [o["port1"], o["port2"], o["port3"],
        organ(o["uterus"], "uterus_body", A, motion="none"),
        atlas_obj("cervix", None, "cervix_vagina", "#d6a4a4", A, noPick=True, motion="none"),
        organ(o["tube_R"], "tube_r", A, motion="none"),
        # ถุงการตั้งครรภ์ฝังที่ส่วนกระเปาะ (ampulla) ของท่อนำไข่ขวา ทำให้ท่อโป่ง ~2.5 ซม.
        {**o["ectopic"], "at": at(A, lift_pt(amp, 0.002)), "size": [0.013, 0.011, 0.012]},
        organ(o["tube_L"], "tube_l", A, motion="none"),
        organ(o["ovary_R"], "ovary_r", A, motion="none"),
        organ(o["ovary_L"], "ovary_l", A, motion="none"),
        # หลอดเลือดในเยื่อแขวนท่อนำไข่ (mesosalpinx) ใต้ท่อขวา ที่กำลังมีเลือดออก
        {**o["vessel_R"], "points": tube_pts(A, [[-0.02, 0.083, -0.874], [-0.04, 0.08, -0.871], [-0.058, 0.078, -0.866]]), "r": 0.0016, "hit": 0.005},
        organ(o["bladder"], "bladder", A, motion="none"),
        {**o["blood_pool"], "at": at(A, [0.0, 0.07, -0.86]), "r": 0.05},
        {**o["field_fluid"], "at": at(A, [0.0, 0.071, -0.86]), "r": 0.045},
    ]
    f["cameras"] = {"scope": scope_cam(A, [0.0, 0.145, -0.96], [-0.015, 0.085, -0.872])}
    save("reproductive-01", c)

CASES_ALL = {
    "digestive-03": digestive_03, "immune-02": immune_02, "circulatory-01": circulatory_01, "circulatory-02": circulatory_02,
    "digestive-02": digestive_02, "endocrine-02": endocrine_02, "endocrine-03": endocrine_03,
    "respiratory-01": respiratory_01, "respiratory-02": respiratory_02, "excretory-02": excretory_02,
    "reproductive-02": reproductive_02, "musculoskeletal-01": musculoskeletal_01, "nervous-01": nervous_01,
    "endocrine-01": endocrine_01, "reproductive-01": reproductive_01,
}

if __name__ == "__main__":
    for cid in sys.argv[1:] or CASES_ALL:
        CASES_ALL[cid]()
