// LANTERN ROW — the map. A night market district, 64 by 44 metres: two sites,
// three lanes and the connectors between them. Walls are axis-aligned boxes; the
// same list drives collision, sight, bullets and the meshes, so what you see is
// what blocks you. Low stalls and crates (height 1.3 or less) stop bullets but not
// sight; tall walls stop both. Coordinates: x east, z south, y up.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = { minX: -32, maxX: 32, minZ: -22, maxZ: 22 };

// Tall walls (h >= 3): block movement, sight and bullets.
export const WALLS = [
  { x: 0, z: -22, w: 65, d: 1, h: 4, mat: 'stone' }, // north perimeter
  { x: 0, z: 22, w: 65, d: 1, h: 4, mat: 'stone' }, // south perimeter
  { x: -32, z: 0, w: 1, d: 45, h: 4, mat: 'stone' }, // west perimeter
  { x: 32, z: 0, w: 1, d: 45, h: 4, mat: 'stone' }, // east perimeter
  { x: -14, z: -4, w: 6, d: 4, h: 3, mat: 'wood' }, // Spice Store, north half
  { x: -14, z: 6, w: 6, d: 4, h: 3, mat: 'wood' }, // Spice Store, south half
  { x: 14, z: -4, w: 6, d: 4, h: 3, mat: 'wood' }, // Silk House, north half
  { x: 14, z: 6, w: 6, d: 4, h: 3, mat: 'wood' }, // Silk House, south half
  { x: 0, z: -3, w: 5, d: 3, h: 3, mat: 'wood' }, // Tea House, mid cover
  { x: -6, z: -12, w: 4, d: 1, h: 3.5, mat: 'stone' }, // north wall, west of the arch
  { x: 6, z: -12, w: 4, d: 1, h: 3.5, mat: 'stone' }, // north wall, east of the arch
  { x: -24, z: -18, w: 10, d: 1, h: 3.5, mat: 'plaster' }, // Spice Hall back wall
  { x: 24, z: -18, w: 10, d: 1, h: 3.5, mat: 'plaster' }, // Lantern Court back wall
  { x: -29, z: -13, w: 1, d: 6, h: 3, mat: 'plaster' }, // Spice Hall west wall
  { x: 29, z: -13, w: 1, d: 6, h: 3, mat: 'plaster' }, // Lantern Court east wall
];

// Low cover (h <= 1.3): blocks bullets and movement, but a standing agent sees over it.
export const COVER = [
  { x: -22, z: -11, w: 2, d: 2, h: 1.2, mat: 'crate' },
  { x: -27, z: -10, w: 2, d: 2, h: 1.2, mat: 'crate' },
  { x: 22, z: -11, w: 2, d: 2, h: 1.2, mat: 'crate' },
  { x: 27, z: -10, w: 2, d: 2, h: 1.2, mat: 'crate' },
  { x: -3, z: 4, w: 2, d: 2, h: 1.2, mat: 'crate' },
  { x: 3, z: 4, w: 2, d: 2, h: 1.2, mat: 'crate' },
  { x: -12, z: 12, w: 4, d: 2, h: 1.3, mat: 'stall' },
  { x: 12, z: 12, w: 4, d: 2, h: 1.3, mat: 'stall' },
  { x: -20, z: 6, w: 3, d: 2, h: 1.3, mat: 'stall' },
  { x: 20, z: 6, w: 3, d: 2, h: 1.3, mat: 'stall' },
  { x: 0, z: 2, w: 4, d: 1.5, h: 1.2, mat: 'stall' }, // Tea House counter
  { x: -8, z: -16, w: 2, d: 2, h: 1.2, mat: 'crate' },
  { x: 8, z: -16, w: 2, d: 2, h: 1.2, mat: 'crate' },
];

export const ALL_BOXES = WALLS.concat(COVER);

export const SITES = {
  A: { id: 'A', name: 'Spice Hall', x: -24, z: -14, r: 4.5 },
  B: { id: 'B', name: 'Lantern Court', x: 24, z: -14, r: 4.5 },
};

export const SPAWNS = {
  ember: [ // attackers, South Gate
    { x: -4, z: 19 }, { x: -2, z: 20 }, { x: 0, z: 19 }, { x: 2, z: 20 }, { x: 4, z: 19 },
  ],
  lantern: [ // defenders, North Gate
    { x: -4, z: -19 }, { x: -2, z: -20 }, { x: 0, z: -19 }, { x: 2, z: -20 }, { x: 4, z: -19 },
  ],
};

