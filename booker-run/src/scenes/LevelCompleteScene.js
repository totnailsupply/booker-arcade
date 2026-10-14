import Phaser from 'phaser';
import {
  GAME, TRANSITION, COMPLETE_UI as L, UI_COLORS as C, DEPTH,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { ANIMS } from '../core/Assets.js';
import { SaveData } from '../core/SaveData.js';
import { getLevel, nextLevel } from '../levels/index.js';
import { ABILITIES, UI_ICON } from '../core/Abilities.js';
import { text, setText, measure } from '../ui/PixelFont.js';
import {
  ensureUiAssets, panel, ring, icon, burst, bindMenuKeys, PixelButton, UI_TEX,
} from '../ui/UiKit.js';

// Results after the finish. Scene data:
//   { result, levelId, unlocked: { levelId, number, name, ability } | null, prev }
// result = ScoreSystem.finalize() + { levelId, isNewBest, best, firstClear }.
// prev   = the level's save entry before this run (for new-best callouts).
//
// Left panel: stars (pop in one by one), tally rows that count up (distance,
// bones x/y, finish, time vs par), total score, FIRST CLEAR / NEW BEST callouts.
// Right panel: the unlock reveal (next level + its ability) or your bests; after
// Level 6 a full-screen "YOU GOT THE GOLDEN STEAK!" flourish plays first.
// Buttons: Next level (default when open), Replay, Levels.
// Keys: arrows/WASD move, Space/Enter press (the first press during the tally
// skips it), Esc = Levels. Mouse/touch: tap a button.
export class LevelCompleteScene extends Phaser.Scene {
  constructor() {
    super('LevelCompleteScene');
  }

  init(data) {
    this.levelId = data?.levelId || gameState.levelId;
    this.unlocked = data?.unlocked || null;
    this.prev = data?.prev || null;
    this.result = data?.result || gameState.result || {
      score: gameState.score, stars: 1, bones: 0, bonesTotal: 0, distancePts: 0,
      bonePts: 0, finishPts: 0, timePts: 0, totalSeconds: 0, attempts: gameState.attempts, best: 0,
    };
  }

  create() {
    gameState.mode = MODES.COMPLETE;
    ensureUiAssets(this);
    // Phaser reuses this object for every results screen: reset all per-visit state
    this.leaving = false;
    this.t = 0;
    this.steps = [];
    this.stepIdx = 0;
    this.counters = [];
    this.starsShown = 0;
    this.revealDone = !this.unlocked;
    this.callouts = [];
    this.sequenceDone = false;
    this.ending = null;
    this.endingRain = null;
    this.starsNew = null;
    this.timeNew = null;
    this.revealC = null;
    this.revealThumb = null;
    this.revealLock = null;
    this.revealNew = null;
    this.revealIcon = null;

    const r = this.result;
    const entry = getLevel(this.levelId);
    this.entry = entry;
    const next = nextLevel(this.levelId);
    const nextOpen = !!next && SaveData.isUnlocked(next.number);
    const prev = this.prev;
    this.isFinal = entry?.data?.finish === 'golden-steak';
    this.newBest = {
      firstClear: !!r.firstClear,
      score: !!r.isNewBest && !r.firstClear,
      stars: !!prev && !r.firstClear && r.stars > (prev.bestStars || 0),
      time: !!prev && Number.isFinite(prev.bestTimeS) && Number.isFinite(r.totalSeconds) && r.totalSeconds < prev.bestTimeS - 0.05,
    };

    // Background: the level's sky, dimmed
    const theme = entry?.theme || { bgFar: 'bg-far', bgMid: 'bg-mid' };
    [theme.bgFar, theme.bgMid].forEach(k => this.textures.exists(k) && this.add.image(0, 0, k).setOrigin(0, 0));
    this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, C.DIM_OVERLAY, 0.5).setOrigin(0, 0);

    // Header
    this.title = text(this, GAME.WIDTH / 2, 7, 'LEVEL COMPLETE!', { scale: 2, align: 'center', color: C.GOLD });
    text(this, GAME.WIDTH / 2, 26, `${entry?.number || ''} · ${(entry?.name || 'LEVEL').toUpperCase()}`, { align: 'center', color: C.MUTED });
    this.title.setScale(1).setAlpha(0);
    this.tweens.add({ targets: this.title, alpha: 1, duration: 200 });

    this.buildResults(r);
    if (this.isFinal) this.buildFinalPanel();
    else if (this.unlocked) this.buildUnlockPanel(this.unlocked);
    else this.buildBestsPanel();

    // Buttons
    this.buttons = [];
    const by = L.BTN_Y;
    const defs = [];
    if (next) defs.push({ id: 'next', label: 'NEXT LEVEL >', w: 128, enabled: nextOpen, onPress: () => this.playNext(next) });
    defs.push({ id: 'replay', label: 'REPLAY', w: 84, enabled: true, onPress: () => this.replay() });
    defs.push({ id: 'levels', label: 'LEVELS', w: 84, enabled: true, onPress: () => this.toLevels() });
    const gap = 10;
    const total = defs.reduce((w, d) => w + d.w, 0) + gap * (defs.length - 1);
    let x = Math.round(GAME.WIDTH / 2 - total / 2);
    const defaultId = next && nextOpen ? 'next' : 'levels';
    for (const d of defs) {
      const btn = new PixelButton(this, x + d.w / 2, by, d.w, d.label, {
        id: d.id,
        enabled: d.enabled,
        style: d.id === defaultId ? 'primary' : 'ghost',
        onPress: () => { if (!this.endingUp()) d.onPress(); },
        onFocus: (b) => this.setFocus(this.buttons.indexOf(b)),
      });
      this.buttons.push(btn);
      x += d.w + gap;
    }
    this.buttonIds = this.buttons.map(b => b.id);
    this.focus = Math.max(0, this.buttons.findIndex(b => b.id === defaultId));
    this.drawFocus();

    bindMenuKeys(this, {
      left: () => this.moveFocus(-1),
      up: () => this.moveFocus(-1),
      right: () => this.moveFocus(1),
      down: () => this.moveFocus(1),
      confirm: () => this.confirm(),
      back: () => (this.endingUp() ? this.closeEnding() : this.toLevels()),
    });

    eventBus.emit(Events.MUSIC_GAMEOVER);
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);

    if (this.isFinal) this.showEnding();
    else this.scheduleSequence();
  }

  // --- left panel: results -------------------------------------------------------

  buildResults(r) {
    const x0 = L.LEFT_X;
    const y0 = L.PANEL_Y;
    const W = L.PANEL_W;
    const g = this.add.graphics();
    panel(g, x0, y0, W, L.PANEL_H, { fill: C.PANEL, hi: C.PANEL_HI, alpha: 0.95 });
    const left = x0 + 12;
    const right = x0 + W - 12;
    const cx = x0 + W / 2;

    // Stars: grey slots now, gold ones pop in later
    this.starSlots = [0, 1, 2].map(i => icon(this, cx + (i - 1) * 32, y0 + 22, UI_ICON.STAR_OFF, 24).setAlpha(0.6));
    this.starIcons = [];
    if (this.newBest.stars) {
      this.starsNew = this.tag(cx + 62, y0 + 16, 'NEW!', C.NEW_TAG);
      this.starsNew.setVisible(false);
    }

    // Tally rows
    const rows = [
      { label: 'DISTANCE', value: r.distancePts || 0, prefix: '' },
      { label: `BONES ${r.bones}/${r.bonesTotal}`, value: r.bonePts || 0, prefix: '+', boneIcon: true },
      { label: 'FINISH', value: r.finishPts || 0, prefix: '+' },
      {
        label: `TIME ${(r.totalSeconds || 0).toFixed(1)}S  PAR ${Math.round(r.parSeconds || 0)}S`,
        value: r.timePts || 0, prefix: '+', good: (r.timePts || 0) > 0,
      },
    ];
    this.rows = rows.map((row, i) => {
      const y = y0 + 46 + i * 13;
      const label = text(this, left, y, row.label, { color: C.MUTED });
      const val = text(this, right, y, `${row.prefix}0`, { align: 'right', color: C.INK });
      // dotted leader between label and value
      const lead = this.add.graphics();
      for (let lx = label.x + label.width + 4; lx < right - 34; lx += 3) lead.fillStyle(C.DISABLED, 1).fillRect(lx, y + 6, 1, 1);
      [label, val, lead].forEach(o => o.setAlpha(0));
      return { ...row, y, labelT: label, valT: val, lead };
    });

    // Total
    const dy = y0 + 46 + 4 * 13 + 14;
    g.fillStyle(C.OUTLINE, 1).fillRect(left, dy, W - 24, 1);
    g.fillStyle(C.PANEL_HI, 1).fillRect(left, dy + 1, W - 24, 1);
    text(this, left, dy + 9, 'SCORE', { color: C.DIM });
    this.totalT = text(this, right, dy + 6, '0', { scale: 2, align: 'right', color: C.GOLD });

    // Callout under the total
    const callY = dy + 28;
    let call = `BEST ${r.best ?? r.score}`;
    let color = C.MUTED;
    if (this.newBest.firstClear) { call = 'FIRST CLEAR!'; color = C.GOOD; }
    else if (this.newBest.score) { call = 'NEW BEST SCORE!'; color = C.GOOD; }
    this.callT = text(this, cx, callY, call, { align: 'center', color });
    this.callT.setVisible(false);
    text(this, left, callY + 14, `TRIES ${r.attempts || 1}`, { color: C.DIM });
    if (this.newBest.time) {
      this.timeNew = this.tag(right - measure('NEW BEST TIME') - 8, callY + 10, 'NEW BEST TIME', C.NEW_TAG);
      this.timeNew.setVisible(false);
    }
    const bestTime = Number.isFinite(prev(this)?.bestTimeS) ? `BEST TIME ${prev(this).bestTimeS.toFixed(1)}S` : '';
    if (!this.newBest.time && bestTime && !this.newBest.firstClear) text(this, right, callY + 14, bestTime, { align: 'right', color: C.DIM });

    // Booker and the finish, celebrating at the bottom of the panel
    const groundY = y0 + L.PANEL_H - 8;
    g.fillStyle(C.OUTLINE, 0.6).fillRect(x0 + 8, groundY, W - 16, 1);
    const finishKey = this.isFinal ? 'golden-steak' : 'steak';
    this.add.sprite(cx - 40, groundY - 18, 'booker').play(ANIMS.WIN);
    const steak = this.add.image(cx + 12, groundY - (this.isFinal ? 18 : 14), finishKey);
    this.tweens.add({ targets: steak, y: steak.y - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    function prev(scene) { return scene.prev; }
  }

  /** Small red tag ("NEW!"). */
  tag(x, y, str, fill, wide = false) {
    const w = measure(str) + 8;
    const c = this.add.container(Math.round(x - (wide ? w / 2 : 0)), Math.round(y));
    const g = this.add.graphics();
    panel(g, 0, 0, w, 13, { fill, hi: 0xff9aa4, shadow: 1 });
    c.add([g, text(this, Math.round(w / 2), 3, str, { align: 'center', color: C.INK, flat: true })]);
    return c;
  }

  // --- right panel ---------------------------------------------------------------

  rightPanel(hi = C.PANEL_HI) {
    const g = this.add.graphics();
    panel(g, L.RIGHT_X, L.PANEL_Y, L.PANEL_W, L.PANEL_H, { fill: C.PANEL, hi, alpha: 0.95 });
    return g;
  }

  buildUnlockPanel(u) {
    const cx = L.RIGHT_X + L.PANEL_W / 2;
    const y0 = L.PANEL_Y;
    const next = getLevel(u.levelId);
    const c = this.add.container(0, 0);
    this.revealC = c;
    const g = this.rightPanel(C.GOLD_DARK);
    c.add(g);
    c.add(text(this, cx, y0 + 9, 'UNLOCKED!', { scale: 2, align: 'center', color: C.GOLD }));
    const tx = Math.round(cx - 64);
    const ty = y0 + 30;
    this.revealThumb = this.add.image(tx, ty, next.theme.thumb).setOrigin(0, 0).setTint(0x3b3550);
    const frame = this.add.graphics();
    ring(frame, tx - 1, ty - 1, 130, 74, C.OUTLINE, 1, 0);
    ring(frame, tx - 2, ty - 2, 132, 76, C.GOLD_DARK, 1, 1);
    this.revealLock = icon(this, cx, ty + 36, UI_ICON.LOCK, 24);
    c.add([this.revealThumb, frame, this.revealLock]);
    this.revealNew = this.tag(tx + 4, ty + 4, 'NEW!', C.NEW_TAG);
    this.revealNew.setVisible(false);
    c.add(this.revealNew);
    c.add(text(this, cx, ty + 82, `${next.number} · ${next.name.toUpperCase()}`, { align: 'center', color: C.INK }));

    const ab = u.ability ? ABILITIES[u.ability] : null;
    if (ab) {
      const ay = ty + 98;
      const ix = L.RIGHT_X + 26;
      const back = this.add.graphics();
      back.fillStyle(C.PANEL_DARK, 1).fillCircle(ix, ay + 12, 15);
      ring(back, L.RIGHT_X + 8, ay - 4, L.PANEL_W - 16, 40, C.PANEL_HI, 1, 1);
      this.revealIcon = icon(this, ix, ay + 12, ab.icon, 24);
      c.add([back, this.revealIcon]);
      c.add(text(this, ix + 22, ay + 1, `NEW SKILL: ${ab.name.toUpperCase()}`, { color: C.ORANGE }));
      c.add(text(this, ix + 22, ay + 13, ab.hint.toUpperCase(), { color: C.MUTED, maxWidth: L.PANEL_W - 60 }));
    }
    c.setAlpha(0);
    c.x = 24;
  }

  buildBestsPanel() {
    const cx = L.RIGHT_X + L.PANEL_W / 2;
    const y0 = L.PANEL_Y;
    this.rightPanel();
    const lv = SaveData.getLevel(this.levelId);
    text(this, cx, y0 + 10, 'YOUR BESTS', { scale: 2, align: 'center', color: C.GOLD });
    const rays = this.add.image(cx, y0 + 70, UI_TEX.RAYS).setTint(C.GOLD).setAlpha(0.25).setScale(0.7);
    this.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });
    this.add.sprite(cx - 22, y0 + 72, 'booker').setScale(2).play(ANIMS.WIN);
    const steak = this.add.image(cx + 58, y0 + 88, 'steak');
    this.tweens.add({ targets: steak, y: steak.y - 3, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const left = L.RIGHT_X + 16;
    const right = L.RIGHT_X + L.PANEL_W - 16;
    const rows = [
      ['BEST SCORE', String(lv.bestScore)],
      ['BEST STARS', null],
      ['BEST TIME', Number.isFinite(lv.bestTimeS) ? `${lv.bestTimeS.toFixed(1)}S` : '-'],
      ['CLEARS', String(lv.clears)],
    ];
    rows.forEach(([label, value], i) => {
      const y = y0 + 126 + i * 15;
      text(this, left, y, label, { color: C.MUTED });
      if (value !== null) text(this, right, y, value, { align: 'right', color: C.INK });
      else [0, 1, 2].forEach(k => icon(this, right - 6 - (2 - k) * 14, y + 3, k < lv.bestStars ? UI_ICON.STAR_ON : UI_ICON.STAR_OFF, 12));
    });
  }

  buildFinalPanel() {
    const cx = L.RIGHT_X + L.PANEL_W / 2;
    const y0 = L.PANEL_Y;
    this.rightPanel(C.GOLD);
    const sum = SaveData.summary();
    text(this, cx, y0 + 10, 'ALL CLEAR!', { scale: 2, align: 'center', color: C.GOLD });
    const rays = this.add.image(cx, y0 + 66, UI_TEX.RAYS).setTint(C.GOLD).setAlpha(0.4).setScale(0.8);
    this.tweens.add({ targets: rays, angle: 360, duration: 7000, repeat: -1 });
    const gs = this.add.image(cx, y0 + 66, 'golden-steak').setScale(2);
    this.tweens.add({ targets: gs, y: gs.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const left = L.RIGHT_X + 16;
    const right = L.RIGHT_X + L.PANEL_W - 16;
    const rows = [
      ['TOTAL SCORE', String(sum.totalScore)],
      ['STARS', `${sum.totalStars}/${sum.maxStars}`],
      ['LEVELS', `${sum.levelsCleared}/${sum.levelCount}`],
    ];
    rows.forEach(([label, value], i) => {
      const y = y0 + 116 + i * 14;
      text(this, left, y, label, { color: C.MUTED });
      text(this, right, y, value, { align: 'right', color: C.INK });
    });
    text(this, cx, y0 + 168, 'THANKS FOR PLAYING!', { align: 'center', color: C.GOLD });
  }

  // --- Level 6 ending flourish ------------------------------------------------------

  showEnding() {
    const D = DEPTH.HUD + 20;
    const sum = SaveData.summary();
    const c = this.add.container(0, 0).setDepth(D);
    this.ending = { c, done: false, t: 0 };
    // The backdrop takes every tap while the ending is up (the results buttons sit
    // under the prompt): a tap closes the ending like a key press
    const bg = this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x120a06, 1).setOrigin(0, 0).setInteractive();
    bg.on('pointerdown', (_p, _x, _y, e) => {
      e?.stopPropagation?.();
      this.confirmEnding();
    });
    const rays = this.add.image(GAME.WIDTH / 2, 132, UI_TEX.RAYS).setTint(C.GOLD).setAlpha(0.55).setScale(2.6);
    this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
    const steak = this.add.image(GAME.WIDTH / 2, 134, 'golden-steak').setScale(3);
    this.tweens.add({ targets: steak, y: 128, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const booker = this.add.sprite(92, 160, 'booker').setScale(2).play(ANIMS.WIN);
    this.tweens.add({ targets: booker, y: 152, duration: 260, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    const l1 = text(this, GAME.WIDTH / 2, 12, 'YOU GOT THE', { scale: 2, align: 'center', color: C.INK });
    const l2 = text(this, GAME.WIDTH / 2, 32, 'GOLDEN STEAK!', { scale: 3, align: 'center', color: C.GOLD });
    const totals = text(this, GAME.WIDTH / 2, 214,
      `TOTAL SCORE ${sum.totalScore}  ·  STARS ${sum.totalStars}/${sum.maxStars}  ·  LEVELS ${sum.levelsCleared}/${sum.levelCount}`,
      { align: 'center', color: C.INK });
    const prompt = text(this, GAME.WIDTH / 2, 240, 'PRESS TO CONTINUE', { scale: 2, align: 'center', color: 0xfff3c4 });
    prompt.setAlpha(0);
    c.add([bg, rays, steak, booker, l1, l2, totals, prompt]);
    this.ending.prompt = prompt;
    this.ending.bg = bg;
    l2.setScale(1.6).setAlpha(0);
    this.tweens.add({ targets: l2, alpha: 1, duration: 260, delay: 200, ease: 'Quad.easeOut', onStart: () => l2.setScale(1) });
    this.cameras.main.flash(260, 255, 220, 120, true);
    burst(this, GAME.WIDTH / 2, 120, { count: 60, speed: [80, 260], gravity: 260, lifespan: 1600, depth: D + 1 });
    this.endingRain = this.add.particles(0, -6, UI_TEX.CONFETTI, {
      x: { min: 0, max: GAME.WIDTH },
      lifespan: 3200,
      speedY: { min: 40, max: 90 },
      speedX: { min: -20, max: 20 },
      rotate: { min: 0, max: 360 },
      frequency: 40,
      tint: C.CONFETTI,
    }).setDepth(D + 1);
    eventBus.emit(Events.UI_ENDING, { totalScore: sum.totalScore, totalStars: sum.totalStars });
  }

  /** The Level 6 ending covers the results (it takes every press and tap). */
  endingUp() {
    return !!this.ending && !this.ending.done;
  }

  /** A press or tap on the ending: closes it once the flourish has had a moment. */
  confirmEnding() {
    if (this.endingUp() && this.ending.t > L.ENDING_MIN_MS) this.closeEnding();
  }

  closeEnding() {
    const e = this.ending;
    if (!e || e.done) return;
    e.done = true;
    e.bg?.disableInteractive();
    this.endingRain?.stop();
    this.tweens.add({
      targets: e.c, alpha: 0, duration: 300,
      onComplete: () => { e.c.destroy(); this.endingRain?.destroy(); },
    });
    this.scheduleSequence();
  }

  // --- tally / stars / reveal sequence -----------------------------------------------

  scheduleSequence() {
    const r = this.result;
    let t = this.t + L.TALLY_START_MS;
    const at = (ms, run) => this.steps.push({ at: ms, run });
    this.rows.forEach((row, i) => {
      at(t, (instant) => this.showRow(row, i, instant));
      t += L.TALLY_ROW_MS;
    });
    at(t, (instant) => this.countTo(this.totalT, 0, r.score, instant ? 0 : 520, '', 'total'));
    t += 600;
    for (let i = 0; i < 3; i++) {
      at(t, (instant) => this.popStar(i, i < r.stars, instant));
      t += L.STAR_GAP_MS;
    }
    at(t, (instant) => this.showCallouts(instant));
    t += L.REVEAL_DELAY_MS;
    if (this.unlocked && !this.isFinal) at(t, (instant) => this.playReveal(instant));
    at(t + 10, () => { this.sequenceDone = true; });
  }

  update(_time, delta) {
    this.t += delta;
    if (this.endingUp()) {
      this.ending.t += delta;
      if (this.ending.t > 900 && this.ending.prompt.alpha === 0) {
        this.tweens.add({ targets: this.ending.prompt, alpha: 1, duration: 200 });
      }
      if (this.ending.t >= L.ENDING_MS) this.closeEnding();
      return;
    }
    while (this.stepIdx < this.steps.length && this.steps[this.stepIdx].at <= this.t) {
      this.steps[this.stepIdx++].run(false);
    }
    for (const c of this.counters) this.stepCounter(c, delta);
  }

  /** Space/Enter: close the ending, skip the tally, or press the focused button. */
  confirm() {
    if (this.endingUp()) {
      this.confirmEnding();
      return;
    }
    if (!this.sequenceDone) {
      this.skip();
      return;
    }
    this.buttons[this.focus]?.press();
  }

  skip() {
    while (this.stepIdx < this.steps.length) this.steps[this.stepIdx++].run(true);
    for (const c of this.counters) { c.elapsed = c.dur; this.stepCounter(c, 0); }
    this.sequenceDone = true;
  }

  showRow(row, i, instant) {
    [row.labelT, row.valT, row.lead].forEach(o => o.setAlpha(1));
    if (!instant) {
      row.labelT.x -= 6;
      this.tweens.add({ targets: row.labelT, x: row.labelT.x + 6, duration: 140, ease: 'Quad.easeOut' });
    }
    this.countTo(row.valT, 0, row.value, instant ? 0 : L.TALLY_ROW_MS - 80, row.prefix, i);
  }

  countTo(t, from, to, dur, prefix, row) {
    const c = { t, from, to, dur, prefix, row, elapsed: 0, last: null, tickAt: 0, done: false };
    this.counters.push(c);
    this.stepCounter(c, 0);
  }

  stepCounter(c, delta) {
    if (c.done) return;
    c.elapsed += delta;
    const k = c.dur <= 0 ? 1 : Math.min(1, c.elapsed / c.dur);
    const v = Math.round(c.from + (c.to - c.from) * (1 - (1 - k) * (1 - k)));
    if (v !== c.last) {
      c.last = v;
      setText(c.t, `${c.prefix}${v}`);
      if (c.elapsed - c.tickAt >= 50 || k >= 1) {
        c.tickAt = c.elapsed;
        eventBus.emit(Events.UI_TALLY_TICK, { row: c.row, value: v, done: k >= 1 });
      }
    }
    if (k >= 1) {
      c.done = true;
      if (c.row === 'total') {
        this.tweens.add({ targets: c.t, y: c.t.y - 2, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      }
    }
  }

  popStar(i, earned, instant) {
    const slot = this.starSlots[i];
    this.starsShown = i + 1;
    eventBus.emit(Events.UI_STAR_POP, { index: i, earned });
    if (!earned) {
      slot.setAlpha(1);
      return;
    }
    const s = icon(this, slot.x, slot.y, UI_ICON.STAR_ON, 24);
    this.starIcons.push(s);
    if (instant) return;
    s.setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: s, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.time.delayedCall(120, () => {
      burst(this, slot.x, slot.y, { count: 14, texture: UI_TEX.SPARK, colors: [0xffffff, C.GOLD], speed: [40, 110], gravity: 0, rotate: false, lifespan: 450 });
    });
    this.cameras.main.shake(70, 0.003);
  }

  showCallouts(instant) {
    this.callT.setVisible(true);
    const pops = [];
    if (this.newBest.firstClear || this.newBest.score) {
      pops.push(this.callT);
      eventBus.emit(Events.UI_NEW_BEST, { levelId: this.levelId, kind: this.newBest.firstClear ? 'firstClear' : 'score' });
      this.tweens.add({ targets: this.callT, alpha: 0.45, duration: 260, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1], delay: 600 });
    }
    if (this.starsNew) {
      this.starsNew.setVisible(true);
      pops.push(this.starsNew);
      eventBus.emit(Events.UI_NEW_BEST, { levelId: this.levelId, kind: 'stars' });
    }
    if (this.timeNew) {
      this.timeNew.setVisible(true);
      pops.push(this.timeNew);
      eventBus.emit(Events.UI_NEW_BEST, { levelId: this.levelId, kind: 'time' });
    }
    this.callouts = pops.map(p => p === this.callT ? 'score' : p === this.starsNew ? 'stars' : 'time');
    if (instant) return;
    for (const p of pops) {
      // pop from a lifted position (scaling pixel text mid-tween looks smeared)
      const y = p.y;
      p.setY(y - 6);
      this.tweens.add({ targets: p, y, duration: 220, ease: 'Bounce.easeOut' });
    }
  }

  playReveal(instant) {
    const c = this.revealC;
    if (!c) return;
    eventBus.emit(Events.UI_UNLOCK_REVEAL, { levelId: this.unlocked.levelId, ability: this.unlocked.ability, where: 'complete' });
    const finish = () => {
      this.revealThumb.clearTint();
      this.revealLock.setVisible(false);
      this.revealNew.setVisible(true);
      this.revealDone = true;
    };
    if (instant) {
      c.setAlpha(1).setX(0);
      finish();
      return;
    }
    this.tweens.add({ targets: c, x: 0, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
    const lock = this.revealLock;
    this.tweens.add({ targets: lock, y: lock.y - 4, duration: 110, yoyo: true, repeat: 1, delay: 280, ease: 'Quad.easeOut' });
    this.time.delayedCall(560, () => {
      if (this.revealDone) return;
      this.revealThumb.clearTint();
      this.tweens.add({
        targets: lock, y: lock.y - 20, alpha: 0, angle: 30, duration: 380, ease: 'Quad.easeIn',
        onComplete: () => lock.setVisible(false),
      });
      const cx = L.RIGHT_X + L.PANEL_W / 2;
      burst(this, cx, L.PANEL_Y + 66, { count: 40, speed: [60, 190], gravity: 200, lifespan: 1000 });
      burst(this, cx, L.PANEL_Y + 66, { count: 12, texture: UI_TEX.SPARK, colors: [0xffffff, C.GOLD], speed: [20, 80], gravity: 0, rotate: false, lifespan: 600 });
      this.revealNew.setVisible(true).setScale(0);
      this.tweens.add({ targets: this.revealNew, scale: 1, duration: 260, ease: 'Back.easeOut' });
      if (this.revealIcon) this.tweens.add({ targets: this.revealIcon, scale: 1.3, duration: 160, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
      this.revealDone = true;
    });
  }

  // --- buttons ------------------------------------------------------------------------

  setFocus(i) {
    if (i < 0 || i === this.focus || !this.buttons[i]?.enabled) return;
    this.focus = i;
    eventBus.emit(Events.MENU_MOVE, { scene: 'LevelCompleteScene', index: i });
    this.drawFocus();
  }

  moveFocus(d) {
    const n = this.buttons.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.focus + d * k + n * 2) % n;
      if (this.buttons[i].enabled) {
        this.setFocus(i);
        break;
      }
    }
  }

  drawFocus() {
    this.buttons.forEach((b, i) => b.setFocused(i === this.focus));
  }

  leave(sceneKey, data) {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(sceneKey, data);
    });
  }

  playNext(next) {
    if (this.leaving) return;
    eventBus.emit(Events.MENU_SELECT, { scene: 'LevelCompleteScene', action: 'next', levelId: next.id });
    gameState.reset(next.id);
    eventBus.emit(Events.GAME_START, { levelId: next.id });
    this.leave('RunScene', { levelId: next.id });
  }

  replay() {
    if (this.leaving) return;
    eventBus.emit(Events.MENU_SELECT, { scene: 'LevelCompleteScene', action: 'replay', levelId: this.levelId });
    gameState.reset(this.levelId);
    eventBus.emit(Events.GAME_RESTART);
    this.leave('RunScene', { levelId: this.levelId });
  }

  toLevels() {
    if (this.leaving) return;
    eventBus.emit(Events.MENU_BACK, { scene: 'LevelCompleteScene' });
    // Highlight the level this clear just opened, if any, and unlock it on screen
    this.leave('LevelSelectScene', {
      selected: this.unlocked?.levelId || this.levelId,
      reveal: this.unlocked?.levelId || null,
      music: true,
    });
  }

  /** For render_game_to_text(). */
  snapshot() {
    return {
      screen: 'complete',
      buttons: this.buttons.map(b => ({ id: b.id, enabled: b.enabled })),
      focus: this.buttons[this.focus]?.id || null,
      unlocked: this.unlocked,
      tallyDone: !!this.sequenceDone,
      starsShown: this.starsShown,
      stars: this.result.stars,
      newBest: this.newBest,
      callouts: this.callouts,
      revealDone: this.revealDone,
      ending: this.ending ? { done: this.ending.done } : null,
    };
  }
}
