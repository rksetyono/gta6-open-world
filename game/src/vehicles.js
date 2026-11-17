// Cars: a low-poly car mesh, arcade driving physics for the player's car,
// and traffic cars that cruise the street grid, turn at intersections and
// brake for each other. Any parked or traffic car can be stolen with E.

import * as THREE from 'three';
import { CAR, PALETTE } from './config.js';
import { range, pick, chance, clamp, angleLerp, distance2D } from './rng.js';
import { resolveCircleCollision, randomStreetPoint, nearestStreetPoint } from './city.js';

let carIdCounter = 1;

export function buildCarMesh(scene, color, isPolice = false) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? PALETTE.policeWhite : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.75 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.62, CAR.length), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR.width - 0.3, 0.55, CAR.length * 0.48), glass);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  if (isPolice) {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.2, 1.1), new THREE.MeshLambertMaterial({ color: PALETTE.policeBody }));
    hood.position.set(0, 0.9, 1.5);
    group.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.2, 0.9), new THREE.MeshLambertMaterial({ color: PALETTE.policeBody }));
    trunk.position.set(0, 0.9, -1.7);
    group.add(trunk);
    // light bar, two lamps that flash
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.3), dark);
    bar.position.set(0, 1.45, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.32), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    red.position.set(-0.28, 1.52, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.32), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 }));
    blue.position.set(0.28, 1.52, -0.25);
    group.add(blue);
    group.userData.redLamp = red;
    group.userData.blueLamp = blue;
  }

  // headlights and taillights
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    head.position.set(side * 0.7, 0.62, CAR.length / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), new THREE.MeshLambertMaterial({ color: 0xdd2222, emissive: 0xaa0000, emissiveIntensity: 0.6 }));
    tail.position.set(side * 0.7, 0.62, -CAR.length / 2 - 0.01);
    group.add(tail);
  }

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  scene.add(group);
  return group;
}

export class Vehicle {
  constructor(scene, x, z, heading, color, opts = {}) {
    this.id = carIdCounter;
    carIdCounter += 1;
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.color = color;
    this.isPolice = !!opts.isPolice;
    this.isPlayer = false;
    this.stolen = false;
    this.parked = !!opts.parked;
    this.topSpeed = opts.topSpeed || CAR.topSpeed;
    this.health = 100;
    this.mesh = buildCarMesh(scene, color, this.isPolice);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    // traffic state
    this.targetSpeed = 0;
    this.turnAt = null;
    this.waitTime = 0;
    this.flashPhase = Math.random() * 10;
  }

  destroy() {
    this.scene.remove(this.mesh);
  }

  // Arcade driving for one fixed step. Returns the speed in m/s.
  drive(dt, throttle, steer, handbrake, city) {
    const forward = throttle;
    const target = forward * this.topSpeed;
    const accel = forward !== 0 ? CAR.accel : CAR.brake;
    this.speed += clamp(target - this.speed, -accel * dt, accel * dt);
    if (handbrake) this.speed *= Math.max(0, 1 - 3.5 * dt);
    if (Math.abs(this.speed) < 0.05 && forward === 0) this.speed = 0;
    const steerAngle = steer * CAR.steer * clamp(Math.abs(this.speed) / 8, 0, 1);
    // turning right (steer > 0) decreases the heading: forward (sin h, cos h)
    // rotates toward the car's right side.
    this.heading -= (this.speed / CAR.length) * Math.tan(steerAngle) * dt;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const resolved = resolveCircleCollision(city, nx, nz, 1.6);
    if (resolved.x !== nx || resolved.z !== nz) {
      if (Math.abs(this.speed) > 6) this.health -= 2;
      this.speed *= 0.4;
    }
    this.x = resolved.x;
    this.z = resolved.z;
    this.syncMesh(dt);
    return this.speed;
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt * 2.8;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.isPolice) {
      const phase = (performance.now() / 280 + this.flashPhase) % 2;
      this.mesh.userData.redLamp.material.emissiveIntensity = phase < 1 ? 2.2 : 0.15;
      this.mesh.userData.blueLamp.material.emissiveIntensity = phase < 1 ? 0.15 : 2.2;
    }
  }
}

