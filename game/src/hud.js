// The HUD: wanted stars, health, cash, mission objective, a live minimap,
// speedometer, banners and the title / pause / briefing overlays. All DOM,
// drawn over the WebGL canvas; the minimap is a 2D canvas.

import { CITY, PALETTE } from './config.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.starsEl = document.getElementById('wanted-stars');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.cashEl = document.getElementById('cash');
    this.objectiveEl = document.getElementById('objective');
    this.objectiveText = document.getElementById('objective-text');
    this.speedEl = document.getElementById('speed');
    this.clockEl = document.getElementById('clock');
    this.messageEl = document.getElementById('flash-message');
    this.bannerEl = document.getElementById('banner');
    this.bannerTitle = document.getElementById('banner-title');
    this.bannerSub = document.getElementById('banner-sub');
    this.crosshair = document.getElementById('crosshair');
    this.vignette = document.getElementById('vignette');
    this.minimap = document.getElementById('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.messageTimer = null;
    this.bannerTimer = null;
    this.lastObjective = '';
  }

  setStars(level) {
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      html += `<span class="star${i < level ? ' on' : ''}">★</span>`;
    }
    this.starsEl.innerHTML = html;
  }

  setHealth(health, max) {
    const pct = Math.max(0, Math.round((health / max) * 100));
    this.healthFill.style.width = `${pct}%`;
    this.healthFill.style.background = pct > 50 ? '#57c465' : pct > 25 ? '#e8a13a' : '#e5534b';
    this.healthText.textContent = `${pct}`;
  }

  setCash(cash) {
    this.cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  setSpeed(kmh) {
    if (kmh === null) {
      this.speedEl.style.display = 'none';
      return;
    }
    this.speedEl.style.display = 'block';
    this.speedEl.textContent = `${Math.round(kmh)} km/h`;
  }

  setClock(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    this.clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setObjective(text, missionTitle) {
    if (text !== this.lastObjective) {
      this.objectiveText.textContent = text;
      this.lastObjective = text;
    }
    this.objectiveEl.style.display = text ? 'block' : 'none';
  }

  setCrosshair(visible) {
    this.crosshair.style.display = visible ? 'block' : 'none';
  }

  setVignette(alpha) {
    this.vignette.style.opacity = String(Math.max(0, Math.min(1, alpha)));
  }

  flashMessage(text, color = '#ffffff') {
    this.messageEl.textContent = text;
    this.messageEl.style.color = color;
    this.messageEl.style.opacity = '1';
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => {
      this.messageEl.style.opacity = '0';
    }, 3400);
  }

  showBanner(title, sub = '') {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.style.opacity = '1';
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.bannerEl.style.opacity = '0';
    }, 3800);
  }

  // The minimap: streets, buildings, the player arrow, police, traffic,
  // pedestrians, the mission beacon and the sea.
  drawMinimap(game) {
    const ctx = this.mapCtx;
    const size = this.minimap.width;
    const half = CITY.half + 30;
    const toMap = (x, z) => [
      ((x + half) / (half * 2)) * size,
      ((z + half) / (half * 2)) * size,
    ];
    ctx.clearRect(0, 0, size, size);
    // sea and sand at the south edge
    ctx.fillStyle = '#1d4f66';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#274b2f';
    ctx.fillRect(0, 0, size, toMap(0, CITY.half)[1]);
    // blocks
    ctx.fillStyle = '#3a3f47';
    for (const b of game.city.buildings) {
      const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      const w = (b.w / (half * 2)) * size;
      const d = (b.d / (half * 2)) * size;
      ctx.fillStyle = b.landmark ? '#8a6f3a' : '#3a3f47';
      ctx.fillRect(x, z, Math.max(1, w), Math.max(1, d));
    }
    // streets
    ctx.strokeStyle = '#565d68';
    ctx.lineWidth = 3;
    for (const s of game.city.streets) {
      const [x1] = toMap(s, 0);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, size);
      ctx.stroke();
      const [, z1] = toMap(0, s);
      ctx.beginPath();
      ctx.moveTo(0, z1);
      ctx.lineTo(size, z1);
      ctx.stroke();
    }
    // mission target
    const target = game.missions.objectiveTarget();
    if (target) {
      const [x, y] = toMap(target.x, target.z);
      const pulse = 5 + Math.sin(performance.now() / 250) * 1.5;
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.moveTo(x, y - pulse);
      ctx.lineTo(x + pulse, y);
      ctx.lineTo(x, y + pulse);
      ctx.lineTo(x - pulse, y);
      ctx.closePath();
      ctx.fill();
    }
    // traffic
    ctx.fillStyle = '#dfe6ee';
    for (const car of game.traffic.cars) {
      if (car.isPlayer) continue;
      const [x, y] = toMap(car.x, car.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // police
    ctx.fillStyle = '#4da3ff';
    for (const car of game.police.cars) {
      const [x, y] = toMap(car.x, car.z);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // enemies
    ctx.fillStyle = '#ff5544';
    for (const e of game.combat.enemies) {
      if (e.dead) continue;
      const [x, y] = toMap(e.x, e.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow
    const player = game.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    const heading = player.inCar ? player.inCar.heading : player.heading;
    const [mx, my] = toMap(px, pz);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // north tick
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', size - 12, 12);
  }

  // --- overlays -------------------------------------------------------------
  showTitle(save) {
    document.getElementById('title-screen').style.display = 'flex';
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('end-screen').style.display = 'none';
    document.getElementById('continue-btn').style.display = save ? 'block' : 'none';
    document.getElementById('title-best').textContent = save
      ? `Saved game: $${save.cash.toLocaleString('en-US')} · Mission ${save.missionIndex + 1} of 6`
      : 'No saved game yet — start a new story.';
  }

  hideTitle() {
    document.getElementById('title-screen').style.display = 'none';
  }

  showPause() {
    document.getElementById('pause-screen').style.display = 'flex';
  }

  hidePause() {
    document.getElementById('pause-screen').style.display = 'none';
  }

  showEnd(kind, text) {
    const el = document.getElementById('end-screen');
    document.getElementById('end-title').textContent = kind;
    document.getElementById('end-text').textContent = text;
    el.style.display = 'flex';
  }

  hideEnd() {
    document.getElementById('end-screen').style.display = 'none';
  }

  showBriefing(title, text) {
    const el = document.getElementById('briefing');
    document.getElementById('briefing-title').textContent = title;
    document.getElementById('briefing-text').textContent = text;
    el.style.display = 'block';
    el.style.opacity = '1';
    if (this._briefTimer) clearTimeout(this._briefTimer);
    this._briefTimer = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 600);
    }, 7000);
  }

  setHint(text) {
    document.getElementById('hint').textContent = text;
  }
}
