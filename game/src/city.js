// Sunset Bay, the game's fictional coastal city: a grid of blocks, streets,
// sidewalks, a beach on the south edge, a plaza, named landmarks for the
// missions, palm trees and lamps. All textures are drawn on canvas at boot,
// so the game ships no image files at all.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { range, pick, chance } from './rng.js';

// Street centre lines, one per gap between blocks, in both directions.
export function streetCoords() {
  const coords = [];
  for (let i = 0; i <= CITY.blocks; i += 1) {
    coords.push(-CITY.half + CITY.roadWidth / 2 + i * CITY.pitch);
  }
  return coords;
}

// Block centres.
export function blockCoords() {
  const coords = [];
  for (let i = 0; i < CITY.blocks; i += 1) {
    coords.push(-CITY.half + CITY.roadWidth + CITY.blockSize / 2 + i * CITY.pitch);
  }
  return coords;
}

function windowTexture(rng, base, floors, cols) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  const cw = 128 / cols;
  const ch = 256 / floors;
  for (let f = 0; f < floors; f += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = chance(rng, 0.35);
      g.fillStyle = lit ? '#ffd27a' : '#2a3542';
      g.fillRect(c * cw + cw * 0.22, f * ch + ch * 0.25, cw * 0.56, ch * 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2e3138';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#d8d3c3';
  g.fillRect(30, 0, 4, 256);
  g.fillStyle = '#2e3138';
  for (let y = 0; y < 256; y += 64) g.fillRect(30, y + 8, 4, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const city = {
    colliders: [], // { minX, maxX, minZ, maxZ }
    buildings: [], // { x, z, w, d, h, landmark }
    landmarks: {}, // name -> { x, z, label }
    streets: streetCoords(),
    props: [],
    water: null,
    clouds: [],
    bounds: CITY.half + 30,
  };
  const half = CITY.half;

  // --- ground: grass base, sand strip and sea to the south ------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, half * 2 + 220),
    new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, 46),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, half + 23);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, 160),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, half + 46 + 80);
  scene.add(sea);
  city.water = sea;

  // --- roads and sidewalks --------------------------------------------------
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const s of city.streets) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, half * 2 + 14), roadMat.clone());
      road.material.map = roadTex.clone();
      road.material.map.needsUpdate = true;
      road.material.map.repeat.set(1, (half * 2 + 14) / 16);
      road.rotation.x = -Math.PI / 2;
      if (vertical) road.rotation.z = Math.PI / 2;
      road.position.set(vertical ? s : 0, 0.02, vertical ? 0 : s);
      road.receiveShadow = true;
      scene.add(road);
      // sidewalk strips on both sides of the road
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, half * 2 + 14), walkMat);
        walk.rotation.x = -Math.PI / 2;
        if (vertical) walk.rotation.z = Math.PI / 2;
        walk.position.set(
          vertical ? s + side * (CITY.roadWidth / 2 + 1.5) : 0,
          0.03,
          vertical ? 0 : s + side * (CITY.roadWidth / 2 + 1.5),
        );
        walk.receiveShadow = true;
        scene.add(walk);
      }
    }
  }

  // --- buildings ------------------------------------------------------------
  const blocks = blockCoords();
  const palette = [PALETTE.buildingA, PALETTE.buildingB, PALETTE.buildingC, PALETTE.buildingD];
  const plazaBlock = { i: 2, j: 2 }; // the open plaza, no buildings
  const landmarkBlocks = {
    bank: { i: 3, j: 3, label: 'Meridian Bank', color: '#d9c48a' },
    hospital: { i: 1, j: 1, label: 'Sunset General', color: '#e8e8e8' },
    garage: { i: 4, j: 2, label: 'Vega Motors', color: '#7a9bb8' },
    hideout: { i: 2, j: 5, label: 'Reyes Hideout', color: '#8a6f4d' },
    shopA: { i: 1, j: 3, label: "Lou's Diner", color: '#c98a6a' },
    shopB: { i: 3, j: 1, label: 'Bay Market', color: '#6a9b7a' },
    shopC: { i: 4, j: 4, label: 'Neon Arcade', color: '#9b6a8a' },
  };
  const landmarkAt = new Map();
  for (const [name, def] of Object.entries(landmarkBlocks)) landmarkAt.set(`${def.i},${def.j}`, { name, ...def });

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const cx = blocks[i];
      const cz = blocks[j];
      if (i === plazaBlock.i && j === plazaBlock.j) continue;
      const lm = landmarkAt.get(`${i},${j}`);
      if (lm) {
        const w = 30;
        const d = 26;
        const h = lm.name === 'bank' ? 26 : lm.name === 'hospital' ? 20 : 12;
        const tex = windowTexture(rng, lm.color, Math.max(2, Math.floor(h / 6)), 6);
        const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ map: tex }));
        mesh.scale.set(w, h, d);
        mesh.position.set(cx, h / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        city.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        city.buildings.push({ x: cx, z: cz, w, d, h, landmark: lm.name });
        city.landmarks[lm.name] = { x: cx, z: cz + d / 2 + 4, label: lm.label };
        continue;
      }
      // ordinary block: 1-3 buildings with a courtyard gap
      const count = chance(rng, 0.4) ? 1 : chance(rng, 0.6) ? 2 : 3;
      const slots = [
        { dx: -11, dz: -11, w: 20, d: 20 },
        { dx: 12, dz: -10, w: 18, d: 18 },
        { dx: -10, dz: 12, w: 20, d: 18 },
        { dx: 12, dz: 12, w: 18, d: 18 },
      ];
      for (let k = 0; k < count; k += 1) {
        const slot = slots[k];
        const w = slot.w * range(rng, 0.85, 1.1);
        const d = slot.d * range(rng, 0.85, 1.1);
        const h = range(rng, 8, 34);
        const tex = windowTexture(rng, '#' + pick(rng, palette).toString(16).padStart(6, '0'), Math.max(2, Math.floor(h / 5)), 5);
        const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ map: tex }));
        mesh.scale.set(w, h, d);
        mesh.position.set(cx + slot.dx, h / 2, cz + slot.dz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        city.colliders.push({
          minX: cx + slot.dx - w / 2, maxX: cx + slot.dx + w / 2,
          minZ: cz + slot.dz - d / 2, maxZ: cz + slot.dz + d / 2,
        });
        city.buildings.push({ x: cx + slot.dx, z: cz + slot.dz, w, d, h, landmark: null });
      }
    }
  }

  // --- the plaza: fountain, benches, open ground ----------------------------
  const plazaX = blocks[plazaBlock.i];
  const plazaZ = blocks[plazaBlock.j];
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.blockSize, CITY.blockSize),
    new THREE.MeshLambertMaterial({ color: 0xb8a88a }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(plazaX, 0.04, plazaZ);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.6, 1.1, 20),
    new THREE.MeshLambertMaterial({ color: 0x9fb8c8 }),
  );
  fountain.position.set(plazaX, 0.55, plazaZ);
  fountain.castShadow = true;
  scene.add(fountain);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.4, 0.3, 20),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  fountainWater.position.set(plazaX, 1.0, plazaZ);
  scene.add(fountainWater);
  city.colliders.push({ minX: plazaX - 5.6, maxX: plazaX + 5.6, minZ: plazaZ - 5.6, maxZ: plazaZ + 5.6 });
  city.landmarks.plaza = { x: plazaX, z: plazaZ, label: 'Coral Plaza' };

  // --- the docks, east edge ---------------------------------------------------
  const dockX = half + 12;
  const dock = new THREE.Mesh(
    new THREE.BoxGeometry(26, 1.2, 60),
    new THREE.MeshLambertMaterial({ color: 0x7a6a55 }),
  );
  dock.position.set(dockX, 0.6, 0);
  dock.castShadow = true;
  dock.receiveShadow = true;
  scene.add(dock);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8763e });
  for (let k = 0; k < 8; k += 1) {
    const crate = new THREE.Mesh(boxGeo, crateMat);
    const s = range(rng, 1.6, 2.6);
    crate.scale.set(s, s, s);
    crate.position.set(dockX + range(rng, -8, 8), s / 2 + 1.2, range(rng, -26, 26));
    crate.rotation.y = range(rng, 0, Math.PI);
    crate.castShadow = true;
    scene.add(crate);
    city.colliders.push({
      minX: crate.position.x - s / 2, maxX: crate.position.x + s / 2,
      minZ: crate.position.z - s / 2, maxZ: crate.position.z + s / 2,
    });
  }
  city.landmarks.docks = { x: dockX, z: 0, label: 'Sunset Docks' };

  // --- palm trees along the beach and the plaza ------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  function palm(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
    trunk.position.y = 3;
    trunk.rotation.z = range(rng, -0.08, 0.08);
    trunk.castShadow = true;
    group.add(trunk);
    for (let k = 0; k < 6; k += 1) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 3.2), leafMat);
      const a = (k / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.3, 6.1, Math.sin(a) * 1.3);
      leaf.rotation.y = -a;
      leaf.rotation.x = 0.5;
      leaf.castShadow = true;
      group.add(leaf);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    city.props.push(group);
  }
  for (let x = -half + 10; x <= half; x += 24) palm(x, half + 8);
  for (let k = 0; k < 6; k += 1) palm(plazaX + range(rng, -20, 20), plazaZ + range(rng, -20, 20));
  for (let k = 0; k < 10; k += 1) {
    const s = pick(rng, city.streets);
    palm(s + (chance(rng, 0.5) ? 1 : -1) * (CITY.roadWidth / 2 + 3), range(rng, -half, half));
  }

  // --- street lamps -----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2cc, emissive: 0xffdf8a, emissiveIntensity: 0.4 });
  for (const s of city.streets) {
    for (let t = -half + 20; t < half; t += 62) {
      for (const vertical of [true, false]) {
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
        pole.position.y = 3;
        lamp.add(pole);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
        head.position.y = 6.1;
        lamp.add(head);
        lamp.position.set(vertical ? s + CITY.roadWidth / 2 + 1 : t, 0, vertical ? t : s + CITY.roadWidth / 2 + 1);
        scene.add(lamp);
      }
    }
  }

  // --- drifting clouds --------------------------------------------------------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let k = 0; k < 10; k += 1) {
    const cloud = new THREE.Group();
    for (let p = 0; p < 4; p += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 4, 9), 8, 6), cloudMat);
      puff.scale.y = 0.45;
      puff.position.set(range(rng, -8, 8), range(rng, -1, 1), range(rng, -4, 4));
      cloud.add(puff);
    }
    cloud.position.set(range(rng, -half, half), range(rng, 55, 80), range(rng, -half, half));
    scene.add(cloud);
    city.clouds.push(cloud);
  }

  return city;
}

