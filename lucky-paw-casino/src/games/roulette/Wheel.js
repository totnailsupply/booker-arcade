// =============================================================================
// Wheel — the code-drawn roulette wheel and the ball animation.
//
//   const wheel = new Wheel(scene, { depth });
//   wheel.update(dtMs)                       call every frame (scene.update)
//   wheel.spin(17, { rng, onDrop, onSettle })   onSettle(n) fires (inside update) when the ball settles in 17
//   wheel.skip()                             jump to the settled ball
//   wheel.spinning / wheel.restNumber
//
// The RESULT is decided before spin() is called; the animation only lands the
// ball in that pocket. The ball's angle is computed RELATIVE to the rotor:
//   ball = rotor + pocketAngle(n) + D(t),  D(t) = D0 * (1 - t/T)^p  -> 0 at T,
// so whatever the rotor does, the ball ends in the chosen pocket.
// Textures are drawn once with Canvas 2D at 2x (crisp when rotated).
// =============================================================================

import { canvasTexture } from '../../core/Textures.js';
import { FONT } from '../../core/Constants.js';
import { playSfx } from '../../audio/sfx.js';
import { WHEEL_ORDER, POCKETS, pocketIndex, colorOf } from './logic.js';
import { WHEEL, SPIN, COLOR_OF } from './config.js';

