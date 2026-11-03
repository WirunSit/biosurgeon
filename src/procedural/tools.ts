import * as THREE from 'three';
import type { ToolId } from '../types';
import { bar, varTube } from './geom';

/**
 * เครื่องมือผ่าตัดสร้างด้วยโค้ดทั้งหมด (procedural) — ไม่มีโมเดลมือ
 * ทุกชิ้น: ปลายเครื่องมืออยู่ที่จุดกำเนิด ด้ามยื่นไปทาง +Y
 * userData.jaws = กลุ่มปากคีบ/ใบกรรไกร ที่หุบเมื่อกด, userData.flat = วางราบ (ผ้าก๊อซ)
 */

const steelMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, metalness: 0.92, roughness: 0.26 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.9, roughness: 0.35 });

export const TOOL_NAMES: Record<ToolId, string> = {
  antiseptic: 'สำลีชุบน้ำยาฆ่าเชื้อ',
  marker: 'ปากกามาร์ก',
  scalpel: 'มีดผ่าตัด',
  scissors: 'กรรไกรผ่าตัด',
  forceps: 'ปากคีบ',
  clamp: 'คีมหนีบหลอดเลือด',
  retractor: 'ตะขอถ่างแผล',
  suction: 'เครื่องดูด',
  cautery: 'จี้ไฟฟ้า',
  needle: 'คีมจับเข็ม + ไหม',
  gauze: 'ผ้าก๊อซ',
  syringe: 'เข็มฉีดยาชา',
  saw: 'เลื่อยผ่ากระดูก',
  spreader: 'เครื่องถ่างกระดูกอก/ซี่โครง',
  drill: 'สว่านผ่าตัด',
  scope: 'กล้องส่องผ่าตัด',
  chest_tube: 'ท่อระบายทรวงอก',
  cannula: 'ท่อเครื่องปอดและหัวใจเทียม',
  clip: 'คลิปหนีบหลอดเลือด',
  probe: 'หัวตรวจอัลตราซาวนด์',
  laser: 'เลเซอร์สลายนิ่ว',
  basket: 'ตะกร้าคล้องนิ่ว',
  stent: 'สายระบายท่อไต',
  phaco: 'หัวสลายเลนส์ (Phaco)',
  iol: 'เลนส์แก้วตาเทียม',
  plate: 'แผ่นโลหะ + สกรู',
  patch: 'แผ่นปะ',
};

/** เครื่องมือพื้นฐานที่อยู่ในถาดทุกเคส — เครื่องมือเฉพาะเคสจะเพิ่มต่อท้ายตามที่ไฟล์เคสใช้ */
export const BASIC_TOOLS: ToolId[] = [
  'antiseptic',
  'marker',
  'scalpel',
  'cautery',
  'retractor',
  'scissors',
  'forceps',
  'clamp',
  'needle',
  'suction',
  'gauze',
];

export const SPECIAL_TOOLS: ToolId[] = [
  'syringe',
  'saw',
  'spreader',
  'drill',
  'scope',
  'chest_tube',
  'cannula',
  'clip',
  'probe',
  'laser',
  'basket',
  'stent',
  'phaco',
  'iol',
  'plate',
  'patch',
];

export const TOOL_ORDER: ToolId[] = [...BASIC_TOOLS, ...SPECIAL_TOOLS];

function ring(x: number, y: number, r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0016, 8, 20), steelMat);
  m.position.set(x, y, 0);
  return m;
}

/** โครงแบบกรรไกร: ใช้กับกรรไกร คีมหนีบ และคีมจับเข็ม */
function scissorLike(jawLen: number, jawWidth: number, shankLen: number, curved: boolean): THREE.Group {
  const g = new THREE.Group();
  const jaws = new THREE.Group();
  const pivotY = jawLen;
  const spread = 0.0028;
  for (const side of [-1, 1]) {
    const tipX = curved ? side * 0.0006 + 0.0025 : side * 0.0008;
    jaws.add(bar(tipX, 0, side * spread * 0.4, pivotY, jawWidth, 0.0018, steelMat));
    g.add(bar(side * spread * 0.4, pivotY, -side * 0.011, pivotY + shankLen, 0.0028, 0.0022, steelMat));
    g.add(ring(-side * 0.0135, pivotY + shankLen + 0.009, 0.0085));
  }
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 12), darkSteel);
  screw.rotation.x = Math.PI / 2;
  screw.position.y = pivotY;
  g.add(screw, jaws);
  g.userData.jaws = jaws;
  return g;
}

