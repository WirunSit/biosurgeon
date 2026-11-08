# เพิ่ม/อัปเดตรายการใน index.json โดยเรียงตามด่าน (แล็บก่อนเคสในด่านเดียวกัน)
import json, sys
P = r"D:\Dr.Biology\biosurgeon\public\cases\index.json"
def upsert(entry):
    idx = json.load(open(P, encoding="utf-8"))
    idx = [e for e in idx if e["id"] != entry["id"]]
    idx.append(entry)
    idx.sort(key=lambda e: (e["stage"], 0 if e.get("kind") == "anatomy" else 1))
    with open(P, "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join("  " + json.dumps(e, ensure_ascii=False) for e in idx) + "\n]\n")
if __name__ == "__main__":
    c = json.load(open(rf"D:\Dr.Biology\biosurgeon\public\cases\{sys.argv[1]}.json", encoding="utf-8"))
    e = {"id": c["id"], "stage": c["stage"], "system": c["system"], "systemName": c["systemName"], "title": c["title"], "available": True}
    if c.get("mode") == "anatomy": e["kind"] = "anatomy"
    upsert(e)
    print("index ok", c["id"])