export class TrafficManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.maxCars = 16;
    this.spawnTimer = 0;
  }

  clear() {
    for (const car of this.cars) car.destroy();
    this.cars = [];
  }

  spawnInitial(count, playerPos) {
    for (let k = 0; k < count; k += 1) {
      const spot = randomStreetPoint(this.city, this.rng);
      if (playerPos && distance2D(spot.x, spot.z, playerPos.x, playerPos.z) < 25) continue;
      const car = new Vehicle(this.scene, spot.x, spot.z, spot.heading, pick(this.rng, PALETTE.carPaints));
      car.targetSpeed = range(this.rng, 7, 12);
      this.cars.push(car);
    }
    // a few parked cars near the player, ready to steal
    for (let k = 0; k < 4; k += 1) {
      const spot = randomStreetPoint(this.city, this.rng);
      const car = new Vehicle(this.scene, spot.x + range(this.rng, -4, 4), spot.z + range(this.rng, -4, 4), spot.heading, pick(this.rng, PALETTE.carPaints), { parked: true });
      this.cars.push(car);
    }
  }

  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car.isPlayer) continue;
      const d = distance2D(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    car.destroy();
  }

  // One fixed step of traffic: cruise along streets, turn at intersections,
  // slow down for the car ahead, despawn far away and respawn near the city.
  update(dt, playerPos) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.cars.length < this.maxCars) {
      this.spawnTimer = 2;
      const spot = randomStreetPoint(this.city, this.rng);
      if (distance2D(spot.x, spot.z, playerPos.x, playerPos.z) > 60) {
        const car = new Vehicle(this.scene, spot.x, spot.z, spot.heading, pick(this.rng, PALETTE.carPaints));
        car.targetSpeed = range(this.rng, 7, 12);
        this.cars.push(car);
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const car = this.cars[i];
      if (car.isPlayer) continue;
      if (car.parked) {
        car.syncMesh(dt);
        continue;
      }
      if (distance2D(car.x, car.z, playerPos.x, playerPos.z) > 260) {
        const spot = randomStreetPoint(this.city, this.rng);
        car.x = spot.x;
        car.z = spot.z;
        car.heading = spot.heading;
        car.speed = 0;
        car.targetSpeed = range(this.rng, 7, 12);
      }
      // at an intersection, sometimes turn
      const onXStreet = this.city.streets.some((s) => Math.abs(car.z - s) < 1.2);
      const onZStreet = this.city.streets.some((s) => Math.abs(car.x - s) < 1.2);
      if ((onXStreet || onZStreet) && chance(this.rng, 0.012)) {
        const vertical = chance(this.rng, 0.5);
        const street = pick(this.rng, this.city.streets);
        if (vertical) {
          car.heading = angleLerp(car.heading, car.z > street ? 0 : Math.PI, 0.5);
        } else {
          car.heading = angleLerp(car.heading, car.x > street ? -Math.PI / 2 : Math.PI / 2, 0.5);
        }
      }
      // slow for the car ahead
      let ahead = Infinity;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const along = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
        if (along > 0 && along < 12 && side < 2.5) ahead = Math.min(ahead, along);
      }
      let target = car.targetSpeed;
      if (ahead < 9) target = 0;
      else if (ahead < 16) target = car.targetSpeed * 0.4;
      car.speed += clamp(target - car.speed, -CAR.brake * dt, CAR.accel * 0.6 * dt);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const resolved = resolveCircleCollision(this.city, nx, nz, 1.6);
      if (resolved.x !== nx || resolved.z !== nz) {
        // bumped a building: turn around and keep going
        car.heading += Math.PI / 2;
        car.speed *= 0.3;
      }
      car.x = resolved.x;
      car.z = resolved.z;
      car.syncMesh(dt);
    }
  }
}
