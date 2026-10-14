// =============================================================================
// Platform — one logical platform (from level data or spawned at runtime) plus
// an optional pooled view (an Image). Behavior comes from PLATFORM_TYPES, a
// strategy table keyed by `type`; the spawner, the scene, the bot and the node
// scripts never switch on the type themselves.
//
// No Phaser import: logical platforms also run in node (scripts/sim-climb.mjs,
// scripts/validate-level.mjs). Views exist only when a scene binds one.
//
// Fields the rest of the game relies on:
//   x        centre x (world px, 0..270)
//   y        world y of the TOP surface (y down; height = -y)
//   prevY    top y at the start of this frame (swept landing for lifts)
//   w, h     size; w is a multiple of 8
//   solid    can be landed on
//   alive    false once removed (a faded cushion, a crumbled plank)
//   state    free-form per type ('idle', 'cracked', 'falling', 'gone', ...)
//   time     world clock (s) of the last update; moving types are pure
//            functions of it, so xAt(T) / yAt(T) answer "where at time T"
//
// Behavior hooks (all optional):
//   texture / textureFor(p)  base texture key (null = invisible platform)
//   composed           true: build a w-wide texture from [cap, mid, cap] frames
//   originY, frame     view origin (default 0 = top) and frame for plain sheets
//   init(p, def)       read extra per-type fields from the level def
//   xAt(p, T) yAt(p,T) position at world time T (moving platforms)
//   update(p, dt, T)   move/animate (dt, T in seconds)
//   onBounce(p, soba)  react to a landing; may return
//                        { velocityMult, spring } bounce strength (spring: sqrt 2.2)
//                        { crumble: true }       it cracked (it falls 0.15 s later)
//                        { finish: true }        this is the goal (no bounce)
//   viewOffset(p)      { dx, dy, scaleY } for the view (shake, drop, squash)
//   frameFor(p)        frame for the view this frame (spring)
//   reset(p)           restore for a respawn (crumbles come back)
//   rig                'rail' (slider) | 'chain' (lift): drawn by the spawner
// =============================================================================

import { PLATFORM, DEPTH, WORLD, CRUMBLE, SPRING } from '../core/Constants.js';
import { composedPlatformKey, RIM } from '../core/Assets.js';
import { heightToY, yToHeight, pingPongPos } from '../core/Kinematics.js';