const TAU = Math.PI * 2;
const STEP = TAU / POCKETS;
const rgb = (n, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
const mix = (n, f) => {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return (m(r) << 16) | (m(g) << 8) | m(b);
};
/** Canvas angle of pocket index i (centre), 0 = straight up, clockwise. */
export const pocketAngle = (i) => -Math.PI / 2 + i * STEP;

// --- textures ---------------------------------------------------------------------

function ring(ctx, c, r0, r1, fill) {
  ctx.beginPath();
  ctx.arc(c, c, r1, 0, TAU);
  ctx.arc(c, c, r0, 0, TAU, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawBowl(ctx, size) {
  const k = WHEEL.TEX_SCALE;
  const c = size / 2;
  const R = WHEEL.R * k, TO = WHEEL.TRACK_OUT * k, TI = WHEEL.TRACK_IN * k;
  // soft drop shadow
  const sh = ctx.createRadialGradient(c, c + 8 * k, R * 0.8, c, c + 8 * k, R + 8 * k);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.arc(c, c + 8 * k, R + 8 * k, 0, TAU); ctx.fill();
  // outer wooden bowl
  const wood = ctx.createRadialGradient(c - R * 0.3, c - R * 0.35, R * 0.2, c, c, R);
  wood.addColorStop(0, '#a8703f');
  wood.addColorStop(0.75, '#6e4223');
  wood.addColorStop(1, '#3a210f');
  ring(ctx, c, TO, R, wood);
  // wood grain arcs
  ctx.lineWidth = 1 * k;
  for (let i = 0; i < 9; i++) {
    const r = TO + (R - TO) * (0.15 + i * 0.09);
    ctx.strokeStyle = `rgba(40,20,8,${0.18 + (i % 3) * 0.06})`;
    ctx.beginPath(); ctx.arc(c, c, r, 0.3 * i, 0.3 * i + 2.2); ctx.stroke();
  }
  // brass rim + inner lip
  ctx.lineWidth = 3 * k; ctx.strokeStyle = '#d9b25a';
  ctx.beginPath(); ctx.arc(c, c, R - 1.5 * k, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1 * k; ctx.strokeStyle = 'rgba(255,240,190,0.55)';
  ctx.beginPath(); ctx.arc(c, c, R - 3.5 * k, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
  // ball track: polished, concave (light outside, dark inside)
  const tr = ctx.createRadialGradient(c, c, TI, c, c, TO);
  tr.addColorStop(0, '#2a160a');
  tr.addColorStop(0.55, '#4c2c16');
  tr.addColorStop(1, '#7a4c28');
  ring(ctx, c, TI, TO, tr);
  ctx.lineWidth = 2 * k; ctx.strokeStyle = '#c9a24a';
  ctx.beginPath(); ctx.arc(c, c, TO, 0, TAU); ctx.stroke();
  // track sheen
  ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(255,220,170,0.12)';
  ctx.beginPath(); ctx.arc(c, c, (TO + TI) / 2 + 3 * k, Math.PI * 1.1, Math.PI * 1.65); ctx.stroke();
  // 8 brass deflector diamonds
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * (TAU / 8) + TAU / 16;
    const r = (TO + TI) / 2 + 1 * k;
    const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (i % 2 ? Math.PI / 2 : 0));
    const L = 6.5 * k, W = 2.6 * k;
    ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -W); ctx.lineTo(L, 0); ctx.lineTo(0, W); ctx.closePath();
    ctx.fillStyle = '#e8c56a'; ctx.fill();
    ctx.lineWidth = 0.8 * k; ctx.strokeStyle = '#6b4c12'; ctx.stroke();
    ctx.restore();
  }
  // gap shadow where the rotor sits
  ring(ctx, c, TI - 2 * k, TI + 1.5 * k, 'rgba(0,0,0,0.6)');
}

function drawRotor(ctx, size) {
  const k = WHEEL.TEX_SCALE;
  const c = size / 2;
  const RO = WHEEL.TRACK_IN * k, NI = WHEEL.NUM_IN * k, PI_ = WHEEL.POCKET_IN * k, CI = WHEEL.CONE_IN * k;
  // pockets + number ring segments
  for (let i = 0; i < POCKETS; i++) {
    const n = WHEEL_ORDER[i];
    const col = COLOR_OF[colorOf(n)];
    const a0 = pocketAngle(i) - STEP / 2, a1 = pocketAngle(i) + STEP / 2;
    // number ring
    ctx.beginPath(); ctx.arc(c, c, RO, a0, a1); ctx.arc(c, c, NI, a1, a0, true); ctx.closePath();
    ctx.fillStyle = rgb(col); ctx.fill();
    // pocket floor (darker, with depth gradient)
    const g = ctx.createRadialGradient(c, c, PI_, c, c, NI);
    g.addColorStop(0, rgb(mix(col, -0.55)));
    g.addColorStop(1, rgb(mix(col, -0.2)));
    ctx.beginPath(); ctx.arc(c, c, NI, a0, a1); ctx.arc(c, c, PI_, a1, a0, true); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    // number, upright reading outwards
    const am = pocketAngle(i);
    const rr = (RO + NI) / 2;
    ctx.save();
    ctx.translate(c + Math.cos(am) * rr, c + Math.sin(am) * rr);
    ctx.rotate(am + Math.PI / 2);
    ctx.font = `${Math.round(11.5 * k * (FONT.SCALE ?? 1))}px ${FONT.NUMBERS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6ecd4';
    ctx.fillText(String(n), 0, 0.5 * k);
    ctx.restore();
  }
  // separators: thin cream lines on the number ring, brass frets on the pockets
  for (let i = 0; i < POCKETS; i++) {
    const a = pocketAngle(i) - STEP / 2;
    const cs = Math.cos(a), sn = Math.sin(a);
    ctx.lineWidth = 0.8 * k; ctx.strokeStyle = 'rgba(246,236,212,0.45)';
    ctx.beginPath(); ctx.moveTo(c + cs * NI, c + sn * NI); ctx.lineTo(c + cs * RO, c + sn * RO); ctx.stroke();
    ctx.lineWidth = 2 * k; ctx.strokeStyle = '#d8b55e';
    ctx.beginPath(); ctx.moveTo(c + cs * (PI_ - 1 * k), c + sn * (PI_ - 1 * k)); ctx.lineTo(c + cs * (NI + 1 * k), c + sn * (NI + 1 * k)); ctx.stroke();
    ctx.fillStyle = '#f3d98a';
    ctx.beginPath(); ctx.arc(c + cs * (NI + 1 * k), c + sn * (NI + 1 * k), 1.6 * k, 0, TAU); ctx.fill();
  }
  // brass rings
  ctx.lineWidth = 2 * k; ctx.strokeStyle = '#c9a24a';
  for (const r of [RO - 1 * k, NI]) { ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.stroke(); }
  // cone (wooden dome)
  const cone = ctx.createRadialGradient(c - PI_ * 0.25, c - PI_ * 0.3, CI * 0.4, c, c, PI_);
  cone.addColorStop(0, '#b47a45');
  cone.addColorStop(0.6, '#7a4a26');
  cone.addColorStop(1, '#4a2a12');
  ring(ctx, c, CI, PI_, cone);
  ctx.lineWidth = 2.5 * k; ctx.strokeStyle = '#c9a24a';
  ctx.beginPath(); ctx.arc(c, c, PI_, 0, TAU); ctx.stroke();
  // inlay stripes on the cone
  ctx.lineWidth = 1 * k; ctx.strokeStyle = 'rgba(255,214,150,0.18)';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * (CI + 4 * k), c + Math.sin(a) * (CI + 4 * k));
    ctx.lineTo(c + Math.cos(a) * (PI_ - 4 * k), c + Math.sin(a) * (PI_ - 4 * k)); ctx.stroke();
  }
  // turret: 4 brass arms with knobs, then the hub
  const brass = (x0, y0, r) => {
    const g = ctx.createRadialGradient(x0 - r * 0.35, y0 - r * 0.4, r * 0.1, x0, y0, r);
    g.addColorStop(0, '#fff2c0'); g.addColorStop(0.45, '#e2b84f'); g.addColorStop(1, '#8a6420');
    return g;
  };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const L = 46 * k;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(2 * k, -2.4 * k + 2 * k, L - 4 * k, 4.8 * k);
    ctx.fillStyle = '#d9ad48';
    ctx.fillRect(0, -2.4 * k, L - 4 * k, 4.8 * k);
    ctx.fillStyle = 'rgba(255,245,200,0.6)';
    ctx.fillRect(0, -2.4 * k, L - 4 * k, 1.4 * k);
    ctx.restore();
    const kx = c + Math.cos(a) * L, ky = c + Math.sin(a) * L;
    ctx.fillStyle = brass(kx, ky, 5.5 * k);
    ctx.beginPath(); ctx.arc(kx, ky, 5.5 * k, 0, TAU); ctx.fill();
    ctx.lineWidth = 0.8 * k; ctx.strokeStyle = '#6b4c12'; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.arc(c + 1.5 * k, c + 2.5 * k, 17 * k, 0, TAU); ctx.fill();
  ctx.fillStyle = brass(c, c, 17 * k);
  ctx.beginPath(); ctx.arc(c, c, 17 * k, 0, TAU); ctx.fill();
  ctx.lineWidth = 1.2 * k; ctx.strokeStyle = '#6b4c12'; ctx.stroke();
  ctx.fillStyle = brass(c, c, 7 * k);
  ctx.beginPath(); ctx.arc(c, c, 7 * k, 0, TAU); ctx.fill();
  ctx.stroke();
}

function drawBall(ctx, size) {
  const c = size / 2;
  const r = c - 1;
  const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#f1efe8');
  g.addColorStop(1, '#a9a49a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.stroke();
}

export function makeWheelTextures(scene) {
  const k = WHEEL.TEX_SCALE;
  const bowl = Math.ceil((WHEEL.R + 12) * 2 * k);
  const rotor = Math.ceil((WHEEL.TRACK_IN + 2) * 2 * k);
  const ball = Math.ceil(WHEEL.BALL_R * 2 * k) + 2;
  if (!scene.textures.exists('rl-bowl')) canvasTexture(scene, 'rl-bowl', bowl, bowl, (ctx) => drawBowl(ctx, bowl));
  if (!scene.textures.exists('rl-rotor')) canvasTexture(scene, 'rl-rotor', rotor, rotor, (ctx) => drawRotor(ctx, rotor));
  if (!scene.textures.exists('rl-ball')) canvasTexture(scene, 'rl-ball', ball, ball, (ctx) => drawBall(ctx, ball));
}

// --- the wheel object ------------------------------------------------------------------

const wrap = (a) => ((a % TAU) + TAU) % TAU;

export class Wheel {
  constructor(scene, { depth = 100 } = {}) {
    this.scene = scene;
    makeWheelTextures(scene);
    const { X, Y, TEX_SCALE: k } = WHEEL;
    this.x = X;
    this.y = Y;
    this.bowl = scene.add.image(X, Y, 'rl-bowl').setScale(1 / k).setDepth(depth);
    this.rotor = scene.add.image(X, Y, 'rl-rotor').setScale(1 / k).setDepth(depth + 1);
    this.glow = scene.add.graphics({ x: X, y: Y }).setDepth(depth + 2);
    this.ballShadow = scene.add.image(X, Y, 'rl-ball').setScale(1 / k).setTint(0x000000).setAlpha(0.35).setDepth(depth + 3);
    this.streak = scene.add.graphics({ x: X, y: Y }).setDepth(depth + 3);
    this.ball = scene.add.image(X, Y, 'rl-ball').setScale(1 / k).setDepth(depth + 4);
    this.prevA = null;

    this.omega = SPIN.WHEEL_IDLE;
    this.rotor.rotation = 0;
    this.spinning = false;
    this.restNumber = 0;
    this.ballR = WHEEL.BALL_POCKET_R;
    this.ballA = 0;
    this.s = null;
    this.placeBall();
  }

  /** World angle (radians, screen space) of number n's pocket right now. */
  pocketWorldAngle(n) {
    return this.rotor.rotation + pocketAngle(pocketIndex(n));
  }

  /**
   * Launch the ball; it lands in `n`. Callbacks run synchronously inside update(),
   * so fixed-step test clocks see the same timeline as real play.
   * onDrop() when the ball leaves the track, onSettle(n) when it rests; rng = cosmetic variety.
   */
  spin(n, { rng = null, onDrop = null, onSettle = null } = {}) {
    if (this.spinning) this.finish();
    const r = () => (rng ? rng.next() : 0.5);
    const T = SPIN.T * (0.94 + 0.12 * r());
    this.omega = SPIN.WHEEL_SPIN;
    const base = this.pocketWorldAngle(n);
    const start = SPIN.LAUNCH_ANGLE;
    // positive D: the ball runs anticlockwise against a clockwise rotor
    const D0 = wrap(start - base) + Math.floor(SPIN.REVS + r() * 0.8) * TAU;
    this.s = {
      n, T, t: 0, D0, p: SPIN.EASE_P,
      tDrop: T * SPIN.DROP_U, tLand: T * SPIN.DROP_U + SPIN.FALL_MS,
      dropped: false, landed: false, bounce: 0, lastDiamond: null, lastPocket: null, onDrop, onSettle,
    };
    this.spinning = true;
    this.clearGlow();
    this.ball.setScale(0).setAlpha(1);
    this.scene.tweens.add({ targets: this.ball, scale: 1 / WHEEL.TEX_SCALE, duration: 140, ease: 'Back.easeOut' });
    playSfx('ballDrop', { gain: 0.6 });
    return this;
  }

  /** Jump straight to the settled ball (Space / click while spinning). */
  skip() {
    if (!this.spinning || !this.s) return false;
    if (!this.s.dropped) this.s.onDrop?.();
    this.s.t = this.s.T;
    playSfx('ballDrop', { gain: 0.8 });
    return true;
  }

  finish() {
    const s = this.s;
    this.spinning = false;
    this.restNumber = s.n;
    this.s = null;
    this.ballR = WHEEL.BALL_POCKET_R;
    this.ballA = 0;
    this.streak.clear();
    this.prevA = null;
    this.ball.setScale(1 / WHEEL.TEX_SCALE);
    s.onSettle?.(s.n);
  }

  update(dtMs) {
    const dt = Math.min(dtMs, 100) / 1000;
    // rotor: decays from the launch speed back to the idle drift
    this.omega = SPIN.WHEEL_IDLE + (this.omega - SPIN.WHEEL_IDLE) * Math.exp(-dt / SPIN.WHEEL_TAU);
    this.rotor.rotation = wrap(this.rotor.rotation + this.omega * dt);
    this.glow.rotation = this.rotor.rotation;

    const s = this.s;
    if (s) {
      s.t = Math.min(s.T, s.t + dtMs);
      const u = s.t / s.T;
      const D = s.D0 * Math.pow(1 - u, s.p);
      let r = WHEEL.BALL_TRACK_R;
      if (s.t >= s.tDrop) {
        if (!s.dropped) {
          s.dropped = true;
          s.onDrop?.();
          playSfx('ballDrop', { gain: 0.7 });
        }
        if (s.t < s.tLand) {
          const f = (s.t - s.tDrop) / (s.tLand - s.tDrop);
          r = WHEEL.BALL_TRACK_R + (WHEEL.BALL_POCKET_R - WHEEL.BALL_TRACK_R) * f * f;
        } else {
          if (!s.landed) {
            s.landed = true;
            playSfx('ballDrop', { gain: 1 });
          }
          const b = s.T > s.tLand ? (s.t - s.tLand) / (s.T - s.tLand) : 1;
          const B = SPIN.BOUNCES;
          let k = 0;
          while (k < B.length - 2 && b >= B[k + 1]) k++;
          if (k > s.bounce) {
            s.bounce = k;
            playSfx('ballDrop', { gain: 0.8 - k * 0.18 });
          }
          const local = Math.min(1, (b - B[k]) / (B[k + 1] - B[k]));
          r = WHEEL.BALL_POCKET_R + SPIN.BOUNCE_H[k] * Math.sin(Math.PI * local) * (b >= 1 ? 0 : 1);
        }
        // pocket ticks (relative to the rotor)
        const pk = Math.floor(D / STEP);
        if (s.lastPocket !== null && pk !== s.lastPocket) playSfx('wheelTick', { speed: Math.min(1, D / 2), gain: 0.8 });
        s.lastPocket = pk;
      }
      this.ballR = r;
      this.ballA = D;
      // diamond ticks while orbiting (8 deflectors, world space): slow down with the ball
      const world = this.pocketWorldAngle(s.n) + D;
      if (!s.dropped) {
        const dia = Math.floor(wrap(world) / (TAU / 8));
        if (s.lastDiamond !== null && dia !== s.lastDiamond) {
          const speed = Math.min(1, (s.p * s.D0 * Math.pow(1 - u, s.p - 1)) / s.T * 1000 / 14);
          playSfx('wheelTick', { speed, gain: 0.5 + 0.5 * speed });
        }
        s.lastDiamond = dia;
      }
      this.placeBall(true);
      if (s.t >= s.T) this.finish();
    } else {
      this.placeBall(false);
    }
  }

  placeBall(trail = false) {
    const n = this.s ? this.s.n : this.restNumber;
    const a = this.pocketWorldAngle(n) + this.ballA;
    const x = this.x + Math.cos(a) * this.ballR;
    const y = this.y + Math.sin(a) * this.ballR;
    this.ball.setPosition(x, y);
    this.ballShadow.setPosition(x + 1.5, y + 2.5);
    // motion streak behind a fast ball (an arc along its path)
    const g = this.streak;
    g.clear();
    if (trail && this.prevA !== null && this.s && !this.s.dropped) {
      let dA = a - this.prevA;
      dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      const span = Math.max(-0.7, Math.min(0.7, -dA * 2.5));
      const parts = [[0.34, 1], [0.18, 0.75], [0.07, 0.5]];
      parts.forEach(([alpha, w], i) => {
        const a0 = a + (span * i) / 3, a1 = a + (span * (i + 1)) / 3;
        g.lineStyle(WHEEL.BALL_R * 2 * w, 0xffffff, alpha);
        g.beginPath();
        g.arc(0, 0, this.ballR, Math.min(a0, a1), Math.max(a0, a1), false);
        g.strokePath();
      });
    }
    this.prevA = trail ? a : null;
  }

  /** Gold glow on the winning pocket (rotates with the rotor). */
  showGlow(n) {
    const g = this.glow;
    g.clear();
    const a = pocketAngle(pocketIndex(n));
    const wedge = () => {
      g.beginPath();
      g.arc(0, 0, WHEEL.TRACK_IN - 1, a - STEP / 2, a + STEP / 2, false);
      g.arc(0, 0, WHEEL.POCKET_IN, a + STEP / 2, a - STEP / 2, true);
      g.closePath();
    };
    g.fillStyle(0xffe49a, 0.35);
    wedge();
    g.fillPath();
    g.lineStyle(2, 0xf2c94c, 1);
    wedge();
    g.strokePath();
    g.setAlpha(1);
    this.scene.tweens.add({ targets: g, alpha: { from: 1, to: 0.45 }, duration: 420, yoyo: true, repeat: 3 });
  }

  clearGlow() {
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.clear();
  }
}
