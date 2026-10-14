// Keyboard + touch -> the plain { mx, my, dash } object the sim takes.
// WASD / arrows (diagonals normalized), Space / Shift dash (held = dash when
// ready). The touch joystick is used when no movement key is down.

export class PlayerInput {
  constructor(scene, touch) {
    this.touch = touch;
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT');
    this.out = { mx: 0, my: 0, dash: false };
  }

  read() {
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (mx && my) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }
    if (!mx && !my && this.touch) {
      const v = this.touch.vector();
      mx = v.x;
      my = v.y;
    }
    const touchDash = this.touch ? this.touch.consumeDash() : false;
    this.out.mx = mx;
    this.out.my = my;
    this.out.dash = k.SPACE.isDown || k.SHIFT.isDown || touchDash;
    return this.out;
  }
}
