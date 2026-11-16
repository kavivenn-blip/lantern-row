// LANTERN ROW — the simulation. One state object, one fixed step of 1/60s, kept
// apart from rendering: the renderer only draws what the sim says. Shooting is a
// ray against walls and body boxes (headshots pay four times), the bomb is planted
// and defused on a channel, and every round pays out money the buy menu spends.
// The sim never allocates in its hot loop: tracers and sparks come from the pool.
import * as THREE from 'three';
import { WEAPONS, GRENADES, freshLoadout } from './weapons.js';
import { SPAWNS, SITES, rayHit, losBlocked, zoneAt, inSite } from './world.js';

const STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 12;
const BOMB_TIME = 40;
const PLANT_TIME = 3.5;
const MAX_ROUNDS = 13;
const WIN_ROUNDS = 7;
const EYE = 1.62;

const PLANS = ['SPLIT A', 'RUSH B', 'FAKE A', 'MID PUSH'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _hit = new THREE.Vector3();

export function createSim(fx, audio) {
  const random = mulberry32(20261116);
  const sim = {
    fx, audio,
    phase: 'buy', // buy | live | roundEnd | matchEnd
    phaseT: BUY_TIME,
    time: 0, // match clock, seconds
    round: 1,
    wins: { ember: 0, lantern: 0 },
    plan: 'SPLIT A',
    planSite: 'A',
    bomb: { planted: false, site: null, timer: 0, x: 0, z: 0, beepT: 0 },
    agents: [],
    killfeed: [],
    radio: [],
    hearings: [],
    projectiles: [],
    spotted: [], // enemy agents a teammate saw recently, for the minimap
    banner: null,
    bannerT: 0,
    lastWinner: null,
    lastReason: '',
    seed: 1,
    onPlayerHit: null, // main.js hooks the hitmarker here
  };

  function makeAgent(id, team, isBot) {
    const loadout = freshLoadout();
    return {
      id, team, isBot,
      name: isBot ? 'Bot' : 'You',
      pos: new THREE.Vector3(),
      yaw: 0, pitch: 0, eyeH: EYE,
      hp: 100, armor: 0, helmet: false, alive: true,
      moving: false, crouched: false,
      loadout,
      weapon: 'kestrel',
      mags: { ...loadout.mags },
      reserves: { ...loadout.reserves },
      grenades: { ...loadout.grenades },
      kills: 0, deaths: 0, money: 800,
      hasBomb: false,
      fireT: 0, reloadT: 0, bloom: 0, flashT: 0, recoilPitch: 0,
      mesh: null, ai: null,
    };
  }
  for (let i = 0; i < 10; i++) {
    sim.agents.push(makeAgent(i, i < 5 ? 'ember' : 'lantern', i !== 0));
  }
  const player = sim.agents[0];

  function addRadio(name, role, text) {
    sim.radio.unshift({ name, role, text, t: sim.time });
    if (sim.radio.length > 4) sim.radio.length = 4;
    audio.radio();
  }
  function addKill(killer, weaponId, victim, head) {
    sim.killfeed.unshift({ killer, weapon: WEAPONS[weaponId].name, victim, head, t: sim.time });
    if (sim.killfeed.length > 5) sim.killfeed.length = 5;
  }
  function hear(x, z, kind, team) {
    sim.hearings.push({ x, z, kind, team, age: 0 });
  }
  function showBanner(text, sub, t = 3) {
    sim.banner = { text, sub };
    sim.bannerT = t;
  }

  // ---- shooting ----

  // Ray against every enemy body: returns the nearest agent hit and where.
  function rayAgents(ox, oy, oz, dx, dy, dz, maxDist, shooter) {
    let best = null;
    let bestDist = maxDist;
    let bestHead = false;
    for (const a of sim.agents) {
      if (!a.alive || a === shooter || a.team === shooter.team) continue;
      // Body box: 0.6 wide, 1.5 tall. Head box: 0.34 wide at 1.55..1.85.
      for (let part = 0; part < 2; part++) {
        const hw = part === 0 ? 0.3 : 0.17;
        const y0 = part === 0 ? 0 : 1.55;
        const y1 = part === 0 ? 1.5 : 1.85;
        const t = rayBox(ox, oy, oz, dx, dy, dz,
          a.pos.x - hw, y0, a.pos.z - hw, a.pos.x + hw, y1, a.pos.z + hw);
        if (t >= 0 && t < bestDist) { best = a; bestDist = t; bestHead = part === 1; }
      }
    }
    return { agent: best, dist: bestDist, head: bestHead };
  }

  function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    let t0 = 0, t1 = Infinity;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < lo[a] || o[a] > hi[a]) return -1;
      } else {
        let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a];
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return -1;
      }
    }
    return t0;
  }

  function damage(victim, amount, head, shooter, weaponId) {
    if (!victim.alive) return;
    let dmg = amount;
    if (head && victim.helmet) dmg *= 0.5; // a helmet halves a headshot
    let absorbed = 0;
    if (victim.armor > 0) {
      absorbed = Math.min(victim.armor, dmg * 0.5);
      victim.armor -= absorbed;
      dmg -= absorbed;
    }
    victim.hp -= dmg;
    if (victim === player) audio.hurt();
    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.alive = false;
      victim.deaths += 1;
      if (shooter) {
        shooter.kills += 1;
        shooter.money += 300;
      }
      addKill(shooter ? shooter.name : '—', weaponId, victim.name, head);
      addRadio(victim.name, victim.ai ? victim.ai.role : 'player', `Down at ${zoneAt(victim.pos.x, victim.pos.z)}`);
      if (victim.mesh) {
        victim.mesh.group.rotation.x = -Math.PI / 2;
        victim.mesh.group.position.y = 0.25;
      }
      if (victim.hasBomb) {
        victim.hasBomb = false;
        // The bomb drops where its carrier fell; the next attacker to walk
        // over it picks it up.
        sim.bomb.dropX = victim.pos.x;
        sim.bomb.dropZ = victim.pos.z;
        sim.bomb.dropped = true;
      }
      checkRoundEnd();
    }
  }

  // One shot along a direction: wall first, then agents. Shared by player and bots.
  function resolveShot(shooter, ox, oy, oz, dx, dy, dz, def, weaponId) {
    const wall = rayHit(ox, oy, oz, dx, dy, dz, def.range);
    const wallDist = wall.box ? wall.dist : def.range;
    const hit = rayAgents(ox, oy, oz, dx, dy, dz, wallDist, shooter);
    const end = _hit;
    if (hit.agent) {
      end.set(ox + dx * hit.dist, oy + dy * hit.dist, oz + dz * hit.dist);
      const falloff = Math.max(0.5, 1 - (hit.dist / def.range) * 0.5);
      let dmg = def.damage * falloff;
      if (hit.head) dmg *= def.headMult;
      damage(hit.agent, dmg, hit.head, shooter, weaponId);
      if (shooter === player) {
        audio.hit(hit.head);
        if (sim.onPlayerHit) sim.onPlayerHit(hit.head);
      }
    } else {
      end.set(ox + dx * wallDist, oy + dy * wallDist, oz + dz * wallDist);
      if (wall.box) fx.spark(end);
    }
    _eye.set(ox, oy, oz);
    fx.tracer(_eye, end, def.tracer);
    hear(ox, oz, 'shot', shooter.team);
  }

  // The player fires along the camera direction, with spread and recoil bloom.
  function playerShoot() {
    if (sim.phase !== 'live' || !player.alive) return;
    if (player.fireT > 0 || player.reloadT > 0) return;
    const def = WEAPONS[player.weapon];
    if (def.kind === 'melee') { melee(player); return; }
    if (player.mags[player.weapon] <= 0) { audio.dry(); startReload(player); return; }
    player.fireT = 60 / def.rpm;
    player.mags[player.weapon] -= 1;
    const spread = (def.spread + (player.moving ? def.moveSpread : 0) +
      (player.crouched ? -def.spread * 0.3 : 0) + player.bloom);
    player.bloom = Math.min(0.05, player.bloom + def.recoil);
    player.recoilPitch = Math.min(0.09, player.recoilPitch + def.kick);
    const pellets = def.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      _dir.set(
        (Math.random() - 0.5) * 2 * spread - Math.sin(player.yaw) * Math.cos(player.pitch),
        Math.sin(player.pitch) + (Math.random() - 0.5) * 2 * spread,
        (Math.random() - 0.5) * 2 * spread - Math.cos(player.yaw) * Math.cos(player.pitch),
      ).normalize();
      resolveShot(player, player.pos.x, player.eyeH, player.pos.z, _dir.x, _dir.y, _dir.z, def, player.weapon);
    }
    audio.shot(player.weapon, 1);
  }

  function melee(agent) {
    agent.fireT = 60 / WEAPONS.knife.rpm;
    _dir.set(-Math.sin(agent.yaw) * Math.cos(agent.pitch), Math.sin(agent.pitch), -Math.cos(agent.yaw) * Math.cos(agent.pitch));
    const hit = rayAgents(agent.pos.x, agent.eyeH, agent.pos.z, _dir.x, _dir.y, _dir.z, WEAPONS.knife.range, agent);
    if (hit.agent) damage(hit.agent, WEAPONS.knife.damage, false, agent, 'knife');
  }

  // A bot fires at a target it can see, with an aim error by skill.
  function shoot(shooter, target, err, preferHead, dist) {
    if (shooter.mags[shooter.weapon] <= 0) return;
    const def = WEAPONS[shooter.weapon];
    if (def.kind === 'melee') { melee(shooter); return; }
    shooter.mags[shooter.weapon] -= 1;
    shooter.fireT = 60 / def.rpm;
    const aimY = preferHead ? 1.7 : 1.2;
    const tx = target.pos.x + (Math.random() - 0.5) * err * dist;
    const ty = aimY + (Math.random() - 0.5) * err * dist;
    const tz = target.pos.z + (Math.random() - 0.5) * err * dist;
    const ox = shooter.pos.x, oy = shooter.eyeH, oz = shooter.pos.z;
    _dir.set(tx - ox, ty - oy, tz - oz).normalize();
    const pellets = def.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const jx = _dir.x + (Math.random() - 0.5) * def.spread * 2;
      const jy = _dir.y + (Math.random() - 0.5) * def.spread * 2;
      const jz = _dir.z + (Math.random() - 0.5) * def.spread * 2;
      const len = Math.hypot(jx, jy, jz) || 1;
      resolveShot(shooter, ox, oy, oz, jx / len, jy / len, jz / len, def, shooter.weapon);
    }
    const dPlayer = Math.hypot(ox - player.pos.x, oz - player.pos.z);
    if (dPlayer < 30) audio.shot(shooter.weapon, Math.max(0.15, 1 - dPlayer / 30));
  }

  function startReload(agent) {
    const def = WEAPONS[agent.weapon];
    if (agent.reloadT > 0 || agent.mags[agent.weapon] >= def.mag) return;
    if (agent.reserves[agent.weapon] <= 0) return;
    agent.reloadT = def.reload;
    if (agent === player) audio.reload();
  }

  function finishReload(agent) {
    const def = WEAPONS[agent.weapon];
    const need = def.mag - agent.mags[agent.weapon];
    const take = Math.min(need, agent.reserves[agent.weapon]);
    agent.mags[agent.weapon] += take;
    agent.reserves[agent.weapon] -= take;
  }

  // ---- grenades ----

  function throwGrenade(agent, kind, tx, tz) {
    if (agent.grenades[kind] <= 0) return false;
    agent.grenades[kind] -= 1;
    const dx = tx - agent.pos.x, dz = tz - agent.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    sim.projectiles.push({
      kind, x: agent.pos.x, y: agent.eyeH, z: agent.pos.z,
      vx: (dx / dist) * 11, vy: 5.5, vz: (dz / dist) * 11,
      t: kind === 'frag' ? 1.4 : 0.9, team: agent.team,
    });
    return true;
  }

  function explodeFrag(p) {
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > GRENADES.frag.radius) continue;
      if (losBlocked(p.x, p.z, a.pos.x, a.pos.z)) continue;
      damage(a, GRENADES.frag.damage * (1 - d / (GRENADES.frag.radius + 2)), false, null, 'frag');
    }
    fx.spark(_hit.set(p.x, 1, p.z));
    hear(p.x, p.z, 'shot', p.team);
  }

  function popFlash(p) {
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > GRENADES.flash.radius) continue;
      if (losBlocked(p.x, p.z, a.pos.x, a.pos.z)) continue;
      // Flashed only when the burst is in front of the agent's eyes.
      const dx = p.x - a.pos.x, dz = p.z - a.pos.z;
      const facing = (-Math.sin(a.yaw) * dx + -Math.cos(a.yaw) * dz) / (d || 1);
      if (facing > -0.2) a.flashT = Math.max(a.flashT, GRENADES.flash.duration * (1 - d / (GRENADES.flash.radius + 6)));
    }
  }

  // ---- bomb ----

  function finishPlant(agent) {
    // The charge can go down at either site — the site the planter is
    // actually standing on, not only the round's planned site.
    const site = inSite(agent.pos.x, agent.pos.z, SITES.A) ? SITES.A
      : inSite(agent.pos.x, agent.pos.z, SITES.B) ? SITES.B : null;
    if (!site) return;
    sim.bomb.planted = true;
    sim.bomb.site = site.id;
    sim.bomb.timer = BOMB_TIME;
    sim.bomb.x = agent.pos.x;
    sim.bomb.z = agent.pos.z;
    sim.bomb.dropped = false;
    showBanner('CHARGE PLANTED', `Site ${site.id} · ${BOMB_TIME} seconds on the fuse`, 3);
    addRadio(agent.name, agent.ai ? agent.ai.role : 'player', `Charge planted at ${site.name}`);
    for (const a of sim.agents) if (a.team === 'ember' && a.alive) a.money += 300;
    audio.plant();
  }

  function finishDefuse(agent) {
    if (!sim.bomb.planted) return;
    sim.bomb.planted = false;
    addRadio(agent.name, agent.ai ? agent.ai.role : 'player', 'Charge defused');
    for (const a of sim.agents) if (a.team === 'lantern' && a.alive) a.money += 300;
    endRound('lantern', 'Charge defused');
  }

  function explodeBomb() {
    sim.bomb.planted = false;
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - sim.bomb.x, a.pos.z - sim.bomb.z);
      if (d < 7) damage(a, 200, false, null, 'frag');
    }
    endRound('ember', 'Charge detonated');
  }

  // ---- rounds ----

  function checkRoundEnd() {
    if (sim.phase !== 'live') return;
    const emberAlive = sim.agents.some((a) => a.team === 'ember' && a.alive);
    const lanternAlive = sim.agents.some((a) => a.team === 'lantern' && a.alive);
    if (!emberAlive) endRound('lantern', 'Ember Crew eliminated');
    else if (!lanternAlive && !sim.bomb.planted) endRound('ember', 'Lantern Watch eliminated');
    else if (!lanternAlive && sim.bomb.planted) { /* defenders dead, bomb still ticks */ }
  }

  function endRound(winner, reason) {
    if (sim.phase !== 'live') return;
    sim.phase = 'roundEnd';
    sim.phaseT = 4;
    sim.lastWinner = winner;
    sim.lastReason = reason;
    sim.wins[winner] += 1;
    for (const a of sim.agents) {
      a.money += a.team === winner ? 3250 : 1900;
    }
    showBanner(winner === 'ember' ? 'ROUND WON' : 'ROUND LOST', reason, 4);
    audio.round(winner === 'ember');
    if (sim.wins[winner] >= WIN_ROUNDS || sim.round >= MAX_ROUNDS) {
      sim.phase = 'matchEnd';
      sim.phaseT = 0;
    }
  }

  function startRound() {
    const plan = PLANS[Math.floor(random() * PLANS.length)];
    sim.plan = plan;
    sim.planSite = plan === 'RUSH B' ? 'B' : 'A';
    sim.bomb = { planted: false, site: null, timer: 0, x: 0, z: 0, beepT: 0, dropped: false, dropX: 0, dropZ: 0 };
    sim.projectiles.length = 0;
    sim.hearings.length = 0;
    sim.spotted.length = 0;
    // Spawn: attackers south facing north, defenders north facing south.
    sim.agents.forEach((a, i) => {
      const spawns = SPAWNS[a.team];
      const s = spawns[i % 5];
      a.pos.set(s.x, 0, s.z);
      a.yaw = a.team === 'ember' ? 0 : Math.PI;
      a.pitch = 0;
      a.eyeH = EYE;
      a.hp = 100;
      a.alive = true;
      a.fireT = 0;
      a.reloadT = 0;
      a.bloom = 0;
      a.flashT = 0;
      a.moving = false;
      a.crouched = false;
      if (a.mesh) {
        a.mesh.group.visible = true;
        a.mesh.group.rotation.x = 0;
        a.mesh.group.position.y = 0;
      }
    });
    sim.phase = 'buy';
    sim.phaseT = BUY_TIME;
    sim.bots.reset(sim.round);
    sim.bots.assignPlan(plan);
    // The bomb goes to the player on odd rounds, to a bot on even ones.
    // NOTE: this must come AFTER bots.reset — reset clears hasBomb on every
    // bot, so assigning the carrier before it leaves even rounds with no
    // carrier at all and the charge can never be planted by the bots.
    const carrier = sim.round % 2 === 1 ? player : sim.agents[1 + Math.floor(random() * 4)];
    carrier.hasBomb = true;
    addRadio('Command', 'plan', `Plan: ${plan} — take ${sim.planSite === 'A' ? 'Spice Hall' : 'Lantern Court'}`);
  }

  function startMatch() {
    sim.round = 1;
    sim.wins = { ember: 0, lantern: 0 };
    for (const a of sim.agents) { a.money = 800; a.kills = 0; a.deaths = 0; }
    startRound();
  }

  // ---- fixed step ----

  function step(dt) {
    sim.time += dt;
    if (sim.bannerT > 0) sim.bannerT -= dt;
    for (let i = sim.hearings.length - 1; i >= 0; i--) {
      sim.hearings[i].age += dt;
      if (sim.hearings[i].age > 1.5) sim.hearings.splice(i, 1);
    }
    for (const a of sim.agents) {
      if (a.fireT > 0) a.fireT -= dt;
      if (a.flashT > 0) a.flashT -= dt;
      if (a.reloadT > 0) {
        a.reloadT -= dt;
        if (a.reloadT <= 0) finishReload(a);
      }
      a.bloom = Math.max(0, a.bloom - dt * 0.09);
      a.recoilPitch *= Math.max(0, 1 - dt * 6);
    }
    // A dropped charge is picked up by the next attacker who walks over it.
    if (sim.bomb.dropped) {
      for (const a of sim.agents) {
        if (a.team !== 'ember' || !a.alive || a.hasBomb) continue;
        if (Math.hypot(a.pos.x - sim.bomb.dropX, a.pos.z - sim.bomb.dropZ) < 1.2) {
          a.hasBomb = true;
          sim.bomb.dropped = false;
          addRadio(a.name, a.ai ? a.ai.role : 'player', 'Picked up the charge');
          break;
        }
      }
    }
    // Grenade projectiles: gravity, one bounce, then their effect.
    for (let i = sim.projectiles.length - 1; i >= 0; i--) {
      const p = sim.projectiles[i];
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.4) { p.y = 0.4; p.vy = Math.abs(p.vy) * 0.35; p.vx *= 0.7; p.vz *= 0.7; }
      p.t -= dt;
      if (p.t <= 0) {
        if (p.kind === 'frag') explodeFrag(p);
        else if (p.kind === 'smoke') fx.smoke(p.x, p.z, GRENADES.smoke.duration);
        else if (p.kind === 'flash') popFlash(p);
        sim.projectiles.splice(i, 1);
      }
    }
    // Bomb timer and its accelerating beeps.
    if (sim.bomb.planted) {
      sim.bomb.timer -= dt;
      sim.bomb.beepT -= dt;
      const interval = sim.bomb.timer < 10 ? 0.5 : 1;
      if (sim.bomb.beepT <= 0) {
        sim.bomb.beepT = interval;
        audio.beep(sim.bomb.timer < 10 ? 1400 : 1100);
      }
      if (sim.bomb.timer <= 0) explodeBomb();
    }
    // Spotted set for the minimap: enemies a living teammate can see right now.
    sim.spotted.length = 0;
    for (const a of sim.agents) {
      if (!a.alive) continue;
      for (const b of sim.agents) {
        if (b.team === a.team || !b.alive) continue;
        const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
        if (d < 40 && !losBlocked(a.pos.x, a.pos.z, b.pos.x, b.pos.z) &&
          !fx.smokeBetween(a.pos.x, a.pos.z, b.pos.x, b.pos.z) &&
          !sim.spotted.includes(b)) sim.spotted.push(b);
      }
    }
    if (sim.phase === 'buy') {
      sim.phaseT -= dt;
      if (sim.phaseT <= 0) { sim.phase = 'live'; sim.phaseT = ROUND_TIME; }
    } else if (sim.phase === 'live') {
      sim.phaseT -= dt;
      if (sim.phaseT <= 0) {
        if (sim.bomb.planted) { /* bomb timer decides */ }
        else endRound('lantern', 'Time expired — the charge was never planted');
      }
    } else if (sim.phase === 'roundEnd') {
      sim.phaseT -= dt;
      if (sim.phaseT <= 0) {
        sim.round += 1;
        startRound();
      }
    }
  }

  sim.player = player;
  sim.startMatch = startMatch;
  sim.startRound = startRound;
  sim.step = step;
  sim.playerShoot = playerShoot;
  sim.shoot = shoot;
  sim.startReload = startReload;
  sim.throwGrenade = throwGrenade;
  sim.finishPlant = finishPlant;
  sim.finishDefuse = finishDefuse;
  sim.addRadio = addRadio;
  sim.addKill = addKill;
  sim.hear = hear;
  sim.showBanner = showBanner;
  sim.endRound = endRound;
  sim.STEP = STEP;
  sim.ROUND_TIME = ROUND_TIME;
  sim.BUY_TIME = BUY_TIME;
  return sim;
}
