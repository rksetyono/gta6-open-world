// Dana Reyes on foot: a low-poly figure built from boxes, WASD movement
// relative to the camera, a walk/run cycle, punching, and getting in and out
// of cars. The camera orbits with the mouse (drag or pointer lock).

import * as THREE from 'three';
import { PLAYER, PALETTE } from './config.js';
import { clamp, angleLerp } from './rng.js';
import { resolveCircleCollision } from './city.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.x = 0;
    this.z = 20;
    this.heading = 0; // facing direction, radians
    this.camYaw = 0; // camera orbit angle
    this.camPitch = 0.42;
    this.camDistance = 8.5;
    this.speed = 0;
    this.health = PLAYER.health;
    this.maxHealth = PLAYER.health;
    this.inCar = null; // the Vehicle the player is driving, or null
    this.armed = false; // pistol drawn
    this.ammo = 12;
    this.reserve = 48;
    this.punchCooldown = 0;
    this.hurtFlash = 0;
    this.walkPhase = 0;
    this.visible = true;
    this.buildMesh();
    scene.add(this.group);
  }

  buildMesh() {
    const jacket = new THREE.MeshLambertMaterial({ color: PALETTE.playerJacket });
    const pants = new THREE.MeshLambertMaterial({ color: PALETTE.playerPants });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const hair = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.group.add(torso);
    this.torso = torso;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    this.group.add(head);
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.34), hair);
    hairTop.position.y = 1.92;
    this.group.add(hairTop);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.26), pants);
    this.legL.position.set(-0.16, 0.39, 0);
    this.legL.castShadow = true;
    this.group.add(this.legL);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.26), pants);
    this.legR.position.set(0.16, 0.39, 0);
    this.legR.castShadow = true;
    this.group.add(this.legR);

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.22), jacket);
    this.armL.position.set(-0.42, 1.18, 0);
    this.armL.castShadow = true;
    this.group.add(this.armL);
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.22), jacket);
    this.armR.position.set(0.42, 1.18, 0);
    this.armR.castShadow = true;
    this.group.add(this.armR);

    // pistol, hidden until armed
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), gunMat);
    this.gun.position.set(0.42, 0.95, 0.25);
    this.gun.visible = false;
    this.group.add(this.gun);
  }

  reset(x, z, heading = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.camYaw = heading + Math.PI;
    this.speed = 0;
    this.health = this.maxHealth;
    this.inCar = null;
    this.armed = false;
    this.ammo = 12;
    this.reserve = 48;
    this.group.visible = true;
    this.visible = true;
  }

  // On-foot movement for one fixed step. Returns nothing; reads input axes.
  updateOnFoot(dt, input, city, game) {
    const { dx, dy } = input.takeMouseDelta();
    this.camYaw -= dx * 0.005;
    this.camPitch = clamp(this.camPitch + dy * 0.004, 0.08, 1.1);

    const mx = input.moveX();
    const my = input.moveY();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const targetSpeed = (mx !== 0 || my !== 0) ? (running ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;

    if (mx !== 0 || my !== 0) {
      // movement is relative to the camera yaw: forward is (sin yaw, cos yaw),
      // right is (-cos yaw, sin yaw) — the camera sits behind the player.
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      let wx = my * sin - mx * cos;
      let wz = my * cos + mx * sin;
      const len = Math.hypot(wx, wz) || 1;
      wx /= len;
      wz /= len;
      const wantHeading = Math.atan2(wx, wz);
      this.heading = angleLerp(this.heading, wantHeading, 1 - Math.exp(-12 * dt));
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-PLAYER.accel * dt / PLAYER.walkSpeed));
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      const resolved = resolveCircleCollision(city, nx, nz, PLAYER.radius);
      this.x = resolved.x;
      this.z = resolved.z;
      this.walkPhase += this.speed * dt * 2.4;
    } else {
      this.speed += (0 - this.speed) * (1 - Math.exp(-10 * dt));
    }

    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    // weapon toggle
    if (input.wasPressed('Digit1')) {
      this.armed = !this.armed;
      game.sound.click();
    }
    this.gun.visible = this.armed;

    // walk-cycle animation
    const swing = this.speed > 0.3 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = this.armed ? -1.2 : -swing * 0.8;
    this.armR.rotation.x = this.armed ? -1.2 : swing * 0.8;

    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
  }

  // Where the camera should sit for this frame (third person, over shoulder).
  cameraTarget() {
    return new THREE.Vector3(this.x, 1.6, this.z);
  }

  cameraPosition() {
    const d = this.camDistance;
    const cp = Math.cos(this.camPitch);
    return new THREE.Vector3(
      this.x - Math.sin(this.camYaw) * cp * d,
      1.6 + Math.sin(this.camPitch) * d,
      this.z - Math.cos(this.camYaw) * cp * d,
    );
  }

  takeDamage(amount, game) {
    if (this.health <= 0) return;
    this.health -= amount;
    this.hurtFlash = 0.35;
    if (this.health <= 0) {
      this.health = 0;
      game.onPlayerDown();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addAmmo(amount) {
    this.reserve += amount;
  }

  reload() {
    if (this.reserve <= 0 || this.ammo === 12) return false;
    const need = 12 - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    return true;
  }
}
