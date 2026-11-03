import * as THREE from 'three';
import { buildTool } from './tools';
import type { ToolId } from '../types';

export const TABLE_Y = 0.9;

function tileTexture(base: string, line: string, n: number, size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  x.strokeStyle = line;
  x.lineWidth = 2;
  const s = size / n;
  for (let i = 0; i <= n; i++) {
    x.beginPath();
    x.moveTo(i * s, 0);
    x.lineTo(i * s, size);
    x.moveTo(0, i * s);
    x.lineTo(size, i * s);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export interface Room {
  group: THREE.Group;
  lampLight: THREE.SpotLight;
  monitorTexture: THREE.CanvasTexture;
}

/** ห้องผ่าตัดสร้างด้วยโค้ด: เตียง โคมไฟผ่าตัด มอนิเตอร์ ถาดเครื่องมือ เครื่องดมยา */
export function buildRoom(scene: THREE.Scene, monitorCanvas: HTMLCanvasElement): Room {
  const group = new THREE.Group();
  group.name = 'room';

  // พื้นและผนัง
  const floorTex = tileTexture('#8fb3ae', '#7fa19c', 8);
  floorTex.repeat.set(6, 6);
  const floor = mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const wallTex = tileTexture('#e3eceb', '#d2dddb', 10);
  wallTex.repeat.set(4, 1.5);
  const walls = mesh(
    new THREE.BoxGeometry(9, 3.2, 9),
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, side: THREE.BackSide }),
    0,
    1.6,
    0,
  );
  group.add(walls);

  // เตียงผ่าตัด
  const metal = std(0x5f6b73, 0.4, 0.6);
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 20), metal, 0, 0.35, 0.15));
  group.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.9), metal, 0, 0.03, 0.15));
  const top = mesh(new THREE.BoxGeometry(0.6, 0.07, 2.0), std(0x3c4850, 0.5, 0.3), 0, TABLE_Y - 0.065, 0.1);
  top.receiveShadow = true;
  group.add(top);
  group.add(mesh(new THREE.BoxGeometry(0.56, 0.03, 1.96), std(0x1e3a5f, 0.8), 0, TABLE_Y - 0.015, 0.1));

  // ฉากกั้นศีรษะ (วิสัญญีแพทย์อยู่ด้านนี้)
  const screenFrame = std(0x9aa5ad, 0.4, 0.7);
  for (const s of [-1, 1]) group.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 8), screenFrame, s * 0.34, TABLE_Y + 0.31, -0.58));
  const bar = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.68, 8), screenFrame, 0, TABLE_Y + 0.6, -0.58);
  bar.rotation.z = Math.PI / 2;
  group.add(bar);
  const screenCloth = mesh(
    new THREE.PlaneGeometry(0.7, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x2f7d70, roughness: 0.95, side: THREE.DoubleSide }),
    0,
    TABLE_Y + 0.3,
    -0.585,
  );
  group.add(screenCloth);

  // โคมไฟผ่าตัด
  const arm = std(0xe8eef0, 0.4, 0.2);
  group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12), arm, 0.45, 2.75, -0.2));
  const armH = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10), arm, 0.25, 2.3, -0.1);
  armH.rotation.z = 0.9;
  group.add(armH);
  const lampHead = new THREE.Group();
  lampHead.position.set(0.12, 1.95, 0.0);
  lampHead.lookAt(-0.075, TABLE_Y + 0.2, 0.075);
  const shell = mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.08, 32), std(0xf3f6f7, 0.35, 0.1));
  shell.rotation.x = Math.PI / 2;
  lampHead.add(shell);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8e8, emissiveIntensity: 2.2 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = i === 6 ? 0 : 0.16;
    const b = mesh(new THREE.CircleGeometry(0.055, 20), bulbMat, Math.cos(a) * r, Math.sin(a) * r, 0.041);
    lampHead.add(b);
  }
  group.add(lampHead);

  const lampLight = new THREE.SpotLight(0xfff6e6, 2.4, 0, 0.38, 0.6, 1.6);
  lampLight.position.copy(lampHead.position);
  lampLight.target.position.set(-0.075, TABLE_Y + 0.15, 0.075);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.camera.near = 0.4;
  lampLight.shadow.camera.far = 2.2;
  lampLight.shadow.bias = -0.0004;
  lampLight.shadow.normalBias = 0.002;
  group.add(lampLight, lampLight.target);

  const hemi = new THREE.HemisphereLight(0xf2fbff, 0x6b7f7c, 0.5);
  group.add(hemi);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-2, 3, 2);
  group.add(fill);

  // มอนิเตอร์สัญญาณชีพ (แสดงกราฟเดียวกับจอ HUD)
  const monitorTexture = new THREE.CanvasTexture(monitorCanvas);
  monitorTexture.colorSpace = THREE.SRGBColorSpace;
  const mon = new THREE.Group();
  mon.position.set(0.75, 1.45, -0.75);
  mon.rotation.y = -0.6;
  mon.add(mesh(new THREE.BoxGeometry(0.42, 0.28, 0.06), std(0x2b3338, 0.5)));
  mon.add(mesh(new THREE.PlaneGeometry(0.38, 0.24), new THREE.MeshBasicMaterial({ map: monitorTexture }), 0, 0, 0.031));
  group.add(mon);
  group.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 8), metal, 0.75, 0.65, -0.75));
  group.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), metal, 0.75, 0.015, -0.75));

  // เครื่องดมยาสลบ
  const machine = new THREE.Group();
  machine.position.set(-0.55, 0, -1.05);
  machine.add(mesh(new THREE.BoxGeometry(0.55, 1.2, 0.5), std(0xdfe6e8, 0.6), 0, 0.6, 0));
  machine.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), std(0x111820, 0.3), 0, 1.0, 0.26));
  for (let i = 0; i < 3; i++)
    machine.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), std([0x2e7d32, 0x1565c0, 0xeeeeee][i], 0.4), -0.18 + i * 0.12, 1.32, 0.05));
  group.add(machine);

  // เสาน้ำเกลือ
  group.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.9, 8), metal, -0.45, 0.95, -0.55));
  const bag = mesh(new THREE.BoxGeometry(0.1, 0.16, 0.03), new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.7, roughness: 0.2 }), -0.45, 1.75, -0.55);
  group.add(bag);

  // โต๊ะวางเครื่องมือ (Mayo stand)
  const mayo = new THREE.Group();
  mayo.position.set(-0.62, 0, 0.62);
  mayo.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8), metal, 0.18, 0.5, 0));
  const tray = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.36), std(0xb9c3c9, 0.3, 0.8), 0, 1.0, 0);
  tray.receiveShadow = true;
  mayo.add(tray);
  mayo.add(mesh(new THREE.BoxGeometry(0.48, 0.004, 0.34), std(0x2f7d70, 0.95), 0, 1.012, 0));
  const layout: ToolId[] = ['scalpel', 'scissors', 'forceps', 'clamp', 'needle', 'retractor'];
  layout.forEach((id, i) => {
    const t = buildTool(id);
    t.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    t.position.set(0.1, 1.018, -0.13 + i * 0.05);
    t.scale.setScalar(0.9);
    mayo.add(t);
  });
  group.add(mayo);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== walls && o !== floor) o.castShadow = false;
  });
  scene.add(group);
  return { group, lampLight, monitorTexture };
}
