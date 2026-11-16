// LANTERN ROW — boot and the game loop. The simulation runs at a fixed 60 Hz
// step, apart from rendering; this file owns the camera, the player's actions
// (buy, plant, defuse, grenades, reload, weapon switching) and the deterministic
// screenshot modes (?shot=cover|plant|retake|end) the maker uses for its shots.
import * as THREE from 'three';
import { buildScene, SITES, inSite, zoneAt } from './world.js';
import { createSim } from './sim.js';
import { createBots } from './bots.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { WEAPONS, GRENADES, GEAR } from './weapons.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);
buildScene(scene);

const fx = createFx(scene);
const audio = createAudio();
const sim = createSim(fx, audio);
const bots = createBots(scene, sim);
sim.bots = bots;
const playerCtl = createPlayer(scene);
camera.add(playerCtl.group); // the rifle view model rides on the camera

// The planted charge: a small blinking device with a floating timer, so the
// objective is visible in the world, not only in the HUD.
const bombGroup = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.3, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.4 }),
);
bombBody.position.y = 0.15;
const bombLight = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
);
bombLight.position.set(0, 0.36, 0);
bombGroup.add(bombBody, bombLight);
const bombCanvas = document.createElement('canvas');
bombCanvas.width = 256; bombCanvas.height = 64;
const bombCtx = bombCanvas.getContext('2d');
const bombTex = new THREE.CanvasTexture(bombCanvas);
bombTex.colorSpace = THREE.SRGBColorSpace;
const bombLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: bombTex, transparent: true, depthTest: false }));
bombLabel.scale.set(2.4, 0.6, 1);
bombLabel.position.y = 1.6;
bombGroup.add(bombLabel);
bombGroup.visible = false;
scene.add(bombGroup);
let lastBombSecs = -1;
function drawBombLabel(text) {
  bombCtx.clearRect(0, 0, 256, 64);
  bombCtx.fillStyle = 'rgba(8, 20, 24, 0.9)';
  bombCtx.fillRect(0, 0, 256, 64);
  bombCtx.strokeStyle = '#ff5a3c';
  bombCtx.lineWidth = 4;
  bombCtx.strokeRect(2, 2, 252, 60);
  bombCtx.fillStyle = '#ff5a3c';
  bombCtx.font = 'bold 34px system-ui, sans-serif';
  bombCtx.textAlign = 'center';
  bombCtx.fillText(text, 128, 44);
  bombTex.needsUpdate = true;
}
const input = createInput(renderer.domElement);
const player = sim.player;
player.aiRole = 'ENTRY';

// A handle for playtests and the maker's own checks: the live sim and player.
window.__lantern = { sim, player, step: fixedStep };

const hud = createHud({
  onPlay: () => {
    audio.ensure();
    input.lock();
    hud.hideStart();
    if (!matchStarted) { sim.startMatch(); matchStarted = true; }
  },
  onRestart: () => {
    hud.hideStart();
    input.lock();
    sim.startMatch();
    matchStarted = true;
    playerCtl.reset(0);
  },
});
hud.buildBuy(buyItem);
sim.onPlayerHit = (head) => hud.flashHit(head);

let lastHp = player.hp;
let lastRound = 1;
let channel = null; // { kind: 'plant'|'defuse', t: 0, dur: 3.5 }
let grenadeSel = 'frag';
let buyOpen = false;
let matchStarted = false;

function buyItem(id) {
  if (sim.phase !== 'buy' || !player.alive) return;
  const price = WEAPONS[id] ? WEAPONS[id].price : GRENADES[id] ? GRENADES[id].price : GEAR[id].price;
  if (player.money < price) return;
  player.money -= price;
  if (WEAPONS[id]) {
    player.loadout.slots[1] = id;
    player.weapon = id;
    player.mags[id] = WEAPONS[id].mag;
    player.reserves[id] = WEAPONS[id].reserve;
  } else if (id === 'armor') {
    player.armor = 50;
    player.loadout.armor = 50;
  } else if (id === 'helmet') {
    player.helmet = true;
    player.loadout.helmet = true;
  } else if (GRENADES[id]) {
    player.grenades[id] += 1;
    player.loadout.grenades[id] += 1;
  }
  hud.showBuy(player.money);
}

