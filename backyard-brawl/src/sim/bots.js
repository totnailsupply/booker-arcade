// Bots that drive the sim through the same { mx, my, dash } input a player
// makes. Shared by scripts/sim-run.mjs (node) and ?autoplay=1 (browser).
//
//   idle   never moves, picks the first card
//   kite   moves away from the weighted centroid of nearby enemies (bosses and
//          enemy shots count extra), steers off the fence, random cards
//   smart  kite + sidesteps Big Tom's charge lane and dashes through charges +
//          dashes when cornered + drifts to kibble when safe + scored cards
//          (BOTS.CARD_SCORE: weapon levels, a few new weapons, then stats)

import { BOTS, ARENA } from '../core/Constants.js';
import { Rng } from './Rng.js';
import { hypot } from './DetMath.js'; // engine-independent math (see DetMath.js)

const OUT = { mx: 0, my: 0, nearest: Infinity, crowd: 0, dash: false };

function kiteDir(world, { kibble = false, dodge = false } = {}) {
  const p = world.player;
  const R = BOTS.THREAT_RADIUS;
  let cx = 0;
  let cy = 0;
  let wsum = 0;
  let nearest = Infinity;
  let crowd = 0;
  let dash = false;
  const consider = (x, y, scale, radius) => {
    const dx = x - p.x;
    const dy = y - p.y;
    const d = hypot(dx, dy);
    if (d > radius) return;
    const w = scale / Math.max(d * d, 16);
    cx += x * w;
    cy += y * w;
    wsum += w;
  };
  let sideX = 0;
  let sideY = 0;
  for (const e of world.enemies) {
    const d = hypot(e.x - p.x, e.y - p.y) - e.r;
    if (d < nearest) nearest = d;
    if (d < BOTS.CROWD_RADIUS) crowd += 1;
    if (e.boss) {
      consider(e.x, e.y, BOTS.BOSS_WEIGHT, BOTS.BOSS_RADIUS + e.r);
      if (dodge && e.type === 'boss-cat' && (e.state === 'windup' || e.state === 'charge')) {
        // Distance from Booker to the charge line, and whether he is ahead of the boss
        const rx = p.x - e.x;
        const ry = p.y - e.y;
        const along = rx * e.dirX + ry * e.dirY;
        const perp = rx * -e.dirY + ry * e.dirX;
        if (along > -10 && Math.abs(perp) < BOTS.CHARGE_LANE + e.r) {
          // Big Tom aims at Booker, so at the wind-up perp is ~0 and its sign is
          // rounding noise: dead centre, sidestep toward the open middle of the yard.
          let side = perp;
          if (Math.abs(perp) < BOTS.LANE_TIE_PX) side = (ARENA.W / 2 - p.x) * -e.dirY + (ARENA.H / 2 - p.y) * e.dirX;
          const s = side >= 0 ? 1 : -1;
          sideX += -e.dirY * s * 3;
          sideY += e.dirX * s * 3;
          if (e.state === 'charge' && along < BOTS.CHARGE_DASH_DIST) dash = true;
        }
      }
    } else {
      consider(e.x, e.y, e.elite ? 2 : 1, R);
    }
  }
  for (const t of world.telegraphs) consider(t.x, t.y, t.boss ? 3 : 0.5, R);
  for (const h of world.hostiles) consider(h.x, h.y, BOTS.HOSTILE_WEIGHT, BOTS.HOSTILE_RADIUS);

  let mx = 0;
  let my = 0;
  if (wsum > 0) {
    cx /= wsum;
    cy /= wsum;
    mx = p.x - cx;
    my = p.y - cy;
    const l = hypot(mx, my) || 1;
    mx /= l;
    my /= l;
  }
  mx += sideX;
  my += sideY;

  // Fence avoidance
  const M = BOTS.WALL_MARGIN;
  const left = p.x - ARENA.BORDER_X;
  const right = ARENA.W - ARENA.BORDER_X - p.x;
  const top = p.y - ARENA.BORDER_Y;
  const bottom = ARENA.H - ARENA.BORDER_Y - p.y;
  if (left < M) mx += BOTS.WALL_WEIGHT * (1 - left / M);
  if (right < M) mx -= BOTS.WALL_WEIGHT * (1 - right / M);
  if (top < M) my += BOTS.WALL_WEIGHT * (1 - top / M);
  if (bottom < M) my -= BOTS.WALL_WEIGHT * (1 - bottom / M);

  // Gentle pull to the middle so it doesn't hug one side
  mx += ((ARENA.W / 2 - p.x) / ARENA.W) * BOTS.CENTER_PULL;
  my += ((ARENA.H / 2 - p.y) / ARENA.H) * BOTS.CENTER_PULL;

  // Smart bot drifts to kibble: freely when safe, and to close kibble under light threat
  if (kibble && (wsum === 0 || (BOTS.KIBBLE_RISK > 0 && nearest > BOTS.KIBBLE_RISK_DIST))) {
    let best = null;
    let bd = wsum === 0 ? BOTS.KIBBLE_RADIUS : BOTS.KIBBLE_RISK_RADIUS;
    for (const k of world.pickups) {
      const d = hypot(k.x - p.x, k.y - p.y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best) {
      const pull = wsum === 0 ? BOTS.KIBBLE_PULL : BOTS.KIBBLE_RISK;
      mx += ((best.x - p.x) / bd) * pull;
      my += ((best.y - p.y) / bd) * pull;
    }
  }

  const l = hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  OUT.mx = mx;
  OUT.my = my;
  OUT.nearest = nearest;
  OUT.crowd = crowd;
  OUT.dash = dash;
  return OUT;
}

/** Smart bot's value for a card (higher = better). */
function cardScore(world, c) {
  const S = BOTS.CARD_SCORE;
  let s;
  if (c.kind === 'weapon') {
    s = S.weaponLevel + (c.key === world.startWeapon ? S.startWeapon : 0) + (BOTS.WEAPON_PREF[c.key] || 0);
  } else if (c.kind === 'newWeapon') {
    const n = world.weapons.length;
    s = (n < 2 ? S.secondWeapon : (n < 3 ? S.newWeapon : S.newWeaponLate)) + (BOTS.WEAPON_PREF[c.key] || 0);
  } else if (c.kind === 'stat') {
    s = S[c.key] ?? 3;
    if (c.key === 'heart' && world.player.hp < world.player.maxHp * 0.5) s += S.lowHpHeart;
    if (c.rare) s += S.rare;
  } else {
    s = 1;
  }
  return s;
}

const BOTS_BY_KIND = {
  idle: () => ({
    input: () => ({ mx: 0, my: 0, dash: false }),
    pickCard: () => 0,
  }),
  kite: (rng) => ({
    input: (world) => {
      const { mx, my } = kiteDir(world);
      return { mx, my, dash: false };
    },
    pickCard: (world) => rng.int(world.choices.length),
  }),
  smart: () => ({
    input: (world) => {
      const k = kiteDir(world, { kibble: true, dodge: true });
      const dash = k.dash || k.nearest < BOTS.DASH_RADIUS || k.crowd >= BOTS.DASH_CROWD;
      return { mx: k.mx, my: k.my, dash };
    },
    pickCard: (world) => {
      let best = 0;
      let bestScore = -Infinity;
      world.choices.forEach((c, i) => {
        const s = cardScore(world, c);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      return best;
    },
  }),
};

export const BOT_KINDS = Object.keys(BOTS_BY_KIND);

/** makeBot('kite', seed) -> { kind, input(world), pickCard(world) -> index } */
export function makeBot(kind = 'kite', seed = 1) {
  const make = BOTS_BY_KIND[kind] || BOTS_BY_KIND.kite;
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  return { kind: BOTS_BY_KIND[kind] ? kind : 'kite', ...make(rng) };
}

