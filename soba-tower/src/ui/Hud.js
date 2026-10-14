import { UI, COLORS, GAME, SAFE_ZONE, DEPTH, AUDIO, WORLD, PROGRESS_FX as PF } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { MuteButton } from './MuteButton.js';

// HUD (screen-fixed, updated through EventBus except the per-frame marker):
//   top band   a dark band (a touch stronger than before, with a light edge) so
//              platforms passing under it never fight the text
//   top-left   height in meters (big; punches on each 50 m milestone) and score
//   top-centre treats collected / total (biscuit icon; bumps when a collected
//              biscuit flies in — fx:treatArrive)
//   top-right  pause + mute buttons, lives as paw icons below them
//   right edge vertical progress bar on a dark backing (platforms near the right
//              edge pass under it): street at the bottom, bell on top, zone
//              ticks, best-height tick, Soba marker
//   centre     zone ribbon that slides in when a gate (checkpoint) is reached
//   under band "100 m" milestone pop

const MAX_PAWS = 5;

export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} level LEVEL1
   * @param {() => void} onPause called by the pause button
   */
  constructor(scene, level, onPause) {
    this.scene = scene;
    this.level = level;
    this.topPx = level.finish.y;
    const m = UI.HUD_MARGIN;
    const top = SAFE_ZONE.TOP + m;
    this.top = top;
    const style = (size, color = COLORS.UI_TEXT) => ({
      fontFamily: UI.FONT, fontSize: `${size}px`, fontStyle: 'bold',
      color, stroke: COLORS.UI_SHADOW, strokeThickness: 3,
    });
    this.style = style;
    const items = [];
    const fix = (o) => { o.setScrollFactor(0).setDepth(DEPTH.HUD); items.push(o); return o; };

    const bandH = UI.HUD_PANEL_H + SAFE_ZONE.TOP;
    fix(scene.add.rectangle(0, 0, GAME.WIDTH, bandH, COLORS.HUD_PANEL, PF.HUD_BAND_ALPHA).setOrigin(0, 0));
    fix(scene.add.rectangle(0, bandH, GAME.WIDTH, 1, PF.HUD_EDGE, PF.HUD_EDGE_ALPHA).setOrigin(0, 0));
    this.heightText = fix(scene.add.text(m, top - 2, '0m', style(UI.HUD_HEIGHT_SIZE)));
    this.scoreText = fix(scene.add.text(m, top + 17, '', style(UI.HUD_SIZE, COLORS.SCORE_GOLD)));

    // Treats: biscuit icon + "n/40"
    this.treatIcon = fix(scene.add.image(UI.TREAT_ICON_X, top + 7, 'treat'));
    this.treatText = fix(scene.add.text(UI.TREAT_ICON_X + 8, top, '', style(UI.HUD_SIZE + 2)));

    // Buttons: mute in the corner, pause to its left
    const S = AUDIO.MUTE_BTN_SIZE;
    const muteX = GAME.WIDTH - m - S;
    this.muteButton = new MuteButton(scene, muteX, top, DEPTH.HUD + 1);
    this.pauseX = muteX - AUDIO.MUTE_BTN_MARGIN - S - 2;
    this.pauseGfx = fix(scene.add.graphics());
    this.drawPause(false);
    const pad = 4;
    this.pauseHit = fix(scene.add.zone(this.pauseX - pad, top - pad, S + pad * 2, S + pad * 2).setOrigin(0, 0));
    this.pauseHit.setInteractive({ useHandCursor: true });
    this.pauseHit.on('pointerdown', (_p, _x, _y, event) => {
      event?.stopPropagation?.();
      onPause();
    });
    this.pauseHit.on('pointerover', () => this.drawPause(true));
    this.pauseHit.on('pointerout', () => this.drawPause(false));

    // Lives: paw icons right-aligned under the buttons
    this.paws = [];
    for (let i = 0; i < MAX_PAWS; i++) {
      this.paws.push(fix(scene.add.image(GAME.WIDTH - m - 5 - i * UI.HUD_PAW_GAP, top + 24, 'paw')));
    }
    this.livesText = fix(scene.add.text(GAME.WIDTH - m - 5 - MAX_PAWS * UI.HUD_PAW_GAP, top + 18, '', style(UI.HUD_SIZE)).setOrigin(1, 0));

    // Vertical progress bar
    const bx = UI.PROGRESS_X;
    const by0 = UI.PROGRESS_TOP;
    const by1 = UI.PROGRESS_BOTTOM;
    this.barLen = by1 - by0;
    const backTop = by0 - 24;
    fix(scene.add.rectangle(bx, backTop, UI.PROGRESS_BACK_W, by1 - backTop + 4, COLORS.PROGRESS_BACK, COLORS.PROGRESS_BACK_ALPHA)
      .setOrigin(0.5, 0));
    fix(scene.add.rectangle(bx, by0, UI.PROGRESS_W, this.barLen, COLORS.PROGRESS_BG).setOrigin(0.5, 0).setStrokeStyle(1, 0x1a1220));
    this.barFill = fix(scene.add.rectangle(bx, by1, UI.PROGRESS_W, this.barLen, COLORS.PROGRESS_FILL).setOrigin(0.5, 1).setAlpha(UI.PROGRESS_ALPHA));
    this.barFill.scaleY = 0;
    for (const z of level.zones.slice(1)) {
      fix(scene.add.rectangle(bx, this.barY(z.startY), UI.PROGRESS_W + 4, 1, COLORS.PROGRESS_ZONE).setOrigin(0.5, 0.5));
    }
    fix(scene.add.image(bx, by0 - 2, 'bell').setOrigin(0.5, 1).setScale(UI.PROGRESS_BELL_SCALE));
    this.bestTick = fix(scene.add.rectangle(bx, by1, UI.PROGRESS_W + 6, 2, COLORS.PROGRESS_BEST).setOrigin(0.5, 0.5));
    const bestPx = gameState.bestHeightM * WORLD.PX_PER_M;
    this.bestTick.setY(this.barY(bestPx)).setVisible(bestPx > 0);
    this.marker = fix(scene.add.rectangle(bx, by1, UI.PROGRESS_W + 6, 3, COLORS.PROGRESS_SOBA).setOrigin(0.5, 0.5).setStrokeStyle(1, 0x1a1220));

    // Zone ribbon (slides in from the left, out to the right)
    this.banner = scene.add.container(-GAME.WIDTH, PF.BANNER_Y).setScrollFactor(0).setDepth(DEPTH.HUD + 2);
    this.bannerBg = scene.add.graphics();
    this.bannerTitle = scene.add.text(0, -8, '', { ...style(UI.SMALL_SIZE, '#ffc04d'), strokeThickness: 3 }).setOrigin(0.5);
    this.bannerName = scene.add.text(0, 7, '', { ...style(UI.HEADING_SIZE - 4, '#ffe6b0'), strokeThickness: 4 }).setOrigin(0.5);
    this.banner.add([this.bannerBg, this.bannerTitle, this.bannerName]);
    this.banner.setVisible(false);
    items.push(this.banner);

    this.items = items;

    this.onScore = ({ score }) => this.scoreText.setText(`SCORE ${score}`);
    this.onHeight = ({ maxHeightM }) => this.heightText.setText(`${Math.floor(maxHeightM)}m`);
    this.onLives = ({ lives }) => this.drawLives(lives);
    this.onZone = ({ zone, name }) => this.showBanner(zone, name);
    this.onTreat = ({ treats, total }) => { this.treatsShown = { treats, total }; };
    this.onTreatArrive = ({ treats, total }) => this.bumpTreats(treats, total);
    this.onMilestone = ({ meters }) => this.milestone(meters);
    eventBus.on(Events.SCORE_CHANGED, this.onScore);
    eventBus.on(Events.HEIGHT_CHANGED, this.onHeight);
    eventBus.on(Events.LIVES_CHANGED, this.onLives);
    eventBus.on(Events.ZONE_CHANGED, this.onZone);
    eventBus.on(Events.TREAT_COLLECTED, this.onTreat);
    eventBus.on(Events.FX_TREAT_ARRIVE, this.onTreatArrive);
    eventBus.on(Events.FX_MILESTONE, this.onMilestone);

    this.treatText.setText(`${gameState.treats}/${gameState.treatsTotal}`);
    this.onScore({ score: gameState.score });
    this.onHeight({ maxHeightM: gameState.maxHeightM });
    this.drawLives(gameState.lives);
  }

  barY(heightPx) {
    const k = Math.max(0, Math.min(1, heightPx / this.topPx));
    return UI.PROGRESS_BOTTOM - k * this.barLen;
  }

  drawPause(hover) {
    const g = this.pauseGfx;
    const S = AUDIO.MUTE_BTN_SIZE;
    const x = this.pauseX;
    const y = SAFE_ZONE.TOP + UI.HUD_MARGIN;
    g.clear();
    g.fillStyle(COLORS.HUD_PANEL, hover ? 0.7 : 0.45);
    g.fillRect(x, y, S, S);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x + 4, y + 3, 2, S - 6);
    g.fillRect(x + S - 6, y + 3, 2, S - 6);
  }

  drawLives(lives) {
    const shown = Math.min(lives, MAX_PAWS);
    this.paws.forEach((p, i) => p.setVisible(i < shown));
    this.livesText.setText(lives > MAX_PAWS ? `x${lives}` : '');
  }

  /** The biscuit reached the counter: update it with a little bump. */
  bumpTreats(treats, total) {
    this.treatText.setText(`${treats}/${total}`);
    const { tweens } = this.scene;
    for (const t of [this.treatIcon, this.treatText]) {
      tweens.killTweensOf(t);
      t.setScale(PF.COUNTER_BUMP);
      tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  /** Zone ribbon: slide in (Back ease), hold while fading to translucent, slide out. */
  showBanner(zone, name) {
    const { scene } = this;
    const label = name.toUpperCase();
    this.bannerTitle.setText(`ZONE ${zone}`);
    this.bannerName.setText(label);
    const w = Math.max(150, Math.ceil(this.bannerName.width) + 34);
    const h = PF.BANNER_H;
    const g = this.bannerBg;
    g.clear();
    g.fillStyle(0x0b0614, 0.55);
    g.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);
    g.fillStyle(PF.BANNER_EDGE, 1);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(PF.BANNER_FILL, 1);
    g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
    // notched ribbon tails
    g.fillStyle(PF.BANNER_EDGE, 1);
    g.fillTriangle(-w / 2 - 10, -h / 2 + 4, -w / 2, -h / 2 + 4, -w / 2, h / 2 - 4);
    g.fillTriangle(-w / 2 - 10, h / 2 - 4, -w / 2, -h / 2 + 4, -w / 2, h / 2 - 4);
    g.fillTriangle(w / 2 + 10, -h / 2 + 4, w / 2, -h / 2 + 4, w / 2, h / 2 - 4);
    g.fillTriangle(w / 2 + 10, h / 2 - 4, w / 2, -h / 2 + 4, w / 2, h / 2 - 4);
    this.banner.setVisible(true).setAlpha(PF.BANNER_ALPHA).setPosition(-w, PF.BANNER_Y);
    if (this.bannerChain && this.bannerChain.isPlaying()) this.bannerChain.stop();
    this.bannerChain = scene.tweens.chain({
      targets: this.banner,
      tweens: [
        { x: GAME.WIDTH / 2, duration: PF.BANNER_IN_MS, ease: 'Back.easeOut' },
        // Fades while it holds, so a platform passing under it shows through
        { x: GAME.WIDTH / 2, alpha: PF.BANNER_HOLD_ALPHA, duration: PF.BANNER_HOLD_MS, ease: 'Sine.easeIn' },
        { x: GAME.WIDTH + w, alpha: 0, duration: PF.BANNER_OUT_MS, ease: 'Quad.easeIn' },
      ],
      onComplete: () => this.banner.setVisible(false),
    });
  }

  /** "100 m" pop under the band + a punch on the height readout. */
  milestone(meters) {
    const { scene } = this;
    scene.tweens.killTweensOf(this.heightText);
    this.heightText.setScale(1.35).setColor(COLORS.SCORE_GOLD);
    scene.tweens.add({
      targets: this.heightText, scale: 1, duration: 260, ease: 'Back.easeOut',
      onComplete: () => this.heightText.setColor(COLORS.UI_TEXT),
    });
    const t = scene.add.text(UI.HUD_MARGIN + 2, PF.MILESTONE_Y, `${meters} m!`, {
      ...this.style(UI.BODY_SIZE + 2, COLORS.SCORE_GOLD), strokeThickness: 4,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.HUD + 1).setScale(0.5).setAlpha(0);
    scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: t, y: PF.MILESTONE_Y - 8, alpha: 0, delay: PF.MILESTONE_MS - 250, duration: 250,
      onComplete: () => t.destroy(),
    });
  }

  /** Finish: the HUD steps aside for the bell + fireworks. */
  fadeOut(ms) {
    const targets = [...this.items, this.muteButton?.gfx].filter(Boolean);
    this.scene.tweens.add({ targets, alpha: 0, duration: ms });
  }

  /** Per frame: Soba marker + bar fill. heightPx = Soba's current feet height. */
  update(_dt, heightPx) {
    this.marker.setY(Math.round(this.barY(heightPx)));
    this.barFill.scaleY = Math.max(0, Math.min(1, (gameState.maxHeightM * WORLD.PX_PER_M) / this.topPx));
  }

  destroy() {
    this.muteButton?.destroy();
    eventBus.off(Events.SCORE_CHANGED, this.onScore);
    eventBus.off(Events.HEIGHT_CHANGED, this.onHeight);
    eventBus.off(Events.LIVES_CHANGED, this.onLives);
    eventBus.off(Events.ZONE_CHANGED, this.onZone);
    eventBus.off(Events.TREAT_COLLECTED, this.onTreat);
    eventBus.off(Events.FX_TREAT_ARRIVE, this.onTreatArrive);
    eventBus.off(Events.FX_MILESTONE, this.onMilestone);
  }
}
