# ใส่ "model" ให้วัตถุอวัยวะในไฟล์เคส (ท่อต้องมี size เพื่อกำหนดขนาดโมเดล)
import json, sys, glob, os
CASES = r"D:\Dr.Biology\biosurgeon\public\cases"
M = "models/organs/"
MAP = {
 # anatomy-01 วางโมเดลตามพิกัดจริง (atlas_obj ใน lab1.py) — ไม่ต้องใส่ที่นี่
 # anatomy-02..09: วางโมเดลตามพิกัดจริง (atlas_obj) ใน lab2/4/6/8/9.py
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
    with open(p, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False, indent=1)
    print(cid, len(mp))
