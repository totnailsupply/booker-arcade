// =============================================================================
// LivesCheckpoint — lives, zone gates (checkpoints) and the respawn sequence.
//
// Fall or hazard hit -> lose a life:
//   lives > 0: mode 'respawning'. Wait FALL_BEAT_MS (a hit: HIT_BEAT_MS while
//              Soba tumbles), restore the zone (crumbles back, roof tiles
//              re-armed: onRespawnReset), put a cushion at the checkpoint zone's
//              respawn point, pan the camera there over RESPAWN_PAN_MS, drop
//              Soba onto the cushion (she bounces off it), mode 'playing' with
//              INVULN_MS of blinking invulnerability (hazard hits are ignored).
//   lives = 0: onGameOver(cause).
// Landing at or above a zone's startY passes its gate: that zone becomes the
// checkpoint and lives are restored to at least CHECKPOINT_MIN.
//
// All timers advance with the scene's frame dt (works with the test clock).
// =============================================================================

import { LIVES, PLATFORM, CAMERA } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';

export class LivesCheckpoint {
  /**
   * @param {object} hooks { soba, spawner, camera, level, onGameOver(cause),
   *                         onRespawnLanding(cushion), onRespawnReset(respawnHeight) }
   */
  constructor(hooks) {
    this.h = hooks;
    this.level = hooks.level;
    this.beatMs = 0;
    this.invulnMs = 0;
    this.cushion = null;
    this.emitLives();
  }

  get invulnerable() {
    return this.invulnMs > 0 || gameState.mode === MODES.RESPAWNING;
  }

  emitLives() {
    eventBus.emit(Events.LIVES_CHANGED, { lives: gameState.lives });
  }

  /** Index (0-based) of the zone that contains a height. */
  zoneIndexAt(heightPx) {
    const z = this.level.zones;
    for (let i = z.length - 1; i >= 0; i--) if (heightPx >= z[i].startY) return i;
    return 0;
  }

  /** Called when Soba lands on a platform at heightPx. */
  onLanded(heightPx) {
    const idx = this.zoneIndexAt(heightPx);
    if (idx + 1 > gameState.checkpointZone) this.reachZone(idx, true);
  }

  /** Sets the checkpoint without the gate fanfare (debug starts). */
  setCheckpoint(idx) {
    gameState.checkpointZone = idx + 1;
    gameState.zone = idx + 1;
  }

  reachZone(idx, announce) {
    const zone = this.level.zones[idx];
    this.setCheckpoint(idx);
    if (gameState.lives < LIVES.CHECKPOINT_MIN) {
      gameState.lives = LIVES.CHECKPOINT_MIN;
      this.emitLives();
    }
    if (announce) {
      eventBus.emit(Events.ZONE_CHANGED, { index: idx, zone: zone.id, name: zone.name, checkpoint: true });
    }
  }

  /**
   * Soba fell below the view ('fall') or touched a hazard ('hit').
   * @param {'fall'|'hit'} cause
   * @param {object} [source] the hazard (for the event payload)
   */
  loseLife(cause = 'fall', source = null) {
    if (gameState.mode !== MODES.PLAYING) return;
    if (cause !== 'fall' && this.invulnMs > 0) return;
    const { soba } = this.h;
    gameState.lives = Math.max(0, gameState.lives - 1);
    gameState.livesLost += 1;
    this.invulnMs = 0;
    soba.blinkHidden = false;
    eventBus.emit(Events.SOBA_FELL, {
      cause, hazard: source?.type, lives: gameState.lives, zone: gameState.zone,
      x: Math.round(soba.x), y: Math.round(soba.y),
    });
    this.emitLives();
    if (cause === 'hit') soba.knockOut();
    else soba.hide();
    if (gameState.lives <= 0) {
      this.h.onGameOver(cause);
      return;
    }
    gameState.mode = MODES.RESPAWNING;
    this.beatMs = cause === 'hit' ? LIVES.HIT_BEAT_MS : LIVES.FALL_BEAT_MS;
  }

  /** Creates the cushion for a zone (or an explicit height) and returns it. */
  makeCushion(x, heightPx) {
    if (this.cushion && this.cushion.alive) {
      this.cushion.alive = false;
      this.cushion.solid = false;
    }
    this.cushion = this.h.spawner.addDynamic({ x, y: heightPx, w: PLATFORM.CUSHION_W, type: 'cushion' });
    return this.cushion;
  }

  startRespawnPan() {
    const zone = this.level.zones[gameState.checkpointZone - 1];
    const r = zone.respawn;
    if (this.h.onRespawnReset) this.h.onRespawnReset(r.y);
    const cushion = this.makeCushion(r.x, r.y + LIVES.RESPAWN_LIFT);
    const { camera } = this.h;
    camera.panTo(camera.topFor(cushion.y, CAMERA.RESPAWN_FRAC), CAMERA.RESPAWN_PAN_MS, () => {
      this.finishRespawn(cushion);
    });
  }

  finishRespawn(cushion) {
    const { soba } = this.h;
    soba.placeAt(cushion.x, cushion.y);
    gameState.mode = MODES.PLAYING;
    gameState.zone = gameState.checkpointZone;
    this.invulnMs = LIVES.INVULN_MS;
    eventBus.emit(Events.SOBA_RESPAWN, { zone: gameState.checkpointZone, x: cushion.x, y: cushion.y });
    this.h.onRespawnLanding(cushion);
  }

  update(dt) {
    const ms = dt * 1000;
    if (gameState.mode === MODES.RESPAWNING && this.beatMs > 0) {
      this.beatMs -= ms;
      if (this.beatMs <= 0) this.startRespawnPan();
    }
    const { soba } = this.h;
    if (this.invulnMs > 0) {
      this.invulnMs -= ms;
      soba.blinkHidden = this.invulnMs > 0 && Math.floor(this.invulnMs / LIVES.BLINK_MS) % 2 === 1;
    } else {
      soba.blinkHidden = false;
    }
  }
}
