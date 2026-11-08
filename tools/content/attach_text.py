# ใส่ "model" แบบแทรกข้อความ (รักษารูปแบบไฟล์เคสที่เขียนด้วยมือ)
import json, re, os
from attach_models import MAP, CASES, M
HAND = ["digestive-02", "immune-02", "endocrine-02", "excretory-02", "circulatory-01", "circulatory-02"]
for cid in HAND:
    p = os.path.join(CASES, cid + ".json")
    s = open(p, encoding="utf-8").read()
    for oid, spec in MAP[cid].items():
        name, size = (spec if isinstance(spec, tuple) else (spec, None))
        m_ = re.compile(r'\{ ?"id": "' + oid + r'",').search(s, s.index('"objects"'))
        key = m_.group(0) if m_ else f'{{ "id": "{oid}",'
        start = s.index('"objects"')
        i = s.find(key, start)
        assert i >= 0, (cid, oid)
        if s[i + len(key):].startswith(' "model"'): continue
        extra = f' "model": "{M}{name}.glb",' + (f' "size": {json.dumps(size)},' if size else "")
        s = s[:i + len(key)] + extra + s[i + len(key):]
    json.loads(s)
    open(p, "w", encoding="utf-8", newline="\n").write(s)
    print(cid, "ok")
