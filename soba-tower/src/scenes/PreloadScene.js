import Phaser from 'phaser';
import {
  resolveManifest, queueManifestLoads, generateMissingPlaceholders, registerAnimations,
} from '../core/Assets.js';
import { getDebugOptions } from '../core/Debug.js';
import { bakeVisuals } from '../core/VisualBake.js';
import { warmShaders } from '../core/GLGuard.js';
import { LEVEL1 } from '../levels/level1.js';

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
    this.resolved = resolveManifest(this.manifest);
    this.loadedKeys = queueManifestLoads(this.load, this.resolved);
  }

  create() {
    // A failed file can leave a broken texture behind; drop it so the placeholder takes over.
    for (const key of this.failed) if (this.textures.exists(key)) this.textures.remove(key);
    const generated = generateMissingPlaceholders(this);
    // Manifest frame layouts only apply to sheets that actually loaded from a file
    const loaded = {};
    for (const k of this.loadedKeys) if (!this.failed.includes(k)) loaded[k] = this.resolved[k];
    registerAnimations(this, loaded);
    // Step 4: zone facades, eaves, lanterns, Soba's rim, danger recolours, particles
    bakeVisuals(this, LEVEL1);
    window.__ASSET_SOURCES__ = {
      files: this.loadedKeys.filter(k => !this.failed.includes(k)),
      placeholders: generated,
    };

    // Compile every shader variant now (one off-screen frame), not mid-climb.
    // Debug starts (?autoplay=1, ?y=, ?zone=) skip the title.
    warmShaders(this, () => this.scene.start('TitleScene', { autoStart: getDebugOptions().skipTitle }));
  }
}