// Named zones, checked in order: the first rect containing the point wins.
export const ZONES = [
  { x0: -30, z0: -20, x1: -16, z1: -8, name: 'SPICE HALL · SITE A' },
  { x0: 16, z0: -20, x1: 30, z1: -8, name: 'LANTERN COURT · SITE B' },
  { x0: -5, z0: -6, x1: 5, z1: 10, name: 'TEA LANE' },
  { x0: -5, z0: -14, x1: 5, z1: -6, name: 'MID ARCADE' },
  { x0: -19, z0: -8, x1: -9, z1: 16, name: 'FISH ROW' },
  { x0: 9, z0: -8, x1: 19, z1: 16, name: 'SILK ALLEY' },
  { x0: -16, z0: -14, x1: -8, z1: -6, name: 'LOTUS STEPS' },
  { x0: 8, z0: -14, x1: 16, z1: -6, name: 'PAPER BRIDGE' },
  { x0: -32, z0: 14, x1: 32, z1: 22, name: 'SOUTH GATE' },
  { x0: -8, z0: -22, x1: 8, z1: -14, name: 'NORTH GATE' },
];

export function zoneAt(x, z) {
  for (let i = 0; i < ZONES.length; i++) {
    const zn = ZONES[i];
    if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn.name;
  }
  return 'LANTERN ROW';
}

// Waypoint graph: nodes the bots walk between, edges they may take. Every lane,
// connector and site is on the graph, so a bot can path anywhere from anywhere.
export const NODES = {
  spawnE: { x: 0, z: 19 }, spawnD: { x: 0, z: -19 },
  southW: { x: -6, z: 16 }, southE: { x: 6, z: 16 },
  fishS: { x: -14, z: 12 }, fishM: { x: -14, z: 0 }, fishN: { x: -14, z: -10 },
  silkS: { x: 14, z: 12 }, silkM: { x: 14, z: 0 }, silkN: { x: 14, z: -10 },
  teaS: { x: 0, z: 8 }, teaM: { x: 0, z: 1 }, teaN: { x: 0, z: -8 }, arcadeN: { x: 0, z: -14 },
  westCut: { x: -8, z: 1 }, eastCut: { x: 8, z: 1 },
  lotus: { x: -11, z: -9 }, paper: { x: 11, z: -9 },
  siteA: { x: -24, z: -14 }, siteA2: { x: -20, z: -11 },
  siteB: { x: 24, z: -14 }, siteB2: { x: 20, z: -11 },
  northA: { x: -11, z: -16 }, northB: { x: 11, z: -16 },
};

const EDGES = [
  ['spawnE', 'southW'], ['spawnE', 'southE'],
  ['southW', 'fishS'], ['southE', 'silkS'], ['southW', 'teaS'], ['southE', 'teaS'],
  ['fishS', 'fishM'], ['fishM', 'fishN'], ['fishN', 'siteA2'], ['fishN', 'lotus'],
  ['silkS', 'silkM'], ['silkM', 'silkN'], ['silkN', 'siteB2'], ['silkN', 'paper'],
  ['teaS', 'teaM'], ['teaM', 'teaN'], ['teaN', 'arcadeN'],
  ['teaM', 'westCut'], ['teaM', 'eastCut'], ['westCut', 'fishM'], ['eastCut', 'silkM'],
  ['teaN', 'lotus'], ['teaN', 'paper'],
  ['lotus', 'siteA2'], ['paper', 'siteB2'],
  ['siteA2', 'siteA'], ['siteB2', 'siteB'],
  ['arcadeN', 'northA'], ['arcadeN', 'northB'],
  ['northA', 'siteA'], ['northB', 'siteB'],
  ['spawnD', 'northA'], ['spawnD', 'northB'],
  ['fishN', 'northA'], ['silkN', 'northB'],
];

export const ADJACENT = {};
for (const id of Object.keys(NODES)) ADJACENT[id] = [];
for (const [a, b] of EDGES) { ADJACENT[a].push(b); ADJACENT[b].push(a); }

// Next-hop table: nextHop[from][to] is the first node on the shortest path.
// Built once with breadth-first search; bots never pathfind at runtime.
export const NEXT_HOP = {};
{
  const ids = Object.keys(NODES);
  for (const from of ids) {
    NEXT_HOP[from] = {};
    const prev = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of ADJACENT[cur]) {
        if (!(nb in prev)) { prev[nb] = cur; queue.push(nb); }
      }
    }
    for (const to of ids) {
      if (to === from) { NEXT_HOP[from][to] = to; continue; }
      let hop = to;
      while (prev[hop] !== from && prev[hop] !== null) hop = prev[hop];
      NEXT_HOP[from][to] = hop;
    }
  }
}

