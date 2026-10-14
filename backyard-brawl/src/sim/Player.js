// Booker: movement, dash (invulnerable, cooldown), i-frames, regen, arena clamp.
// Input is a plain { mx, my, dash } object: mx/my in -1..1 (analog allowed,
// length clamped to 1), dash = "dash wanted" (held is fine: it fires when ready).

import { PLAYER, ARENA } from '../core/Constants.js';
import { hypot } from './DetMath.js'; // engine-independent math (see DetMath.js)

export function createPlayer(hp = null) {
  const maxHp = hp ?? PLAYER.HP;
  return {
    x: ARENA.W / 2,
    y: ARENA.H / 2,
    r: PLAYER.RADIUS,
    hp: maxHp,
    maxHp,
    iframes: 0,
    dashT: 0,
    dashCd: 0,
    dashDx: 1,
    dashDy: 0,
    facing: 1,
    moving: false,
    hurtT: 0,      // render: time since last hurt (for the hurt frame)
  };
}

export function isInvulnerable(world) {
  const p = world.player;
  return world.god || p.iframes > 0 || p.dashT > 0;
}

export function clampToArena(o, r) {
  const lx = ARENA.BORDER_X + r;
  const ly = ARENA.BORDER_Y + r;
  if (o.x < lx) o.x = lx;
  else if (o.x > ARENA.W - lx) o.x = ARENA.W - lx;
  if (o.y < ly) o.y = ly;
  else if (o.y > ARENA.H - ly) o.y = ARENA.H - ly;
}

export function updatePlayer(world, dt, input) {
  const p = world.player;
  let mx = Number(input?.mx) || 0;
  let my = Number(input?.my) || 0;
  const len = hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const moving = len > 0.05;

  if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  p.hurtT += dt;

  if (input?.dash && p.dashCd <= 0 && p.dashT <= 0) {
    const l = moving ? hypot(mx, my) : 0;
    p.dashDx = moving ? mx / l : p.facing;
    p.dashDy = moving ? my / l : 0;
    p.dashT = PLAYER.DASH_S;
    p.dashCd = PLAYER.DASH_COOLDOWN_S;
    world.emit('dash', { x: p.x, y: p.y, dx: p.dashDx, dy: p.dashDy });
  }

  if (p.dashT > 0) {
    const step = Math.min(dt, p.dashT);
    p.x += p.dashDx * PLAYER.DASH_SPEED * step;
    p.y += p.dashDy * PLAYER.DASH_SPEED * step;
    p.dashT = Math.max(0, p.dashT - dt);
    if (Math.abs(p.dashDx) > 0.05) p.facing = Math.sign(p.dashDx);
  } else {
    const speed = PLAYER.SPEED * (1 + world.stats.speed);
    // world.pullX/Y: Robo-Vac phase 2 suction (set by the boss in the previous step)
    p.x += (mx * speed + world.pullX) * dt;
    p.y += (my * speed + world.pullY) * dt;
    if (Math.abs(mx) > 0.05) p.facing = Math.sign(mx);
  }
  p.moving = moving || p.dashT > 0;
  clampToArena(p, p.r);

  if (world.stats.regen > 0 && p.hp > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + world.stats.regen * dt);
  }
}

/** Contact hit on Booker. Returns true when it landed. */
export function hurtPlayer(world, rawDmg, src) {
  if (isInvulnerable(world)) return false;
  const p = world.player;
  const dmg = Math.max(PLAYER.MIN_DAMAGE, rawDmg - world.stats.armor);
  p.hp = Math.max(0, p.hp - dmg);
  p.iframes = PLAYER.IFRAMES_S;
  p.hurtT = 0;
  world.emit('playerHurt', { dmg: Math.round(dmg * 100) / 100, hp: p.hp, x: p.x, y: p.y, from: src?.type || null });
  return true;
}
