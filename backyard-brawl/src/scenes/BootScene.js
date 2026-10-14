import Phaser from 'phaser';
import { fetchManifest } from '../core/Assets.js';

// Fetches public/assets/manifest.json before the loader runs, so PreloadScene
// knows which real art files exist. A missing manifest is normal (placeholders).
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