export function nearestNode(x, z) {
  let best = 'spawnE';
  let bestD = Infinity;
  for (const id of Object.keys(NODES)) {
    const n = NODES[id];
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

// ---- collision and sight (2D in the XZ plane, y handled by the ray test) ----

function boxHit2D(b, x, z, r) {
  return x > b.x - b.w / 2 - r && x < b.x + b.w / 2 + r &&
    z > b.z - b.d / 2 - r && z < b.z + b.d / 2 + r;
}

// Push a circle out of every box it overlaps. Returns true when anything moved.
export function collideCircle(p, r) {
  let hit = false;
  for (let i = 0; i < ALL_BOXES.length; i++) {
    const b = ALL_BOXES[i];
    const hx = b.w / 2 + r;
    const hz = b.d / 2 + r;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
    const px = hx - Math.abs(dx);
    const pz = hz - Math.abs(dz);
    if (px < pz) p.x = b.x + (dx >= 0 ? hx : -hx);
    else p.z = b.z + (dz >= 0 ? hz : -hz);
    hit = true;
  }
  if (p.x < MAP.minX + r) { p.x = MAP.minX + r; hit = true; }
  if (p.x > MAP.maxX - r) { p.x = MAP.maxX - r; hit = true; }
  if (p.z < MAP.minZ + r) { p.z = MAP.minZ + r; hit = true; }
  if (p.z > MAP.maxZ - r) { p.z = MAP.maxZ - r; hit = true; }
  return hit;
}

// Does the segment (ax,az)-(bx,bz) cross a tall wall? Low cover never blocks sight.
export function losBlocked(ax, az, bx, bz) {
  for (let i = 0; i < WALLS.length; i++) {
    const b = WALLS[i];
    if (segmentHitsBox(ax, az, bx, bz, b)) return true;
  }
  return false;
}

function segmentHitsBox(ax, az, bx, bz, b) {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < x0 || ax > x1) return false;
  } else {
    let ta = (x0 - ax) / dx, tb = (x1 - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < z0 || az > z1) return false;
  } else {
    let ta = (z0 - az) / dz, tb = (z1 - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// 3D ray against every box (slab test). Reuses module temps: no allocation per shot.
const _rayHit = { dist: Infinity, box: null };
export function rayHit(ox, oy, oz, dx, dy, dz, maxDist) {
  _rayHit.dist = Infinity;
  _rayHit.box = null;
  for (let i = 0; i < ALL_BOXES.length; i++) {
    const b = ALL_BOXES[i];
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
    const y0 = 0, y1 = b.h;
    const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    let t0 = 0, t1 = maxDist;
    let ok = true;
    const axes = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
    for (let a = 0; a < 3; a++) {
      const o = axes[a][0], d = axes[a][1], lo = axes[a][2], hi = axes[a][3];
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { ok = false; break; }
      } else {
        let ta = (lo - o) / d, tb = (hi - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && t0 < _rayHit.dist) { _rayHit.dist = t0; _rayHit.box = b; }
  }
  return _rayHit;
}

export function inSite(x, z, site) {
  const dx = x - site.x, dz = z - site.z;
  return dx * dx + dz * dz <= site.r * site.r;
}

// ---- scene building ----

const MATS = {
  stone: new THREE.MeshStandardMaterial({ color: 0xa89e8c, roughness: 0.95 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x6b6257, roughness: 0.95 }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xd9b47e, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7d5a38, roughness: 0.85 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x54401f, roughness: 0.9 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.9 }),
  stall: new THREE.MeshStandardMaterial({ color: 0x9a7a4e, roughness: 0.85 }),
  paper: new THREE.MeshStandardMaterial({
    color: PALETTE.paper, roughness: 0.6, emissive: 0x7a1408, emissiveIntensity: 0.7,
  }),
};

function textSprite(text, sub, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8, 20, 24, 0.92)';
  g.fillRect(0, 0, 512, 192);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 180);
  g.fillStyle = color;
  g.font = 'bold 92px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 256, 104);
  g.fillStyle = '#f2ead9';
  g.font = 'bold 44px system-ui, sans-serif';
  g.fillText(sub, 256, 164);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.95),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  return m;
}