function aimPoint(dist) {
  const dx = -Math.sin(player.yaw) * Math.cos(player.pitch);
  const dy = Math.sin(player.pitch);
  const dz = -Math.cos(player.yaw) * Math.cos(player.pitch);
  return { x: player.pos.x + dx * dist, z: player.pos.z + dz * dist };
}

function handleKeys() {
  if (input.wasPressed('KeyR')) sim.startReload(player);
  if (input.wasPressed('Digit1')) { player.weapon = player.loadout.slots[1]; player.reloadT = 0; }
  if (input.wasPressed('Digit2')) { player.weapon = 'pike'; player.reloadT = 0; }
  if (input.wasPressed('Digit3')) { player.weapon = 'knife'; player.reloadT = 0; }
  if (input.wasPressed('Digit4')) grenadeSel = 'frag';
  if (input.wasPressed('Digit5')) grenadeSel = 'smoke';
  if (input.wasPressed('Digit6')) grenadeSel = 'flash';
  if (input.wasPressed('KeyG')) {
    const p = aimPoint(14);
    if (sim.throwGrenade(player, grenadeSel, p.x, p.z)) {
      grenadeSel = player.grenades.frag > 0 ? 'frag'
        : player.grenades.smoke > 0 ? 'smoke' : 'flash';
    }
  }
  if (input.wasPressed('KeyB') && sim.phase === 'buy') {
    if (buyOpen) { hud.hideBuy(); buyOpen = false; input.lock(); }
    else { hud.showBuy(player.money); buyOpen = true; input.unlock(); }
  }
  if (input.wasPressed('Escape') && buyOpen) { hud.hideBuy(); buyOpen = false; input.lock(); }
  playerCtl.state.scoped = input.scoping && player.weapon === 'harrier';
  player.scoped = playerCtl.state.scoped;
}

function handleChannel(dt) {
  const holdingE = input.keys.KeyE;
  if (!holdingE || sim.phase !== 'live' || !player.alive) {
    if (channel) { channel = null; hud.clearChannel(); }
    return;
  }
  if (player.hasBomb) {
    const site = inSite(player.pos.x, player.pos.z, SITES.A) ? SITES.A
      : inSite(player.pos.x, player.pos.z, SITES.B) ? SITES.B : null;
    if (site) {
      if (!channel || channel.kind !== 'plant') channel = { kind: 'plant', t: 0, dur: 3.5 };
      channel.t += dt;
      hud.setChannel(`PLANTING THE CHARGE · SITE ${site.id}`, channel.t / channel.dur);
      if (channel.t >= channel.dur) {
        sim.finishPlant(player);
        player.hasBomb = false;
        channel = null;
        hud.clearChannel();
      }
      return;
    }
  }
  if (sim.bomb.planted) {
    const d = Math.hypot(player.pos.x - sim.bomb.x, player.pos.z - sim.bomb.z);
    if (d < 2.5) {
      if (!channel || channel.kind !== 'defuse') channel = { kind: 'defuse', t: 0, dur: player.loadout.kit ? 2.5 : 5 };
      channel.t += dt;
      hud.setChannel('DEFUSING THE CHARGE', channel.t / channel.dur);
      if (channel.t >= channel.dur) {
        sim.finishDefuse(player);
        channel = null;
        hud.clearChannel();
      }
      return;
    }
  }
  if (channel) { channel = null; hud.clearChannel(); }
}

