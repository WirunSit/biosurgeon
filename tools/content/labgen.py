# ตัวช่วยสร้างไฟล์ห้องปฏิบัติการกายวิภาค (anatomy-0X.json)
# A(u, v_app, d): ตำแหน่งที่ "ต้องการให้เห็น" ผ่านแผล → พิกัดจริง (ชดเชยพารัลแลกซ์ v + 0.39d)
import json, os, struct, sys

OUT = r"D:\Dr.Biology\biosurgeon\public\cases"
K = 0.387


def A(u, v, d):
    return [round(u, 4), round(v - K * d, 4), round(d, 4)]


def T(pts):
    """จุดของท่อ: [(u, v_app, d), ...]"""
    return [A(*p) for p in pts]


MODEL_SKIN = "#e6c7ad"
ORGANS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models", "organs")


def glb_box(name):
    """กล่องขอบเขตของโมเดล (พิกัดร่างกาย BodyParts3D หน่วยเมตร: x ซ้ายผู้ป่วย, y ด้านหน้า, z ทางเท้า)"""
    b = open(os.path.join(ORGANS, name + ".glb"), "rb").read()
    n = struct.unpack_from("<I", b, 12)[0]
    acc = json.loads(b[20:20 + n])["accessors"][0]
    return acc["min"], acc["max"]


import math


