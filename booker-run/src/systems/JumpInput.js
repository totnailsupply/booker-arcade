import Phaser from 'phaser';

// The one button. Space, ArrowUp, mouse click or touch tap.
// `pressed` is a fresh press since the last poll; `held` is whether any
// source is still down (for variable jump height).
export class JumpInput {
  constructor(scene) {
    this.scene = scene;
    this.queued = false;
    this.pointerIds = new Set();
    this.botHeld = false;

    const kb = scene.input.keyboard;
    this.space = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.up = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);

    const onKey = (e) => {
      if (!e || !e.repeat) this.queued = true;
    };
    kb.on('keydown-SPACE', onKey);
    kb.on('keydown-UP', onKey);

    scene.input.on('pointerdown', (pointer) => {
      this.pointerIds.add(pointer.id);
      this.queued = true;
    });
    const release = (pointer) => this.pointerIds.delete(pointer.id);
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
    // Listeners above are removed by Phaser's input plugins on scene shutdown.

    // A paused scene gets no pointer events, so a finger lifted during the pause
    // would stay "held" (and glide on its own on Levels 3+). Pause and resume
    // drop every press; keys are reset by Phaser's keyboard plugin on pause.
    this.onPauseResume = () => {
      this.pointerIds.clear();
      this.queued = false;
    };
    scene.events.on('pause', this.onPauseResume);
    scene.events.on('resume', this.onPauseResume);
    // Scene events outlive a restart: remove ours on shutdown
    scene.events.once('shutdown', () => {
      scene.events.off('pause', this.onPauseResume);
      scene.events.off('resume', this.onPauseResume);
    });
  }

  /** Bot hooks (?autoplay=1) */
  botPress() {
    this.queued = true;
    this.botHeld = true;
  }

  botRelease() {
    this.botHeld = false;
  }

  clear() {
    this.queued = false;
  }

  poll() {
    const pressed = this.queued;
    this.queued = false;
    const held = this.space.isDown || this.up.isDown || this.pointerIds.size > 0 || this.botHeld;
    return { pressed, held };
  }
}
