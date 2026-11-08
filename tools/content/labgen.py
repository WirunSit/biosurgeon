# ตัวช่วยสร้างไฟล์ห้องปฏิบัติการกายวิภาค (anatomy-0X.json)
# A(u, v_app, d): ตำแหน่งที่ "ต้องการให้เห็น" ผ่านแผล → พิกัดจริง (ชดเชยพารัลแลกซ์ v + 0.39d)
import json, os, sys

OUT = r"D:\Dr.Biology\biosurgeon\public\cases"
K = 0.387


def A(u, v, d):
    return [round(u, 4), round(v - K * d, 4), round(d, 4)]


def T(pts):
    """จุดของท่อ: [(u, v_app, d), ...]"""
    return [A(*p) for p in pts]


MODEL_SKIN = "#e6c7ad"
DRAPE = "#5b7fa6"


def lab(id, stage, system, systemName, title, intro, steps, objects, layers, paths, opening, quiz, codex,
        window=(0.09, 0.1), center=(0.0, -0.05), cavity=("#6e3a34", 0.07), cameras=None, practice=False, time=600):
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