def _rot(atlas):
    """เมทริกซ์หมุนแบบเดียวกับ three.js Euler 'XYZ' (R = Rx·Ry·Rz)"""
    rx, ry, rz = [math.radians(a) for a in atlas.get("rot", [0, 0, 0])]
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
    mul = lambda A, B: [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mul(mul(Rx, Ry), Rz)


def atlas_pt(atlas, p):
    """จุดในพิกัดโมเดล (เมตร) → พิกัดฉาก [u, v, d] ตาม field.atlas"""
    R, k = _rot(atlas), atlas.get("scale", 1)
    q = [(p[i] - atlas["origin"][i]) * k for i in range(3)]
    w = [sum(R[r][c] * q[c] for c in range(3)) for r in range(3)]
    return [round(w[0], 4), round(w[2], 4), round(atlas["depth"] - w[1], 4)]


def frac(model, fx, fy, fz):
    """จุดในกล่องขอบเขตของโมเดล (0–1 ต่อแกน: x ขวา→ซ้ายผู้ป่วย, y หลัง→หน้า, z ศีรษะ→เท้า) ใช้วางรูปทรงประกอบ"""
    lo, hi = glb_box(model)
    return [lo[i] + (hi[i] - lo[i]) * f for i, f in enumerate((fx, fy, fz))]


def atlas_obj(id, label, model, color, atlas, **extra):
    """อวัยวะวางตามพิกัดจริง: at/size คำนวณจากกล่องขอบเขตของโมเดล (ใช้เป็นรูปทรงสำรองถ้าโหลดโมเดลไม่ได้)"""
    lo, hi = glb_box(model)
    sh = extra.get("atlasShift") or [0, 0, 0]
    lo, hi = [lo[i] + sh[i] for i in range(3)], [hi[i] + sh[i] for i in range(3)]
    pts = [atlas_pt(atlas, [(lo, hi)[a][0], (lo, hi)[b][1], (lo, hi)[c][2]]) for a in (0, 1) for b in (0, 1) for c in (0, 1)]
    mn = [min(p[i] for p in pts) for i in range(3)]
    mx = [max(p[i] for p in pts) for i in range(3)]
    k = atlas.get("scale", 1)
    o = {"id": id, "label": label, "shape": "ellipsoid",
         "at": [round((mn[i] + mx[i]) / 2, 4) for i in range(3)],
         # size = ครึ่งความกว้าง [u, ความสูง, v]
         "size": [round((mx[0] - mn[0]) / 2, 4), round((mx[2] - mn[2]) / 2, 4), round((mx[1] - mn[1]) / 2, 4)],
         "color": color, "model": f"models/organs/{model}.glb", "atlas": True}
    o.update(extra)
    if o.get("label") is None:
        del o["label"]
    return o


def atlas_tube(id, label, atlas, pts, r, color, **extra):
    """ท่อ (เช่น ท่อน้ำเหลือง ท่อนำอสุจิ) ผ่านจุดในพิกัดโมเดล"""
    k = atlas.get("scale", 1)
    o = {"id": id, "label": label, "shape": "tube", "points": [atlas_pt(atlas, p) for p in pts], "r": round(r * k, 4), "color": color}
    o.update(extra)
    if o.get("label") is None:
        del o["label"]
    return o


def atlas_blob(id, label, atlas, p, size, color, shape="ellipsoid", **extra):
    """รูปทรงพื้นฐาน (ต่อมน้ำเหลือง ห้องหัวใจ ภาพตัดไต ฯลฯ) ที่จุดในพิกัดโมเดล — size เป็นเมตรจริง (ครึ่งความกว้าง u, สูง, v)"""
    k = atlas.get("scale", 1)
    o = {"id": id, "label": label, "shape": shape, "at": atlas_pt(atlas, p), "size": [round(x * k, 4) for x in size], "color": color}
    o.update(extra)
    if o.get("label") is None:
        del o["label"]
    return o


DRAPE = "#5b7fa6"


def lab(id, stage, system, systemName, title, intro, steps, objects, layers, paths, opening, quiz, codex,
        window=(0.09, 0.1), center=(0.0, -0.05), cavity=("#6e3a34", 0.07), cameras=None, practice=False, time=600, atlas=None):
    field = {
        "center": list(center),
        "window": {"hw": window[0], "hd": window[1]},
        "drapeColor": DRAPE,
        "opening": opening,
        "paths": paths,
        "layers": layers,
        "cavity": {"color": cavity[0], "depth": cavity[1]} if cavity else None,
        "objects": objects,
    }
    if cameras:
        field["cameras"] = cameras
    if atlas:
        field["atlas"] = atlas
    if practice:
        field["practicePad"] = True
    c = {
        "id": id,
        "mode": "anatomy",
        "system": system,
        "systemName": systemName,
        "stage": stage,
        "title": title,
        "diseaseName": f"ห้องปฏิบัติการกายวิภาค: {systemName}",
        "curriculum": ["(ครูใส่รหัสตัวชี้วัด: โครงสร้างและหน้าที่ของ" + systemName.replace("ระบบ", "ระบบ") + ")"],
        "patient": {"name": "หุ่นจำลองกายวิภาค", "age": 0, "sex": "M", "job": "แบบจำลองเพื่อการศึกษา"},
        "chiefComplaint": intro[0],
        "background": intro[1],
        "vitals": {"T": 37.0, "HR": 72, "BP": "120/80", "RR": 14, "SpO2": 99},
        "history": [], "exam": [], "tests": [], "budget": 0,
        "surgery": {"scene": "field", "timeLimitSec": time, "field": field, "steps": steps},
        "postOp": {"quiz": quiz},
        "codex": codex,
    }
    with open(os.path.join(OUT, f"{id}.json"), "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False, indent=1)
    print("wrote", id, len(steps), "steps", len(objects), "objects")


def click(id, say, target, learn, tool="forceps", label=None, mistakes=None, onSuccess=None, hint=None):
    s = {"id": id, "say": say, "tool": tool, "action": "click", "target": target, "learn": learn,
         "onSuccess": (onSuccess or []) + [f"label:{x}" for x in (label or [target])]}
    if mistakes:
        s["mistakes"] = mistakes
    if hint:
        s["hint"] = hint
    return s


def wrong(target, explain, penalty=1):
    return {"target": target, "penalty": penalty, "explain": explain}


def mg_order(id, say, title, prompt, items, explain):
    return {"id": id, "say": say, "action": "minigame",
            "minigame": {"type": "order", "title": title, "prompt": prompt, "items": items, "explain": explain, "bio": True}}


def mg_match(id, say, title, prompt, pairs, explain):
    return {"id": id, "say": say, "action": "minigame",
            "minigame": {"type": "match", "title": title, "prompt": prompt,
                         "pairs": [{"left": l, "right": r} for l, r in pairs], "explain": explain, "bio": True}}


def q(question, choices, explain, answer=0):
    return {"q": question, "choices": choices, "answer": answer, "explain": explain}


def skin_layers(*extra):
    base = [{"id": "skin", "name": "ผิวหนัง (หุ่นจำลอง)", "depth": 0, "color": MODEL_SKIN, "edge": "#b5765f", "tex": "skin"}]
    return base + list(extra)


if __name__ == "__main__":
    import importlib
    for name in sys.argv[1:]:
        importlib.import_module(name)
