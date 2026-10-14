import Phaser from 'phaser';
import {
  resolveManifest, queueManifestLoads, generateMissingPlaceholders, registerAnimations,
} from '../core/Assets.js';
import { getDebugOptions } from '../core/Debug.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  init(data) {
    this.manifest = data?.manifest || null;
  }

  preload() {
    this.failed = [];
    this.load.on('loaderror', (file) => {
      this.failed.push(file.key);
      console.warn(`[assets] ${file.key} failed to load, using placeholder`);
    });
    this.loadedKeys = queueManifestLoads(this.load, resolveManifest(this.manifest));
  }

  create() {
    const generated = generateMissingPlaceholders(this);
    registerAnimations(this);
    window.__ASSET_SOURCES__ = {
      files: this.loadedKeys.filter(k => !this.failed.includes(k)),
      placeholders: generated,
    };

    const debug = getDebugOptions();
    // Debug starts (?autoplay=1, ?start=, ?x=) skip the title.
    if (debug.skipTitle) {
      this.scene.start('TitleScene', { autoStart: true });
    } else {
      this.scene.start('TitleScene');
    }
  }
}
