// The story of Sunset Bay: six missions for Dana Reyes, from a first errand
// to the big score, plus taxi fares as a free-roam side activity. A mission
// is a chain of steps; each step names an objective the HUD and the minimap
// point at, and finishing it pays cash and unlocks the next chapter.

import * as THREE from 'three';
import { ECONOMY } from './config.js';
import { distance2D } from './rng.js';

export const STORY = {
  hero: 'Dana Reyes',
  city: 'Sunset Bay',
  intro: 'Dana Reyes came home to Sunset Bay with nothing but a duffel bag and a debt. The city runs on favours, fast cars and louder sirens — and Dana is about to learn all three.',
};

export const MISSIONS = [
  {
    id: 'first-errand',
    title: 'First Errand',
    briefing: 'Marco needs a package picked up from the Sunset Docks and brought to the hideout. No questions. Walk or drive — just don\'t draw attention.',
    reward: 400,
    steps: [
      { type: 'goto', target: 'docks', text: 'Pick up the package at the Sunset Docks' },
      { type: 'goto', target: 'hideout', text: 'Deliver the package to the Reyes Hideout' },
    ],
  },
  {
    id: 'getaway-driver',
    title: 'Getaway Driver',
    briefing: 'Your old friend Vega is in trouble at Vega Motors. Pick him up — and when the sirens come, drive like the whole city is watching.',
    reward: 600,
    steps: [
      { type: 'goto', target: 'garage', text: 'Pick up Vega at Vega Motors' },
      { type: 'escape', target: 'hideout', text: 'Lose the cops and reach the hideout' },
    ],
  },
  {
    id: 'the-shakedown',
    title: 'The Shakedown',
    briefing: 'Three shops owe Marco protection money. Collect from Lou\'s Diner, Bay Market and the Neon Arcade. Be polite. Be firm.',
    reward: 800,
    steps: [
      { type: 'goto', target: 'shopA', text: 'Collect from Lou\'s Diner (1/3)' },
      { type: 'goto', target: 'shopB', text: 'Collect from Bay Market (2/3)' },
      { type: 'goto', target: 'shopC', text: 'Collect from the Neon Arcade (3/3)' },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    briefing: 'A one-of-a-kind sports car — the Comet GT — is parked at Coral Plaza. Steal it and bring it to Vega Motors. The owner will notice. So will the police.',
    reward: 900,
    steps: [
      { type: 'steal', target: 'plaza', text: 'Steal the Comet GT at Coral Plaza' },
      { type: 'deliver', target: 'garage', text: 'Deliver the Comet GT to Vega Motors' },
    ],
  },
  {
    id: 'turf-wars',
    title: 'Turf Wars',
    briefing: 'The Red Vipers moved into Coral Plaza and they are not leaving on their own. Clear them out. Bring your pistol — and bring ammo.',
    reward: 1200,
    steps: [
      { type: 'goto', target: 'plaza', text: 'Reach Coral Plaza' },
      { type: 'kill', count: 5, target: 'plaza', text: 'Defeat the Red Vipers (0/5)' },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    briefing: 'Meridian Bank. One vault, one getaway car, and every cop in Sunset Bay. Grab the cash, lose the heat, and make it home. This is the one they will remember.',
    reward: 2500,
    steps: [
      { type: 'goto', target: 'bank', text: 'Reach Meridian Bank' },
      { type: 'escape', target: 'hideout', text: 'Escape the police and reach the hideout' },
    ],
  },
];

export class MissionManager {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game;
    this.index = 0; // which mission is active
    this.step = 0; // which step of it
    this.completed = []; // ids of finished missions
    this.active = false;
    this.kills = 0;
    this.killTarget = 0;
    this.escaped = false;
    this.specialCar = null;
    this.beacon = null;
    this.beaconLight = null;
    this.fare = null; // active taxi fare, if any
    this.fareTimer = 0;
    this.storyDone = false;
    this.buildBeacon();
  }

  buildBeacon() {
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 42, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd54f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    this.beacon.add(ring);
    this.beaconLight = new THREE.PointLight(0xffd54f, 0.8, 26, 1.6);
    this.beacon.add(this.beaconLight);
    this.beaconLight.position.y = 6;
  }

  currentMission() {
    return MISSIONS[this.index] || null;
  }

  currentStep() {
    const m = this.currentMission();
    return m ? m.steps[this.step] : null;
  }

  startMission(index) {
    this.index = index;
    this.step = 0;
    this.kills = 0;
    this.active = true;
    const m = this.currentMission();
    if (!m) {
      this.active = false;
      return;
    }
    this.game.hud.showBriefing(m.title, m.briefing);
    this.game.sound.missionComplete();
    this.setupStep();
  }

  setupStep() {
    const step = this.currentStep();
    if (!step) return;
    if (step.type === 'kill') {
      this.killTarget = step.count;
      this.kills = 0;
      const plaza = this.city.landmarks.plaza;
      this.game.combat.spawnSquad(plaza, step.count + 1, 12);
      this.game.hud.flashMessage('The Red Vipers are here — fight!', '#ff5544');
    }
    if (step.type === 'steal') {
      const plaza = this.city.landmarks.plaza;
      if (!this.specialCar) {
        this.specialCar = this.game.spawnSpecialCar(plaza.x + 6, plaza.z, 0xffd700);
      }
    }
    if (step.type === 'escape') {
      const level = this.currentMission().id === 'the-big-score' ? 4 : 2;
      this.game.police.setLevel(level);
      this.escaped = false;
    }
    this.updateBeacon();
  }

  objectiveTarget() {
    const step = this.currentStep();
    if (!step || !this.active) return this.fare ? this.fare.dest : null;
    const lm = this.city.landmarks[step.target];
    return lm || null;
  }

  objectiveText() {
    const step = this.currentStep();
    if (!step) return this.fare ? this.fare.text : 'Free roam — explore Sunset Bay';
    if (step.type === 'kill') {
      return `Defeat the Red Vipers (${this.kills}/${this.killTarget})`;
    }
    return step.text;
  }

  updateBeacon() {
    const target = this.objectiveTarget();
    if (target && this.active) {
      this.beacon.visible = true;
      this.beacon.position.set(target.x, 21, target.z);
    } else if (this.fare) {
      this.beacon.visible = true;
      this.beacon.position.set(this.fare.dest.x, 21, this.fare.dest.z);
    } else {
      this.beacon.visible = false;
    }
  }

  advanceStep() {
    this.step += 1;
    const m = this.currentMission();
    if (this.step >= m.steps.length) {
      this.completeMission();
      return;
    }
    this.setupStep();
    this.game.sound.pickup();
  }

  completeMission() {
    const m = this.currentMission();
    this.completed.push(m.id);
    this.game.addCash(m.reward, `Mission complete: ${m.title} +$${m.reward}`);
    this.game.sound.missionComplete();
    this.game.hud.showBanner(`MISSION COMPLETE — ${m.title}`, `+$${m.reward}`);
    this.active = false;
    this.beacon.visible = false;
    if (this.index + 1 < MISSIONS.length) {
      this.game.hud.flashMessage(`Next mission unlocked: ${MISSIONS[this.index + 1].title} — press N to start`, '#7fd67f');
    } else {
      this.storyDone = true;
      this.game.hud.showBanner('SUNSET BAY LEGEND', 'You finished the whole story. The city is yours.');
    }
  }

  onEnemyDown() {
    const step = this.currentStep();
    if (!this.active || !step || step.type !== 'kill') return;
    this.kills += 1;
    if (this.kills >= this.killTarget) this.advanceStep();
  }

  onCarStolen(car) {
    const step = this.currentStep();
    if (!this.active || !step || step.type !== 'steal') return;
    if (this.specialCar && car === this.specialCar) this.advanceStep();
  }

  // A taxi fare: a waiting passenger and a destination. Spawned in free roam.
  startFare() {
    if (this.fare || this.active) return;
    const from = this.game.randomStreetSpot(40);
    const dest = this.game.randomStreetSpot(40);
    this.fare = {
      from, dest,
      text: 'Taxi fare: pick up the passenger',
      passenger: null,
      state: 'pickup',
      reward: ECONOMY.fareValue,
    };
    this.fare.passenger = this.game.peds.makePed(from.x, from.z);
    this.updateBeacon();
    this.game.hud.flashMessage('Taxi fare available — pick up the passenger', '#ffd54f');
  }

  update(dt, player) {
    // beacon pulse
    if (this.beacon.visible) {
      this.beacon.rotation.y += dt * 0.8;
      const s = 1 + Math.sin(performance.now() / 300) * 0.12;
      this.beacon.scale.set(s, 1, s);
    }
    // taxi fares appear now and then while roaming
    if (!this.active && !this.fare && !this.storyDone) {
      this.fareTimer -= dt;
      if (this.fareTimer <= 0) {
        this.fareTimer = 45;
        if (Math.random() < 0.5) this.startFare();
      }
    }
    if (this.fare) {
      const f = this.fare;
      if (f.state === 'pickup') {
        const px = player.inCar ? player.inCar.x : player.x;
        const pz = player.inCar ? player.inCar.z : player.z;
        if (distance2D(px, pz, f.from.x, f.from.z) < 5 && player.inCar) {
          f.state = 'dropoff';
          f.text = 'Taxi fare: take the passenger to the destination';
          this.updateBeacon();
          this.game.hud.flashMessage('Passenger aboard — drive to the marker', '#ffd54f');
          this.game.sound.pickup();
        }
      } else if (distance2D(player.inCar ? player.inCar.x : player.x, player.inCar ? player.inCar.z : player.z, f.dest.x, f.dest.z) < 7 && player.inCar) {
        this.game.addCash(f.reward, `Taxi fare complete +$${f.reward}`);
        this.game.sound.cash();
        if (f.passenger) {
          const idx = this.game.peds.peds.indexOf(f.passenger);
          if (idx >= 0) this.game.peds.peds.splice(idx, 1);
          this.game.scene.remove(f.passenger.group);
        }
        this.fare = null;
        this.fareTimer = 30;
        this.updateBeacon();
      }
    }
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    if (step.type === 'goto' || step.type === 'deliver') {
      const lm = this.city.landmarks[step.target];
      if (lm && distance2D(px, pz, lm.x, lm.z) < 8) {
        if (step.type === 'deliver') this.game.returnSpecialCar();
        this.advanceStep();
      }
    }
    if (step.type === 'escape') {
      const lm = this.city.landmarks[step.target];
      if (lm && distance2D(px, pz, lm.x, lm.z) < 9 && this.game.police.level <= 1) {
        this.advanceStep();
      }
    }
  }

  reset() {
    this.index = 0;
    this.step = 0;
    this.completed = [];
    this.active = false;
    this.storyDone = false;
    this.fare = null;
    this.fareTimer = 20;
    this.beacon.visible = false;
    if (this.specialCar) {
      this.game.traffic.removeCar(this.specialCar);
      this.specialCar = null;
    }
  }
}
