import Phaser from 'phaser';
import { fetchManifest } from '../core/Assets.js';

// Fetches public/assets/manifest.json (if any) before the loader runs, so
// PreloadScene only queues files that exist (a 404 would log a console error).
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    fetchManifest().then((manifest) => this.scene.start('Preload', { manifest }));
  }
}
