// LANTERN ROW — bots. Nine teammates and opponents with roles, a round plan and
// ears. Each bot walks the waypoint graph to its objective, holds angles, and
// fights in bursts; when it sees or hears something it says so on the radio, and
// the defenders rotate towards the sound. A bot never teleports and never knows
// what it cannot see or hear: its target is only what its last perception found.
import * as THREE from 'three';
import { WEAPONS, botBuy } from './weapons.js';
import { NODES, NEXT_HOP, nearestNode, losBlocked, zoneAt, inSite, SITES } from './world.js';

const VIEW_DIST = 42;
const VIEW_HALF_ANGLE = 1.05;
const PERCEIVE_EVERY = 0.15;
const WALK = 4.3;
const BOT_RADIUS = 0.35;

const NAMES = {
  ember: ['Vex', 'Rook', 'Ash', 'Flint', 'Cinder'],
  lantern: ['Kael', 'Ilya', 'Mara', 'Jax', 'Wren'],
};

const TEAM_COLOR = { ember: 0xff7a2a, lantern: 0x2fa8a0 };
const TEAM_DARK = { ember: 0x7a2a08, lantern: 0x0d4a46 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nameTexture(name, team) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.font = 'bold 28px system-ui, sans-serif';
  g.textAlign = 'center';
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = 6;
  g.fillStyle = team === 'ember' ? '#ffb37a' : '#8fe0d8';
  g.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSoldier(scene, agent) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[agent.team], roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: TEAM_DARK[agent.team], roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.8 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.4 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), torsoMat);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.68;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), darkMat);
  helmet.position.y = 1.86;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), darkMat);
  legL.position.set(-0.14, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), torsoMat);
  arm.position.set(0.2, 1.32, 0.28);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), gunMat);
  gun.position.set(0.2, 1.34, 0.32);
  group.add(torso, head, helmet, legL, legR, arm, gun);

  const plate = new THREE.Sprite(new THREE.SpriteMaterial({
    map: nameTexture(agent.name, agent.team), transparent: true, depthTest: true,
  }));
  plate.scale.set(1.6, 0.3, 1);
  plate.position.y = 2.2;
  group.add(plate);

  group.position.copy(agent.pos);
  scene.add(group);
  return { group, legL, legR, plate, walkPhase: 0 };
}

