// LANTERN ROW — input. Keyboard state, mouse look through pointer lock, and the
// edge-triggered keys (reload, buy, grenade, plant) the simulation consumes once.
export function createInput(canvas) {
  const keys = {};
  const pressed = {};
  let lookDX = 0;
  let lookDY = 0;
  let mouseDown = false;
  let rightDown = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    pressed[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouseDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookDX += e.movementX;
    lookDY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    keys,
    get locked() { return locked; },
    lock() { canvas.requestPointerLock(); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    get firing() { return mouseDown && locked; },
    get scoping() { return rightDown && locked; },
    consumeLook() {
      const dx = lookDX, dy = lookDY;
      lookDX = 0; lookDY = 0;
      return { dx, dy };
    },
    // True once, the frame after the key went down.
    wasPressed(code) {
      if (pressed[code]) { pressed[code] = false; return true; }
      return false;
    },
    clearPressed() { for (const k of Object.keys(pressed)) pressed[k] = false; },
  };
}
