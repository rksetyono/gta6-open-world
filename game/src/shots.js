// Staged screenshot scenes, in the starter's spirit: each one plays the real
// rules forward from a fresh seeded world for a fixed number of steps,
// steered by a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame.
//   ?shot=chase   — a police chase in the Comet GT, wanted 3, mission live
//   ?shot=street  — on foot in a busy street, traffic and pedestrians
//   ?shot=mission — driving to the docks on the first mission
//   ?shot=combat  — the turf-war shootout at Coral Plaza

import { STEP } from './config.js';
import { clamp } from './rng.js';

// An input look-alike whose answers come from a plan function the autopilot
// refreshes every step, so the game loop runs untouched.
class FakeInput {
  constructor(plan) {
    this.plan = plan;
    this.state = { mx: 0, my: 0, click: false, run: false };
  }

  refresh(game) {
    this.state = this.plan(game);
  }

  down(code) {
    if (code === 'ShiftLeft' || code === 'ShiftRight') return !!this.state.run;
    return false;
  }

  wasPressed() {
    return false;
  }

  wasClicked() {
    return !!this.state.click;
  }

  moveX() {
    return this.state.mx;
  }

  moveY() {
    return this.state.my;
  }

  takeMouseDelta() {
    return { dx: 0, dy: 0 };
  }

  endFrame() {}
}

function angleTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Drive toward a point: throttle while roughly lined up, steer by the angle.
function drivePlan(tx, tz) {
  return (game) => {
    const car = game.player.inCar;
    if (!car) return { mx: 0, my: 0, click: false };
    const diff = angleDiff(car.heading, angleTo(car.x, car.z, tx, tz));
    return {
      mx: clamp(diff * 2.2, -1, 1),
      my: Math.abs(diff) < 1.4 ? 1 : 0.3,
      click: false,
    };
  };
}

// Walk toward a point, camera-relative: project the desired world direction
// onto the camera's forward (sin yaw, cos yaw) and right (-cos yaw, sin yaw).
function walkPlan(tx, tz) {
  return (game) => {
    const p = game.player;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const th = p.camYaw;
    const my = (dx / len) * Math.sin(th) + (dz / len) * Math.cos(th);
    const mx = -(dx / len) * Math.cos(th) + (dz / len) * Math.sin(th);
    return { mx: clamp(mx * 2, -1, 1), my: clamp(my * 2, -1, 1), click: false };
  };
}

// Fight: walk toward the nearest enemy, stop at range, shoot on cooldown.
function fightPlan() {
  return (game) => {
    const p = game.player;
    const enemy = game.combat.nearestEnemy(p.x, p.z, 80);
    if (!enemy) return { mx: 0, my: 0, click: false };
    const dx = enemy.x - p.x;
    const dz = enemy.z - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    const th = p.camYaw;
    const my = (dx / dist) * Math.sin(th) + (dz / dist) * Math.cos(th);
    const mx = -(dx / dist) * Math.cos(th) + (dz / dist) * Math.sin(th);
    return {
      mx: clamp(mx * 2, -1, 1),
      my: dist > 16 ? clamp(my * 2, -1, 1) : 0,
      click: dist < 45,
    };
  };
}

function simulate(game, seconds, plan) {
  const input = new FakeInput(plan);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    input.refresh(game);
    game.stepFixed(STEP, input);
  }
  // Freeze the staged world: the live loop keeps rendering (and the HUD
  // keeps drawing) but no more simulation runs, so the captured frame is
  // exactly the staged one instead of drifting on.
  game.frozen = true;
}

export function stageShot(name, game) {
  game.hud.hideTitle();
  game.hud.hideEnd();
  game.hud.hidePause();
  if (name === 'street') {
    game.resetWorld(11);
    game.setState('playing');
    game.player.reset(0, 62, 0);
    game.player.camYaw = Math.PI;
    game.player.camPitch = 0.38;
    game.traffic.spawnInitial(10, { x: 0, z: 62 });
    game.peds.spawnInitial(14, { x: 0, z: 62 });
    simulate(game, 3, walkPlan(0, -40));
    return { screen: 'playing' };
  }
  if (name === 'mission') {
    game.resetWorld(21);
    game.setState('playing');
    game.missions.startMission(0);
    // eastbound on 0th Street, straight toward the Sunset Docks
    const car = game.spawnPlayerCar(124, 0, Math.PI / 2);
    game.enterCar(car);
    game.player.camYaw = Math.PI;
    game.traffic.spawnInitial(10, { x: 124, z: 0 });
    game.peds.spawnInitial(10, { x: 124, z: 0 });
    simulate(game, 2.2, drivePlan(game.city.landmarks.docks.x, game.city.landmarks.docks.z));
    return { screen: 'playing' };
  }
  if (name === 'combat') {
    game.resetWorld(33);
    game.setState('playing');
    game.missions.startMission(4);
    game.missions.step = 1;
    game.missions.setupStep();
    const plaza = game.city.landmarks.plaza;
    game.player.reset(plaza.x + 6, plaza.z + 8, 0);
    game.player.armed = true;
    game.player.ammo = 12;
    game.player.camYaw = Math.PI;
    game.player.camPitch = 0.3;
    game.traffic.spawnInitial(8, { x: plaza.x, z: plaza.z });
    game.peds.spawnInitial(8, { x: plaza.x, z: plaza.z });
    simulate(game, 3, fightPlan());
    return { screen: 'playing' };
  }
  // default: chase — the cover shot. The player drives south down 0th Street
  // in the Comet GT with three police cars right behind, wanted level 4.
  game.resetWorld(7);
  game.setState('playing');
  game.missions.startMission(5);
  game.missions.step = 1;
  game.missions.setupStep();
  const car = game.spawnPlayerCar(0, -124, 0);
  game.enterCar(car);
  game.player.camYaw = Math.PI;
  game.player.camPitch = 0.3;
  game.traffic.spawnInitial(10, { x: 0, z: -124 });
  game.peds.spawnInitial(10, { x: 0, z: -124 });
  game.police.spawnPoliceCarAt(2, -142, 0);
  game.police.spawnPoliceCarAt(-2, -156, 0);
  game.police.spawnPoliceCarAt(1, -172, 0);
  // straight south down 0th Street toward the hideout (waypoint, not the
  // hideout itself, so the car stays on the road instead of cutting corners)
  simulate(game, 5, drivePlan(0, 200));
  return { screen: 'playing' };
}
