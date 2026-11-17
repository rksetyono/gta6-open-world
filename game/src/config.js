// Sunset Bay — every tuning number and colour in one place.
// The city is a grid of square blocks separated by streets; all distances
// are in metres, all speeds in metres per second, all times in seconds.

export const STEP = 1 / 60;

export const CITY = {
  blocks: 6, // blocks per side
  blockSize: 48, // metres of buildings per block
  roadWidth: 14, // metres of asphalt between blocks
  get pitch() { return this.blockSize + this.roadWidth; },
  get half() { return (this.blocks * this.pitch + this.roadWidth) / 2; },
};

export const PLAYER = {
  height: 1.8,
  radius: 0.45,
  walkSpeed: 4.2,
  runSpeed: 7.5,
  accel: 26,
  health: 100,
};

export const CAR = {
  length: 4.4,
  width: 2.0,
  topSpeed: 34, // m/s, about 122 km/h
  accel: 14,
  brake: 26,
  reverseSpeed: 10,
  steer: 0.55, // radians of wheel angle at full lock
  grip: 8,
};

export const POLICE = {
  topSpeed: 36,
  accel: 16,
  ramDamage: 8,
  arrestRange: 1.6,
  arrestTime: 2.0,
};

export const WANTED = {
  decayDelay: 12, // seconds out of sight before a star starts to fade
  decayStep: 8, // seconds per star lost while hidden
  maxLevel: 5,
  // how many police cars chase at each wanted level
  carsForLevel: [0, 1, 2, 3, 4, 5],
  // how many foot officers chase at each wanted level
  officersForLevel: [0, 0, 1, 2, 3, 4],
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 55,
  pistolAmmo: 12,
  pistolReserve: 48,
  punchDamage: 18,
  punchRange: 1.9,
  enemyHealth: 70,
  enemyDamage: 7,
  enemyRange: 26,
  enemyShotInterval: 1.1,
};

export const ECONOMY = {
  startCash: 250,
  bustedFine: 0.1, // fraction of cash lost when busted or wasted
  stashValue: 150,
  fareValue: 60,
};

export const DAY = {
  length: 480, // seconds for a full day cycle
  startHour: 16.5, // golden afternoon, the city's signature light
};

export const PALETTE = {
  sky: 0x87b5d9,
  horizon: 0xffd9a0,
  sun: 0xfff2cc,
  asphalt: 0x2e3138,
  asphaltLine: 0xd8d3c3,
  sidewalk: 0x9a938a,
  sand: 0xe0c98f,
  sea: 0x2e7f9e,
  grass: 0x6f9e5a,
  buildingA: 0xc9a06a,
  buildingB: 0x8fa3b8,
  buildingC: 0xb87a6e,
  buildingD: 0x7d8a99,
  windowLit: 0xffd27a,
  windowDark: 0x2a3542,
  playerJacket: 0x2e8b8b,
  playerPants: 0x2c3240,
  policeBody: 0x1c2733,
  policeWhite: 0xf2f4f6,
  rivalShirt: 0xb03a2e,
  pedShirts: [0xd96c4f, 0x4f7dd9, 0x6fb84f, 0xd9b84f, 0x9b59b6, 0xe67e22],
  carPaints: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x1a1a1a, 0xe67e22, 0x16a085, 0x7f8c8d],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'sunset-bay.save.v1';
export const BEST_KEY = 'sunset-bay.best.v1';
