import Phaser from 'phaser';
import { resolveManifest, queueManifestLoads, generateMissingPlaceholders } from '../core/Assets.js';
import { getDebugOptions } from '../core/Debug.js';
import { makeBattleConfig } from '../core/BattleConfig.js';
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
    // A failed file can leave a broken texture behind; drop it so the placeholder takes over.
    for (const key of this.failed) if (this.textures.exists(key)) this.textures.remove(key);
    const generated = generateMissingPlaceholders(this);
    window.__ASSET_SOURCES__ = {
      files: this.loadedKeys.filter(k => !this.failed.includes(k)),
      placeholders: generated,
    };
    // Compile every shader variant now (one off-screen frame), not mid-battle.
    warmShaders(this, () => {
      if (getDebugOptions().skip) this.scene.start('BattleScene', { config: makeBattleConfig() });
      else this.scene.start('TitleScene');
    });
  }
}
