import Phaser from 'phaser';
import { GAME } from '../core/Constants.js';
import { META_FONT, META_TEXT, META_COLORS, MENU, LEVEL_NODES, TITLE_MENU as T } from '../core/MetaConstants.js';
import { SaveData } from '../core/SaveData.js';
import { makeBattleConfig } from '../core/BattleConfig.js';
import { gameState } from '../core/GameState.js';
import { LEVELS } from '../data/levels/index.js';
import { UNITS } from '../data/units.js';
import { ITEM, SOBA_FRAMES } from '../core/Assets.js';
import { MuteButton } from './MuteButton.js';

// Shared pieces for the menu scenes: text style, night backdrop, bone badge,
// toasts, fades, level/progression helpers and the one place that starts a
// battle from a menu.

export function menuStyle(size = META_TEXT.BODY, color = META_COLORS.TEXT, extra = {}) {
  return {
    fontFamily: META_FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    stroke: META_COLORS.TEXT_STROKE,
    strokeThickness: META_TEXT.STROKE,
    ...extra,
  };
}

export function menuText(scene, x, y, str, size, color, extra) {
  return scene.add.text(x, y, str, menuStyle(size, color, extra));
}

/** Menu button with the shared look (lip, font, 40 px tall). */
export function menuButtonOpts(extra = {}) {
  return { font: META_FONT, size: META_TEXT.BODY + 1, lip: true, radius: MENU.BTN_RADIUS, ...extra };
}

// --- animations -------------------------------------------------------------------

export function ensureMenuAnims(scene) {
  const a = scene.anims;
  if (!a.exists('menu-soba-idle')) {
    a.create({ key: 'menu-soba-idle', frames: a.generateFrameNumbers('soba', { frames: SOBA_FRAMES.IDLE }), frameRate: T.SOBA_IDLE_FPS, repeat: -1 });
  }
  if (!a.exists('menu-soba-run')) {
    a.create({ key: 'menu-soba-run', frames: a.generateFrameNumbers('soba', { frames: SOBA_FRAMES.RUN }), frameRate: T.SOBA_IDLE_FPS * 4, repeat: -1 });
  }
}

// --- backdrop -----------------------------------------------------------------------

/** Night sky with stars (deterministic) and a moon. */
export function drawNightSky(scene, { moon = true } = {}) {
  const g = scene.add.graphics();
  const bands = T.SKY_BANDS;
  const top = Phaser.Display.Color.IntegerToColor(META_COLORS.SKY_TOP);
  const bot = Phaser.Display.Color.IntegerToColor(META_COLORS.SKY_BOTTOM);
  for (let i = 0; i < bands; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, bands - 1, i);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
    g.fillRect(0, Math.floor((GAME.HEIGHT * i) / bands), GAME.WIDTH, Math.ceil(GAME.HEIGHT / bands) + 1);
  }
  let s = T.STAR_SEED;
  const rnd = () => {
    s = (s * T.STAR_RNG.A + T.STAR_RNG.C) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < T.STAR_COUNT; i++) {
    g.fillStyle(META_COLORS.STAR, 0.35 + rnd() * 0.6);
    const size = rnd() < 0.15 ? 2 : 1;
    g.fillRect(Math.floor(rnd() * GAME.WIDTH), Math.floor(rnd() * GAME.HEIGHT * 0.6), size, size);
  }
  if (moon) {
    g.fillStyle(META_COLORS.MOON, 1).fillCircle(T.MOON.X, T.MOON.Y, T.MOON.R);
    g.fillStyle(META_COLORS.MOON_SHADE, 1).fillCircle(T.MOON.X + T.MOON.R / 3, T.MOON.Y - 2, T.MOON.R / 4);
    g.fillCircle(T.MOON.X - T.MOON.R / 3, T.MOON.Y + T.MOON.R / 3, T.MOON.R / 5);
  }
  return g;
}

