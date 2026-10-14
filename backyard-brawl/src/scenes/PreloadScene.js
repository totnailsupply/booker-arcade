import Phaser from 'phaser';
import {
  resolveManifest, queueManifestLoads, generateMissingPlaceholders, registerAnimations,
} from '../core/Assets.js';
import { getDebugOptions } from '../core/Debug.js';
import { warmShaders } from '../core/GLGuard.js';

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
    for (const key of this.failed) if (this.textures.exists(key)) this.textures.remove(key);
    const generated = generateMissingPlaceholders(this);
    const loaded = {};
    for (const k of this.loadedKeys) if (!this.failed.includes(k)) loaded[k] = this.resolved[k];
    registerAnimations(this, loaded);
    window.__ASSET_SOURCES__ = {
      files: this.loadedKeys.filter(k => !this.failed.includes(k)),
      placeholders: generated,
    };
    const dbg = getDebugOptions();
    warmShaders(this, () => {
      if (dbg.skipTitle) this.scene.start('ArenaScene', {});
      else this.scene.start('TitleScene');
    });
  }
}
