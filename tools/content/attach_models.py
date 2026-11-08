# ใส่ "model" ให้วัตถุอวัยวะในไฟล์เคส (ท่อต้องมี size เพื่อกำหนดขนาดโมเดล)
import json, sys, glob, os
CASES = r"D:\Dr.Biology\biosurgeon\public\cases"
M = "models/organs/"
MAP = {
 "anatomy-01": {"liver": "liver", "gallbladder": "gallbladder", "stomach": "stomach", "spleen": "spleen",
                "pancreas": ("pancreas", [0.03, 0.007, 0.01]), "duodenum": ("duodenum", [0.014, 0.006, 0.016]), "colon": ("colon", [0.046, 0.01, 0.034])},
 "anatomy-02": {"heart": "heart"},  # กลีบปอด/หลอดลม: ใช้รูปทรงพื้นฐาน (โมเดลกลีบที่ย่อแยกกันไม่ต่อกันเป็นปอดเดียว)
 "anatomy-03": {"lung_R": "lung_r", "lung_L": "lung_l", "heart": "heart"},
 "anatomy-04": {"thymus": "thymus", "heart": "heart", "stomach": "stomach", "spleen": "spleen"},
 "anatomy-05": {"kidney_R": "kidney_r", "kidney_L": "kidney_l", "adrenal_R": "adrenal_r", "adrenal_L": "adrenal_l", "bladder": "bladder"},
 "anatomy-06": {"cerebrum_R": "cerebrum_r", "cerebrum_L": "cerebrum_l", "cerebellum": "cerebellum", "pons": "pons", "medulla": ("medulla", [0.004, 0.004, 0.008])},
 "anatomy-07": {"biceps": "biceps_r", "triceps": "triceps_r"},
 "anatomy-08": {"liver": "liver", "stomach": "stomach", "pancreas": ("pancreas", [0.032, 0.007, 0.01]), "kidney_R": "kidney_r", "kidney_L": "kidney_l", "adrenal_R": "adrenal_r", "adrenal_L": "adrenal_l"},
 "anatomy-09": {"bladder": "bladder", "prostate": "prostate", "vesicle": "seminal_vesicle"},
 "digestive-02": {"liver": "liver", "gallbladder": "gallbladder"},
 "digestive-03": {"liver": "liver", "stomach": "stomach", "duodenum": ("duodenum", [0.014, 0.006, 0.016])},
 "immune-02": {"spleen": "spleen", "stomach": "stomach", "liver": "liver"},
 "endocrine-02": {"stomach": "stomach", "spleen": "spleen", "pancreas": ("pancreas", [0.05, 0.009, 0.014])},
 "excretory-02": {"kidney": "kidney_r", "bladder": "bladder"},
 "circulatory-01": {"heart": "heart"},
 "circulatory-02": {"heart": "heart"},
}
only = set(sys.argv[1:])
if __name__ != "__main__": only = {"__none__"}
for cid, mp in MAP.items():
    if only and cid not in only: continue
    p = os.path.join(CASES, cid + ".json")
    c = json.load(open(p, encoding="utf-8"))
    objs = {o["id"]: o for o in c["surgery"]["field"]["objects"]}
    for oid, spec in mp.items():
        name, size = (spec if isinstance(spec, tuple) else (spec, None))
        o = objs[oid]
        o["model"] = M + name + ".glb"
        if size: o["size"] = size
    if cid == "anatomy-04": objs["thymus_L"]["hidden"] = True
    if cid == "anatomy-06":
        for k in ("cerebrum_R", "cerebrum_L"): objs[k]["modelRot"] = [90, 0, 0]  # มองจากด้านบนศีรษะ
    with open(p, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False, indent=1)
    print(cid, len(mp))