export const PLATFORM_TYPES = {
  beam: {
    texture: 'plat-beam',
    composed: true,
  },

  // The roof deck under the bell: landing on it completes the level. The deck
  // is drawn by the roof art (Backdrop), so the platform itself is invisible.
  roof: {
    texture: null,
    onBounce: () => ({ finish: true }),
  },

  // Respawn cushion: one bounce, then it fades away.
  cushion: {
    texture: 'cushion',
    init(p) { p.fadeMs = 0; },
    onBounce(p) {
      if (p.state !== 'used') {
        p.state = 'used';
        p.vanishing = true;
        p.fadeMs = PLATFORM.CUSHION_FADE_MS;
      }
      return {};
    },
    update(p, dt) {
      if (!p.vanishing) return;
      p.fadeMs -= dt * 1000;
      p.alpha = Math.max(0, p.fadeMs / PLATFORM.CUSHION_FADE_MS);
      if (p.fadeMs <= 0) {
        p.solid = false;
        p.alive = false;
      }
    },
  },

  // The street: a floor across the whole width, drawn by the backdrop.
  street: {
    texture: null,
  },

  // Slider: moves back and forth between x - range and x + range at `speed`
  // px/s (constant speed, instant turn). Level def: { x, range, speed, phase }.
  slider: {
    texture: 'plat-slider',
    composed: true,
    rig: 'rail',
    init(p, def) {
      p.cx = def.x;
      p.range = def.range || 0;
      p.speed = def.speed || 0;
      p.phase = def.phase || 0;
      p.x = p.xAt(0);
    },
    xAt: (p, T) => p.cx - p.range + pingPongPos(T, 2 * p.range, p.speed, p.phase),
    update(p, dt, T) { p.x = p.xAt(T); },
  },

  // Crumble: holds exactly one bounce, cracks, shakes, falls away 0.15 s later.
  // Gone for the rest of the attempt; restored when Soba respawns.
  crumble: {
    texture: 'plat-crumble',
    composed: true,
    textureFor: p => (p.state === 'idle' ? 'plat-crumble' : 'plat-crumble-cracked'),
    init(p) { PLATFORM_TYPES.crumble.reset(p); },
    onBounce(p) {
      if (p.state !== 'idle') return {};
      p.state = 'cracked';
      p.timer = CRUMBLE.FALL_DELAY_S;
      p.crackT = 0;
      return { crumble: true };
    },
    update(p, dt) {
      if (p.state === 'cracked') {
        p.crackT += dt;
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'falling';
          p.solid = false;
          p.dropV = 0;
          p.dropMs = 0;
          p.justFell = true;
        }
      } else if (p.state === 'falling') {
        p.dropV += CRUMBLE.DROP_GRAVITY * dt;
        p.dropY += p.dropV * dt;
        p.dropMs += dt * 1000;
        p.alpha = Math.max(0, 1 - p.dropMs / CRUMBLE.DROP_MS);
        if (p.dropMs >= CRUMBLE.DROP_MS) {
          p.state = 'gone';
          p.alive = false;
        }
      }
    },
    viewOffset(p) {
      if (p.state === 'cracked') {
        const s = Math.floor(p.crackT * CRUMBLE.SHAKE_HZ) % 2 ? CRUMBLE.SHAKE_PX : -CRUMBLE.SHAKE_PX;
        return { dx: s, dy: 0 };
      }
      return { dx: 0, dy: p.dropY };
    },
    reset(p) {
      p.state = 'idle';
      p.solid = true;
      p.alive = true;
      p.alpha = 1;
      p.timer = 0;
      p.crackT = 0;
      p.dropY = 0;
      p.dropV = 0;
      p.dropMs = 0;
      p.justFell = false;
    },
  },

  // Spring beam: a plain beam; its spring pad is a separate 'springpad'
  // platform the spawner adds on top (level def: { spring: dx } offset).
  spring: {
    texture: 'plat-beam',
    composed: true,
  },

  // The spring itself (16 px wide, sticks up PAD_TOP px above the beam). Its top
  // is higher than the beam's, so the swept landing test hits it first when
  // Soba's paws are over it: 2.2x bounce height. Compressed at rest (frame 0);
  // a hit squashes it, then it pops to extended (frame 1).
  springpad: {
    texture: RIM.KEYS.spring,                  // rimmed art, 1 px padding all round
    originY: (10 + RIM.PAD) / (10 + 2 * RIM.PAD), // the art's bottom row sits on the beam
    frame: 0,
    init(p, def) {
      p.parent = def.parent;
      p.dx = def.dx || 0;
      p.sprungMs = 0;
    },
    xAt: (p, T) => p.parent.xAt(T) + p.dx,
    yAt: (p, T) => p.parent.yAt(T) - SPRING.PAD_TOP,
    onBounce(p) {
      p.sprungMs = SPRING.SQUASH_MS + SPRING.EXTEND_MS;
      return { velocityMult: SPRING.VELOCITY_MULT, spring: true };
    },
    update(p, dt, T) {
      if (p.sprungMs > 0) p.sprungMs -= dt * 1000;
      p.x = p.xAt(T);
      p.y = p.yAt(T);
    },
    frameFor: p => (p.sprungMs > 0 && p.sprungMs <= SPRING.EXTEND_MS ? 1 : 0),
    viewOffset: p => ({
      dx: 0,
      dy: SPRING.PAD_TOP,   // the view's bottom sits on the beam top
      scaleY: p.sprungMs > SPRING.EXTEND_MS ? 0.7 : 1,
    }),
  },

  // Lift: moves up and down between y and y + rise (heights) at `speed` px/s.
  // Level def: { x, y (lowest top), rise, speed, phase }.
  lift: {
    texture: 'plat-lift',
    composed: true,
    rig: 'chain',
    init(p, def) {
      p.yLow = heightToY(def.y);
      p.rise = def.rise || 0;
      p.speed = def.speed || 0;
      p.phase = def.phase || 0;
      p.y = p.yAt(0);
      p.prevY = p.y;
    },
    yAt: (p, T) => p.yLow - pingPongPos(T, p.rise, p.speed, p.phase),
    update(p, dt, T) { p.y = p.yAt(T); },
  },
};

let nextId = 1;

