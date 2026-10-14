// In-arena HUD (screen space, scrollFactor 0): HP bar, dash cooldown, XP bar
// + level, wave + timer (BOSS on boss waves), boss HP bar with name, score +
// combo, Golden Bone counter, weapon slots, mute + pause buttons, banners.
// update(world, dtMs) is called once per rendered frame; texts only change when
// their value does.
//
// Juice (Step 3A, tunables in FX): score pops on change, the combo text grows
// and shakes with the multiplier (with a draining timer bar), the HP bar
// leaves a white damage chunk that drains, the XP bar flashes on a level-up,
// the dash bar flashes when ready, banners punch in on a dark ribbon.

import { GAME, UI, COLORS, DEPTH, AUDIO, ICON_FRAMES, ITEM_FRAMES, PLAYER, FX, SCORE } from '../core/Constants.js';
import { MuteButton } from './MuteButton.js';

const HP_W = 84;
const BAR_X = 6;
const BOSS_W = 200;
const BOSS_Y = 44;
const BONE_Y = 10;  // Step 4: on the score row (was 44: it covered Booker by the top fence)

export class Hud {
  constructor(scene) {
    this.scene = scene;
    const text = (x, y, size, color = COLORS.UI_TEXT, origin = [0, 0]) => scene.add.text(x, y, '', {
      fontFamily: UI.FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: COLORS.STROKE, strokeThickness: 3,
    }).setOrigin(origin[0], origin[1]).setScrollFactor(0).setDepth(DEPTH.HUD + 1);

    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD);
    this.hpText = text(BAR_X + HP_W + 4, 4, UI.SMALL_SIZE);
    this.lvText = text(BAR_X + HP_W + 4, 15, UI.SMALL_SIZE, COLORS.MUTED_TEXT);
    this.waveText = text(GAME.WIDTH / 2, 3, UI.BODY_SIZE + 1, COLORS.UI_TEXT, [0.5, 0]);
    this.timerText = text(GAME.WIDTH / 2, 16, UI.BODY_SIZE + 3, COLORS.ACCENT_TEXT, [0.5, 0]);
    const right = GAME.WIDTH - AUDIO.MUTE_BTN_SIZE - AUDIO.MUTE_BTN_MARGIN * 2;
    this.scoreText = text(right, 3, UI.BODY_SIZE + 1, COLORS.UI_TEXT, [1, 0]);
    this.comboText = text(right, 16, UI.SMALL_SIZE + 1, COLORS.ACCENT_TEXT, [1, 0]);
    // Golden Bones sit left of the score, on its row (inside the camera's HUD band)
    this.boneIcon = scene.add.image(right - 18, BONE_Y, 'items', ITEM_FRAMES.GOLDEN_BONE).setScrollFactor(0).setDepth(DEPTH.HUD + 1);
    this.boneText = text(right, BONE_Y, UI.SMALL_SIZE + 1, COLORS.ACCENT_TEXT, [1, 0.5]);
    this.bossText = text(GAME.WIDTH / 2, BOSS_Y - 6, UI.SMALL_SIZE + 1, '#ffb0a0', [0.5, 0.5]).setVisible(false);
    this.mute = new MuteButton(scene, GAME.WIDTH - AUDIO.MUTE_BTN_SIZE - AUDIO.MUTE_BTN_MARGIN, AUDIO.MUTE_BTN_MARGIN, DEPTH.HUD + 2);
    this.buildPauseButton(scene);

    this.slots = [];
    for (let i = 0; i < PLAYER.MAX_WEAPONS; i++) {
      const x = BAR_X + 8 + i * 30;
      const y = GAME.HEIGHT - 11;
      const icon = scene.add.image(x, y, 'icons', 0).setScale(0.625).setScrollFactor(0).setDepth(DEPTH.HUD + 1).setVisible(false);
      const lv = text(x + 9, y + 2, UI.SMALL_SIZE, COLORS.ACCENT_TEXT, [0, 0.5]).setVisible(false);
      this.slots.push({ icon, lv });
    }

