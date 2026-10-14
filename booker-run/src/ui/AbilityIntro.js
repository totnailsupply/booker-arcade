// =============================================================================
// AbilityIntro.js — the "NEW ABILITY" card at the start of Levels 2-6.
//
// Shown on the first attempt of a session (gameState.attempts === 1) of a level
// that introduces an ability, when the run was started from the menus. Debug
// starts (?level, ?x, ?start, ?autoplay without ?menus) skip it; ?intro=1 forces
// it, ?intro=0 disables it.
// While it is up RunScene holds the run (mode 'intro', physics paused). It goes
// away on a press (Space / Up / Enter / Esc / click / tap, after INTRO_UI.MIN_MS)
// or by itself after INTRO_UI.AUTO_MS; RunScene then clears the input, so the
// dismissing press never becomes a jump, and starts the run (LEVEL_START).
// =============================================================================

import { GAME, DEPTH, INTRO_UI as I, UI_COLORS as C } from '../core/Constants.js';
import { ABILITIES } from '../core/Abilities.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { getDebugOptions } from '../core/Debug.js';
import { text } from './PixelFont.js';
import { ensureUiAssets, icon, panel, burst, UI_TEX } from './UiKit.js';

function introParam() {
  try {
    return new URLSearchParams(window.location.search).get('intro');
  } catch {
    return null;
  }
}

export class AbilityIntro {
  /** Whether RunScene should hold the run for the card. */
  static shouldShow(scene) {
    const ab = scene.entry?.ability;
    if (!ab || !ABILITIES[ab] || gameState.attempts !== 1) return false;
    const p = introParam();
    if (p === '0') return false;
    if (p === '1') return true;
    return !getDebugOptions().skipTitle;
  }

  constructor(scene, onDone) {
    this.scene = scene;
    this.onDone = onDone;
    this.ability = ABILITIES[scene.entry.ability];
    this.levelId = scene.levelId;
    this.done = false;
    this.elapsed = 0;
    ensureUiAssets(scene);

    const D = DEPTH.HUD + 10;
    const cx = GAME.WIDTH / 2;
    const left = Math.round(cx - I.CARD_W / 2);
    const top = 70;

    this.dim = scene.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, C.DIM_OVERLAY, 0.55)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(D);

    const c = scene.add.container(cx, top + I.CARD_H / 2).setScrollFactor(0).setDepth(D + 1);
    this.card = c;
    const ox = -I.CARD_W / 2;
    const oy = -I.CARD_H / 2;
    const g = scene.add.graphics();
    panel(g, ox, oy, I.CARD_W, I.CARD_H, { fill: C.PANEL, hi: C.GOLD, shadow: 3 });
    c.add(g);

    // Ribbon tab
    const tab = scene.add.graphics();
    panel(tab, -46, oy - 7, 92, 15, { fill: C.GOLD, hi: 0xfff0b0, shadow: 1 });
    c.add(tab);
    c.add(text(scene, 0, oy - 3, 'NEW ABILITY!', { flat: true, align: 'center', color: 0x3a1a06 }));

    // Icon at 2x on spinning rays
    const iconX = ox + 42;
    const iconY = oy + 44;
    this.rays = scene.add.image(iconX, iconY, UI_TEX.RAYS).setTint(C.GOLD).setAlpha(0.45).setScale(0.62);
    const disc = scene.add.graphics();
    disc.fillStyle(C.PANEL_DARK, 0.85).fillCircle(iconX, iconY, 25);
    this.icon = icon(scene, iconX, iconY, this.ability.icon, 24).setScale(2);
    c.add([this.rays, disc, this.icon]);
    scene.tweens.add({ targets: this.rays, angle: 360, duration: 6000, repeat: -1 });
    scene.tweens.add({ targets: this.icon, y: iconY - 2, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Name + hint
    const tx = ox + 82;
    c.add(text(scene, tx, oy + 22, this.ability.name.toUpperCase(), { scale: 2, color: C.INK }));
    c.add(text(scene, tx, oy + 44, this.ability.hint.toUpperCase(), { color: C.ORANGE, maxWidth: I.CARD_W - 92 }));

    // Footer: prompt + countdown
    c.add(text(scene, tx, oy + 70, 'PRESS TO GO!', { color: C.MUTED }));
    this.bar = scene.add.graphics();
    c.add(this.bar);
    this.barX = tx;
    this.barY = oy + 82;
    this.barW = (I.CARD_W / 2 - 12) - tx;
    this.drawBar(0);

    // Pop in
    c.setScale(0.6).setAlpha(0);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: I.POP_MS, ease: 'Back.easeOut' });
    burst(scene, cx, top + 10, { count: 18, scroll: 0, depth: D + 2, speed: [40, 140], gravity: 200 });

    // Input (listeners are removed in finish())
    const kb = scene.input.keyboard;
    this.onKey = (e) => { if (!e?.repeat) this.dismiss('press'); };
    this.keys = ['keydown-SPACE', 'keydown-UP', 'keydown-ENTER', 'keydown-ESC'];
    this.keys.forEach(ev => kb.on(ev, this.onKey));
    this.onPointer = () => this.dismiss('press');
    scene.input.on('pointerdown', this.onPointer);
    this.onUpdate = (_t, dt) => this.update(dt);
    scene.events.on('update', this.onUpdate);
    // Scene events outlive the scene's visit: drop the update hook if the run ends
    // while the card is still up
    this.onShutdown = () => scene.events.off('update', this.onUpdate);
    scene.events.once('shutdown', this.onShutdown);

    eventBus.emit(Events.ABILITY_INTRO_SHOWN, { levelId: this.levelId, ability: this.ability.id });
  }

  drawBar(t) {
    const g = this.bar;
    g.clear();
    const w = Math.max(0, Math.round(this.barW * (1 - t)));
    g.fillStyle(C.OUTLINE, 1).fillRect(this.barX - 1, this.barY - 1, this.barW + 2, 4);
    g.fillStyle(C.GOLD, 1).fillRect(this.barX, this.barY, w, 2);
  }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.drawBar(Math.min(1, this.elapsed / I.AUTO_MS));
    if (this.elapsed >= I.AUTO_MS) this.dismiss('auto');
  }

  dismiss(by) {
    if (this.done) return;
    if (by === 'press' && this.elapsed < I.MIN_MS) return;
    this.done = true;
    this.by = by;
    const s = this.scene;
    const kb = s.input.keyboard;
    this.keys.forEach(ev => kb.off(ev, this.onKey));
    s.input.off('pointerdown', this.onPointer);
    s.events.off('update', this.onUpdate);
    s.events.off('shutdown', this.onShutdown);
    s.tweens.add({ targets: this.card, scale: 0.85, alpha: 0, duration: I.OUT_MS, ease: 'Quad.easeIn' });
    s.tweens.add({
      targets: this.dim, alpha: 0, duration: I.OUT_MS,
      onComplete: () => {
        this.card.destroy();
        this.dim.destroy();
      },
    });
    eventBus.emit(Events.ABILITY_INTRO_DONE, { levelId: this.levelId, ability: this.ability.id, by });
    this.onDone?.(by);
  }

  /** For render_game_to_text() (via RunScene.snapshot). */
  snapshot() {
    return { ability: this.ability.id, elapsedMs: Math.round(this.elapsed), done: this.done };
  }
}
