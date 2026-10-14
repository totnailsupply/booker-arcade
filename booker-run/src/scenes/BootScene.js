import Phaser from 'phaser';
import { fetchManifest } from '../core/Assets.js';

// Fetches public/assets/manifest.json (if any) before the loader runs, so
// PreloadScene knows which real files exist. A missing manifest is normal.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    fetchManifest().then((manifest) => {
      this.scene.start('PreloadScene', { manifest });
    });
  }
}
