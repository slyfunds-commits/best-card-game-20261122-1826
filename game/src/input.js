// Keyboard and pointer input. One-shot presses (confirm, pause, digit picks)
// are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. Pointer clicks arrive with
// their logical-table coordinates; the loop reads them from takeClicks().
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_LEFT = 4;
export const ACTION_RIGHT = 8;
export const ACTION_DIGIT_1 = 16;
export const ACTION_DIGIT_2 = 32;
export const ACTION_DIGIT_3 = 64;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DIGITS = { Digit1: ACTION_DIGIT_1, Digit2: ACTION_DIGIT_2, Digit3: ACTION_DIGIT_3 };

export function createInput(canvas, toLogical) {
  let actions = 0;
  let clicks = [];

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_LEFT;
    } else if (RIGHT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RIGHT;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (DIGITS[event.code]) {
      if (!event.repeat) actions |= DIGITS[event.code];
    } else return;
    event.preventDefault();
  });
  // A key released while the tab is hidden never sends keyup: nothing held here,
  // so there is nothing to drop on blur.
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = toLogical(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    clicks.push(point);
    actions |= ACTION_CONFIRM;
  });

  return {
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Pointer clicks since the last call, in logical-table coordinates. */
    takeClicks() {
      const taken = clicks;
      clicks = [];
      return taken;
    },
  };
}