    this.bannerTitle = text(GAME.WIDTH / 2, GAME.HEIGHT * 0.36, UI.TITLE_SIZE, COLORS.UI_TEXT, [0.5, 0.5])
      .setDepth(DEPTH.BANNER).setStroke(COLORS.STROKE, 5).setAlpha(0);
    this.bannerSub = text(GAME.WIDTH / 2, GAME.HEIGHT * 0.36 + 20, UI.BODY_SIZE + 1, COLORS.ACCENT_TEXT, [0.5, 0.5])
      .setDepth(DEPTH.BANNER).setAlpha(0);
    this.ribbon = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.BANNER - 1).setAlpha(0);
    this.bannerTween = null;
    this.last = {};
    // juice state
    this.trailHp = null;
    this.trailHold = 0;
    this.scorePop = 0;
    this.xpFlash = 0;
    this.lastLevel = null;
    this.dashFlash = 0;
    this.lastDashCd = 0;
    this.clock = 0;
  }

  /**
   * Pause button under the mute button (Step 4: touch players had no way to
   * pause). Same size and padded hit area as MuteButton; the pointer event
   * stops here, so it never starts the joystick or a dash.
   */
  buildPauseButton(scene) {
    const S = AUDIO.MUTE_BTN_SIZE;
    const x = GAME.WIDTH - S - AUDIO.MUTE_BTN_MARGIN;
    const y = AUDIO.MUTE_BTN_MARGIN * 2 + S;
    const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD + 2);
    const draw = (hover) => {
      g.clear();
      g.fillStyle(COLORS.HUD_PANEL, hover ? 0.6 : 0.4).fillRect(x, y, S, S);
      g.fillStyle(0xffffff, 1).fillRect(x + 4, y + 3, 2, S - 6).fillRect(x + S - 6, y + 3, 2, S - 6);
    };
    draw(false);
    const pad = 4;
    const hit = scene.add.zone(x - pad, y, S + pad * 2, S + pad).setOrigin(0, 0) // starts where the mute pad ends
      .setScrollFactor(0).setDepth(DEPTH.HUD + 2).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p, _lx, _ly, event) => {
      event?.stopPropagation?.();
      scene.pauseGame?.();
    });
    hit.on('pointerover', () => draw(true));
    hit.on('pointerout', () => draw(false));
    this.pauseBtn = { gfx: g, hit, x, y, size: S };
  }

  /** Called by ArenaFx when a level-up opens. */
  flashXp() {
    this.xpFlash = FX.XP_FLASH_MS;
  }

  set(key, obj, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    obj.setText(value);
  }

  update(world, dtMs = 0) {
    const p = world.player;
    const g = this.bars;
    this.clock += dtMs;
    g.clear();
    // HP, with a white damage chunk that holds, then drains (heals snap)
    const hpF = Math.max(0, p.hp) / p.maxHp;
    if (this.trailHp === null || hpF >= this.trailHp) {
      this.trailHp = hpF;
      this.trailHold = 0;
    } else if (this.trailHold < FX.HP_TRAIL_HOLD_MS) {
      this.trailHold += dtMs;
    } else {
      this.trailHp = Math.max(hpF, this.trailHp - FX.HP_TRAIL_RATE * dtMs / 1000);
    }
    const lowHp = hpF > 0 && hpF <= FX.LOW_HP_FRAC;
    g.fillStyle(0x1a1208, 1).fillRect(BAR_X - 1, 4, HP_W + 2, 9);
    g.fillStyle(COLORS.HP_BACK, 1).fillRect(BAR_X, 5, HP_W, 7);
    const hpPx = Math.round(HP_W * hpF);
    const trailPx = Math.round(HP_W * this.trailHp);
    if (trailPx > hpPx) g.fillStyle(0xfff6e0, 1).fillRect(BAR_X + hpPx, 5, trailPx - hpPx, 7);
    const hpCol = lowHp && Math.floor(this.clock / 160) % 2 ? 0xff7a5a : COLORS.HP;
    g.fillStyle(hpCol, 1).fillRect(BAR_X, 5, hpPx, 7);
    g.fillStyle(0xffffff, 0.25).fillRect(BAR_X, 5, hpPx, 2);
    // Dash cooldown (flashes white when it comes back)
    const dashReady = 1 - p.dashCd / PLAYER.DASH_COOLDOWN_S;
    if (this.lastDashCd > 0 && p.dashCd <= 0) this.dashFlash = 200;
    this.lastDashCd = p.dashCd;
    this.dashFlash = Math.max(0, this.dashFlash - dtMs);
    g.fillStyle(0x1a1208, 1).fillRect(BAR_X - 1, 14, 30, 4);
    g.fillStyle(this.dashFlash > 0 ? 0xffffff : COLORS.DASH, dashReady >= 1 ? 1 : 0.45).fillRect(BAR_X, 15, Math.round(28 * dashReady), 2);
    // XP (flashes on level-up)
    if (this.lastLevel !== null && world.level > this.lastLevel) this.xpFlash = FX.XP_FLASH_MS;
    this.lastLevel = world.level;
    this.xpFlash = Math.max(0, this.xpFlash - dtMs);
    g.fillStyle(0x1a1208, 1).fillRect(BAR_X + 31, 14, HP_W - 30, 4);
    g.fillStyle(COLORS.XP_BACK, 1).fillRect(BAR_X + 32, 15, HP_W - 32, 2);
    g.fillStyle(COLORS.XP, 1).fillRect(BAR_X + 32, 15, Math.round((HP_W - 32) * Math.min(1, world.xp / world.xpNext)), 2);
    if (this.xpFlash > 0) {
      g.fillStyle(0xffffff, this.xpFlash / FX.XP_FLASH_MS).fillRect(BAR_X + 31, 14, HP_W - 30, 4);
    }

    // Boss HP bar
    const boss = world.boss;
    if (boss) {
      const x0 = (GAME.WIDTH - BOSS_W) / 2;
      const f = Math.max(0, boss.hp) / boss.maxHp;
      g.fillStyle(0x1a1208, 1).fillRect(x0 - 2, BOSS_Y - 1, BOSS_W + 4, 8);
      g.fillStyle(0x3a1010, 1).fillRect(x0, BOSS_Y, BOSS_W, 6);
      g.fillStyle(boss.phase2 ? 0xff3a6a : 0xe0473a, 1).fillRect(x0, BOSS_Y, Math.round(BOSS_W * f), 6);
      g.fillStyle(0xffffff, 0.3).fillRect(x0, BOSS_Y, Math.round(BOSS_W * f), 2);
      g.fillStyle(0x1a1208, 1).fillRect(x0 + BOSS_W / 2, BOSS_Y, 1, 6); // 50 % tick (Robo-Vac phase 2)
      this.bossText.setVisible(true);
      this.set('boss', this.bossText, boss.def.name);
    } else if (this.bossText.visible) {
      this.bossText.setVisible(false);
    }
    this.set('bones', this.boneText, `${world.goldenBones}`);

    this.set('hp', this.hpText, `${Math.ceil(p.hp)}/${Math.round(p.maxHp)}`);
    this.set('lv', this.lvText, `LV ${world.level}`);
    this.set('wave', this.waveText, world.endless && world.wave > 10 ? `ENDLESS ${world.wave}` : `WAVE ${world.wave}`);
    let timer;
    if (world.phase === 'wave_break') timer = 'BREAK';
    else if (world.phase === 'victory') timer = 'WIN!';
    else if (world.bossWave) timer = world.bossDeadT > 0 ? 'CLEAR!' : 'BOSS';
    else {
      const s = Math.ceil(world.waveLeft);
      timer = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    this.set('timer', this.timerText, timer);
    if (this.last.score !== undefined && this.last.score !== world.score.toLocaleString('en-US')) this.scorePop = FX.SCORE_POP_MS;
    this.set('score', this.scoreText, world.score.toLocaleString('en-US'));
    this.scorePop = Math.max(0, this.scorePop - dtMs);
    const sp = this.scorePop / FX.SCORE_POP_MS;
    this.scoreText.setScale(1 + FX.SCORE_POP_SCALE * sp * sp);
    // Bone counter left of the score (unscaled width, so the score pop doesn't shove it)
    const bx = Math.round(this.scoreText.x - this.scoreText.width - 8);
    if (this.boneText.x !== bx) this.boneText.setX(bx);
    this.boneIcon.setX(bx - this.boneText.width - 9);
    // Combo meter: grows and shakes with the multiplier; a bar drains with the combo window
    const c = world.combo;
    const on = c.count >= 2;
    this.set('combo', this.comboText, on ? `x${c.mult.toFixed(1)} COMBO ${c.count}` : '');
    const right = this.scoreText.x;
    if (on) {
      const heat = (c.mult - 1) / (SCORE.COMBO_CAP - 1); // 0..1
      this.comboText.setScale(1 + 0.35 * heat);
      const jit = heat > 0.3 ? Math.round((Math.random() - 0.5) * 2 * heat * 1.6) : 0;
      this.comboText.setPosition(right + jit, 16 + (heat > 0.3 ? Math.round((Math.random() - 0.5) * 2 * heat) : 0));
      const col = heat >= 1 ? '#ff6a4a' : (heat > 0.5 ? '#ffb04a' : COLORS.ACCENT_TEXT);
      if (this.last.comboCol !== col) {
        this.last.comboCol = col;
        this.comboText.setColor(col);
      }
      const bw = 44;
      const f = Math.max(0, Math.min(1, c.timer / SCORE.COMBO_WINDOW_S));
      const by = 16 + Math.round(this.comboText.height * this.comboText.scaleY) + 1;
      g.fillStyle(0x1a1208, 0.9).fillRect(right - bw - 1, by, bw + 2, 3);
      g.fillStyle(heat >= 1 ? 0xff6a4a : COLORS.DASH, 1).fillRect(right - Math.round(bw * f), by + 1, Math.round(bw * f), 1);
    } else if (this.comboText.scaleX !== 1) {
      this.comboText.setScale(1).setPosition(right, 16);
    }

    world.weapons.forEach((w, i) => {
      const s = this.slots[i];
      if (!s) return;
      s.icon.setVisible(true).setFrame(ICON_FRAMES[w.key] ?? 0);
      s.lv.setVisible(true);
      this.set(`slot${i}`, s.lv, `${w.level}`);
    });
    for (let i = world.weapons.length; i < this.slots.length; i++) {
      this.slots[i].icon.setVisible(false);
      this.slots[i].lv.setVisible(false);
    }
  }

  /** style: 'wave' | 'clear' | 'boss' | 'danger' (ribbon colour + text colour). */
  banner(title, sub = '', style = 'wave') {
    const s = this.scene;
    const STYLE = {
      wave: { ribbon: 0x1a1208, edge: 0xffd44a, text: COLORS.UI_TEXT },
      clear: { ribbon: 0x16300c, edge: 0x9be27a, text: '#e8ffd0' },
      boss: { ribbon: 0x300c0a, edge: 0xff4a3a, text: '#ffd0c0' },
      danger: { ribbon: 0x2a0806, edge: 0xff4a3a, text: '#ffb0a0' },
    }[style] || { ribbon: 0x1a1208, edge: 0xffd44a, text: COLORS.UI_TEXT };
    const y = GAME.HEIGHT * 0.36;
    const rg = this.ribbon;
    rg.clear();
    rg.fillStyle(STYLE.ribbon, 0.6).fillRect(0, y - 16, GAME.WIDTH, sub ? 44 : 32);
    rg.fillStyle(STYLE.edge, 0.9).fillRect(0, y - 17, GAME.WIDTH, 1).fillRect(0, y + (sub ? 28 : 16), GAME.WIDTH, 1);
    rg.setAlpha(1).setScale(1, 0.2).setY(y * 0.8);
    this.bannerTitle.setText(title).setColor(STYLE.text).setAlpha(0).setScale(FX.BANNER_PUNCH_SCALE);
    this.bannerSub.setText(sub).setAlpha(0).setX(GAME.WIDTH / 2 + 30);
    if (this.bannerTween) this.bannerTween.stop();
    s.tweens.killTweensOf([this.bannerTitle, this.bannerSub, rg]);
    // Ribbon opens, title punches in (big -> 1x), subtitle slides in
    s.tweens.add({ targets: rg, scaleY: 1, y: 0, duration: 140, ease: 'Quad.Out' });
    s.tweens.add({ targets: this.bannerTitle, scale: 1, alpha: 1, duration: FX.BANNER_PUNCH_MS, ease: 'Back.Out' });
    if (sub) s.tweens.add({ targets: this.bannerSub, x: GAME.WIDTH / 2, alpha: 1, delay: 90, duration: 200, ease: 'Quad.Out' });
    this.bannerTween = s.tweens.add({
      targets: [this.bannerTitle, this.bannerSub, rg],
      alpha: 0,
      delay: UI.BANNER_HOLD_MS,
      duration: UI.BANNER_FADE_MS,
    });
  }
}
