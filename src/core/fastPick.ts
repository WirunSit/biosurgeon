import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

/**
 * การคลิก/หาจุดที่มองเห็นยิงรังสีหาโมเดลอวัยวะหลายหมื่นสามเหลี่ยม — ถ้าไล่ทีละสามเหลี่ยม ครั้งละ ~6 มิลลิวินาที (เกมกระตุก)
 * จึงสร้างโครงสร้างค้นหา (BVH) ให้เรขาคณิตที่คลิกได้ ครั้งเดียวตอนโหลด แล้วยิงรังสีเร็วขึ้นหลายสิบเท่า
 * ใช้ได้เฉพาะเรขาคณิตที่ไม่ถูกแก้จุดยอดบน CPU ภายหลัง (การยุบ/เต้น/คลื่นทำในเชดเดอร์ ส่วนผนังรอยตัดไม่ได้เป็นตัวรับคลิก)
 */
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** สร้าง BVH ให้เมชที่คลิกได้ (ข้ามรูปทรงเล็ก ๆ ที่ไล่ทีละสามเหลี่ยมก็เร็วอยู่แล้ว) */
export function ensureBVH(objs: Iterable<THREE.Object3D>): void {
  for (const o of objs) {
    const g = (o as THREE.Mesh).geometry;
    if (!(o as THREE.Mesh).isMesh || !g || g.boundsTree) continue;
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    if (tris >= 200) g.computeBoundsTree();
  }
}