function fixedStep(dt) {
  // In shot mode the staged frame freezes once it is ready: the screenshot
  // shows the composed moment, not the fight a second later.
  if (shot && window.__shotReady) return;
  if (sim.phase === 'buy' || sim.phase === 'live') {
    if (player.alive) {
      playerCtl.step(player, input, dt);
      if (input.firing) sim.playerShoot();
      handleKeys();
      handleChannel(dt);
      // Running footsteps carry: defenders hear them and rotate.
      if (player.moving && !player.crouched) {
        sim._stepNoise = (sim._stepNoise || 0) + dt;
        if (sim._stepNoise > 0.8) {
          sim._stepNoise = 0;
          sim.hear(player.pos.x, player.pos.z, 'step', 'ember');
        }
      }
    } else {
      input.clearPressed();
    }
    // Bots wait at spawn through the buy phase and move only once the round
    // is live; the player may already walk to a lane during the buy.
    if (sim.phase === 'live') bots.update(dt);
  }
  sim.step(dt);
  if (sim.round !== lastRound) {
    lastRound = sim.round;
    playerCtl.reset(0);
    channel = null;
    hud.clearChannel();
  }
  if (sim.phase === 'matchEnd' && !hud._endShown) {
    hud._endShown = true;
    const won = sim.wins.ember > sim.wins.lantern;
    hud.showEnd(won, `EMBER CREW ${sim.wins.ember} — ${sim.wins.lantern} LANTERN WATCH`,
      won ? 'The market is yours. First to 7 takes the match.' : 'The Lantern Watch held the market.');
  }
  if (sim.phase !== 'matchEnd') hud._endShown = false;
}