export class Platform {
  /**
   * @param {{x:number, y:number, w:number, type:string}} def  level def (y = height px)
   * @param {{dynamic?:boolean}} [opts] dynamic platforms are removed once dead
   */
  constructor(def, opts = {}) {
    this.id = nextId++;
    this.def = def;
    this.type = def.type || 'beam';
    this.behavior = PLATFORM_TYPES[this.type] || PLATFORM_TYPES.beam;
    this.dynamic = !!opts.dynamic;
    this.x = def.x;
    this.y = heightToY(def.y);
    this.prevY = this.y;
    this.w = def.w;
    this.h = PLATFORM.HEIGHT;
    this.solid = true;
    this.alive = true;
    this.vanishing = false;
    this.alpha = 1;
    this.state = 'idle';
    this.bounces = 0;
    this.active = false;
    this.time = 0;
    this.view = null;
    this.viewKey = null;
    this.scene = null;
    if (this.behavior.init) this.behavior.init(this, def);
  }

  get heightPx() {
    return yToHeight(this.y);
  }

  /** True for platforms that move (the bot predicts them; the validator takes the worst case). */
  get moving() {
    return !!(this.behavior.xAt || this.behavior.yAt) && this.type !== 'springpad';
  }

  /** Centre x at world time T. */
  xAt(T) {
    return this.behavior.xAt ? this.behavior.xAt(this, T) : this.x;
  }

  /** Top y at world time T. */
  yAt(T) {
    return this.behavior.yAt ? this.behavior.yAt(this, T) : this.y;
  }

  update(dt, T) {
    this.time = T;
    if (this.behavior.update) this.behavior.update(this, dt, T);
  }

  /** Soba landed on this platform. Returns the behavior's response ({} by default). */
  bounce(soba) {
    this.bounces += 1;
    return (this.behavior.onBounce && this.behavior.onBounce(this, soba)) || {};
  }

  /** Restore after a respawn (crumbles come back). */
  reset() {
    if (this.behavior.reset) this.behavior.reset(this);
  }

  /** Centre x / top y t seconds from now (the bot). */
  predictX(t) {
    return this.xAt(this.time + t);
  }

  predictY(t) {
    return this.yAt(this.time + t);
  }

  textureKey() {
    const b = this.behavior;
    return b.textureFor ? b.textureFor(this) : b.texture;
  }

  /** Binds a pooled Image to this platform. */
  attachView(image, scene) {
    if (!this.textureKey()) return;
    this.scene = scene;
    this.view = image;
    this.viewKey = null;
    image.setOrigin(0.5, this.behavior.originY ?? 0);
    image.setDepth(DEPTH.PLATFORM);
    image.setVisible(true);
    image.setActive(true);
    this.syncView();
  }

  detachView() {
    const v = this.view;
    this.view = null;
    this.viewKey = null;
    if (v) v.setVisible(false).setActive(false).setScale(1);
    return v;
  }

  syncView() {
    const v = this.view;
    if (!v) return;
    const b = this.behavior;
    const base = this.textureKey();
    const key = b.composed ? composedPlatformKey(this.scene, base, this.w) : base;
    if (key !== this.viewKey) {
      if (b.composed) v.setTexture(key);
      else v.setTexture(key, b.frame ?? 0);
      this.viewKey = key;
    }
    if (b.frameFor) v.setFrame(b.frameFor(this));
    const o = b.viewOffset ? b.viewOffset(this) : null;
    v.setPosition(Math.round(this.x + (o?.dx || 0)), Math.round(this.y + (o?.dy || 0)));
    v.setScale(1, o?.scaleY ?? 1);
    v.setAlpha(this.alpha);
  }

  /** For render_game_to_text(). */
  snapshot() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      h: Math.round(this.heightPx),
      w: this.w,
      type: this.type,
      state: this.state,
    };
  }
}

/** The street floor: wider than the wrap period so it always overlaps. */
export function makeStreet() {
  return new Platform({ x: WORLD.WRAP_W / 2, y: 0, w: WORLD.WRAP_W * 2, type: 'street' });
}

/** The spring pad that sits on a 'spring' beam. */
export function makeSpringPad(beam) {
  const dx = beam.def.spring || 0;
  return new Platform({
    type: 'springpad', x: beam.x + dx, y: beam.def.y + SPRING.PAD_TOP, w: SPRING.PAD_W, parent: beam, dx,
  });
}
