// Sunset Bay — the game itself: a 3D open-world crime game in the spirit of
// GTA, built on three.js. Boot, the fixed-step loop, the camera, entering and
// stealing cars, the wanted level, missions, saving, and the debug handle the
// screenshot driver reads.

import * as THREE from 'three';
import { STEP, CITY, CAR, DAY, ECONOMY, PALETTE } from './config.js';
import { makeRng, clamp, angleLerp } from './rng.js';
import { buildCity, randomStreetPoint } from './city.js';
import { Player } from './player.js';
import { Vehicle, TrafficManager } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { Combat } from './combat.js';
import { MissionManager, MISSIONS } from './missions.js';
import { HUD } from './hud.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadSave, recordBest } from './save.js';
import { stageShot } from './shots.js';

const CITY_SEED = 20261117;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    // preserveDrawingBuffer so headless screenshots capture the WebGL frame
    // instead of only the clear colour.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(0xd8c9a8, 220, 720);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.sun.shadow.camera.far = 600;
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9));

    this.input = new Input(canvas);
    this.sound = new SoundEngine();
    this.rng = makeRng(CITY_SEED);
    this.city = buildCity(this.scene, makeRng(CITY_SEED));
    this.player = new Player(this.scene);
    this.traffic = new TrafficManager(this.scene, this.city, makeRng(CITY_SEED + 1));
    this.peds = new PedestrianManager(this.scene, this.city, makeRng(CITY_SEED + 2));
    this.police = new PoliceManager(this.scene, this.city, makeRng(CITY_SEED + 3), this);
    this.combat = new Combat(this.scene, this.city, makeRng(CITY_SEED + 4), this);
    this.missions = new MissionManager(this.scene, this.city, this);
    this.hud = new HUD(this);

    this.state = 'title'; // title | playing | paused | over
    this.frozen = false; // staged screenshot scenes freeze the simulation
    this.cash = ECONOMY.startCash;
    this.hour = DAY.startHour;
    this.playTime = 0;
    this.autosaveTimer = 30;
    this.driveCamYaw = 0;
    this.orbitOffset = 0;
    this.titleAngle = 0;
    this.endKind = '';
    this.shotName = new URLSearchParams(window.location.search).get('shot');

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindMenuButtons();
    this.resetWorld(CITY_SEED);
    this.hud.showTitle(loadSave());
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setStars(0);
    this.hud.setClock(this.hour);

    if (this.shotName) {
      stageShot(this.shotName, this);
    }
    this.lastTime = performance.now();
    this.accumulator = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  bindMenuButtons() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        this.sound.ensure();
        this.sound.click();
        fn();
      });
    };
    on('new-game-btn', () => this.startNewGame());
    on('continue-btn', () => this.continueGame());
    on('resume-btn', () => this.resume());
    on('save-btn', () => {
      if (saveGame(this)) this.hud.flashMessage('Game saved', '#7fd67f');
      else this.hud.flashMessage('Could not save in this browser', '#ff8866');
    });
    on('quit-title-btn', () => {
      this.state = 'title';
      this.hud.hidePause();
      this.hud.showTitle(loadSave());
      this.input.releasePointerLock();
    });
    on('restart-btn', () => this.startNewGame());
    on('end-respawn-btn', () => this.respawn());
    on('end-title-btn', () => {
      this.state = 'title';
      this.hud.hideEnd();
      this.hud.showTitle(loadSave());
    });
  }

  // --- world setup ----------------------------------------------------------
  resetWorld(seed) {
    this.traffic.rng = makeRng(seed + 1);
    this.peds.rng = makeRng(seed + 2);
    this.police.rng = makeRng(seed + 3);
    this.combat.rng = makeRng(seed + 4);
    this.traffic.clear();
    this.peds.clear();
    this.police.clear();
    this.combat.clear();
    this.missions.reset();
    this.hour = DAY.startHour;
    this.playTime = 0;
    this.driveCamYaw = 0;
    this.orbitOffset = 0;
  }

  startNewGame() {
    this.resetWorld(CITY_SEED);
    this.cash = ECONOMY.startCash;
    // spawn on the street south of the hideout, facing north into the city
    this.player.reset(0, 186, Math.PI);
    this.traffic.spawnInitial(12, { x: this.player.x, z: this.player.z });
    this.peds.spawnInitial(16, { x: this.player.x, z: this.player.z });
    this.combat.spawnStashes(6, { x: this.player.x, z: this.player.z });
    this.state = 'playing';
    this.hud.hideTitle();
    this.hud.hideEnd();
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setStars(0);
    this.hud.setObjective('Press N to start your first mission', 'Sunset Bay');
    this.hud.setHint('WASD move · E enter car · F punch · 1 pistol · Click shoot · Esc pause');
    this.hud.showBanner('SUNSET BAY', 'Dana Reyes is back in town.');
    this.sound.ensure();
    this.input.requestPointerLock();
  }

  continueGame() {
    const save = loadSave();
    if (!save) {
      this.startNewGame();
      return;
    }
    this.resetWorld(CITY_SEED);
    this.cash = save.cash;
    this.missions.index = Math.min(save.missionIndex, MISSIONS.length - 1);
    this.missions.step = save.missionStep || 0;
    this.missions.completed = save.completed || [];
    this.missions.storyDone = !!save.storyDone;
    this.hour = save.hour || DAY.startHour;
    this.player.reset(save.player.x, save.player.z, save.player.heading);
    this.player.health = save.player.health;
    this.player.ammo = save.player.ammo;
    this.player.reserve = save.player.reserve;
    this.police.setLevel(save.wanted || 0);
    this.traffic.spawnInitial(12, { x: this.player.x, z: this.player.z });
    this.peds.spawnInitial(16, { x: this.player.x, z: this.player.z });
    this.combat.spawnStashes(6, { x: this.player.x, z: this.player.z });
    this.state = 'playing';
    this.hud.hideTitle();
    this.hud.hideEnd();
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setStars(this.police.level);
    this.hud.setHint('WASD move · E enter car · F punch · 1 pistol · Click shoot · Esc pause');
    this.hud.showBanner('WELCOME BACK', 'Your story continues.');
    this.sound.ensure();
    this.input.requestPointerLock();
  }

  setState(state) {
    this.state = state;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.showPause();
    this.input.releasePointerLock();
    this.sound.setEngine(0, false);
    this.sound.setSiren(false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hidePause();
    this.input.requestPointerLock();
  }

  respawn() {
    const fine = Math.floor(this.cash * 0.1);
    this.cash -= fine;
    recordBest(this.cash);
    this.police.clear();
    this.combat.clear();
    const spot = this.endKind === 'WASTED'
      ? { x: -62, z: -62 } // street corner by Sunset General hospital
      : { x: 0, z: 186 }; // street south of the Reyes Hideout
    this.player.reset(spot.x, spot.z, Math.PI);
    this.player.health = this.player.maxHealth;
    this.state = 'playing';
    this.hud.hideEnd();
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setStars(0);
    this.hud.flashMessage(fine > 0 ? `Lost $${fine} in fines and hospital bills` : 'You got away this time', '#ffcc66');
    this.sound.setSiren(false);
  }

  onPlayerDown() {
    if (this.state !== 'playing') return;
    this.endKind = 'WASTED';
    this.state = 'over';
    this.sound.missionFail();
    this.sound.setSiren(false);
    this.sound.setEngine(0, false);
    this.hud.showEnd('WASTED', 'Dana went down in the streets of Sunset Bay. The city keeps moving — will you?');
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.endKind = 'BUSTED';
    this.state = 'over';
    this.sound.missionFail();
    this.sound.setSiren(false);
    this.sound.setEngine(0, false);
    this.hud.showEnd('BUSTED', 'The Sunset Bay PD caught up with Dana. Time served, fine paid — back on the street.');
  }

  onEnemyDown(enemy) {
    this.missions.onEnemyDown();
    this.police.addHeat(40, 'Shooting');
  }

  addCash(amount, message) {
    this.cash += amount;
    this.hud.setCash(this.cash);
    if (message) this.hud.flashMessage(message, '#7fd67f');
  }

  damagePlayerCar(amount) {
    const car = this.player.inCar;
    if (!car) return;
    car.health -= amount;
    if (car.health <= 0) {
      this.hud.flashMessage('Your car is wrecked!', '#ff5544');
      this.sound.crash();
      this.exitCar();
      car.health = 40;
    }
  }

  randomStreetSpot(minDist = 30) {
    const spot = randomStreetPoint(this.city, this.rng);
    return spot;
  }

  // --- cars -----------------------------------------------------------------
  spawnPlayerCar(x, z, heading) {
    const car = new Vehicle(this.scene, x, z, heading, 0x2e86c1);
    car.owned = true;
    this.traffic.cars.push(car);
    return car;
  }

  spawnSpecialCar(x, z, color) {
    const car = new Vehicle(this.scene, x, z, 0, color, { topSpeed: 38 });
    car.special = true;
    this.traffic.cars.push(car);
    return car;
  }

  returnSpecialCar() {
    const car = this.missions.specialCar;
    if (car) {
      this.traffic.removeCar(car);
      this.missions.specialCar = null;
    }
  }

  enterCar(car) {
    if (this.player.inCar) return;
    this.player.inCar = car;
    car.isPlayer = true;
    car.parked = false;
    car.stolen = !car.owned;
    this.player.group.visible = false;
    this.player.visible = false;
    this.driveCamYaw = car.heading;
    this.orbitOffset = 0;
    this.sound.ensure();
    if (car.stolen) {
      this.police.addHeat(60, 'Grand theft auto');
      this.missions.onCarStolen(car);
    }
    this.hud.setHint('W/S drive · A/D steer · Space handbrake · E get out · C camera');
  }

  exitCar() {
    const car = this.player.inCar;
    if (!car) return;
    car.isPlayer = false;
    this.player.inCar = null;
    const side = Math.cos(car.heading) > 0 ? 1 : -1;
    this.player.x = car.x + Math.cos(car.heading) * 2.4 * side;
    this.player.z = car.z - Math.sin(car.heading) * 2.4 * side;
    this.player.heading = car.heading;
    this.player.camYaw = car.heading + Math.PI;
    this.player.group.visible = true;
    this.player.visible = true;
    this.player.group.position.set(this.player.x, 0, this.player.z);
    this.sound.setEngine(0, false);
    this.hud.setSpeed(null);
    this.hud.setHint('WASD move · E enter car · F punch · 1 pistol · Click shoot · Esc pause');
  }

  // --- the fixed step -------------------------------------------------------
  stepFixed(dt, inputOverride) {
    const input = inputOverride || this.input;
    if (this.state !== 'playing') return;
    this.playTime += dt;
    this.hour += (dt / DAY.length) * 24;
    if (this.hour >= 24) this.hour -= 24;

    // global keys
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      this.pause();
      return;
    }
    if (input.wasPressed('KeyM')) {
      this.sound.setMuted(!this.sound.muted);
      this.hud.flashMessage(this.sound.muted ? 'Sound muted (M to unmute)' : 'Sound on', '#cfe8ff');
    }
    if (input.wasPressed('KeyN')) {
      if (!this.missions.active && this.missions.index < MISSIONS.length) {
        this.missions.startMission(this.missions.index);
      } else if (!this.missions.active) {
        this.hud.flashMessage('Story complete — free roam, or take a taxi fare', '#7fd67f');
      }
    }

    const player = this.player;
    if (player.inCar) {
      const car = player.inCar;
      const { dx, dy } = input.takeMouseDelta();
      this.orbitOffset -= dx * 0.004;
      const throttle = input.moveY();
      const steer = input.moveX();
      const handbrake = input.down('Space');
      car.drive(dt, throttle, steer, handbrake, this.city);
      this.sound.setEngine(Math.abs(car.speed) / CAR.topSpeed, true);
      this.hud.setSpeed(Math.abs(car.speed) * 3.6);
      // camera follows behind the car, mouse orbits around it
      this.driveCamYaw = angleLerp(this.driveCamYaw, car.heading + this.orbitOffset, 1 - Math.exp(-4 * dt));
      if (input.wasPressed('KeyC')) this.orbitOffset = 0;
      if (input.wasPressed('KeyE')) this.exitCar();
      // running over pedestrians is a crime
      const ped = this.peds.nearestPed(car.x, car.z, 2.0);
      if (ped && Math.abs(car.speed) > 3) {
        this.peds.knockDown(ped);
        this.police.addHeat(45, 'Hit and run');
        this.sound.crash();
      }
    } else {
      player.updateOnFoot(dt, input, this.city, this);
      this.sound.setEngine(0, false);
      this.hud.setSpeed(null);
      if (input.wasPressed('KeyE')) {
        const car = this.traffic.nearestCar(player.x, player.z, 3.6);
        if (car) this.enterCar(car);
      }
      if (input.wasPressed('KeyF')) {
        this.combat.playerPunch(player);
      }
      if (input.wasPressed('KeyR')) {
        if (player.reload()) this.hud.flashMessage('Reloaded', '#cfe8ff');
      }
      if (input.wasClicked() && player.armed) {
        this.combat.playerShoot(player);
        this.police.addHeat(8, 'Shots fired');
      }
    }

    this.traffic.update(dt, { x: player.x, z: player.z });
    this.peds.update(dt, { x: player.x, z: player.z }, this.police.level > 0 ? { x: player.x, z: player.z, radius: 20 } : null);
    this.police.update(dt, player);
    this.combat.update(dt, player);
    this.missions.update(dt, player);

    // autosave
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 30;
      saveGame(this);
    }

    // HUD
    this.hud.setStars(this.police.level);
    this.hud.setHealth(player.health, player.maxHealth);
    this.hud.setClock(this.hour);
    this.hud.setObjective(this.missions.objectiveText(), this.missions.currentMission() ? this.missions.currentMission().title : '');
    this.hud.setCrosshair(player.armed && !player.inCar);
    this.hud.setVignette(player.hurtFlash > 0 ? 0.35 : 0);
    if (this.police.arrestProgress > 0) {
      this.hud.flashMessage('The police are arresting you — RUN!', '#ff5544');
    }
    input.endFrame();
  }

  // Place the camera exactly where updateCamera would put it, without the
  // smoothing lerp — used by the screenshot driver so the frame is settled.
  snapCamera() {
    const player = this.player;
    if (this.state === 'title') {
      const plaza = this.city.landmarks.plaza;
      this.camera.position.set(plaza.x + Math.sin(this.titleAngle) * 90, 42, plaza.z + Math.cos(this.titleAngle) * 90);
      this.camera.lookAt(plaza.x, 4, plaza.z);
      return;
    }
    if (player.inCar) {
      const car = player.inCar;
      const yaw = this.driveCamYaw;
      this.camera.position.set(
        car.x - Math.sin(yaw) * 11,
        4.2,
        car.z - Math.cos(yaw) * 11,
      );
      this.camera.lookAt(car.x + Math.sin(car.heading) * 6, 1.4, car.z + Math.cos(car.heading) * 6);
      return;
    }
    const target = player.cameraTarget();
    const pos = player.cameraPosition();
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
  }

  // --- rendering ------------------------------------------------------------
  updateCamera(dt) {
    const player = this.player;
    if (this.state === 'title') {
      this.titleAngle += dt * 0.05;
      const plaza = this.city.landmarks.plaza;
      const r = 90;
      this.camera.position.set(plaza.x + Math.sin(this.titleAngle) * r, 42, plaza.z + Math.cos(this.titleAngle) * r);
      this.camera.lookAt(plaza.x, 4, plaza.z);
      return;
    }
    if (player.inCar) {
      const car = player.inCar;
      const yaw = this.driveCamYaw;
      const dist = 11;
      const height = 4.2;
      const tx = car.x - Math.sin(yaw) * dist;
      const tz = car.z - Math.cos(yaw) * dist;
      this.camera.position.x += (tx - this.camera.position.x) * (1 - Math.exp(-8 * dt));
      this.camera.position.y += (height - this.camera.position.y) * (1 - Math.exp(-8 * dt));
      this.camera.position.z += (tz - this.camera.position.z) * (1 - Math.exp(-8 * dt));
      this.camera.lookAt(car.x + Math.sin(car.heading) * 6, 1.4, car.z + Math.cos(car.heading) * 6);
      return;
    }
    const target = player.cameraTarget();
    const pos = player.cameraPosition();
    this.camera.position.x += (pos.x - this.camera.position.x) * (1 - Math.exp(-14 * dt));
    this.camera.position.y += (pos.y - this.camera.position.y) * (1 - Math.exp(-14 * dt));
    this.camera.position.z += (pos.z - this.camera.position.z) * (1 - Math.exp(-14 * dt));
    this.camera.lookAt(target);
  }

  updateSun() {
    // golden afternoon that slowly drifts toward dusk
    const t = ((this.hour - 12) / 12) * Math.PI; // 0 at noon, PI at midnight
    const elev = Math.max(0.12, Math.sin(Math.PI - t) * 0.9);
    const azim = t * 0.7;
    this.sun.position.set(Math.cos(azim) * 220, elev * 220 + 40, Math.sin(azim) * 160);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
    const warmth = clamp(1 - Math.abs(this.hour - 16.5) / 6, 0, 1);
    this.sun.color.setHSL(0.09 + warmth * 0.02, 0.7, 0.62 + warmth * 0.1);
    const dayFactor = clamp(Math.sin(((this.hour - 6) / 12) * Math.PI), 0.25, 1);
    this.scene.background.setHSL(0.58, 0.45, 0.55 + dayFactor * 0.18);
    for (const cloud of this.city.clouds) {
      cloud.position.x += 0.6 * (1 / 60);
      if (cloud.position.x > CITY.half + 60) cloud.position.x = -CITY.half - 60;
    }
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dtReal = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.state === 'playing' && !this.frozen) {
      this.accumulator += dtReal;
      let guard = 0;
      while (this.accumulator >= STEP && guard < 5) {
        this.stepFixed(STEP);
        this.accumulator -= STEP;
        guard += 1;
      }
      if (guard === 5) this.accumulator = 0;
    }
    this.updateSun();
    this.updateCamera(dtReal);
    if (this.state === 'playing') this.hud.drawMinimap(this);
    this.renderer.render(this.scene, this.camera);
  }
}

// Boot the game and expose a small debug handle for playtesting.
const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__sunsetbay = {
  game,
  state() {
    const p = game.player;
    return {
      state: game.state,
      cash: game.cash,
      playTime: Number(game.playTime.toFixed(2)),
      hour: Number(game.hour.toFixed(2)),
      wanted: game.police.level,
      health: p.health,
      ammo: p.ammo,
      inCar: !!p.inCar,
      speed: p.inCar ? Number(p.inCar.speed.toFixed(1)) : Number(p.speed.toFixed(1)),
      x: Number(p.x.toFixed(1)),
      z: Number(p.z.toFixed(1)),
      mission: game.missions.currentMission() ? game.missions.currentMission().id : null,
      missionStep: game.missions.step,
      missionActive: game.missions.active,
      objective: game.missions.objectiveText(),
      enemies: game.combat.enemies.filter((e) => !e.dead).length,
      policeCars: game.police.cars.length,
      traffic: game.traffic.cars.length,
      peds: game.peds.peds.length,
      completed: game.missions.completed,
    };
  },
};
