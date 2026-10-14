import Phaser from 'phaser';
import { GAME, GAMEOVER, GAMEOVER_UI as G, UI_COLORS as C } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { getDebugOptions } from '../core/Debug.js';
import { getLevel } from '../levels/index.js';
import { text } from '../ui/PixelFont.js';
import { ensureUiAssets, panel, miniBar, PixelButton, UI_TEX } from '../ui/UiKit.js';

// Death overlay: a compact card over the dimmed, frozen RunScene.
//   OUCH! (varied) or SO CLOSE! (>= 90%), % reached with a mini bar (best tick),
//   NEW BEST! when this run beat the best, attempt #, and a tip for the cause.
// The card stays up until the player chooses. After GAMEOVER.INPUT_LOCK_MS a
// fresh press (Space, Up, Enter, click, tap) retries; Esc (or the LEVELS button)
// goes to the level select. Only the dev bot (?autoplay=1) retries on its own,
// after GAMEOVER.BOT_AUTO_RETRY_MS, with a countdown bar.
//
// Scene data (from RunScene.showGameOver):
//   { levelId, levelName, progress, bestProgress, isNewBestProgress, attempt, cause }

/** One tip per death cause (plain strings; tipFor() picks ability-aware variants). */
export const DEATH_TIPS = {
  obstacle: 'Tap to hop. Hold for a higher jump.',
  pit: 'Jump right at the edge of the pit.',
  wall: 'Jump before you reach the wall.',
  steam: 'Watch the puffs, then pass while the steam is off.',
  bollard: 'Tap to hop over bollards.',
  tires: 'Tires are tall: hold the button for a high jump.',
  crab: 'Crabs scuttle at you. Jump a little early.',
  acunit: 'Hop over the AC units.',
  antenna: 'Antennas are tall: hold for a high jump.',
  pigeon: 'Pigeons fly low. Jump early, or stay down and let them pass.',
  gear: 'Watch how high the gear floats, then time your jump.',
  l4crate: 'Hop over the crates.',
  cart: 'Food carts are tall: hold for a high jump.',
  hydrant: 'Tap to hop over hydrants.',
  grill: 'Hot grill! Jump over it.',
  trashcan: 'Hold to clear the trash cans.',
  vacuum: 'Vacuums bite from the side. Jump over them.',
  drone: 'Drones bump from the side. Jump over or under them.',
  boxes: 'Boxes block the way. Jump over the stack.',
  gate: 'Gates block the way. Find another path.',
  default: 'Tap to hop, hold to jump high.',
};

// Variants used when the level has the ability (checked in order)
const ABILITY_TIPS = {
  pit: [
    ['dash', 'Out of jumps? Tap once more to dash across.'],
    ['glide', 'Wide gap? Hold while falling to glide across.'],
    ['double', 'Wide gap? Tap again in the air to double jump.'],
  ],
  wall: [['wallkick', 'Jump into the wall, then tap to kick up it.']],
  tires: [['double', 'Tall stack? Double jump over it.']],
  antenna: [['double', 'Double jump to clear tall antennas.']],
  cart: [['pounce', 'Hold for a high jump over food carts.']],
  vacuum: [['pounce', 'Land on vacuums from above to pounce. Sides hurt.']],
  drone: [['pounce', 'Land on drones from above to pounce. Sides hurt.']],
  boxes: [['dash', 'Dash through boxes: jump, double jump, then tap again.']],
  gate: [['dash', 'Dash through gates: jump, double jump, then tap again.']],
  pigeon: [['glide', 'Let go to drop fast under the pigeons.']],
  steam: [['wallkick', 'Steam fires in a rhythm. Go right after a puff ends.']],
};

