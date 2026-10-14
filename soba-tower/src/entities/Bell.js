import { DEPTH, FINISH } from '../core/Constants.js';
import { heightToY } from '../core/Kinematics.js';

// The temple bell on the roof (the finish). The art (48x48) is a whole gate —
// teal roof, red frame, bronze bell — standing on the back edge of the roof
// deck, behind Soba. Ringing never rotates the image (the gate would tip over):
// the gate shakes and squashes a little, a warm glow blooms behind the bell and
// sound-wave rings spread from it.
export class Bell {
  constructor(scene, finish) {
    this.scene = scene;
    const roofY = heightToY(finish.y);
    this.x = finish.x;
    this.footY = roofY - FINISH.BELL_BACK;
    this.cy = this.footY - FINISH.BELL_CENTER_DY;     // bronze bell centre
    this.glow = scene.add.graphics().setDepth(DEPTH.BELL - 1).setAlpha(0);
    this.glow.setPosition(this.x, this.cy);
    for (let i = 4; i >= 1; i--) {
      this.glow.fillStyle(FINISH.GLOW_COLOR, 0.12 * (5 - i));
      this.glow.fillCircle(0, 0, (FINISH.GLOW_R * i) / 4);
    }
    this.image = scene.add.image(this.x, this.footY, 'bell')
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.BELL);
    this.rings = scene.add.graphics().setDepth(DEPTH.BELL + 1);
    this.ringT = [];
    this.rung = false;
  }

  ring() {
    if (this.rung) return;
    this.rung = true;
    const { scene, image } = this;
    // Shake (a few px side to side) + a small squash from the feet
    scene.tweens.add({
      targets: image,
      x: { from: this.x - FINISH.SHAKE_PX, to: this.x + FINISH.SHAKE_PX },
      duration: FINISH.SHAKE_MS,
      yoyo: true,
      repeat: FINISH.SHAKES,
      onComplete: () => image.setX(this.x),
    });
    scene.tweens.add({
      targets: image,
      scaleY: { from: FINISH.SQUASH_Y, to: 1 },
      scaleX: { from: 2 - FINISH.SQUASH_Y, to: 1 },
      duration: FINISH.SHAKE_MS * 4,
      ease: 'Back.easeOut',
    });
    // Glow
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.6, to: 1.4 },
      duration: FINISH.GLOW_MS,
      ease: 'Quad.easeOut',
    });
    // Sound-wave rings, redrawn as 1 px circles (no scaled thick strokes)
    for (let i = 0; i < FINISH.RINGS; i++) {
      const ring = { t: 0 };
      this.ringT.push(ring);
      scene.tweens.add({
        targets: ring,
        t: 1,
        delay: i * FINISH.RING_STAGGER_MS,
        duration: FINISH.RING_MS,
        ease: 'Quad.easeOut',
        onUpdate: () => this.drawRings(),
        onComplete: () => { ring.t = 2; this.drawRings(); },
      });
    }
  }

  drawRings() {
    const g = this.rings;
    g.clear();
    for (const r of this.ringT) {
      if (r.t <= 0 || r.t >= 1) continue;
      const rad = FINISH.RING_R0 + (FINISH.RING_R1 - FINISH.RING_R0) * r.t;
      g.lineStyle(1, FINISH.RING_COLOR, 1 - r.t);
      g.strokeCircle(this.x, this.cy, rad);
    }
  }
}
