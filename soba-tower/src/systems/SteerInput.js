import Phaser from 'phaser';
import { GAME } from '../core/Constants.js';

// Steering: one action, a direction in {-1, 0, 1}.
//   Keyboard: Left / Right arrows, A / D. When both sides are held, the most
//             recently pressed side wins.
//   Touch / mouse: hold on the left or right half of the screen. Sliding a
//             held finger across the middle switches direction. With several
//             fingers down, the most recent one wins.
// The bot (?autoplay=1) overrides everything through setBotDir().
// Buttons that stop propagation (mute, pause) never reach these handlers.

const LEFT_CODES = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_CODES = new Set(['ArrowRight', 'KeyD']);

export class SteerInput {
  constructor(scene) {
    this.scene = scene;
    this.botDir = null;
    this.lastKeyDir = 0;
    this.pointers = new Map();     // pointer id -> Phaser pointer (insertion order = press order)

    const kb = scene.input.keyboard;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({ left: K.LEFT, right: K.RIGHT, a: K.A, d: K.D });

    this.onKeyDown = (event) => {
      if (LEFT_CODES.has(event.code)) this.lastKeyDir = -1;
      else if (RIGHT_CODES.has(event.code)) this.lastKeyDir = 1;
    };
    kb.on('keydown', this.onKeyDown);

    this.onPointerDown = (pointer) => {
      this.pointers.delete(pointer.id);
      this.pointers.set(pointer.id, pointer);
    };
    this.onPointerUp = (pointer) => this.pointers.delete(pointer.id);
    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.on('pointerup', this.onPointerUp);
    scene.input.on('pointerupoutside', this.onPointerUp);
  }

  setBotDir(dir) {
    this.botDir = dir;
  }

  /** Forget held pointers (e.g. after resuming from pause). */
  clear() {
    this.pointers.clear();
  }

  keyDir() {
    const k = this.keys;
    const l = k.left.isDown || k.a.isDown;
    const r = k.right.isDown || k.d.isDown;
    if (l && r) return this.lastKeyDir || 0;
    if (l) return -1;
    if (r) return 1;
    return 0;
  }

  pointerDir() {
    let dir = 0;
    for (const [id, p] of this.pointers) {
      if (!p.isDown) {
        this.pointers.delete(id);
        continue;
      }
      dir = p.x < GAME.WIDTH / 2 ? -1 : 1;   // last (most recent) pointer wins
    }
    return dir;
  }

  /** Current steer direction: -1, 0 or 1. */
  poll() {
    if (this.botDir !== null) return this.botDir;
    return this.keyDir() || this.pointerDir();
  }

  /** For render_game_to_text(). */
  debugState() {
    return { dir: this.poll(), keys: this.keyDir(), pointers: this.pointers.size, bot: this.botDir !== null };
  }

  destroy() {
    const kb = this.scene.input.keyboard;
    kb.off('keydown', this.onKeyDown);
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('pointerupoutside', this.onPointerUp);
    this.pointers.clear();
  }
}
