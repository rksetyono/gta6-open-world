// Save and load: the whole campaign state in one localStorage key, so the
// player can continue the story after closing the browser.

import { SAVE_KEY, BEST_KEY } from './config.js';

export function saveGame(game) {
  const player = game.player;
  const data = {
    version: 1,
    cash: game.cash,
    missionIndex: game.missions.index,
    missionStep: game.missions.step,
    completed: game.missions.completed,
    storyDone: game.missions.storyDone,
    player: {
      x: player.x,
      z: player.z,
      heading: player.heading,
      health: player.health,
      ammo: player.ammo,
      reserve: player.reserve,
    },
    wanted: game.police.level,
    hour: game.hour,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (_e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (_e) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (_e) {
    // storage may be unavailable; the game still plays.
  }
}

export function recordBest(cash) {
  try {
    const best = Number(localStorage.getItem(BEST_KEY) || 0);
    if (cash > best) localStorage.setItem(BEST_KEY, String(cash));
    return Math.max(best, cash);
  } catch (_e) {
    return cash;
  }
}