let last = performance.now();
let acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  // Twelve steps a frame lets the sim keep up on a slow machine instead of
  // falling behind real time; at 60 fps only one step runs anyway.
  while (acc >= sim.STEP && n < 12) {
    fixedStep(sim.STEP);
    acc -= sim.STEP;
    n++;
  }
  // Camera: first person alive, a teammate's shoulder when dead. In shot mode
  // the staged first-person view always wins, even if the player went down.
  if (player.alive || shot) {
    camera.position.set(player.pos.x, player.eyeH, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    const targetFov = player.scoped ? 32 : 70;
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
    playerCtl.updateView(camera, player.weapon, player.reloadT > 0, input.firing);
  } else {
    playerCtl.hideView();
    const mate = sim.agents.find((a) => a.team === 'ember' && a.alive);
    if (mate) {
      const bx = -Math.sin(mate.yaw), bz = -Math.cos(mate.yaw);
      camera.position.set(mate.pos.x - bx * 2.6, 2.4, mate.pos.z - bz * 2.6);
      camera.lookAt(mate.pos.x + bx * 4, 1.4, mate.pos.z + bz * 4);
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
  }
  if (player.hp < lastHp) hud.damageFlash();
  lastHp = player.hp;
  // The planted charge blinks in the world while its fuse runs down.
  if (sim.bomb.planted) {
    bombGroup.visible = true;
    bombGroup.position.set(sim.bomb.x, 0, sim.bomb.z);
    bombLight.material.color.setHex(Math.sin(sim.time * 8) > 0 ? 0xff2a1a : 0x550a06);
    const secs = Math.ceil(sim.bomb.timer);
    if (secs !== lastBombSecs) {
      lastBombSecs = secs;
      drawBombLabel(`CHARGE 0:${String(secs).padStart(2, '0')}`);
    }
  } else {
    bombGroup.visible = false;
    lastBombSecs = -1;
  }
  fx.update(dt);
  hud.update(sim, player);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- deterministic screenshot modes ----
// Each mode stages the real simulation (seeded) at a composed moment, then sets
// window.__shotReady so the screenshot script knows the frame is final.

function stepN(n) {
  for (let i = 0; i < n; i++) {
    bots.update(sim.STEP);
    sim.step(sim.STEP);
  }
}

function aimAt(x, z, y = 1.3) {
  const dx = x - player.pos.x, dz = z - player.pos.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.atan2(y - player.eyeH, Math.hypot(dx, dz)) + player.recoilPitch;
  playerCtl.state.yaw = player.yaw;
  playerCtl.state.pitch = player.pitch - player.recoilPitch;
}

function placePlayer(x, z) {
  player.pos.set(x, 0, z);
  player.eyeH = 1.62;
}

function runShot(name) {
  hud.hideStart();
  sim.startMatch();
  sim.phase = 'live';
  sim.phaseT = sim.ROUND_TIME;
  if (name === 'cover') {
    // Mid-round firefight down Tea Lane: the player stages safe at spawn while
    // the bots trade, then steps into the arcade with enemies in the open ahead.
    stepN(60 * 8);
    placePlayer(0, 14);
    const foes = sim.agents.filter((a) => a.team === 'lantern' && a.alive);
    if (foes[0]) { foes[0].pos.set(-5, 0, -5); foes[0].yaw = Math.PI; }
    if (foes[1]) { foes[1].pos.set(5, 0, -8); foes[1].yaw = Math.PI; }
    const mate = sim.agents.find((a) => a.team === 'ember' && a.isBot && a.alive);
    if (mate) { mate.pos.set(-3, 0, 10); mate.yaw = 0; }
    aimAt(-5, -5, 1.4);
    sim.playerShoot();
    sim.playerShoot();
  } else if (name === 'plant') {
    // The charge goes down at Spice Hall while teammates cover the lane.
    sim.plan = 'SPLIT A';
    sim.planSite = 'A';
    const carrier = sim.agents[1];
    carrier.pos.set(-24, 0, -14);
    carrier.hasBomb = true;
    player.hasBomb = false;
    stepN(60 * 6);
    placePlayer(-11, -9);
    sim.finishPlant(carrier);
    carrier.pos.set(-21, 0, -11); // step aside so the charge and its timer show
    aimAt(-24, -14, 1.3);
    sim.bomb.timer = 37;
    const guard = sim.agents.find((a) => a.team === 'lantern' && a.alive);
    if (guard) { guard.pos.set(-18, 0, -10); guard.yaw = Math.PI * 0.5; }
  } else if (name === 'retake') {
    // Defenders retake Lantern Court: bomb live, 32 seconds on the fuse.
    sim.plan = 'RUSH B';
    sim.planSite = 'B';
    const carrier = sim.agents[2];
    carrier.pos.set(24, 0, -14);
    carrier.hasBomb = true;
    sim.finishPlant(carrier);
    sim.bomb.timer = 32;
    stepN(60 * 4);
    placePlayer(9, -8);
    player.hasBomb = false;
    aimAt(24, -14, 1.3);
  } else if (name === 'end') {
    // Match point: the round is won and the banner is up over the market.
    placePlayer(-6, -4);
    stepN(60 * 20);
    if (sim.phase === 'live') sim.endRound('ember', 'Lantern Watch eliminated');
    aimAt(-16, -12, 1.4);
  }
  // The staged shot is first-person: the player stands at full health,
  // whatever the fight did during staging.
  if (!player.alive) { player.alive = true; }
  player.hp = 100;
  // In the cover the dead stay dead in the sim but out of the frame: the shot
  // shows a live fight, not a graveyard.
  if (name === 'cover') {
    for (const a of sim.agents) if (!a.alive && a.mesh) a.mesh.group.visible = false;
  }
  hud.update(sim, player);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

if (shot) {
  runShot(shot);
} else {
  hud.showStart();
  requestAnimationFrame(loop);
}
// In shot mode the loop still runs so tracers and smoke animate one frame.
if (shot) requestAnimationFrame(loop);

// Clicking the game re-locks the pointer after it was lost.
renderer.domElement.addEventListener('click', () => {
  if (!shot && !buyOpen && !input.locked) input.lock();
});
