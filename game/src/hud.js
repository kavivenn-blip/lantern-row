// LANTERN ROW — the HUD. Every panel the top-10 screenshots share, read from the
// simulation once a frame: the minimap with sites and spotted enemies, the
// scoreboard with alive pips, the kill feed, the radio log, health/armour/cash and
// the weapon panel. The DOM is updated only when a value changes, so the HUD
// costs nothing when the game is quiet.
import { MAP, WALLS, COVER, SITES, zoneAt } from './world.js';
import { WEAPONS, GRENADES, GEAR } from './weapons.js';

const fmtTime = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const el = {
    minimap: $('minimap'), location: $('location'),
    scoreEmber: $('score-ember-pips'), scoreLantern: $('score-lantern-pips'),
    timer: $('timer'), roundLabel: $('round-label'), phaseLabel: $('phase-label'),
    planLine: $('plan-line'),
    killfeed: $('killfeed'), radio: $('radio'),
    health: $('health'), armor: $('armor'), cash: $('cash'), objective: $('objective'),
    weaponName: $('weapon-name'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    slots: $('slots'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    headshot: $('headshot'), banner: $('banner'), bannerText: $('banner-text'),
    bannerSub: $('banner-sub'), channel: $('channel'), channelFill: $('channel-fill'),
    channelLabel: $('channel-label'), damage: $('damage'),
    start: $('overlay-start'), buy: $('overlay-buy'), end: $('overlay-end'),
    buyCash: $('buy-cash'), buyItems: $('buy-items'),
    endTitle: $('end-title'), endScore: $('end-score'), endSub: $('end-sub'),
    spectate: $('spectate'),
  };
  const mctx = el.minimap.getContext('2d');
  const MW = el.minimap.width, MH = el.minimap.height;
  const scale = Math.min((MW - 12) / (MAP.maxX - MAP.minX), (MH - 12) / (MAP.maxZ - MAP.minZ));
  const ox = (MW - (MAP.maxX - MAP.minX) * scale) / 2;
  const oy = (MH - (MAP.maxZ - MAP.minZ) * scale) / 2;
  const mx = (x) => ox + (x - MAP.minX) * scale;
  const mz = (z) => oy + (z - MAP.minZ) * scale;

  const cache = {};
  function setText(node, key, value) {
    if (cache[key] !== value) { cache[key] = value; node.textContent = value; }
  }
  function setHtml(node, key, value) {
    if (cache[key] !== value) { cache[key] = value; node.innerHTML = value; }
  }

  function drawMinimap(sim) {
    const g = mctx;
    g.clearRect(0, 0, MW, MH);
    g.fillStyle = 'rgba(8, 20, 24, 0.85)';
    g.fillRect(0, 0, MW, MH);
    g.fillStyle = '#5a5348';
    for (const w of WALLS) {
      g.fillRect(mx(w.x - w.w / 2), mz(w.z - w.d / 2), w.w * scale, w.d * scale);
    }
    g.fillStyle = '#7a7268';
    for (const w of COVER) {
      g.fillRect(mx(w.x - w.w / 2), mz(w.z - w.d / 2), w.w * scale, w.d * scale);
    }
    for (const id of ['A', 'B']) {
      const s = SITES[id];
      const planted = sim.bomb.planted && sim.bomb.site === id;
      g.fillStyle = planted ? '#ff5a3c' : '#ffb347';
      g.fillRect(mx(s.x) - 8, mz(s.z) - 8, 16, 16);
      g.fillStyle = '#0b1e26';
      g.font = 'bold 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(id, mx(s.x), mz(s.z) + 0.5);
    }
    if (sim.bomb.dropped) {
      g.fillStyle = '#ff5a3c';
      g.beginPath();
      g.arc(mx(sim.bomb.dropX), mz(sim.bomb.dropZ), 4, 0, Math.PI * 2);
      g.fill();
    }
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const isPlayer = a.id === 0;
      const spotted = a.team !== 'ember' ? sim.spotted.includes(a) : true;
      if (!spotted) continue;
      const x = mx(a.pos.x), y = mz(a.pos.z);
      if (isPlayer) {
        g.fillStyle = '#ffffff';
        g.save();
        g.translate(x, y);
        g.rotate(-a.yaw); // canvas north is up; yaw 0 faces north
        g.beginPath();
        g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath();
        g.fill();
        g.restore();
      } else {
        g.fillStyle = a.team === 'ember' ? '#ff7a2a' : '#2fa8a0';
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.fill();
        if (a.hasBomb) {
          g.strokeStyle = '#ff5a3c';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(x, y, 5.5, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
  }

  let hitT = null;
  let damageT = null;

  const api = {
    update(sim, player) {
      drawMinimap(sim);
      setText(el.location, 'loc', zoneAt(player.pos.x, player.pos.z));
      const emberAlive = sim.agents.filter((a) => a.team === 'ember' && a.alive).length;
      const lanternAlive = sim.agents.filter((a) => a.team === 'lantern' && a.alive).length;
      setText(el.scoreEmber, 'se', `${'●'.repeat(emberAlive)}${'○'.repeat(5 - emberAlive)} ${sim.wins.ember}`);
      setText(el.scoreLantern, 'sl', `${sim.wins.lantern} ${'●'.repeat(lanternAlive)}${'○'.repeat(5 - lanternAlive)}`);
      setText(el.timer, 'timer', fmtTime(sim.phaseT));
      setText(el.roundLabel, 'round', `ROUND ${sim.round} OF 13`);
      const phase = sim.phase === 'buy' ? 'BUY PHASE' : sim.phase === 'live'
        ? (sim.bomb.planted ? `CHARGE LIVE · ${Math.ceil(sim.bomb.timer)}S` : 'LIVE')
        : sim.phase === 'roundEnd' ? 'ROUND OVER' : 'MATCH OVER';
      setText(el.phaseLabel, 'phase', phase);
      setText(el.planLine, 'plan', `PLAN: ${sim.plan} — YOU: ${player.aiRole || 'ENTRY'}`);
      setText(el.health, 'hp', String(Math.max(0, Math.ceil(player.hp))));
      setText(el.armor, 'ar', `${Math.ceil(player.armor)}${player.helmet ? ' +H' : ''}`);
      setText(el.cash, 'cash', `$${player.money.toLocaleString('en-US')}`);
      const obj = !player.alive ? 'You are down — spectating a teammate'
        : sim.bomb.planted ? (player.team === 'ember' ? 'Hold the site until the charge blows' : 'Retake the site and defuse the charge')
        : player.hasBomb ? 'You carry the charge — plant at A or B'
        : sim.phase === 'buy' ? 'Buy phase — press B for the buy menu'
        : 'Plant the charge at A or B, or eliminate the Lantern Watch';
      setText(el.objective, 'obj', obj);
      const def = WEAPONS[player.weapon];
      setText(el.weaponName, 'wn', def.name);
      setText(el.ammoMag, 'mag', def.kind === 'melee' ? '—' : String(player.mags[player.weapon]));
      setText(el.ammoReserve, 'res', def.kind === 'melee' ? '' : `/ ${player.reserves[player.weapon]}`);
      const slots = [
        `1 ${WEAPONS[player.loadout.slots[1]].name}`,
        `2 ${WEAPONS.pike.name}`,
        '3 Blade',
        `4 Frag ${player.grenades.frag}`,
        `5 Smoke ${player.grenades.smoke}`,
        `6 Flash ${player.grenades.flash}`,
      ].join(' · ');
      setText(el.slots, 'slots', slots);
      // Crosshair grows with spread: still is tight, moving is wide.
      const spread = 4 + player.bloom * 220 + (player.moving ? 7 : 0) + (player.crouched ? -2 : 0);
      el.crosshair.style.setProperty('--sp', `${Math.max(3, spread).toFixed(1)}px`);
      el.crosshair.classList.toggle('scoped', !!player.scoped);
      // Kill feed, newest first.
      setHtml(el.killfeed, 'kf', sim.killfeed.map((k) =>
        `<div class="kf"><span class="kf-killer">${k.killer}</span> <span class="kf-w">${k.weapon}${k.head ? ' · HS' : ''}</span> <span class="kf-victim">${k.victim}</span></div>`).join(''));
      // Radio log, newest first, with the speaker's role.
      setHtml(el.radio, 'radio', sim.radio.map((r) =>
        `<div class="rl"><span class="rl-name">${r.name}</span> <span class="rl-role">${r.role}</span> ${r.text}</div>`).join(''));
      if (sim.banner && sim.bannerT > 0) {
        el.banner.hidden = false;
        setText(el.bannerText, 'bt', sim.banner.text);
        setText(el.bannerSub, 'bs', sim.banner.sub);
      } else {
        el.banner.hidden = true;
      }
      el.spectate.hidden = player.alive;
      if (!player.alive) {
        const mate = sim.agents.find((a) => a.team === 'ember' && a.alive);
        setText(el.spectate, 'spec', mate ? `SPECTATING ${mate.name.toUpperCase()}` : 'NO TEAMMATES LEFT');
      }
    },
    flashHit(head) {
      el.hitmarker.classList.add('on');
      if (head) { el.hitmarker.classList.add('head'); el.headshot.hidden = false; }
      clearTimeout(hitT);
      hitT = setTimeout(() => {
        el.hitmarker.classList.remove('on', 'head');
        el.headshot.hidden = true;
      }, 110);
    },
    damageFlash() {
      el.damage.classList.add('on');
      clearTimeout(damageT);
      damageT = setTimeout(() => el.damage.classList.remove('on'), 180);
    },
    setChannel(label, progress) {
      el.channel.hidden = false;
      el.channelLabel.textContent = label;
      el.channelFill.style.width = `${Math.round(progress * 100)}%`;
    },
    clearChannel() { el.channel.hidden = true; },
    showStart() { el.start.hidden = false; el.buy.hidden = true; el.end.hidden = true; },
    hideStart() { el.start.hidden = true; },
    showBuy(cash) {
      el.buy.hidden = false;
      el.buyCash.textContent = `$${cash.toLocaleString('en-US')}`;
    },
    hideBuy() { el.buy.hidden = true; },
    showEnd(won, score, sub) {
      el.end.hidden = false;
      el.endTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
      el.endScore.textContent = score;
      el.endSub.textContent = sub;
    },
    buildBuy(buyFn) {
      const items = [
        { id: 'kestrel', name: 'Kestrel AR', price: WEAPONS.kestrel.price, desc: 'Auto rifle · 33 dmg · 30 rounds' },
        { id: 'wren', name: 'Wren SMG', price: WEAPONS.wren.price, desc: 'Fast SMG · 24 dmg · 28 rounds' },
        { id: 'harrier', name: 'Harrier DMR', price: WEAPONS.harrier.price, desc: 'Scoped marksman · 85 dmg · 10 rounds' },
        { id: 'gavel', name: 'Gavel Shotgun', price: WEAPONS.gavel.price, desc: 'Pump · 8 pellets · close range' },
        { id: 'armor', name: 'Kevlar Vest', price: GEAR.armor.price, desc: '+50 armour' },
        { id: 'helmet', name: 'Helmet', price: GEAR.helmet.price, desc: 'Halves headshot damage' },
        { id: 'frag', name: 'Frag Grenade', price: GRENADES.frag.price, desc: '95 damage in 5.5 m' },
        { id: 'smoke', name: 'Smoke Grenade', price: GRENADES.smoke.price, desc: 'Blocks sight for 14 s' },
        { id: 'flash', name: 'Flash Grenade', price: GRENADES.flash.price, desc: 'Blinds anyone facing it' },
      ];
      el.buyItems.innerHTML = items.map((it) =>
        `<button type="button" class="buy-item" data-id="${it.id}">
          <span class="buy-name">${it.name}</span>
          <span class="buy-desc">${it.desc}</span>
          <span class="buy-price">$${it.price.toLocaleString('en-US')}</span>
        </button>`).join('');
      el.buyItems.querySelectorAll('.buy-item').forEach((btn) => {
        btn.addEventListener('click', () => buyFn(btn.dataset.id));
      });
    },
  };

  el.start.querySelector('#play').addEventListener('click', () => callbacks.onPlay());
  el.end.querySelector('#again').addEventListener('click', () => callbacks.onRestart());
  return api;
}
