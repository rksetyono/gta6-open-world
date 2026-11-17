// The wanted system: stars rise with crimes, fall when the player stays out
// of sight, and police cars and foot officers spawn to match the level.
// Officers on foot try to arrest the player; police cars try to ram them.

import * as THREE from 'three';
import { WANTED, POLICE, PLAYER, PALETTE } from './config.js';
import { range, chance, clamp, angleLerp, distance2D } from './rng.js';
import { Vehicle } from './vehicles.js';
import { resolveCircleCollision } from './city.js';

export class PoliceManager {
  constructor(scene, city, rng, game) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.game = game;
    this.level = 0;
    this.heat = 0; // fractional progress toward the next star
    this.hiddenTime = 0; // seconds the player has been out of police sight
    this.decayTimer = 0;
    this.cars = [];
    this.officers = [];
    this.spawnTimer = 0;
    this.arrestProgress = 0;
  }

  clear() {
    for (const car of this.cars) car.destroy();
    this.cars = [];
    for (const off of this.officers) this.scene.remove(off.group);
    this.officers = [];
    this.level = 0;
    this.heat = 0;
    this.arrestProgress = 0;
  }

  // A crime adds heat; every 100 heat is one star.
  addHeat(amount, reason) {
    if (this.level >= WANTED.maxLevel && this.heat >= 99) return;
    this.heat += amount;
    while (this.heat >= 100 && this.level < WANTED.maxLevel) {
      this.heat -= 100;
      this.level += 1;
      this.game.hud.flashMessage(`WANTED LEVEL ${this.level} — ${reason}`, '#ff5544');
      this.game.sound.setSiren(this.level > 0);
    }
    this.hiddenTime = 0;
    this.decayTimer = 0;
  }

  setLevel(level) {
    this.level = clamp(level, 0, WANTED.maxLevel);
    this.heat = 0;
    this.game.sound.setSiren(this.level > 0);
  }

  makeOfficer(x, z) {
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), navy);
    torso.position.y = 1.14;
    torso.castShadow = true;
    group.add(torso);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.02), new THREE.MeshLambertMaterial({ color: 0xffd27a, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
    badge.position.set(-0.15, 1.3, 0.18);
    group.add(badge);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), skin);
    head.position.y = 1.68;
    head.castShadow = true;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.34), navy);
    cap.position.y = 1.86;
    group.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.76, 0.24), navy);
    legL.position.set(-0.15, 0.38, 0);
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.76, 0.24), navy);
    legR.position.set(0.15, 0.38, 0);
    group.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), navy);
    armL.position.set(-0.4, 1.14, 0);
    group.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), navy);
    armR.position.set(0.4, 1.14, 0);
    group.add(armR);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const officer = {
      group, legL, legR, x, z,
      heading: 0, speed: 0, walkPhase: 0, shootTimer: range(this.rng, 0.5, 1.5),
    };
    this.officers.push(officer);
    return officer;
  }

  spawnPoliceCar(playerPos) {
    const angle = range(this.rng, 0, Math.PI * 2);
    const dist = range(this.rng, 45, 70);
    let x = playerPos.x + Math.sin(angle) * dist;
    let z = playerPos.z + Math.cos(angle) * dist;
    x = clamp(x, -this.city.bounds, this.city.bounds);
    z = clamp(z, -this.city.bounds, this.city.bounds);
    return this.spawnPoliceCarAt(x, z, angle);
  }

  // Spawn a police car at an exact spot (used by the staged chase scene).
  spawnPoliceCarAt(x, z, heading) {
    const car = new Vehicle(this.scene, x, z, heading, 0xffffff, { isPolice: true, topSpeed: POLICE.topSpeed });
    car.targetSpeed = POLICE.topSpeed;
    this.cars.push(car);
    return car;
  }

  update(dt, player) {
    // keep the fleet matched to the wanted level
    const wantCars = WANTED.carsForLevel[this.level];
    const wantOfficers = WANTED.officersForLevel[this.level];
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const playerPos = player.inCar ? { x: player.inCar.x, z: player.inCar.z } : { x: player.x, z: player.z };
      if (this.cars.length < wantCars) this.spawnPoliceCar(playerPos);
      if (this.officers.length < wantOfficers && !player.inCar) {
        const angle = range(this.rng, 0, Math.PI * 2);
        this.makeOfficer(
          playerPos.x + Math.sin(angle) * range(this.rng, 18, 28),
          playerPos.z + Math.cos(angle) * range(this.rng, 18, 28),
        );
      }
    }
    // decay: the player must stay out of sight for a while
    const anyNear = this.cars.some((c) => distance2D(c.x, c.z, player.x, player.z) < 45)
      || this.officers.some((o) => distance2D(o.x, o.z, player.x, player.z) < 30);
    if (this.level > 0) {
      if (anyNear) {
        this.hiddenTime = 0;
        this.decayTimer = 0;
      } else {
        this.hiddenTime += dt;
        if (this.hiddenTime > WANTED.decayDelay) {
          this.decayTimer += dt;
          if (this.decayTimer > WANTED.decayStep) {
            this.decayTimer = 0;
            this.level -= 1;
            this.heat = 0;
            this.game.hud.flashMessage(`Wanted level down — ${this.level} star${this.level === 1 ? '' : 's'}`, '#7fd67f');
            if (this.level === 0) this.game.sound.setSiren(false);
          }
        }
      }
    }

    // police cars: steer at the player and ram
    const target = player.inCar || null;
    const tx = target ? target.x : player.x;
    const tz = target ? target.z : player.z;
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const car = this.cars[i];
      if (this.level === 0) {
        car.destroy();
        this.cars.splice(i, 1);
        continue;
      }
      const dist = distance2D(car.x, car.z, tx, tz);
      if (dist > 320) {
        car.destroy();
        this.cars.splice(i, 1);
        continue;
      }
      const wantHeading = Math.atan2(tx - car.x, tz - car.z);
      car.heading = angleLerp(car.heading, wantHeading, 1 - Math.exp(-2.2 * dt));
      const targetSpeed = dist > 12 ? POLICE.topSpeed : POLICE.topSpeed * 0.55;
      car.speed += clamp(targetSpeed - car.speed, -16 * dt, POLICE.accel * dt);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const resolved = resolveCircleCollision(this.city, nx, nz, 1.6);
      if (resolved.x !== nx || resolved.z !== nz) {
        car.speed *= 0.4;
        car.heading += 0.6;
      }
      car.x = resolved.x;
      car.z = resolved.z;
      car.syncMesh(dt);
      // ram the player — but not every frame: a hit, then a cooldown
      if (car.ramCooldown === undefined) car.ramCooldown = 0;
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      if (dist < 3.4 && car.ramCooldown <= 0) {
        car.ramCooldown = 0.9;
        if (target) {
          this.game.damagePlayerCar(POLICE.ramDamage);
          this.game.sound.crash();
        } else if (distance2D(car.x, car.z, player.x, player.z) < 2.2) {
          player.takeDamage(POLICE.ramDamage, this.game);
          car.speed *= -0.4;
          this.game.sound.crash();
        }
      }
    }

    // foot officers: run at the player, shoot at range, arrest up close
    for (let i = this.officers.length - 1; i >= 0; i -= 1) {
      const off = this.officers[i];
      if (this.level === 0 || player.inCar) {
        this.scene.remove(off.group);
        this.officers.splice(i, 1);
        continue;
      }
      const dist = distance2D(off.x, off.z, player.x, player.z);
      if (dist > 200) {
        this.scene.remove(off.group);
        this.officers.splice(i, 1);
        continue;
      }
      const wantHeading = Math.atan2(player.x - off.x, player.z - off.z);
      off.heading = angleLerp(off.heading, wantHeading, 1 - Math.exp(-6 * dt));
      if (dist < POLICE.arrestRange) {
        this.arrestProgress += dt;
        if (this.arrestProgress > POLICE.arrestTime) {
          this.arrestProgress = 0;
          this.game.onBusted();
          return;
        }
      } else {
        this.arrestProgress = Math.max(0, this.arrestProgress - dt);
      }
      const speed = dist > 8 ? 5.2 : 2.2;
      const nx = off.x + Math.sin(off.heading) * speed * dt;
      const nz = off.z + Math.cos(off.heading) * speed * dt;
      const resolved = resolveCircleCollision(this.city, nx, nz, 0.4);
      off.x = resolved.x;
      off.z = resolved.z;
      off.walkPhase += speed * dt * 3;
      off.group.position.set(off.x, 0, off.z);
      off.group.rotation.y = off.heading;
      off.legL.rotation.x = Math.sin(off.walkPhase) * 0.6;
      off.legR.rotation.x = -Math.sin(off.walkPhase) * 0.6;
      // officers open fire when the player is armed and in range
      off.shootTimer -= dt;
      if (off.shootTimer <= 0 && dist < 24 && dist > 3) {
        off.shootTimer = range(this.rng, 1.0, 1.8);
        if (chance(this.rng, 0.45)) {
          player.takeDamage(5, this.game);
          this.game.combat.officerShot(off);
        }
      }
    }
  }
}
