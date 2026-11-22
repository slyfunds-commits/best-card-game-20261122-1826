// Every tuning number, colour and mode rule in one place. The table is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below
// depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Cards per hand, tricks per round, rounds to win a match. */
export const HAND_SIZE = 6;
export const TRICKS_PER_ROUND = 6;
export const ROUNDS_TO_WIN = 2;

/** How long the revealed trick stays on the table before the next turn, in seconds. */
export const REVEAL_SECONDS = 1.15;

export const MODES = {
  classic: { name: 'CLASSIC', lives: 3, scoreMult: 1, rivalBonus: 0, label: '3 lives · standard rival' },
  master: { name: 'MASTER', lives: 2, scoreMult: 2, rivalBonus: 1, label: '2 lives · rival +1 · score x2' },
};

/** The four original suits of Ember Court. Each is told apart by colour AND shape. */
export const SUITS = {
  ember: { key: 'ember', name: 'EMBER', glyph: 'flame', color: '#ff6b35', dark: '#c73e12', beats: 'thorn', rule: 'Burns THORN — +4 vs Thorn' },
  tide: { key: 'tide', name: 'TIDE', glyph: 'wave', color: '#38b6ff', dark: '#1d6fb8', beats: 'star', rule: 'Drowns STAR — +4 vs Star' },
  thorn: { key: 'thorn', name: 'THORN', glyph: 'leaf', color: '#4ade80', dark: '#1f9d4d', beats: 'tide', rule: 'Strangles TIDE — +4 vs Tide' },
  star: { key: 'star', name: 'STAR', glyph: 'spark', color: '#f2c94c', dark: '#b8860b', beats: 'ember', rule: 'Outshines EMBER — +4 vs Ember' },
};
export const SUIT_KEYS = ['ember', 'tide', 'thorn', 'star'];

/** The rival: a named 3-phase boss. Phase is the round number. */
export const RIVAL = {
  name: 'THE CINDER QUEEN',
  title: 'Keeper of the Ember Court',
  phases: {
    1: { name: 'PHASE 1 · KINDLING', bonus: 0, note: 'plays fair, tests your suits' },
    2: { name: 'PHASE 2 · BLAZE', bonus: 1, note: 'plays harder, hunts your chains' },
    3: { name: 'PHASE 3 · INFERNO', bonus: 2, note: 'enraged — counters your last suit' },
  },
};

export const PALETTE = {
  backdrop: '#160b08',
  felt: '#2b1a12',
  feltLight: '#3a2418',
  feltEdge: '#6b4423',
  gold: '#f2c94c',
  goldDim: '#a8822e',
  cream: '#f5ead6',
  muted: '#c9a98a',
  dim: '#8a6f5c',
  panel: '#241209',
  panelEdge: '#5a3a22',
  red: '#ff5a4e',
  green: '#4ade80',
  blue: '#38b6ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score per mode is kept between visits (this browser only). */
export const BEST_KEY = 'ember-court.best.v1';