export function createBots(scene, sim) {
  const random = mulberry32(20261116);
  const bots = [];

  for (const team of ['ember', 'lantern']) {
    for (let i = 0; i < (team === 'ember' ? 4 : 5); i++) {
      const agent = sim.agents.find((a) => a.team === team && a.isBot && !a.mesh);
      if (!agent) continue;
      agent.name = NAMES[team][i];
      agent.mesh = buildSoldier(scene, agent);
      agent.ai = {
        skill: 0.6 + random() * 0.35,
        role: 'rifler',
        path: [],
        goal: null,
        holdNode: null,
        holdYaw: 0,
        perceiveT: random() * PERCEIVE_EVERY,
        target: null,
        lastSeen: null,
        reactionT: 0,
        burstLeft: 0,
        burstPause: 0,
        reloadT: 0,
        channelT: 0,
        channelKind: null,
        investigate: null,
        investigateT: 0,
        saidContact: false,
        strafeDir: 1,
        strafeT: 0,
        walkPhase: 0,
        smoked: false,
      };
      bots.push(agent);
    }
  }

  // The round plan: what the attackers try this round, and what each bot does.
  // The plan is shown in the HUD, so the player fights inside a visible team plan.
  function assignPlan(plan) {
    const attackers = bots.filter((b) => b.team === 'ember');
    const defenders = bots.filter((b) => b.team === 'lantern');
    const routes = {
      'SPLIT A': [
        ['fishS', 'fishM', 'fishN', 'siteA2', 'siteA'],
        ['fishS', 'fishM', 'fishN', 'siteA2', 'siteA'],
        ['teaS', 'teaM', 'lotus', 'siteA2', 'siteA'],
        ['teaS', 'teaM', 'teaN', 'arcadeN', 'northA', 'siteA'],
      ],
      'RUSH B': [
        ['silkS', 'silkM', 'silkN', 'siteB2', 'siteB'],
        ['silkS', 'silkM', 'silkN', 'siteB2', 'siteB'],
        ['silkS', 'silkM', 'silkN', 'siteB2', 'siteB'],
        ['teaS', 'teaM', 'paper', 'siteB2', 'siteB'],
      ],
      'FAKE A': [
        ['fishS', 'fishM', 'fishN', 'siteA2'],
        ['fishS', 'fishM', 'fishN', 'siteA2'],
        ['teaS', 'teaM', 'teaN', 'arcadeN'],
        ['teaS', 'teaM', 'teaN', 'arcadeN'],
      ],
      'MID PUSH': [
        ['teaS', 'teaM', 'teaN', 'arcadeN', 'northA', 'siteA'],
        ['teaS', 'teaM', 'teaN', 'arcadeN', 'northB', 'siteB'],
        ['fishS', 'fishM', 'fishN', 'siteA2', 'siteA'],
        ['silkS', 'silkM', 'silkN', 'siteB2', 'siteB'],
      ],
    };
    const roles = ['entry', 'support', 'entry', 'lurk'];
    const planRoutes = routes[plan] || routes['SPLIT A'];
    attackers.forEach((b, i) => {
      b.ai.role = roles[i] || 'rifler';
      b.ai.route = planRoutes[i % planRoutes.length].slice();
      b.ai.path = [];
      b.ai.goal = null;
      b.ai.holdNode = null;
    });
    const defSpots = [
      { node: 'siteA', yaw: Math.PI },
      { node: 'siteA2', yaw: Math.PI * 0.75 },
      { node: 'siteB', yaw: Math.PI },
      { node: 'siteB2', yaw: Math.PI * 0.25 },
      { node: 'teaM', yaw: Math.PI }, // mid defender watches the attackers' approach
    ];
    defenders.forEach((b, i) => {
      b.ai.role = i === 4 ? 'mid' : 'anchor';
      b.ai.holdNode = defSpots[i].node;
      b.ai.holdYaw = defSpots[i].yaw;
      b.ai.path = [];
      b.ai.goal = defSpots[i].node;
    });
    return plan;
  }

  function pathTo(bot, goalNode) {
    const from = nearestNode(bot.pos.x, bot.pos.z);
    const path = [];
    let cur = from;
    let guard = 0;
    while (cur !== goalNode && guard++ < 24) {
      cur = NEXT_HOP[cur][goalNode];
      path.push(cur);
    }
    return path;
  }

  function canSee(a, b) {
    if (!b.alive || a.flashT > 0) return false;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VIEW_DIST) return false;
    const ang = Math.atan2(-dx, -dz) - a.yaw;
    let diff = ang;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > VIEW_HALF_ANGLE) return false;
    if (losBlocked(a.pos.x, a.pos.z, b.pos.x, b.pos.z)) return false;
    if (sim.fx.smokeBetween(a.pos.x, a.pos.z, b.pos.x, b.pos.z)) return false;
    return true;
  }

  function nearestVisible(bot) {
    let best = null;
    let bestD = Infinity;
    for (const other of sim.agents) {
      if (other.team === bot.team || !other.alive) continue;
      const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
      if (d < bestD && canSee(bot, other)) { best = other; bestD = d; }
    }
    return best;
  }

  function say(bot, text) {
    sim.addRadio(bot.name, bot.ai.role, text);
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    bot.pos.x += (dx / dist) * step;
    bot.pos.z += (dz / dist) * step;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.moving = true;
    return dist < 0.8;
  }

  function followPath(bot, dt) {
    if (!bot.ai.path.length) return true;
    const node = NODES[bot.ai.path[0]];
    if (moveToward(bot, node.x, node.z, dt, WALK)) bot.ai.path.shift();
    return bot.ai.path.length === 0;
  }

  function updateBot(bot, dt) {
    const ai = bot.ai;
    if (!bot.alive) return;
    bot.moving = false;
    if (bot.flashT > 0) {
      bot.yaw += dt * 1.2;
      return;
    }
    // Reloading runs on the simulation clock, never on a timer: a reload that
    // starts in a round finishes in the same round, even headless.
    if (ai.reloadT > 0) {
      ai.reloadT -= dt;
      if (ai.reloadT <= 0) {
        const wdef = WEAPONS[bot.weapon];
        const need = wdef.mag - bot.mags[bot.weapon];
        const take = Math.min(need, bot.reserves[bot.weapon]);
        bot.mags[bot.weapon] += take;
        bot.reserves[bot.weapon] -= take;
      }
    }
    // Perception, staggered: a bot re-checks what it can see six times a second.
    ai.perceiveT -= dt;
    if (ai.perceiveT <= 0) {
      ai.perceiveT = PERCEIVE_EVERY;
      const seen = nearestVisible(bot);
      if (seen) {
        if (ai.target !== seen) {
          ai.target = seen;
          ai.lastSeen = { x: seen.pos.x, z: seen.pos.z };
          ai.reactionT = 0.35 + (1 - ai.skill) * 0.6;
          if (!ai.saidContact) {
            ai.saidContact = true;
            say(bot, `Contact at ${zoneAt(seen.pos.x, seen.pos.z)}`);
            sim.hear(bot.pos.x, bot.pos.z, 'contact', bot.team);
          }
        } else {
          ai.lastSeen = { x: seen.pos.x, z: seen.pos.z };
        }
      } else if (ai.target) {
        // Lost sight: keep the last known position for a short hunt.
        ai.target = null;
        ai.saidContact = false;
      }
    }
    // Hearing: a sound on the radio bus pulls defenders towards it.
    if (ai.investigate && sim.phase === 'live') {
      ai.investigateT -= dt;
      if (ai.investigateT <= 0) ai.investigate = null;
    }
    for (let i = sim.hearings.length - 1; i >= 0; i--) {
      const h = sim.hearings[i];
      if (h.team === bot.team) continue;
      const d = Math.hypot(h.x - bot.pos.x, h.z - bot.pos.z);
      const radius = h.kind === 'shot' ? 30 : h.kind === 'step' ? 9 : 40;
      if (d < radius && bot.team === 'lantern' && !ai.investigate) {
        ai.investigate = { x: h.x, z: h.z };
        ai.investigateT = 6;
        if (h.kind === 'shot') say(bot, `Heard shots, ${zoneAt(h.x, h.z)}`);
        else if (h.kind === 'step') say(bot, `Steps heard, ${zoneAt(h.x, h.z)}`);
        bot.ai.path = pathTo(bot, nearestNode(h.x, h.z));
      }
    }

    // Entry smoke: first contact in a lane — pop smoke between the push and
    // the enemy so the attackers cross open ground under cover instead of
    // trading in it. The carrier keeps moving; the route bots throw.
    if (bot.team === 'ember' && ai.target && bot.grenades.smoke > 0 && !ai.smoked && !bot.hasBomb) {
      ai.smoked = true;
      const t = ai.target;
      const d = Math.hypot(t.pos.x - bot.pos.x, t.pos.z - bot.pos.z) || 1;
      const throwD = Math.min(d * 0.6, 12);
      const tx = bot.pos.x + ((t.pos.x - bot.pos.x) / d) * throwD;
      const tz = bot.pos.z + ((t.pos.z - bot.pos.z) / d) * throwD;
      if (sim.throwGrenade(bot, 'smoke', tx, tz)) say(bot, 'Smoke out — pushing through');
    }

    // Planting and defusing channel the bot in place.
    if (ai.channelKind) {
      ai.channelT -= dt;
      if (ai.channelT <= 0) {
        if (ai.channelKind === 'plant') sim.finishPlant(bot);
        else if (ai.channelKind === 'defuse') sim.finishDefuse(bot);
        ai.channelKind = null;
      }
      return;
    }

    const bomb = sim.bomb;
    if (bomb.planted && bot.team === 'lantern') {
      // Retake: get to the planted site, then defuse.
      const site = bomb.site === 'A' ? SITES.A : SITES.B;
      const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
      if (d < 2.2) {
        ai.channelKind = 'defuse';
        ai.channelT = bot.loadout.kit ? 2.5 : 5;
        sim.audio.defuse();
        say(bot, `Defusing at ${site.name}`);
        return;
      }
      if (!ai.path.length) ai.path = pathTo(bot, bomb.site === 'A' ? 'siteA' : 'siteB');
      followPath(bot, dt);
      return;
    }
    if (bomb.planted && bot.team === 'ember') {
      // Post-plant: hold the site and watch its entrances.
      if (!ai.holdNode) ai.holdNode = bomb.site === 'A' ? 'siteA2' : 'siteB2';
      if (!ai.path.length && nearestNode(bot.pos.x, bot.pos.z) !== ai.holdNode) {
        ai.path = pathTo(bot, ai.holdNode);
      }
      if (ai.path.length) { followPath(bot, dt); return; }
      bot.yaw += Math.sin(sim.time * 0.5 + bot.id) * dt * 0.4;
      return;
    }

    // The carrier plants when it reaches a site — even under fire, while
    // teammates cover. Planting beats duelling: a carrier that stops to
    // fight at the site entrance never gets the charge down.
    if (bot.hasBomb && bot.team === 'ember') {
      const site = inSite(bot.pos.x, bot.pos.z, SITES.A) ? SITES.A
        : inSite(bot.pos.x, bot.pos.z, SITES.B) ? SITES.B : null;
      if (site) {
        ai.channelKind = 'plant';
        ai.channelT = 3.5;
        sim.audio.plant();
        say(bot, `Planting the charge at ${site.name}`);
        return;
      }
    }

    // Combat: a visible target wins over the route.
    if (ai.target && ai.target.alive) {
      const t = ai.target;
      const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dx, -dz);
      let dyaw = wantYaw - bot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.yaw += Math.max(-5 * dt, Math.min(5 * dt, dyaw));
      ai.reactionT -= dt;
      // Strafe while fighting, so the bot is a moving target.
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { ai.strafeDir *= -1; ai.strafeT = 0.7 + random() * 0.8; }
      if (dist > 14) {
        moveToward(bot, t.pos.x, t.pos.z, dt, WALK * 0.7);
      } else if (dist < 5) {
        bot.pos.x += Math.cos(bot.yaw) * ai.strafeDir * WALK * 0.5 * dt;
        bot.pos.z += -Math.sin(bot.yaw) * ai.strafeDir * WALK * 0.5 * dt;
        bot.moving = true;
      } else {
        bot.pos.x += Math.cos(bot.yaw) * ai.strafeDir * WALK * 0.35 * dt;
        bot.pos.z += -Math.sin(bot.yaw) * ai.strafeDir * WALK * 0.35 * dt;
        bot.moving = true;
      }
      if (ai.reactionT <= 0 && Math.abs(dyaw) < 0.25) {
        fireBurst(bot, t, dist, dt);
      }
      return;
    }

    // Route: follow the plan's waypoints, then hold. A fake on A rotates to B
    // once the defenders have been pulled west.
    if (bot.team === 'ember') {
      if (ai.route && ai.route.length) {
        const next = ai.route[0];
        if (!ai.path.length) ai.path = pathTo(bot, next);
        if (followPath(bot, dt)) ai.route.shift();
        return;
      }
      if (sim.plan === 'FAKE A' && !ai.rotated) {
        ai.rotated = true;
        ai.route = ['fishN', 'fishM', 'teaM', 'paper', 'siteB2', 'siteB'];
        say(bot, 'Fake is on, rotating to B');
        return;
      }
      // Route done: hold near the site and watch.
      bot.yaw += Math.sin(sim.time * 0.4 + bot.id * 2) * dt * 0.5;
      return;
    }
    // Defenders: investigate, else hold the assigned spot.
    if (ai.investigate && ai.path.length) { followPath(bot, dt); return; }
    if (ai.holdNode && nearestNode(bot.pos.x, bot.pos.z) !== ai.holdNode) {
      if (!ai.path.length) ai.path = pathTo(bot, ai.holdNode);
      followPath(bot, dt);
      return;
    }
    bot.yaw = ai.holdYaw + Math.sin(sim.time * 0.35 + bot.id) * 0.35;
  }

  function fireBurst(bot, target, dist, dt) {
    const ai = bot.ai;
    const def = WEAPONS[bot.weapon];
    if (ai.reloadT > 0) return; // reload counts down in updateBot, on the sim clock
    if (ai.burstPause > 0) { ai.burstPause -= dt; return; }
    if (bot.mags[bot.weapon] <= 0) {
      if (ai.reloadT <= 0) ai.reloadT = def.reload;
      return;
    }
    if (ai.burstLeft <= 0) ai.burstLeft = 3 + Math.floor(random() * 3);
    ai.burstLeft -= 1;
    const err = (1 - ai.skill) * 0.11 + 0.02 + (bot.moving ? 0.02 : 0);
    const head = random() < 0.15;
    sim.shoot(bot, target, err, head, dist);
    if (ai.burstLeft <= 0) ai.burstPause = 0.7 + random() * 0.7;
  }

  function update(dt) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      updateBot(bot, dt);
      // Mesh follows the agent: walk-cycle legs, facing, fall on death.
      const m = bot.mesh;
      m.group.position.set(bot.pos.x, 0, bot.pos.z);
      m.group.rotation.y = bot.yaw;
      if (bot.moving) {
        m.walkPhase += dt * 9;
        m.legL.rotation.x = Math.sin(m.walkPhase) * 0.5;
        m.legR.rotation.x = -Math.sin(m.walkPhase) * 0.5;
      } else {
        m.legL.rotation.x = 0;
        m.legR.rotation.x = 0;
      }
      const d = Math.hypot(bot.pos.x - sim.agents[0].pos.x, bot.pos.z - sim.agents[0].pos.z);
      m.plate.visible = d < 30;
    }
  }

  function reset(round) {
    for (const bot of bots) {
      const buy = botBuy(bot.money, round);
      bot.loadout = buy.loadout;
      bot.money = buy.cash;
      bot.weapon = buy.loadout.slots[1];
      bot.mags = { ...buy.loadout.mags };
      bot.reserves = { ...buy.loadout.reserves };
      bot.grenades = { ...buy.loadout.grenades };
      bot.hp = 100;
      bot.armor = buy.loadout.armor;
      bot.helmet = buy.loadout.helmet;
      bot.alive = true;
      bot.hasBomb = false;
      bot.ai.target = null;
      bot.ai.channelKind = null;
      bot.ai.investigate = null;
      bot.ai.rotated = false;
      bot.ai.smoked = false;
      bot.ai.path = [];
      bot.ai.route = null;
      bot.ai.holdNode = null;
      bot.mesh.group.visible = true;
      bot.mesh.group.rotation.x = 0;
      bot.mesh.group.position.y = 0;
    }
  }

  return { bots, assignPlan, update, reset, canSee };
}
