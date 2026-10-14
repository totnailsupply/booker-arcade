import Phaser from 'phaser';
import { COLORS, GAME } from '../core/Constants.js';
import { queueLoads, applyFilters, assetReport } from '../core/Assets.js';
import { generateCoreTextures, generatePlaceholders } from '../core/Textures.js';
import { warmShaders } from '../core/GLGuard.js';

// Loads Booker's art + whatever the manifest lists, applies NEAREST to pixel
// textures, draws chips/particles and any missing art placeholders, then
// opens the lobby.
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  init(data) {
    this.manifest = data?.manifest || {};
  }

  preload() {
    const w = 420;
    const x = (GAME.WIDTH - w) / 2;
    const y = GAME.HEIGHT / 2;
    const g = this.add.graphics();
    const bar = this.add.graphics();
    g.lineStyle(2, COLORS.BRASS, 1);
    g.strokeRoundedRect(x, y - 10, w, 20, 10);
    this.load.on('progress', (p) => {
      bar.clear();
      bar.fillStyle(COLORS.GOLD, 1);
      bar.fillRoundedRect(x + 3, y - 7, Math.max(14, (w - 6) * p), 14, 7);
    });
    this.failed = [];
    this.load.on('loaderror', (file) => {
      this.failed.push(file.key);
      console.warn(`[assets] ${file.key} failed to load, using placeholder`);
    });
    this.queued = queueLoads(this.load, this.manifest);
  }

  create() {
    for (const key of this.failed) if (this.textures.exists(key)) this.textures.remove(key);
    applyFilters(this, this.queued);
    generateCoreTextures(this);
    const placeholders = generatePlaceholders(this);
    assetReport.files = Object.keys(this.queued).filter(k => !this.failed.includes(k));
    assetReport.placeholders = placeholders;
    assetReport.failed = [...this.failed];
    warmShaders(this, () => this.scene.start('Lobby'));
  }
}
