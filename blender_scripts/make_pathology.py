"""
BioSurgeon — ระยะ 2: สร้างโมเดล "สภาพผิดปกติ" จากโมเดลอวัยวะปกติ (แผนข้อ 5.4)

วิธีใช้:
    blender --background --python blender_scripts/make_pathology.py -- public/models/organs

แต่ละรายการใน JOBS: นำไฟล์ .glb ปกติเข้ามา → ดัดแปลง → ส่งออกไฟล์ใหม่
ชนิดการดัดแปลง:
  inflate   ขยายตามแนวตั้งฉากผิว (ไส้ติ่งบวม ต่อมไทรอยด์โต ท่อนำไข่โป่ง)
  stones    เพิ่มก้อนนิ่วรูปร่างสุ่มภายในกล่องขอบเขต (นิ่วถุงน้ำดี นิ่วท่อไต)
  hole      เจาะรูด้วย boolean (ผนังกั้นห้องหัวใจรั่ว)
  narrow    บีบรัศมีบางช่วงตามแกน (หลอดเลือดหัวใจตีบ)
  split     ตัดเป็น 2 ท่อนด้วยระนาบ แล้วแยกห่าง (กระดูกหัก เอ็นขาด)
  twist     บิดเป็นเกลียวรอบแกน (อัณฑะบิดขั้ว)
  tumor     เพิ่มก้อนนูนบนผิว (มะเร็งปอด เนื้องอกตับอ่อน)
"""
import bpy
import bmesh
import os
import random
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DIR = argv[0] if argv else os.path.join(os.path.dirname(__file__), "..", "public", "models", "organs")

JOBS = [
    # (ไฟล์ต้นฉบับ, ไฟล์ผลลัพธ์, ชนิด, พารามิเตอร์)
    ("appendix.glb", "appendix-inflamed.glb", "inflate", {"amount": 0.0025, "color": (0.72, 0.2, 0.16)}),
    ("gallbladder.glb", "gallbladder-stones.glb", "stones", {"count": 6, "size": 0.004, "color": (0.85, 0.72, 0.25)}),
    ("heart.glb", "heart-vsd.glb", "hole", {"at": (0.0, -0.005, 0.0), "radius": 0.004}),
    ("coronary.glb", "coronary-stenosis.glb", "narrow", {"axis": "Z", "at": 0.4, "width": 0.15, "factor": 0.45}),
    ("femur.glb", "femur-fracture.glb", "split", {"axis": "Z", "at": 0.5, "gap": 0.006}),
    ("achilles.glb", "achilles-ruptured.glb", "split", {"axis": "Z", "at": 0.35, "gap": 0.012}),
    ("thyroid.glb", "thyroid-goiter.glb", "inflate", {"amount": 0.003, "color": (0.62, 0.28, 0.26)}),
    ("tube-right.glb", "tube-ectopic.glb", "tumor", {"at": 0.6, "radius": 0.008, "color": (0.55, 0.2, 0.25)}),
    ("testis.glb", "testis-torsion.glb", "twist", {"axis": "Z", "angle": 720}),
    ("lung-right.glb", "lung-tumor.glb", "tumor", {"at": 0.8, "radius": 0.012, "color": (0.85, 0.82, 0.75)}),
    ("pancreas.glb", "pancreas-insulinoma.glb", "tumor", {"at": 0.15, "radius": 0.006, "color": (0.8, 0.45, 0.4)}),
]


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def load(name):
    bpy.ops.import_scene.gltf(filepath=os.path.join(DIR, name))
    meshes = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def tint(obj, rgb):
    for m in obj.data.materials:
        if m and m.use_nodes:
            m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1)


def add_material(obj, rgb):
    mat = bpy.data.materials.new("patho")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1)
    obj.data.materials.append(mat)
    return len(obj.data.materials) - 1


def bounds(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def axis_index(a):
    return "XYZ".index(a)


def inflate(obj, amount, color=None):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        v.co += v.normal * amount
    bm.to_mesh(obj.data)
    bm.free()
    if color:
        tint(obj, color)


def stones(obj, count, size, color):
    lo, hi = bounds(obj)
    c = (lo + hi) / 2
    parts = []
    for i in range(count):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size * random.uniform(0.6, 1.3))
        s = bpy.context.active_object
        s.location = c + Vector([random.uniform(-0.3, 0.3) * (hi[k] - lo[k]) for k in range(3)])
        s.rotation_euler = (random.random() * 3, random.random() * 3, random.random() * 3)
        parts.append(s)
    for s in parts:
        idx = add_material(s, color)
        for p in s.data.polygons:
            p.material_index = idx
    bpy.ops.object.select_all(action="DESELECT")
    for s in parts:
        s.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()


def hole(obj, at, radius):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=0.05, location=at, rotation=(0, 1.5708, 0))
    cutter = bpy.context.active_object
    mod = obj.modifiers.new("hole", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def narrow(obj, axis, at, width, factor):
    i = axis_index(axis)
    lo, hi = bounds(obj)
    centre = (lo + hi) / 2
    span = hi[i] - lo[i]
    mid = lo[i] + span * at
    for v in obj.data.vertices:
        t = abs(v.co[i] - mid) / (span * width)
        if t < 1:
            k = 1 - (1 - factor) * (1 - t * t)
            for j in range(3):
                if j != i:
                    v.co[j] = centre[j] + (v.co[j] - centre[j]) * k


def split(obj, axis, at, gap):
    i = axis_index(axis)
    lo, hi = bounds(obj)
    cut = lo[i] + (hi[i] - lo[i]) * at
    for v in obj.data.vertices:
        if v.co[i] > cut:
            v.co[i] += gap
        else:
            v.co[i] -= gap * 0.2


def twist(obj, axis, angle):
    mod = obj.modifiers.new("twist", "SIMPLE_DEFORM")
    mod.deform_method = "TWIST"
    mod.deform_axis = axis
    mod.angle = angle * 3.14159 / 180
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    tint(obj, (0.35, 0.18, 0.3))


def tumor(obj, at, radius, color):
    lo, hi = bounds(obj)
    p = lo + (hi - lo) * at
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=p)
    t = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(t.data)
    for v in bm.verts:
        v.co *= random.uniform(0.85, 1.15)
    bm.to_mesh(t.data)
    bm.free()
    idx = add_material(t, color)
    for f in t.data.polygons:
        f.material_index = idx
    bpy.ops.object.select_all(action="DESELECT")
    t.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()


OPS = {"inflate": inflate, "stones": stones, "hole": hole, "narrow": narrow, "split": split, "twist": twist, "tumor": tumor}

for src, dst, kind, params in JOBS:
    if not os.path.exists(os.path.join(DIR, src)):
        print(f"ข้าม {src} (ยังไม่มีไฟล์ — รัน extract_organs.py ก่อน)")
        continue
    clear()
    obj = load(src)
    OPS[kind](obj, **params)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(DIR, dst), export_format="GLB", use_selection=True, export_draco_mesh_compression_enable=True)
    print(f"✓ {dst}")
