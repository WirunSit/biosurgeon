import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * โหลดโมเดล .glb (บีบอัด Draco) พร้อมแคช — ใช้กับโมเดลอวัยวะที่ส่งออกจาก Blender (ระยะ 2)
 * ถ้าไม่มีไฟล์หรือโหลดไม่สำเร็จ จะคืน null แล้วฉากใช้รูปทรงพื้นฐานแทน เกมจึงเล่นได้เสมอ
 */
let loader: GLTFLoader | null = null;
const cache = new Map<string, Promise<THREE.Group | null>>();

function getLoader(): GLTFLoader {
  if (!loader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
  }
  return loader;
}

/** โหลดแล้วย่อ/ขยายให้ขนาดใหญ่สุดเท่ากับ size (เมตร) และจัดศูนย์กลางที่จุดกำเนิด */
export function loadModel(url: string, size: [number, number, number]): Promise<THREE.Group | null> {
  if (!cache.has(url)) {
    cache.set(
      url,
      getLoader()
        .loadAsync(url)
        .then((gltf) => gltf.scene)
        .catch(() => {
          console.info(`[BioSurgeon] ไม่พบโมเดล ${url} — ใช้รูปทรงพื้นฐานแทน`);
          return null;
        }),
    );
  }
  return cache.get(url)!.then((src) => {
    if (!src) return null;
    const m = src.clone(true);
    const box = new THREE.Box3().setFromObject(m);
    const dim = box.getSize(new THREE.Vector3());
    const want = Math.max(size[0], size[1], size[2]) * 2;
    const k = want / Math.max(dim.x, dim.y, dim.z, 1e-6);
    m.scale.setScalar(k);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    m.position.sub(c);
    const g = new THREE.Group();
    g.add(m);
    return g;
  });
}
