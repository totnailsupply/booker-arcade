import Phaser from 'phaser';
import { GAME, PAUSE_UI as P, UI_COLORS as C } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { text } from '../ui/PixelFont.js';
import { ensureUiAssets, panel, PixelButton, bindMenuKeys } from '../ui/UiKit.js';

// Pause menu over the paused RunScene: RESUME / RESTART / LEVELS / SOUND.
// Keys: Up/Down (W/S) move, Space/Enter press, P or Esc resume, R restart,
// Q levels, M mute (global). Mouse/touch: tap a button; tap outside the panel resumes.
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  init(data) {
    this.levelId = data?.levelId || null;
  }

  create() {
    ensureUiAssets(this);
    this.resuming = false;
    const cx = GAME.WIDTH / 2;
    const n = 4;
    const H = 34 + n * P.BTN_GAP + 6;
    const top = Math.round(GAME.HEIGHT / 2 - H / 2) - 4;
    const left = Math.round(cx - P.PANEL_W / 2);

    this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, C.DIM_OVERLAY, 0.6).setOrigin(0, 0);
    const g = this.add.graphics();
    panel(g, left, top, P.PANEL_W, H, { fill: C.PANEL, hi: C.PANEL_HI, shadow: 3 });
    text(this, cx, top + 9, 'PAUSED', { scale: 2, align: 'center', color: C.GOLD });
    this.panelRect = new Phaser.Geom.Rectangle(left, top, P.PANEL_W, H);

    const defs = [
      { id: 'resume', label: 'RESUME', onPress: () => this.resumeGame() },
      { id: 'restart', label: 'RESTART LEVEL', onPress: () => this.restart() },
      { id: 'levels', label: 'LEVEL SELECT', onPress: () => this.quit() },
      { id: 'sound', label: this.soundLabel(), onPress: () => eventBus.emit(Events.AUDIO_TOGGLE_MUTE) },
    ];
    this.buttons = defs.map((d, i) => new PixelButton(this, cx, top + 42 + i * P.BTN_GAP, P.BTN_W, d.label, {
      id: d.id,
      style: i === 0 ? 'primary' : 'ghost',
      onPress: d.onPress,
      onFocus: (b) => this.setFocus(this.buttons.indexOf(b)),
    }));
    this.focus = 0;
    this.drawFocus();
    text(this, cx, top + H + 6, 'P / ESC RESUME   R RESTART   Q LEVELS', { align: 'center', color: C.DIM });

    this.onMute = () => this.buttons[3]?.setLabel(this.soundLabel());
    eventBus.on(Events.AUDIO_MUTE_CHANGED, this.onMute);
    this.events.once('shutdown', () => eventBus.off(Events.AUDIO_MUTE_CHANGED, this.onMute));

    bindMenuKeys(this, {
      up: () => this.moveFocus(-1),
      down: () => this.moveFocus(1),
      left: () => this.moveFocus(-1),
      right: () => this.moveFocus(1),
      confirm: () => this.buttons[this.focus].press(),
      back: () => this.resumeGame(),
    });
    // Auto-repeat is ignored: holding P must not flicker between paused and playing
    const kb = this.input.keyboard;
    const once = (fn) => (e) => { if (!e?.repeat) fn(); };
    kb.on('keydown-P', once(() => this.resumeGame()));
    kb.on('keydown-R', once(() => this.restart()));
    kb.on('keydown-Q', once(() => this.quit()));
    // Tap outside the panel resumes (buttons stop their own pointer events)
    this.input.on('pointerdown', (p) => {
      if (!this.panelRect.contains(p.x, p.y)) this.resumeGame();
    });
  }

  soundLabel() {
    return gameState.isMuted ? 'SOUND: OFF' : 'SOUND: ON';
  }

  setFocus(i) {
    if (i < 0 || i === this.focus) return;
    this.focus = i;
    eventBus.emit(Events.MENU_MOVE, { scene: 'PauseScene', index: i });
    this.drawFocus();
  }

  moveFocus(d) {
    const n = this.buttons.length;
    this.setFocus((this.focus + d + n) % n);
  }

  drawFocus() {
    this.buttons.forEach((b, i) => b.setFocused(i === this.focus));
  }

  resumeGame() {
    if (this.resuming) return;
    this.resuming = true;
    eventBus.emit(Events.MENU_SELECT, { scene: 'PauseScene', action: 'resume' });
    this.scene.resume('RunScene');
    this.scene.stop();
  }

  restart() {
    if (this.resuming) return;
    this.resuming = true;
    eventBus.emit(Events.MENU_SELECT, { scene: 'PauseScene', action: 'restart', levelId: this.levelId });
    eventBus.emit(Events.GAME_RESUME);   // un-pause the music system; the restart starts a fresh loop
    const run = this.scene.get('RunScene');
    this.scene.stop();
    run.retry();
  }

  quit() {
    if (this.resuming) return;
    this.resuming = true;
    eventBus.emit(Events.MENU_BACK, { scene: 'PauseScene' });
    eventBus.emit(Events.GAME_RESUME);   // the music system un-pauses before the menu track takes over
    this.scene.stop('RunScene');
    this.scene.start('LevelSelectScene', { selected: this.levelId, music: true });
  }

  /** For render_game_to_text(). */
  snapshot() {
    return {
      screen: 'pause',
      buttons: this.buttons.map(b => b.id),
      focus: this.buttons[this.focus]?.id || null,
    };
  }
}
