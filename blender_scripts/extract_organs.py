"""
BioSurgeon — ระยะ 2: ดึงอวัยวะจาก Z-Anatomy แล้วส่งออกเป็น .glb (บีบอัด Draco) ทีละชิ้น

วิธีใช้ (ไม่ต้องเปิดหน้าต่าง Blender):
    blender Z-Anatomy.blend --background --python blender_scripts/extract_organs.py -- blender_scripts/organs.csv public/models/organs

สิ่งที่สคริปต์ทำ (ตามแผนข้อ 5.3):
  1. ค้นหา object ตามชื่อภาษาอังกฤษในคอลัมน์ z_anatomy_name (ไม่สนตัวพิมพ์เล็ก-ใหญ่ รองรับชื่อที่มี .l / .r ต่อท้าย)
  2. คัดลอกออกมา รวมชิ้นย่อยที่ระบุหลายชื่อ (คั่นด้วย |) เป็นชิ้นเดียว และย้ายจุดศูนย์กลางมาที่กึ่งกลางชิ้น
  3. Decimate ให้ไม่เกินจำนวนสามเหลี่ยมในคอลัมน์ max_tris
  4. ใส่วัสดุ Principled BSDF สีตามคอลัมน์ color (สไตล์กึ่งการ์ตูน ผิวด้านเล็กน้อย)
  5. ส่งออก .glb แบบ Draco ไปที่โฟลเดอร์ปลายทาง (ชื่อไฟล์ตามคอลัมน์ out_file)
  6. ต่อท้ายรายการเครดิตใน CREDITS.md (Z-Anatomy, CC BY-SA 4.0)

จากนั้นในไฟล์เคส JSON ใส่ "model": "models/organs/<out_file>" ให้วัตถุที่ id ตรงกับคอลัมน์ object_id
ถ้าไม่มีไฟล์ เกมจะใช้รูปทรงพื้นฐานเดิมโดยอัตโนมัติ
"""
import bpy
import bmesh
import csv
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CSV_PATH = argv[0] if len(argv) > 0 else os.path.join(os.path.dirname(__file__), "organs.csv")
OUT_DIR = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "public", "models", "organs")
CREDITS = os.path.join(os.path.dirname(__file__), "..", "CREDITS.md")
os.makedirs(OUT_DIR, exist_ok=True)


def find_objects(names):
    """หา object ที่ชื่อตรง (ไม่สนตัวพิมพ์) หรือขึ้นต้นด้วยชื่อนั้น"""
    found = []
    for wanted in names:
        w = wanted.strip().lower()
        hits = [o for o in bpy.data.objects if o.type == "MESH" and o.name.lower() == w]
        if not hits:
            hits = [o for o in bpy.data.objects if o.type == "MESH" and o.name.lower().startswith(w)]
        if not hits:
            print(f"  ! ไม่พบ '{wanted}'")
        found.extend(hits[:1])
    return found


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def make_material(name, hex_color):
    h = hex_color.lstrip("#")
    rgb = tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    # sRGB → linear สำหรับ Blender
    lin = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.45
    return mat


def isolate(objs, name):
    """คัดลอกชิ้นที่เลือก รวมเป็นชิ้นเดียว ใช้ modifier ทั้งหมด"""
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for o in objs:
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        c.parent = None
        c.matrix_world = o.matrix_world.copy()
        copies.append(c)
    for c in copies:
        c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.convert(target="MESH")
    if len(copies) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.location = (0, 0, 0)
    return obj


def decimate(obj, max_tris):
    n = tri_count(obj)
    if n <= max_tris:
        return n
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = max(0.01, max_tris / n)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # ทำให้ผิวเรียบ
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(obj.data)
    bm.free()
    return tri_count(obj)


def export(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_yup=True,
    )


def main():
    done = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            names = row["z_anatomy_name"].split("|")
            print(f"[{row['case_id']}] {row['object_id']} ← {names}")
            objs = find_objects(names)
            if not objs:
                continue
            obj = isolate(objs, row["object_id"])
            tris = decimate(obj, int(row["max_tris"]))
            obj.data.materials.clear()
            obj.data.materials.append(make_material(row["object_id"], row["color"]))
            out = os.path.join(OUT_DIR, row["out_file"])
            export(obj, out)
            size_kb = os.path.getsize(out) // 1024
            print(f"  ✓ {out} ({tris} สามเหลี่ยม, {size_kb} KB)")
            done.append((row["out_file"], ", ".join(o.name for o in objs)))
            bpy.data.objects.remove(obj, do_unlink=True)
    if done:
        with open(CREDITS, "a", encoding="utf-8") as c:
            c.write("\n## โมเดลอวัยวะจาก Z-Anatomy (CC BY-SA 4.0) — ดัดแปลง: ลดรูป ปรับสี ส่งออก glTF\n")
            c.write("ที่มา: https://github.com/LluisV/Z-Anatomy (ต่อยอดจาก BodyParts3D, DBCLS)\n\n")
            for out_file, src in done:
                c.write(f"- `{out_file}` ← {src}\n")
    print(f"เสร็จ {len(done)} ชิ้น")


main()
