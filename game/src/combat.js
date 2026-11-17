// Combat: the player's pistol and fists, rival gang members who shoot back,
// muzzle flashes, tracers, and the cash stashes hidden around the city.
// Enemies are simple low-poly figures in rival red.

import * as THREE from 'three';
import { COMBAT, PALETTE } from './config.js';
import { range, pick, chance, distance2D } from './rng.js';
import { resolveCircleCollision } from './city.js';

export class Combat {
  constructor(scene, city, rng, game) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.game = game;
    this.enemies = [];
    this.tracers = [];
    this.stashes = [];
    this.muzzle = new THREE.PointLight(0xffcc66, 0, 18, 1.8);
    this.scene.add(this.muzzle);
    this.muzzleTime = 0;
    this.shotCooldown = 0;
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
    for (const t of this.tracers) this.scene.remove(t.line);
    this.tracers = [];
    for (const s of this.stashes) this.scene.remove(s.mesh);
    this.stashes = [];
  }

  makeEnemy(x, z, name = 'Rival') {
    const group = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: PALETTE.rivalShirt });
    const pants = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const skin = new THREE.MeshLambertMaterial({ color: pick(this.rng, [0xc98d64, 0x8a5a3a, 0xe8b88a]) });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), red);
    torso.position.y = 1.14;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), skin);
    head.position.y = 1.68;
    head.castShadow = true;
    group.add(head);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.32), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    band.position.y = 1.8;
    group.add(band);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.76, 0.24), pants);
    legL.position.set(-0.15, 0.38, 0);
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.76, 0.24), pants);
    legR.position.set(0.15, 0.38, 0);
    group.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), red);
    armL.position.set(-0.4, 1.14, 0);
    group.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), red);
    armR.position.set(0.4, 1.14, 0);
    group.add(armR);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const enemy = {
      group, legL, legR, armL, armR,
      x, z, name,
      health: COMBAT.enemyHealth,
      heading: 0,
      walkPhase: 0,
      shootTimer: range(this.rng, 0.4, 1.2),
      speed: range(this.rng, 2.4, 3.4),
      state: 'hunt', // hunt | strafe
      strafeDir: chance(this.rng, 0.5) ? 1 : -1,
      strafeTime: 0,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  spawnSquad(center, count, radius = 14) {
    const squad = [];
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2 + range(this.rng, -0.4, 0.4);
      squad.push(this.makeEnemy(center.x + Math.sin(a) * radius, center.z + Math.cos(a) * radius));
    }
    return squad;
  }

  // A glowing cash stash the player can walk over to collect.
  spawnStash(x, z) {
    const mesh = new THREE.Group();
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2e7d32, emissive: 0x1b5e20, emissiveIntensity: 0.6 }),
    );
    bag.position.y = 0.35;
    bag.castShadow = true;
    mesh.add(bag);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.25 }),
    );
    glow.position.y = 0.4;
    mesh.add(glow);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const stash = { mesh, glow, x, z, value: 150, phase: range(this.rng, 0, 6) };
    this.stashes.push(stash);
    return stash;
  }

  spawnStashes(count, playerPos) {
    for (let k = 0; k < count; k += 1) {
      let x;
      let z;
      let tries = 0;
      do {
        x = range(this.rng, -170, 170);
        z = range(this.rng, -170, 170);
        tries += 1;
      } while (tries < 20 && distance2D(x, z, playerPos.x, playerPos.z) < 30);
      this.spawnStash(x, z);
    }
  }

  nearestEnemy(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = distance2D(x, z, e.x, e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // The player's shot: auto-aim at the nearest enemy near the camera's
  // forward line, else straight ahead. Returns the enemy hit, if any.
  playerShoot(player) {
    if (this.shotCooldown > 0) return null;
    if (player.ammo <= 0) {
      if (player.reload()) this.game.hud.flashMessage('Reloaded', '#cfe8ff');
      else this.game.hud.flashMessage('Out of ammo — find a stash', '#ff8866');
      this.shotCooldown = 0.25;
      return null;
    }
    player.ammo -= 1;
    this.shotCooldown = 0.28;
    const px = player.x;
    const pz = player.z;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let target = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      const dx = e.x - px;
      const dz = e.z - pz;
      const along = dx * fx + dz * fz;
      if (along < 1 || along > COMBAT.pistolRange) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > 4 + along * 0.12) continue;
      const score = along + side * 3;
      if (score < bestScore) {
        bestScore = score;
        target = e;
      }
    }
    const endX = target ? target.x : px + fx * COMBAT.pistolRange;
    const endZ = target ? target.z : pz + fz * COMBAT.pistolRange;
    this.addTracer(px, 1.35, pz, endX, 1.2, endZ);
    this.muzzle.position.set(px + fx * 0.8, 1.35, pz + fz * 0.8);
    this.muzzle.intensity = 3.5;
    this.muzzleTime = 0.07;
    this.game.sound.gunshot();
    this.game.peds.scare(px, pz, 30);
    if (target) {
      this.damageEnemy(target, COMBAT.pistolDamage);
      return target;
    }
    return null;
  }

  officerShot(officer) {
    this.addTracer(officer.x, 1.35, officer.z, this.game.player.x, 1.3, this.game.player.z);
    this.game.sound.gunshot();
  }

  enemyShoot(enemy, player) {
    this.addTracer(enemy.x, 1.35, enemy.z, player.x, 1.3, player.z);
    this.muzzle.position.set(enemy.x, 1.35, enemy.z);
    this.muzzle.intensity = 2.5;
    this.muzzleTime = 0.06;
    this.game.sound.gunshot();
  }

  addTracer(x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
  }

  damageEnemy(enemy, amount) {
    enemy.health -= amount;
    if (enemy.health <= 0) {
      const idx = this.enemies.indexOf(enemy);
      if (idx >= 0) this.enemies.splice(idx, 1);
      // fall over, then fade out
      enemy.group.rotation.x = -Math.PI / 2 + 0.1;
      enemy.group.position.y = 0.25;
      enemy.dead = true;
      enemy.deadTime = 0;
      this.enemies.push(enemy); // keep in list as a corpse until the timer runs out
      this.game.onEnemyDown(enemy);
    }
  }

  // The player's punch: knocks down the nearest ped or enemy in reach.
  playerPunch(player) {
    if (player.punchCooldown > 0) return false;
    player.punchCooldown = 0.45;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const px = player.x + fx * 1.2;
    const pz = player.z + fz * 1.2;
    const enemy = this.nearestEnemy(px, pz, COMBAT.punchRange);
    if (enemy) {
      this.damageEnemy(enemy, COMBAT.punchDamage);
      this.game.sound.punch();
      this.game.police.addHeat(25, 'Assault');
      return true;
    }
    const ped = this.game.peds.nearestPed(px, pz, COMBAT.punchRange);
    if (ped) {
      this.game.peds.knockDown(ped);
      this.game.sound.punch();
      this.game.police.addHeat(35, 'Assault');
      this.game.peds.scare(player.x, player.z, 25);
      return true;
    }
    this.game.sound.punch();
    return false;
  }

  update(dt, player) {
    if (this.shotCooldown > 0) this.shotCooldown -= dt;
    if (this.muzzleTime > 0) {
      this.muzzleTime -= dt;
      if (this.muzzleTime <= 0) this.muzzle.intensity = 0;
    }
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }
    // stashes bob and glow; the player collects them on foot
    for (let i = this.stashes.length - 1; i >= 0; i -= 1) {
      const s = this.stashes[i];
      s.phase += dt * 2;
      s.glow.scale.setScalar(1 + Math.sin(s.phase) * 0.15);
      if (!player.inCar && distance2D(player.x, player.z, s.x, s.z) < 1.6) {
        this.game.addCash(s.value, `Stash found +$${s.value}`);
        this.game.sound.cash();
        this.scene.remove(s.mesh);
        this.stashes.splice(i, 1);
      }
    }
    // enemies hunt the player
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (e.dead) {
        e.deadTime += dt;
        if (e.deadTime > 2.5) {
          this.scene.remove(e.group);
          this.enemies.splice(i, 1);
        }
        continue;
      }
      const dist = distance2D(e.x, e.z, player.x, player.z);
      if (dist > 160) continue;
      const want = Math.atan2(player.x - e.x, player.z - e.z);
      let diff = want - e.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
      e.strafeTime -= dt;
      if (e.strafeTime <= 0) {
        e.strafeTime = range(this.rng, 0.8, 1.8);
        e.strafeDir *= -1;
      }
      let mx = 0;
      let mz = 0;
      if (dist > COMBAT.enemyRange * 0.7) {
        mx = Math.sin(e.heading);
        mz = Math.cos(e.heading);
      } else {
        // strafe sideways at mid range, closing slowly
        mx = Math.cos(e.heading) * e.strafeDir * 0.7 + Math.sin(e.heading) * 0.25;
        mz = -Math.sin(e.heading) * e.strafeDir * 0.7 + Math.cos(e.heading) * 0.25;
      }
      const nx = e.x + mx * e.speed * dt;
      const nz = e.z + mz * e.speed * dt;
      const resolved = resolveCircleCollision(this.city, nx, nz, 0.4);
      e.x = resolved.x;
      e.z = resolved.z;
      e.walkPhase += e.speed * dt * 3;
      e.group.position.set(e.x, 0, e.z);
      e.group.rotation.y = e.heading;
      e.legL.rotation.x = Math.sin(e.walkPhase) * 0.55;
      e.legR.rotation.x = -Math.sin(e.walkPhase) * 0.55;
      e.armR.rotation.x = -1.1; // gun arm raised
      // shoot back
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < COMBAT.enemyRange && !player.inCar) {
        e.shootTimer = COMBAT.enemyShotInterval * range(this.rng, 0.8, 1.3);
        if (chance(this.rng, 0.55)) {
          this.enemyShoot(e, player);
          player.takeDamage(COMBAT.enemyDamage, this.game);
        } else {
          this.enemyShoot(e, player);
        }
      }
    }
  }
}
