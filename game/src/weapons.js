// LANTERN ROW — weapons. One table owns every number: damage, fire rate, spread,
// recoil, price and sound. The buy menu, the bots and the shooting code all read it,
// so a balance change is one edit here. Headshots deal four times body damage.
export const WEAPONS = {
  kestrel: {
    id: 'kestrel', name: 'Kestrel AR', kind: 'rifle', price: 2700,
    damage: 33, headMult: 4, rpm: 600, auto: true, mag: 30, reserve: 90,
    spread: 0.011, moveSpread: 0.03, recoil: 0.011, kick: 0.006, range: 60,
    reload: 2.2, zoom: 1, tracer: 0xffc46b,
  },
  wren: {
    id: 'wren', name: 'Wren SMG', kind: 'smg', price: 1500,
    damage: 24, headMult: 4, rpm: 800, auto: true, mag: 28, reserve: 84,
    spread: 0.016, moveSpread: 0.036, recoil: 0.008, kick: 0.004, range: 34,
    reload: 1.9, zoom: 1, tracer: 0xffd27a,
  },
  harrier: {
    id: 'harrier', name: 'Harrier DMR', kind: 'dmr', price: 4200,
    damage: 85, headMult: 4, rpm: 90, auto: false, mag: 10, reserve: 30,
    spread: 0.002, moveSpread: 0.05, recoil: 0.05, kick: 0.02, range: 90,
    reload: 3.0, zoom: 2.2, tracer: 0xffe9a8,
  },
  gavel: {
    id: 'gavel', name: 'Gavel Shotgun', kind: 'shotgun', price: 2100,
    damage: 12, headMult: 4, rpm: 75, auto: false, mag: 6, reserve: 24,
    pellets: 8, spread: 0.05, moveSpread: 0.06, recoil: 0.045, kick: 0.018,
    range: 18, reload: 2.8, zoom: 1, tracer: 0xffb347,
  },
  pike: {
    id: 'pike', name: 'Pike-9 Pistol', kind: 'pistol', price: 300,
    damage: 26, headMult: 4, rpm: 360, auto: false, mag: 12, reserve: 48,
    spread: 0.014, moveSpread: 0.032, recoil: 0.012, kick: 0.005, range: 30,
    reload: 1.6, zoom: 1, tracer: 0xffe1a1,
  },
  knife: {
    id: 'knife', name: 'Blade', kind: 'melee', price: 0,
    damage: 40, headMult: 1, rpm: 90, auto: false, mag: Infinity, reserve: 0,
    spread: 0, moveSpread: 0, recoil: 0, kick: 0, range: 2.2,
    reload: 0, zoom: 1, tracer: 0xffffff,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag', price: 300, radius: 5.5, damage: 95 },
  smoke: { id: 'smoke', name: 'Smoke', price: 300, duration: 14 },
  flash: { id: 'flash', name: 'Flash', price: 200, duration: 2.6, radius: 22 },
};

export const GEAR = {
  armor: { id: 'armor', name: 'Kevlar Vest', price: 650, armor: 50 },
  helmet: { id: 'helmet', name: 'Helmet', price: 350 },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400 },
};

// A fresh loadout: every agent starts a round with the pistol and the knife.
export function freshLoadout() {
  return {
    slots: { 1: 'kestrel', 2: 'pike', 3: 'knife' },
    current: 1,
    mags: { kestrel: 30, wren: 28, harrier: 10, gavel: 6, pike: 12 },
    reserves: { kestrel: 90, wren: 84, harrier: 30, gavel: 24, pike: 48 },
    grenades: { frag: 0, smoke: 0, flash: 0 },
    grenadeSlot: 0,
    armor: 0,
    helmet: false,
    kit: false,
  };
}

// What a bot buys with its money, by round: pistol round, then SMG, then rifles
// once the economy allows, with armour when it can afford it. No random rolls.
export function botBuy(money, round) {
  const loadout = freshLoadout();
  let cash = money;
  const primary = round <= 1 ? 'pike' : round === 2 ? 'wren' : 'kestrel';
  if (primary !== 'pike' && cash >= WEAPONS[primary].price) {
    cash -= WEAPONS[primary].price;
    loadout.slots[1] = primary;
    loadout.current = 1;
  } else {
    loadout.slots[1] = 'pike';
    loadout.current = 1;
  }
  if (round >= 2 && cash >= GRENADES.smoke.price) {
    cash -= GRENADES.smoke.price;
    loadout.grenades.smoke = 1;
  }
  if (round >= 2 && cash >= GRENADES.frag.price) {
    cash -= GRENADES.frag.price;
    loadout.grenades.frag = 1;
  }
  if (cash >= GEAR.armor.price) {
    cash -= GEAR.armor.price;
    loadout.armor = 50;
  }
  if (cash >= GEAR.helmet.price) {
    cash -= GEAR.helmet.price;
    loadout.helmet = true;
  }
  return { loadout, cash };
}