/** A hanging paper lantern that sways a little. */
export function addLantern(scene, x, y, index = 0) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(META_COLORS.LANTERN_STRING, 1).fillRect(-0.5, 0, 1, 2);
  g.fillStyle(META_COLORS.LANTERN, 1).fillEllipse(0, T.LANTERN_RY + 1, T.LANTERN_RX * 2, T.LANTERN_RY * 2);
  g.fillStyle(META_COLORS.LANTERN_CAP, 1).fillRect(-T.LANTERN_RX / 2, 1, T.LANTERN_RX, 2);
  g.fillRect(-T.LANTERN_RX / 2, T.LANTERN_RY * 2, T.LANTERN_RX, 2);
  g.fillStyle(META_COLORS.LANTERN_GLOW, 1).fillRect(-1, T.LANTERN_RY - 2, 2, 5);
  c.add(g);
  scene.tweens.add({
    targets: c,
    angle: { from: -T.LANTERN_SWAY_DEG, to: T.LANTERN_SWAY_DEG },
    duration: T.LANTERN_SWAY_MS + index * T.LANTERN_SWAY_STEP_MS,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return c;
}

/** A dark rounded panel with a wooden edge. */
export function drawPanel(scene, x, y, w, h, alpha = META_COLORS.PANEL_ALPHA) {
  const g = scene.add.graphics();
  g.fillStyle(META_COLORS.PANEL_EDGE, alpha).fillRoundedRect(x, y, w, h, MENU.BTN_RADIUS + 2);
  const b = MENU.PANEL_BORDER;
  g.fillStyle(META_COLORS.PANEL, alpha).fillRoundedRect(x + b, y + b, w - b * 2, h - b * 2, MENU.BTN_RADIUS);
  g.lineStyle(2, META_COLORS.NODE_EDGE, 1).strokeRoundedRect(x, y, w, h, MENU.BTN_RADIUS + 2);
  return g;
}

// --- bone badge -----------------------------------------------------------------------

/** "[bone] 25" badge. Returns { container, set(n), shake() }. */
export function addBoneBadge(scene, x, y) {
  const B = MENU.BONE_BADGE;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(META_COLORS.PANEL, 0.85).fillRoundedRect(0, 0, B.W, B.H, MENU.BTN_RADIUS);
  g.lineStyle(2, META_COLORS.PANEL_EDGE, 1).strokeRoundedRect(0, 0, B.W, B.H, MENU.BTN_RADIUS);
  const icon = scene.add.image(B.H / 2 + 2, B.H / 2, 'items', ITEM.BONE).setScale(MENU.ICON_SCALE * 0.75);
  const txt = menuText(scene, B.H + 4, B.H / 2, '0', META_TEXT.HEADING, META_COLORS.TEXT_GOLD).setOrigin(0, 0.5);
  c.add([g, icon, txt]);
  const set = (n) => txt.setText(String(n));
  set(SaveData.bones());
  const shake = () => shakeX(scene, c);
  return { container: c, text: txt, set, shake };
}

export function shakeX(scene, target) {
  const x0 = target.x;
  scene.tweens.killTweensOf(target);
  target.x = x0;
  scene.tweens.add({
    targets: target,
    x: x0 + MENU.SHAKE_PX,
    duration: MENU.SHAKE_MS,
    yoyo: true,
    repeat: MENU.SHAKE_REPEAT,
    onComplete: () => { target.x = x0; },
  });
}

/** The speaker (mute) button in the top-right slot of a menu screen. */
export function drawMuteSlot(scene) {
  const M = MENU.MUTE_SLOT;
  return new MuteButton(scene, M.X, M.Y, { size: M.W, depth: MENU.MUTE_DEPTH ?? 1000 });
}

/** A short message near the bottom of the screen. */
export function toast(scene, str, color = META_COLORS.TEXT, y = MENU.TOAST_Y) {
  scene.menuToast?.destroy();
  const t = menuText(scene, GAME.WIDTH / 2, y, str, META_TEXT.BODY, color).setOrigin(0.5).setDepth(1000);
  scene.menuToast = t;
  scene.tweens.add({ targets: t, alpha: 0, delay: MENU.TOAST_MS, duration: MENU.FADE_MS, onComplete: () => t.destroy() });
  return t;
}

// --- transitions ----------------------------------------------------------------------

export function fadeIn(scene) {
  scene.cameras.main.fadeIn(MENU.FADE_MS, 0, 0, 0);
}

/** Fades out, then starts sceneKey. Only the first call per scene counts. */
export function fadeTo(scene, sceneKey, data, ms = MENU.FADE_MS) {
  if (scene.menuLeaving) return;
  scene.menuLeaving = true;
  scene.cameras.main.fadeOut(ms, 0, 0, 0);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(sceneKey, data));
}

// --- progression ----------------------------------------------------------------------

export function levelData(n) {
  return LEVELS.find(l => l.number === n) || null;
}

export function unitName(key) {
  return UNITS[key]?.name || key;
}

/** The unit a first clear of level n unlocks (level.clearUnlocks, else the map table). */
export function levelReward(n) {
  const data = levelData(n);
  const fromData = data?.clearUnlocks?.[0];
  return fromData || LEVEL_NODES[n - 1]?.reward || null;
}

/**
 * Everything the level select needs about node n:
 * { n, name, exists, playable, cleared, stars, bestScore, reward, lockReason }
 */
export function levelInfo(n) {
  const node = LEVEL_NODES[n - 1];
  const data = levelData(n);
  const save = SaveData.level(n);
  const prevCleared = n === 1 || SaveData.level(n - 1).cleared;
  const exists = !!data;
  let lockReason = null;
  if (!exists) lockReason = 'Coming soon';
  else if (!prevCleared) lockReason = `Clear ${LEVEL_NODES[n - 2]?.name || 'the last level'} first`;
  return {
    n,
    name: data?.name || node?.name || `Level ${n}`,
    exists,
    playable: exists && prevCleared,
    cleared: save.cleared,
    stars: save.stars,
    bestScore: save.bestScore,
    reward: levelReward(n),
    lockReason,
  };
}

export function allLevelInfo() {
  return LEVEL_NODES.map(node => levelInfo(node.n));
}

/** The next crew member still locked, and the level that unlocks it. */
export function nextUnlock() {
  for (const node of LEVEL_NODES) {
    const reward = levelReward(node.n);
    if (reward && !SaveData.isUnitUnlocked(reward)) return { unit: reward, level: node.n, levelName: levelInfo(node.n).name };
  }
  return null;
}

/**
 * The one place menus start a battle: the level plus the Treat Shop modifiers.
 * Cards are left to the level data (level.cards); see BattleConfig's contract.
 */
export function battleConfigFor(levelNumber) {
  return makeBattleConfig({ levelNumber, modifiers: SaveData.getModifiers() });
}

export function startBattle(scene, levelNumber) {
  const config = battleConfigFor(levelNumber);
  gameState.battleConfig = config;
  fadeTo(scene, 'BattleScene', { config });
}
