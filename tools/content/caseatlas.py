# ตัวช่วยแปลงไฟล์เคสผ่าตัด (เขียนด้วยมือ) ให้ใช้อวัยวะ BodyParts3D ตามพิกัดจริง (field.atlas)
# ใช้: แต่ละเคสมีฟังก์ชันใน cases_atlas.py ที่ระบุ origin ของ atlas, อวัยวะ → โมเดล, และตำแหน่งใหม่ของรูปทรงประกอบ (รอยโรค จุดเย็บ แอ่งเลือด ฯลฯ)
# ตำแหน่งรูปทรงประกอบคำนวณจากผิวจริงของโมเดล (surf) จึงวางบนอวัยวะพอดี
import json, os, struct
from labgen import glb_box, atlas_pt, atlas_obj, frac, ORGANS

# commit ที่เก็บไฟล์เคสก่อนแปลงเป็นพิกัดจริง (อย่าเปลี่ยน — ถ้าแก้เนื้อหาเคสต้นฉบับ ให้แก้ทั้งที่นี่และในฟังก์ชันแปลง)
BASE_REF = "f5cf714"
CASES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "cases")
_verts = {}


def verts(model):
    """จุดยอดทั้งหมดของโมเดล (พิกัดร่างกาย เมตร)"""
    if model not in _verts:
        b = open(os.path.join(ORGANS, model + ".glb"), "rb").read()
        n = struct.unpack_from("<I", b, 12)[0]
        j = json.loads(b[20:20 + n])
        acc = j["accessors"][0]
        bv = j["bufferViews"][acc["bufferView"]]
        off = 20 + n + 8 + bv.get("byteOffset", 0)
        cnt = acc["count"]
        _verts[model] = [struct.unpack_from("<3f", b, off + i * 12) for i in range(cnt)]
    return _verts[model]


def surf(model, x, z, r=0.008, side="front", lift=0.0):
    """จุดบนผิวโมเดลใกล้ตำแหน่ง (x, z): ด้านหน้าสุด (y มากสุด) หรือด้านหลังสุด — ยกออกจากผิว lift เมตร"""
    best = None
    for p in verts(model):
        if (p[0] - x) ** 2 + (p[2] - z) ** 2 > r * r:
            continue
        if best is None or (p[1] > best[1] if side == "front" else p[1] < best[1]):
            best = p
    if best is None:
        return surf(model, x, z, r * 2, side, lift)
    return [best[0], best[1] + (lift if side == "front" else -lift), best[2]]


def nearest(model, p):
    """จุดยอดของโมเดลที่ใกล้จุด p ที่สุด"""
    return list(min(verts(model), key=lambda q: sum((q[i] - p[i]) ** 2 for i in range(3))))


KEEP = ("label", "color", "rough", "draggable", "pulse", "hidden", "parent", "motion", "emissive", "opacity", "noPick", "axis", "tissue", "blood", "scrub")


def organ(old, model, atlas, **extra):
    """แทนวัตถุเดิมด้วยโมเดลตามพิกัดจริง คงคุณสมบัติที่ขั้นตอนใช้ (ป้ายชื่อ ลากได้ ซ่อน ฯลฯ)"""
    kept = {k: v for k, v in old.items() if k in KEEP}
    kept.update(extra)
    label = kept.pop("label", None)
    color = kept.pop("color", "#c08080")
    return atlas_obj(old["id"], label, model, color, atlas, **kept)


def at(atlas, p):
    return atlas_pt(atlas, p)


def tube_pts(atlas, pts):
    return [atlas_pt(atlas, p) for p in pts]


def load(cid):
    """อ่านไฟล์เคส "ต้นฉบับ" (ก่อนแปลง) จาก git commit BASE_REF — การแปลงจึงรันซ้ำได้ ผลเท่าเดิมเสมอ"""
    import subprocess
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    raw = subprocess.run(["git", "show", f"{BASE_REF}:public/cases/{cid}.json"], cwd=root, capture_output=True, check=True).stdout
    return json.loads(raw.decode("utf-8"))


def save(cid, c):
    with open(os.path.join(CASES, cid + ".json"), "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False, indent=1)
    print("wrote", cid, len(c["surgery"]["field"]["objects"]), "objects")


def scale_open(c, k, layers=None):
    """คูณความกว้างช่องเปิด (effect open:<layer>:<w>) ทุกขั้นด้วย k (แผลกว้างขึ้นตามสเกลจริง)"""
    def fix(lst):
        out = []
        for e in lst if isinstance(lst, list) else [lst]:
            p = e.split(":")
            if p[0] == "open" and len(p) == 3 and (layers is None or p[1] in layers):
                e = f"open:{p[1]}:{round(float(p[2]) * k, 4)}"
            out.append(e)
        return out
    walk = list(c["surgery"]["steps"]) + [s for ev in c.get("events", []) for s in ev.get("steps", [])]
    for s in walk:
        for key in ("onStart", "onSuccess"):
            if s.get(key):
                s[key] = fix(s[key])
        for m in s.get("mistakes", []) or []:
            if m.get("effects"):
                m["effects"] = fix(m["effects"])


def set_effect(c, step_id, key, old, new):
    """แทน effect ในขั้นที่ระบุ"""
    for s in c["surgery"]["steps"]:
        if s["id"] == step_id:
            lst = s.get(key) or []
            s[key] = [new if e == old else e for e in lst]
            return
    raise KeyError(step_id)


def objs(c):
    return {o["id"]: o for o in c["surgery"]["field"]["objects"]}


def ridge(model, xs, band=0.004, lift=0.0):
    """แนวสันด้านหน้าของอวัยวะ (เช่น ตามแนวยาวของตับอ่อน): ที่แต่ละ x เลือกจุดยอดที่อยู่หน้าสุด"""
    out = []
    for x in xs:
        cand = [p for p in verts(model) if abs(p[0] - x) < band]
        if not cand:
            continue
        p = max(cand, key=lambda q: q[1])
        out.append([p[0], p[1] + lift, p[2]])
    return out


def scope_cam(atlas, pos, target):
    """มุมกล้องส่องจากจุดในพิกัดโมเดล → รูปแบบ cameras ของฉาก: pos [u, ความสูงเหนือผิว, v], target [u, ความลึก, v]"""
    p, t = atlas_pt(atlas, pos), atlas_pt(atlas, target)
    return {"pos": [p[0], round(-p[2], 4), p[1]], "target": [t[0], t[2], t[1]]}


def lift_pt(p, dy):
    return [p[0], p[1] + dy, p[2]]