export function buildTool(id: ToolId): THREE.Group {
  const g = new THREE.Group();
  g.name = `tool:${id}`;
  switch (id) {
    case 'scalpel': {
      g.add(bar(0, 0.028, 0, 0.13, 0.009, 0.0026, steelMat));
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.05, 0.0028), darkSteel);
      grip.position.y = 0.06;
      g.add(grip);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(0.0085, 0.008, 0.0045, 0.028);
      shape.lineTo(-0.0028, 0.028);
      shape.lineTo(-0.0018, 0.006);
      shape.closePath();
      const blade = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ color: 0xf2f5f7, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
      );
      g.add(blade);
      break;
    }
    case 'marker': {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.11, 14),
        new THREE.MeshStandardMaterial({ color: 0x6d28d9, roughness: 0.5 }),
      );
      body.position.y = 0.068;
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.0035, 0.012, 12),
        new THREE.MeshStandardMaterial({ color: 0x3b0764 }),
      );
      tip.rotation.x = Math.PI;
      tip.position.y = 0.007;
      g.add(body, tip);
      break;
    }
    case 'antiseptic': {
      for (const s of [-1, 1]) g.add(bar(s * 0.0025, 0.012, s * 0.008, 0.2, 0.0022, 0.0022, steelMat));
      g.add(ring(-0.011, 0.21, 0.008), ring(0.011, 0.21, 0.008));
      const sponge = new THREE.Mesh(
        new THREE.SphereGeometry(0.0115, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xa8521a, roughness: 0.95 }),
      );
      sponge.scale.set(1, 0.85, 1);
      sponge.position.y = 0.0098;
      g.add(sponge);
      break;
    }
    case 'scissors':
      g.add(scissorLike(0.045, 0.0032, 0.085, false));
      g.userData.jaws = g.children[0].userData.jaws;
      break;
    case 'clamp': {
      const s = scissorLike(0.03, 0.0026, 0.1, true);
      g.add(s);
      g.userData.jaws = s.userData.jaws;
      for (const side of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.002), darkSteel);
        r.position.set(-side * 0.0085, 0.12, 0);
        g.add(r);
      }
      break;
    }
    case 'needle': {
      const s = scissorLike(0.018, 0.0042, 0.12, false);
      g.add(s);
      g.userData.jaws = s.userData.jaws;
      const needle = new THREE.Mesh(
        new THREE.TorusGeometry(0.007, 0.0006, 6, 18, Math.PI * 1.05),
        new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 1, roughness: 0.2 }),
      );
      needle.rotation.y = Math.PI / 2;
      needle.position.set(0, -0.001, 0);
      const thread = new THREE.Mesh(
        varTube(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -0.001, 0.007),
            new THREE.Vector3(0.01, 0.01, 0.02),
            new THREE.Vector3(0.025, 0.03, 0.02),
            new THREE.Vector3(0.03, 0.06, 0.005),
          ]),
          () => 0.0005,
          { tubular: 24, radial: 5 },
        ),
        new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.6 }),
      );
      g.add(needle, thread);
      break;
    }
    case 'forceps': {
      const jaws = new THREE.Group();
      for (const s of [-1, 1]) jaws.add(bar(s * 0.0009, 0, s * 0.0065, 0.13, 0.0042, 0.0016, steelMat));
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.0024), steelMat);
      top.position.y = 0.132;
      g.add(jaws, top);
      g.userData.jaws = jaws;
      break;
    }
    case 'retractor': {
      g.add(bar(0, 0.028, 0, 0.16, 0.013, 0.0022, steelMat));
      g.add(bar(0, 0, 0, 0.03, 0.016, 0.0018, steelMat));
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0018, 0.01), steelMat);
      lip.position.set(0, 0.0009, -0.005);
      g.add(lip);
      break;
    }
    case 'suction': {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.03, 0.006),
        new THREE.Vector3(0, 0.1, 0.012),
        new THREE.Vector3(0, 0.2, 0),
      ]);
      const tube = new THREE.Mesh(
        varTube(curve, (t) => 0.0026 + t * 0.004, { tubular: 30, radial: 10 }),
        new THREE.MeshStandardMaterial({ color: 0xeef4f6, roughness: 0.25, transparent: true, opacity: 0.85 }),
      );
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0036, 12, 8), tube.material);
      tip.position.y = 0.002;
      g.add(tube, tip);
      break;
    }
    case 'cautery': {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0058, 0.005, 0.12, 14),
        new THREE.MeshStandardMaterial({ color: 0xf1ead2, roughness: 0.6 }),
      );
      body.position.y = 0.08;
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.003), new THREE.MeshStandardMaterial({ color: 0xf2c200 }));
      b1.position.set(0, 0.06, 0.0055);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.003), new THREE.MeshStandardMaterial({ color: 0x2563eb }));
      b2.position.set(0, 0.076, 0.0055);
      g.add(body, b1, b2, bar(0, 0, 0, 0.022, 0.0024, 0.0008, steelMat));
      break;
    }
    case 'syringe': {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0065, 0.0065, 0.07, 14),
        new THREE.MeshStandardMaterial({ color: 0xeef6fa, transparent: true, opacity: 0.6, roughness: 0.15 }),
      );
      barrel.position.y = 0.065;
      const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.045, 12), new THREE.MeshStandardMaterial({ color: 0xbfe3ff }));
      fluid.position.y = 0.055;
      g.add(barrel, fluid, bar(0, 0.1, 0, 0.14, 0.004, 0.004, darkSteel), bar(0, 0, 0, 0.03, 0.0009, 0.0009, steelMat));
      break;
    }
    case 'saw': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 }));
      body.position.y = 0.075;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.022), steelMat);
      blade.position.y = 0.016;
      g.add(body, blade);
      break;
    }
    case 'spreader': {
      for (const s of [-1, 1]) g.add(bar(s * 0.02, 0, s * 0.02, 0.03, 0.006, 0.012, steelMat));
      g.add(bar(-0.04, 0.03, 0.04, 0.03, 0.008, 0.006, steelMat));
      const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 10), darkSteel);
      crank.position.set(0.035, 0.045, 0);
      g.add(crank);
      break;
    }
    case 'drill': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 16), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4 }));
      body.position.y = 0.08;
      const bit = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.001, 0.035, 8), steelMat);
      bit.position.y = 0.017;
      g.add(body, bit);
      break;
    }
    case 'scope': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 12), steelMat);
      shaft.position.y = 0.1;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.018), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
      head.position.y = 0.21;
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.0042, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x60a5fa, emissiveIntensity: 0.8 }),
      );
      g.add(shaft, head, lens);
      break;
    }
    case 'chest_tube':
    case 'stent':
    case 'cannula': {
      const color = id === 'cannula' ? 0xdc2626 : id === 'stent' ? 0x2563eb : 0xf8fafc;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.05, 0.005),
        new THREE.Vector3(0.02, 0.12, 0.02),
        new THREE.Vector3(0.05, 0.17, 0.01),
      ]);
      g.add(
        new THREE.Mesh(
          varTube(curve, () => (id === 'stent' ? 0.0018 : 0.0045), { tubular: 30, radial: 10 }),
          new THREE.MeshStandardMaterial({ color, roughness: 0.3, transparent: id === 'chest_tube', opacity: 0.85 }),
        ),
      );
      break;
    }
    case 'clip': {
      const s = scissorLike(0.02, 0.003, 0.13, false);
      g.add(s);
      g.userData.jaws = s.userData.jaws;
      const c = new THREE.Mesh(
        new THREE.TorusGeometry(0.0035, 0.0009, 6, 12, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xc0a062, metalness: 0.9, roughness: 0.3 }),
      );
      c.rotation.z = Math.PI;
      g.add(c);
      break;
    }
    case 'probe': {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.008), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
      head.position.y = 0.006;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
      handle.position.y = 0.06;
      g.add(head, handle);
      break;
    }
    case 'laser':
    case 'basket':
    case 'phaco': {
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.1, 14),
        new THREE.MeshStandardMaterial({ color: id === 'phaco' ? 0xe5e7eb : 0x1e293b, roughness: 0.4 }),
      );
      handle.position.y = 0.075;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0012, 0.025, 8), steelMat);
      tip.position.y = 0.0125;
      g.add(handle, tip);
      if (id === 'laser') g.add(new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4ade80 })));
      if (id === 'basket') {
        for (let i = 0; i < 4; i++) {
          const w = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0004, 4, 14, Math.PI), steelMat);
          w.rotation.set(0, (i * Math.PI) / 4, Math.PI);
          g.add(w);
        }
      }
      break;
    }
    case 'iol': {
      const optic = new THREE.Mesh(
        new THREE.SphereGeometry(0.003, 14, 8),
        new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.6, roughness: 0.05 }),
      );
      optic.scale.set(1, 0.3, 1);
      optic.position.y = 0.002;
      g.add(optic, bar(0, 0.002, 0, 0.12, 0.002, 0.002, steelMat));
      break;
    }
    case 'plate': {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.003, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xb6c2cc, metalness: 0.9, roughness: 0.25 }),
      );
      p.position.y = 0.0015;
      g.add(p);
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.004, 8), darkSteel);
        sc.position.set(0, 0.003, i * 0.011);
        g.add(sc);
      }
      g.userData.flat = true;
      break;
    }
    case 'patch': {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.001, 18), new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.9 }));
      p.position.y = 0.0005;
      g.add(p);
      g.userData.flat = true;
      break;
    }
    case 'gauze': {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = '#f8fafb';
      x.fillRect(0, 0, 64, 64);
      x.strokeStyle = 'rgba(160,180,190,0.55)';
      for (let i = 0; i < 64; i += 4) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, 64);
        x.moveTo(0, i);
        x.lineTo(64, i);
        x.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.05), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
      pad.position.y = 0.0025;
      g.add(pad);
      g.userData.flat = true;
      break;
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}