/** Tip for a cause, picking a variant for the abilities this level has. */
export function tipFor(cause, abilities = []) {
  for (const [ab, tip] of ABILITY_TIPS[cause] || []) {
    if (abilities.includes(ab)) return tip;
  }
  return DEATH_TIPS[cause] || DEATH_TIPS.default;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(data) {
    this.info = data || {};
  }

  create() {
    gameState.mode = MODES.GAMEOVER;
    ensureUiAssets(this);
    this.done = false;
    this.elapsed = 0;
    this.armed = false;
    this.autoRetryMs = getDebugOptions().autoplay ? GAMEOVER.BOT_AUTO_RETRY_MS : GAMEOVER.AUTO_RETRY_MS;
    const d = this.info;
    const progress = d.progress || 0;
    const best = d.bestProgress || 0;
    this.soClose = progress >= G.SO_CLOSE;
    this.header = this.soClose ? 'SO CLOSE!' : G.HEADERS[((d.attempt || 1) - 1) % G.HEADERS.length];
    const run = this.scene.get('RunScene');
    const abilities = run?.abilities || getLevel(d.levelId)?.abilities || [];
    this.tip = tipFor(d.cause, abilities);

    this.dim = this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, C.DIM_OVERLAY, 0.5).setOrigin(0, 0);

    const W = G.CARD_W;
    const H = G.CARD_H;
    const card = this.add.container(GAME.WIDTH / 2, G.CARD_Y + H / 2);
    this.card = card;
    const ox = -W / 2;
    const oy = -H / 2;
    const g = this.add.graphics();
    panel(g, ox, oy, W, H, { fill: C.PANEL, hi: this.soClose ? C.GOLD : C.PANEL_HI, shadow: 3 });
    // divider above the tip
    g.fillStyle(C.OUTLINE, 1).fillRect(ox + 8, oy + 60, W - 16, 1);
    g.fillStyle(C.PANEL_HI, 1).fillRect(ox + 8, oy + 61, W - 16, 1);
    card.add(g);

    // Header + attempt
    card.add(text(this, ox + 12, oy + 9, this.header, { scale: 2, color: this.soClose ? C.GOLD : C.BAD }));
    card.add(text(this, ox + W - 12, oy + 9, `ATTEMPT ${d.attempt || 1}`, { align: 'right', color: C.DIM }));
    card.add(text(this, ox + W - 12, oy + 19, (d.levelName || '').toUpperCase(), { align: 'right', color: C.DISABLED }));

    // Percent reached (3x) + mini bar with the best tick and the finish
    const pctStr = `${Math.round(progress * 100)}%`;
    card.add(text(this, ox + 12, oy + 30, pctStr, { scale: 3, color: C.INK }));
    const barX = ox + 84;
    const bar = miniBar(this, barX, oy + 34, G.BAR_W, 6, { value: progress, best: d.isNewBestProgress ? 0 : best });
    card.add(bar.g);
    const finishKey = run?.model?.finish?.key === 'golden-steak' ? UI_TEX.GOLDEN_STEAK_SM : UI_TEX.STEAK_SM;
    card.add(this.add.image(barX + G.BAR_W + 13, oy + 37, finishKey));
    if (d.isNewBestProgress) {
      this.newBest = text(this, barX, oy + 46, 'NEW BEST!', { color: C.GOOD });
      card.add(this.newBest);
      this.tweens.add({ targets: this.newBest, alpha: 0.4, duration: 220, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] });
    } else {
      card.add(text(this, barX, oy + 46, `BEST ${Math.round(best * 100)}%`, { color: C.MUTED }));
    }

    // Tip for the cause
    const tipTag = text(this, ox + 12, oy + 67, 'TIP', { color: C.GOLD });
    card.add(tipTag);
    card.add(text(this, ox + 12 + tipTag.width + 6, oy + 67, this.tip.toUpperCase(), { color: C.INK, maxWidth: W - 48 }));

    // Footer: retry hint (dim until presses count), LEVELS button, bot-only countdown
    this.retryHint = text(this, ox + 12, oy + 93, 'SPACE / TAP: RETRY', { color: C.INK }).setAlpha(0.35);
    card.add(this.retryHint);
    this.levelsBtn = new PixelButton(this, W / 2 - 40, oy + 96, 60, 'ESC LEVELS', {
      id: 'levels', style: 'ghost', h: 14, onPress: () => this.toLevels(),
    });
    // Scene coords: the button lives in the card container
    card.add(this.levelsBtn.container);
    this.levelsBtn.container.setPosition(ox + W - 44, oy + 96);
    this.countdown = this.add.graphics();
    card.add(this.countdown);
    this.cd = { x: ox + 4, y: oy + H - 5, w: W - 8 };

    // Pop in (fast: retries must stay snappy)
    card.setScale(0.92).setAlpha(0);
    this.dim.setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: G.POP_MS, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.dim, alpha: 0.5, duration: G.POP_MS });

    const kb = this.input.keyboard;
    const press = (e) => { if (!e || !e.repeat) this.retry(); };
    ['keydown-SPACE', 'keydown-UP', 'keydown-ENTER'].forEach(ev => kb.on(ev, press));
    kb.on('keydown-ESC', () => this.toLevels());
    kb.on('keydown-BACKSPACE', () => this.toLevels());
    this.input.on('pointerdown', () => this.retry());
  }

  update(_time, delta) {
    this.elapsed += delta;
    if (!this.armed && this.elapsed >= GAMEOVER.INPUT_LOCK_MS) {
      this.armed = true;
      this.retryHint.setAlpha(1);
    }
    if (this.autoRetryMs > 0) {
      const t = Math.min(1, this.elapsed / this.autoRetryMs);
      const g = this.countdown;
      g.clear();
      g.fillStyle(C.OUTLINE, 1).fillRect(this.cd.x, this.cd.y, this.cd.w, 2);
      g.fillStyle(C.GOLD, 1).fillRect(this.cd.x, this.cd.y, Math.round(this.cd.w * t), 2);
      if (this.elapsed >= this.autoRetryMs) this.retry(true);
    }
  }

  retry(auto = false) {
    if (this.done) return;
    // Ignore presses until the card has been readable for a moment. Keys or
    // touches held from gameplay never count: a held key only sends repeats
    // (filtered above) and a held pointer sends no new pointerdown.
    if (!auto && !this.armed) return;
    this.done = true;
    eventBus.emit(Events.MENU_SELECT, { scene: 'GameOverScene', action: auto ? 'auto-retry' : 'retry', levelId: this.info.levelId });
    const run = this.scene.get('RunScene');
    run.retry();
  }

  toLevels() {
    if (this.done) return;
    this.done = true;
    eventBus.emit(Events.MENU_BACK, { scene: 'GameOverScene' });
    this.scene.stop('RunScene');
    this.scene.start('LevelSelectScene', { selected: this.info.levelId, music: true });
  }

  /** For render_game_to_text(). */
  snapshot() {
    const d = this.info;
    return {
      screen: 'gameover',
      header: this.header,
      soClose: this.soClose,
      isNewBest: !!d.isNewBestProgress,
      progress: d.progress,
      bestProgress: d.bestProgress,
      attempt: d.attempt,
      cause: d.cause,
      tip: this.tip,
      armed: this.armed,
      autoRetryInMs: this.autoRetryMs > 0 ? Math.max(0, Math.round(this.autoRetryMs - this.elapsed)) : null,
    };
  }
}
