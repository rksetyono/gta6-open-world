// Keyboard and mouse input. Tracks held keys, click edges and the mouse
// orbit drag; the game reads this every fixed step, never from events.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since the last consume
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false; // left button pressed since the last consume
    this.pointerLocked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.dragging = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.clicked = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.pointerLocked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
        return;
      }
      if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once for a fresh key press; consumed after the game reads it.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasClicked() {
    return this.clicked;
  }

  // Movement axes: -1..1 from WASD / arrow keys.
  moveX() {
    let x = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return x;
  }

  moveY() {
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    return y;
  }

  takeMouseDelta() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.pressed.clear();
    this.clicked = false;
  }

  requestPointerLock() {
    try {
      const p = this.canvas.requestPointerLock();
      // A rejected lock (no user gesture, headless) must not surface as an
      // unhandled promise rejection in the console.
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_e) {
      // Pointer lock is a nicety; drag orbit works without it.
    }
  }

  releasePointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