// Push a circle (x, z, radius) out of every building collider it overlaps.
export function resolveCircleCollision(city, x, z, radius) {
  let px = x;
  let pz = z;
  for (const c of city.colliders) {
    const nx = Math.max(c.minX, Math.min(px, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pz, c.maxZ));
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * radius;
        pz = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration
        const left = px - c.minX;
        const right = c.maxX - px;
        const top = pz - c.minZ;
        const bottom = c.maxZ - pz;
        const m = Math.min(left, right, top, bottom);
        if (m === left) px = c.minX - radius;
        else if (m === right) px = c.maxX + radius;
        else if (m === top) pz = c.minZ - radius;
        else pz = c.maxZ + radius;
      }
    }
  }
  return { x: px, z: pz };
}

// True when the point is inside any building footprint.
export function hitsBuilding(city, x, z, radius = 0) {
  for (const c of city.colliders) {
    if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) return true;
  }
  return false;
}

// A random point on a street, with a heading along it.
export function randomStreetPoint(city, rng) {
  const vertical = chance(rng, 0.5);
  const street = pick(rng, city.streets);
  const along = range(rng, -CITY.half + 10, CITY.half - 10);
  const lane = (chance(rng, 0.5) ? 1 : -1) * 3.2;
  if (vertical) return { x: street + lane, z: along, heading: lane > 0 ? Math.PI : 0 };
  return { x: along, z: street + lane, heading: lane > 0 ? -Math.PI / 2 : Math.PI / 2 };
}

// The nearest street point to (x, z), snapped to a lane.
export function nearestStreetPoint(city, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const s of city.streets) {
    const d = Math.min(Math.abs(x - s), Math.abs(z - s));
    if (d < bestD) {
      bestD = d;
      best = Math.abs(x - s) < Math.abs(z - s) ? { x: s, z } : { x, z: s };
    }
  }
  return best;
}
