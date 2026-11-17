// Pedestrians: ordinary Sunset Bay residents who stroll the sidewalks,
// cross the streets, and run away from gunfire, sirens and speeding cars.
// A few of them carry a phone and a wallet — knocking one down is a crime.

import * as THREE from 'three';
import { PALETTE } from './config.js';
import { range, pick, chance, distance2D } from './rng.js';
import { resolveCircleCollision, nearestStreetPoint } from './city.js';

export class PedestrianManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.maxPeds = 22;
    this.spawnTimer = 0;
  }

  clear() {
    for (const p of this.peds) this.scene.remove(p.group);
    this.peds = [];
  }

  makePed(x, z) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: pick(this.rng, PALETTE.pedShirts) });
    const pants = new THREE.MeshLambertMaterial({ color: pick(this.rng, [0x2c3240, 0x4a3a2a, 0x3a4a3a]) });
    const skin = new THREE.MeshLambertMaterial({ color: pick(this.rng, [0xc98d64, 0x8a5a3a, 0xe8b88a, 0x6b4426]) });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), shirt);
    torso.position.y = 1.12;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), skin);
    head.position.y = 1.66;
    head.castShadow = true;
    group.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.74, 0.24), pants);
    legL.position.set(-0.15, 0.37, 0);
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.74, 0.24), pants);
    legR.position.set(0.15, 0.37, 0);
    group.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), shirt);
    armL.position.set(-0.38, 1.12, 0);
    group.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), shirt);
    armR.position.set(0.38, 1.12, 0);
    group.add(armR);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const ped = {
      group, legL, legR, armL, armR,
      x, z,
      heading: range(this.rng, 0, Math.PI * 2),
      speed: range(this.rng, 0.9, 1.6),
      walkPhase: range(this.rng, 0, 6),
      target: null,
      fleeing: false,
      fleeTime: 0,
      down: false,
      downTime: 0,
      retarget: range(this.rng, 2, 8),
    };
    this.peds.push(ped);
    return ped;
  }

  spawnInitial(count, playerPos) {
    for (let k = 0; k < count; k += 1) {
      const spot = nearestStreetPoint(this.city, range(this.rng, -160, 160), range(this.rng, -160, 160));
      if (playerPos && distance2D(spot.x, spot.z, playerPos.x, playerPos.z) < 15) continue;
      this.makePed(spot.x + range(this.rng, -6, 6), spot.z + range(this.rng, -6, 6));
    }
  }

  // A scare (gunshot, siren, speeding car) makes nearby peds flee.
  scare(x, z, radius) {
    for (const p of this.peds) {
      if (p.down) continue;
      if (distance2D(p.x, p.z, x, z) < radius) {
        p.fleeing = true;
        p.fleeTime = range(this.rng, 2, 4);
      }
    }
  }

  nearestPed(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.peds) {
      if (p.down) continue;
      const d = distance2D(x, z, p.x, p.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  knockDown(ped) {
    ped.down = true;
    ped.downTime = 6;
    ped.group.rotation.x = Math.PI / 2 - 0.15;
    ped.group.position.y = 0.3;
  }

  update(dt, playerPos, danger) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.peds.length < this.maxPeds) {
      this.spawnTimer = 1.5;
      const spot = nearestStreetPoint(this.city, range(this.rng, -160, 160), range(this.rng, -160, 160));
      if (distance2D(spot.x, spot.z, playerPos.x, playerPos.z) > 50) {
        this.makePed(spot.x, spot.z);
      }
    }
    for (let i = this.peds.length - 1; i >= 0; i -= 1) {
      const p = this.peds[i];
      if (distance2D(p.x, p.z, playerPos.x, playerPos.z) > 240) {
        this.scene.remove(p.group);
        this.peds.splice(i, 1);
        continue;
      }
      if (p.down) {
        p.downTime -= dt;
        if (p.downTime <= 0) {
          p.down = false;
          p.group.rotation.x = 0;
          p.group.position.y = 0;
          p.fleeing = true;
          p.fleeTime = 3;
        }
        continue;
      }
      if (p.fleeTime > 0) p.fleeTime -= dt;
      else p.fleeing = false;
      if (danger && distance2D(p.x, p.z, danger.x, danger.z) < danger.radius) {
        p.fleeing = true;
        p.fleeTime = 2.5;
      }
      p.retarget -= dt;
      if (p.retarget <= 0) {
        p.retarget = range(this.rng, 4, 10);
        const spot = nearestStreetPoint(this.city, p.x + range(this.rng, -60, 60), p.z + range(this.rng, -60, 60));
        p.target = spot;
      }
      let tx;
      let tz;
      if (p.fleeing) {
        const away = Math.atan2(p.x - playerPos.x, p.z - playerPos.z);
        tx = p.x + Math.sin(away) * 20;
        tz = p.z + Math.cos(away) * 20;
      } else if (p.target) {
        tx = p.target.x;
        tz = p.target.z;
      } else {
        tx = p.x;
        tz = p.z;
      }
      const dx = tx - p.x;
      const dz = tz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6) {
        const want = Math.atan2(dx, dz);
        let diff = want - p.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        const speed = p.fleeing ? p.speed * 3.2 : p.speed;
        const nx = p.x + Math.sin(p.heading) * speed * dt;
        const nz = p.z + Math.cos(p.heading) * speed * dt;
        const resolved = resolveCircleCollision(this.city, nx, nz, 0.4);
        p.x = resolved.x;
        p.z = resolved.z;
        p.walkPhase += speed * dt * 3.2;
        p.group.position.set(p.x, 0, p.z);
        p.group.rotation.y = p.heading;
        const swing = Math.sin(p.walkPhase) * (p.fleeing ? 0.7 : 0.45);
        p.legL.rotation.x = swing;
        p.legR.rotation.x = -swing;
        p.armL.rotation.x = -swing * 0.8;
        p.armR.rotation.x = swing * 0.8;
      } else {
        p.group.position.set(p.x, 0, p.z);
        p.group.rotation.y = p.heading;
        p.legL.rotation.x *= 0.9;
        p.legR.rotation.x *= 0.9;
      }
    }
  }
}