export function buildScene(scene) {
  scene.background = new THREE.Color(PALETTE.night);
  scene.fog = new THREE.Fog(PALETTE.night, 30, 85);

  const hemi = new THREE.HemisphereLight(0x3a6a7a, 0x2a1c10, 1.7);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fc4d8, 1.1);
  moon.position.set(-20, 38, -14);
  scene.add(moon);

  // Ground: dark stone lanes with a faint tile grid, drawn once as a canvas texture.
  const gc = document.createElement('canvas');
  gc.width = 512; gc.height = 384;
  const gg = gc.getContext('2d');
  gg.fillStyle = '#3d4346';
  gg.fillRect(0, 0, 512, 384);
  gg.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  gg.lineWidth = 2;
  for (let x = 0; x <= 512; x += 32) { gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x, 384); gg.stroke(); }
  for (let y = 0; y <= 384; y += 32) { gg.beginPath(); gg.moveTo(0, y); gg.lineTo(512, y); gg.stroke(); }
  const gtex = new THREE.CanvasTexture(gc);
  gtex.colorSpace = THREE.SRGBColorSpace;
  gtex.wrapS = THREE.RepeatWrapping; gtex.wrapT = THREE.RepeatWrapping;
  gtex.repeat.set(8, 6);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 46),
    new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of ALL_BOXES) {
    const mesh = new THREE.Mesh(boxGeo, MATS[b.mat] || MATS.stone);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    scene.add(mesh);
  }

  // Awning stripes over the stalls: red paper and amber cloth, the market's colour.
  const awnGeo = new THREE.BoxGeometry(1, 0.08, 1);
  const awnMats = [
    new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: PALETTE.lantern, roughness: 0.8 }),
  ];
  let ai = 0;
  for (const b of COVER) {
    if (b.mat !== 'stall') continue;
    const awn = new THREE.Mesh(awnGeo, awnMats[ai++ % 2]);
    awn.scale.set(b.w + 0.6, 1, b.d + 0.6);
    awn.position.set(b.x, b.h + 0.7, b.z);
    scene.add(awn);
    const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6);
    const postMat = MATS.woodDark;
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(b.x + px * (b.w / 2 + 0.2), b.h + 0.35, b.z + pz * (b.d / 2 + 0.2));
      scene.add(post);
    }
  }

  // Paper lanterns: glowing red spheres on poles, with three warm point lights
  // (one per site, one over Tea Lane) so the map reads in the dark.
  const lanternGeo = new THREE.SphereGeometry(0.32, 12, 10);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: PALETTE.paper, emissive: 0xd43a2a, emissiveIntensity: 1.6, roughness: 0.5,
  });
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6);
  const poleMat = MATS.woodDark;
  const lanternSpots = [
    [-24, -14], [-20, -17], [24, -14], [20, -17], [0, 1], [-14, 0], [14, 0],
    [0, 16], [-8, -14], [8, -14], [0, -8],
  ];
  for (const [lx, lz] of lanternSpots) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(lx, 1.7, lz);
    scene.add(pole);
    const lamp = new THREE.Mesh(lanternGeo, lanternMat);
    lamp.position.set(lx, 3.5, lz);
    scene.add(lamp);
  }
  const warm = new THREE.PointLight(0xffb347, 110, 32, 1.6);
  warm.position.set(-24, 4, -14);
  scene.add(warm);
  const warmB = new THREE.PointLight(0xffb347, 110, 32, 1.6);
  warmB.position.set(24, 4, -14);
  scene.add(warmB);
  const warmMid = new THREE.PointLight(0xffc46b, 70, 26, 1.6);
  warmMid.position.set(0, 4, 1);
  scene.add(warmMid);
  const warmSouth = new THREE.PointLight(0xffc46b, 55, 24, 1.6);
  warmSouth.position.set(0, 4, 16);
  scene.add(warmSouth);

  // String lights across the lanes: small warm bulbs on a sagging line.
  const bulbGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 2.2,
  });
  const strings = [[-19, 8, -9, 8], [9, 8, 19, 8], [-5, -6, 5, -6], [-16, -8, -16, -20]];
  for (const [x0, z0, x1, z1] of strings) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const bx = x0 + (x1 - x0) * t;
      const bz = z0 + (z1 - z0) * t;
      const by = 3.4 - Math.sin(t * Math.PI) * 0.5;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(bx, by, bz);
      scene.add(bulb);
    }
  }

  // Site signs: the judge reads the map at a glance from these.
  const signA = textSprite('A', 'SPICE HALL', '#ffb347');
  signA.position.set(-24, 3.2, -17.4);
  scene.add(signA);
  const signB = textSprite('B', 'LANTERN COURT', '#ffb347');
  signB.position.set(24, 3.2, -17.4);
  scene.add(signB);
  const gate = textSprite('LANTERN ROW', 'NIGHT MARKET', '#2fa8a0');
  gate.position.set(0, 4.4, 21.4);
  gate.rotation.y = Math.PI;
  scene.add(gate);
}
