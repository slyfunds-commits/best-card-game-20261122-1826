// Scoring: the combo multiplier, trick points, chains, flushes and the floating
// "+points" popups that make a win visible in a still frame.
import { MODES } from './config.js';

/** A won trick grows the combo, up to x4; a lost trick breaks it back to zero. */
export function addCombo(state) {
  state.combo = Math.min(4, state.combo + 1);
  return state.combo;
}

export function breakCombo(state) {
  state.combo = 0;
}

/**
 * Points for winning a trick: the card's value x10, x the combo multiplier,
 * +25% per chain step past the first, x the mode multiplier, + the relic bonus.
 * Returns the integer points.
 */
export function trickPoints(state, card, chain) {
  let points = card.value * 10;
  points *= Math.max(1, state.combo);
  const step = state.charm ? 0.5 : 0.25;
  if (chain > 1) points *= 1 + step * (chain - 1);
  if (state.relic === 'sigil') points *= 1.15;
  points *= MODES[state.mode].scoreMult;
  return Math.round(points);
}

/** The flush bonus: three same-suit plays in a row. */
export const FLUSH_BONUS = 100;

/** Add a floating popup: it rises and fades over about a second. */
export function addPopup(state, x, y, text, color) {
  state.popups.push({ x, y, text, color: color || '#f2c94c', t: 0, life: 1.1 });
}

/** Advance all popups one step; drop the spent ones. */
export function stepPopups(state, dt) {
  for (let i = state.popups.length - 1; i >= 0; i -= 1) {
    const popup = state.popups[i];
    popup.t += dt;
    popup.y -= 34 * dt;
    if (popup.t >= popup.life) state.popups.splice(i, 1);
  }
}
