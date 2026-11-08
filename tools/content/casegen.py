# ตัวช่วยสร้างไฟล์เคสผู้ป่วย (เคส x.3)
import json, os
from labgen import A, T, q, wrong, mg_order, mg_match, OUT


def H(id, question, answer, clue, ev, minutes=2):
    return {"id": id, "q": question, "a": answer, "clue": clue, "minutes": minutes, "ev": ev}


def E(zone, label, finding, clue, ev, minutes=2, minigame=None):
    e = {"zone": zone, "label": label, "finding": finding, "clue": clue, "minutes": minutes, "ev": ev}
    if minigame:
        e["minigame"] = minigame
    return e


def X(id, name, result, clue, ev, cost=1, minutes=20, image=None):
    t = {"id": id, "name": name, "cost": cost, "minutes": minutes, "result": result, "clue": clue, "ev": ev}
    if image:
        t["image"] = image
    return t


def S(id, say, tool, action, **kw):
    s = {"id": id, "say": say, "action": action}
    if tool:
        s["tool"] = tool
    s.update(kw)
    return s


def case(id, stage, system, systemName, title, diseaseName, curriculum, patient, chief, background, vitals, examMap,
         history, exam, tests, budget, diagnosis, preOp, surgery, postOp, codex, events=None):
    c = {"id": id, "system": system, "systemName": systemName, "stage": stage, "title": title, "diseaseName": diseaseName,
         "curriculum": [curriculum], "patient": patient, "chiefComplaint": chief, "background": background, "vitals": vitals,
         "examMap": examMap, "history": history, "exam": exam, "tests": tests, "budget": budget}
    if events:
        c["events"] = events
    c.update({"diagnosis": diagnosis, "preOp": preOp, "surgery": surgery, "postOp": postOp, "codex": codex})
    with open(os.path.join(OUT, f"{id}.json"), "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False, indent=1)
    print("wrote", id, len(surgery["steps"]), "steps")


def dx(options, explains, evidence, bio):
    return {"options": options, "answer": 0, "explains": explains, "evidenceRequired": evidence, "bioQuestion": bio}


def preop(procedure, anesthesia, distractors, decision=None, minigames=None):
    p = {"procedure": procedure}
    if decision:
        p["decision"] = decision
    if minigames:
        p["minigames"] = minigames
    p["anesthesia"] = anesthesia
    p["tray"] = {"distractors": [{"id": i, "name": n, "why": w} for i, n, w in distractors]}
    return p


def postop(good, infection, ruptured, damage, advice, quiz):
    return {"outcomes": {"good": good, "infection": infection, "ruptured": ruptured, "damage": damage}, "advice": advice, "quiz": quiz}


def avatar(skin="#c98f6b", hair="#141110"):
    return {"skin": skin, "hair": hair, "gown": "#8cbfd1"}


def V(T=37.0, HR=80, BP="120/80", RR=16, SpO2=98):
    return {"T": T, "HR": HR, "BP": BP, "RR": RR, "SpO2": SpO2}


def close_steps(deep, deep_name, opens):
    """เย็บปิดชั้นลึก + ผิวหนัง + ปิดแผล"""
    return [
        S(f"close-{deep}", f"เย็บปิด{deep_name}", "needle", "suture", layer=deep, stitches=3, onStart=opens, onSuccess=[f"close:{deep}"]),
        S("close-skin", "เย็บปิดผิวหนัง", "needle", "suture", layer="skin", stitches=3, onSuccess=["close:skin"]),
        S("dress", "ปิดแผลด้วยผ้าก๊อซ", "gauze", "click", target="incision", onSuccess=["dress"]),
    ]
