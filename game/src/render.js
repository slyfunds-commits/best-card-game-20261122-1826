// Drawing only: the game's state and the current screen in, pixels out. The
// 1280x720 table is scaled to fit the window and centred, the margin filled with
// the backdrop colour. Cards are drawn from their x/y (the loop lerps them toward
// their targets, so deals slide, plays flip and snap into their slots).
import { FIELD, FONT, MODES, PALETTE, RIVAL, SUITS, SUIT_KEYS } from './config.js';
import { goalLine } from './rules.js';
import { rivalPhase } from './opponent.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSS = 'loss';
export const SCREEN_PAUSED = 'paused';

const CARD_W = 92;
const CARD_H = 132;
const RIVAL_W = 56;
const RIVAL_H = 78;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw one suit glyph centred at (cx, cy) with radius `s`, in `color`. */
export function drawGlyph(ctx, glyph, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.14);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (glyph === 'flame') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.bezierCurveTo(cx + s * 0.75, cy - s * 0.25, cx + s * 0.6, cy + s * 0.55, cx, cy + s * 0.8);
    ctx.bezierCurveTo(cx - s * 0.6, cy + s * 0.55, cx - s * 0.75, cy - s * 0.25, cx, cy - s);
    ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.25);
    ctx.bezierCurveTo(cx + s * 0.35, cy + s * 0.15, cx + s * 0.25, cy + s * 0.5, cx, cy + s * 0.55);
    ctx.bezierCurveTo(cx - s * 0.25, cy + s * 0.5, cx - s * 0.35, cy + s * 0.15, cx, cy - s * 0.25);
    ctx.fill();
  } else if (glyph === 'wave') {
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s * 0.1);
    ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.7, cx, cy + s * 0.1);
    ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.9, cx + s, cy + s * 0.1);
    ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.5, cx, cy + s * 0.45);
    ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.4, cx - s, cy + s * 0.1);
    ctx.fill();
  } else if (glyph === 'leaf') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.4, cx + s * 0.7, cy + s * 0.7, cx, cy + s);
    ctx.bezierCurveTo(cx - s * 0.7, cy + s * 0.7, cx - s * 0.9, cy - s * 0.4, cx, cy - s);
    ctx.fill();
    ctx.strokeStyle = '#0d3d1e';
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.7);
    ctx.lineTo(cx, cy + s * 0.8);
    ctx.stroke();
  } else {
    // spark: a four-point star.
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.quadraticCurveTo(cx + s * 0.22, cy - s * 0.22, cx + s, cy);
    ctx.quadraticCurveTo(cx + s * 0.22, cy + s * 0.22, cx, cy + s);
    ctx.quadraticCurveTo(cx - s * 0.22, cy + s * 0.22, cx - s, cy);
    ctx.quadraticCurveTo(cx - s * 0.22, cy - s * 0.22, cx, cy - s);
    ctx.fill();
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, bold) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  /** Convert a client-pixel point on the canvas to logical table coordinates. */
  function toLogical(px, py, w, h) {
    const scale = Math.min(w / FIELD.width, h / FIELD.height);
    const ox = (w - FIELD.width * scale) / 2;
    const oy = (h - FIELD.height * scale) / 2;
    return { x: (px - ox) / scale, y: (py - oy) / scale };
  }

  function panel(x, y, w, h, fill) {
    ctx.fillStyle = fill || PALETTE.panel;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function hearts(x, y, count, max, color) {
    for (let i = 0; i < max; i += 1) {
      const cx = x + i * 24;
      ctx.fillStyle = i < count ? color : '#4a2c1c';
      ctx.beginPath();
      ctx.moveTo(cx, y + 7);
      ctx.bezierCurveTo(cx - 9, y - 3, cx - 2, y - 10, cx + 4, y - 3);
      ctx.bezierCurveTo(cx + 10, y - 10, cx + 17, y - 3, cx + 8, y + 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCardBack(x, y, w, h) {
    ctx.fillStyle = '#7a1f16';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#a83a28';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 5);
    ctx.stroke();
    drawGlyph(ctx, 'flame', x + w / 2, y + h / 2, Math.min(w, h) * 0.22, PALETTE.gold);
  }

  function drawCard(card, w, h) {
    const suit = SUITS[card.suit];
    const f = card.face == null ? 1 : card.face;
    // Flip: the card narrows to nothing at the turn, back before it, face after.
    const squash = Math.abs(Math.cos(f * Math.PI));
    const cx = card.x + w / 2;
    const dw = Math.max(2, w * (0.12 + 0.88 * squash));
    const dx = cx - dw / 2;
    if (f < 0.5) {
      drawCardBack(dx, card.y, dw, h);
      return;
    }
    ctx.fillStyle = '#f7ead0';
    roundRect(ctx, dx, card.y, dw, h, 8);
    ctx.fill();
    ctx.strokeStyle = suit.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (dw < w * 0.5) return;
    text(String(card.value), dx + 10, card.y + 30, 26, suit.dark, 'left', true);
    drawGlyph(ctx, suit.glyph, dx + 22, card.y + 52, 11, suit.color);
    drawGlyph(ctx, suit.glyph, dx + dw / 2, card.y + h / 2 + 8, 26, suit.color);
    text(suit.name, dx + dw / 2, card.y + h - 12, 13, suit.dark, 'center', true);
    if (dw >= 92) text(String(card.value), dx + dw - 10, card.y + h - 10, 20, suit.dark, 'right', true);
  }

  function drawSlot(x, y, w, h, label) {
    ctx.strokeStyle = PALETTE.feltEdge;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.setLineDash([]);
    text(label, x + w / 2, y + h / 2 + 5, 13, PALETTE.dim, 'center');
  }

  function drawHud(state, bests) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, 46);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(0, 46, FIELD.width, 2);
    text('EMBER COURT', 16, 31, 24, PALETTE.gold, 'left', true);
    const best = bests[state.mode] || 0;
    text(`SCORE ${state.score}`, 250, 31, 20, PALETTE.cream, 'left', true);
    text(`BEST ${best}`, 430, 31, 20, PALETTE.gold, 'left', true);
    text(`ROUND ${state.round}/3`, 570, 31, 20, PALETTE.cream, 'left', true);
    text(`TURN ${Math.min(state.turn, 6)}/6`, 700, 31, 20, PALETTE.cream, 'left', true);
    const comboColor = state.combo >= 3 ? PALETTE.gold : state.combo > 0 ? PALETTE.cream : PALETTE.dim;
    text(`COMBO x${Math.max(1, state.combo)}`, 800, 31, 20, comboColor, 'left', true);
    text(`DECK ${state.deckCount}`, 960, 31, 18, PALETTE.muted, 'left');
    text(`DISCARD ${state.discardCount}`, 1070, 31, 18, PALETTE.muted, 'left');
    text(MODES[state.mode].name, 1264, 31, 18, PALETTE.gold, 'right', true);
    text(goalLine(), FIELD.width / 2, 66, 15, PALETTE.muted, 'center');
  }

  function drawRivalRow(state) {
    const phase = rivalPhase(state.round);
    text(RIVAL.name, 16, 96, 22, '#ff8a5c', 'left', true);
    text(phase.name, 16, 118, 15, PALETTE.gold, 'left');
    // Boss bar: phase pips (●●○) + the phase bonus, so the rival reads as a boss.
    for (let i = 0; i < 3; i += 1) {
      const cx = 176 + i * 16;
      ctx.beginPath();
      ctx.arc(cx, 113, 5, 0, Math.PI * 2);
      if (i < phase.number) {
        ctx.fillStyle = PALETTE.gold;
        ctx.fill();
      } else {
        ctx.strokeStyle = PALETTE.dim;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    text(`BONUS +${phase.bonus}`, 224, 118, 14, PALETTE.gold, 'left', true);
    text(phase.note, 16, 138, 13, PALETTE.dim, 'left');
    text('LIFE', 300, 96, 14, PALETTE.muted, 'left');
    hearts(300, 104, state.lives.rival, 3, '#ff5a4e');
    // HP bar under the hearts: rival lives as a red bar.
    ctx.fillStyle = '#4a2c1c';
    ctx.fillRect(300, 120, 72, 6);
    ctx.fillStyle = '#ff5a4e';
    ctx.fillRect(300, 120, Math.max(0, 72 * (state.lives.rival / 3)), 6);
    text(`ROUNDS ${state.roundsWon.rival}`, 300, 140, 14, PALETTE.muted, 'left');
    // Her hand: face-down backs, fanned.
    for (let i = 0; i < state.rivalHand.length; i += 1) {
      const card = state.rivalHand[i];
      drawCardBack(card.x, card.y, RIVAL_W, RIVAL_H);
    }
    // The telegraphed intent: what she will play, and what counters it.
    panel(880, 74, 384, 66, '#2a0f08');
    ctx.fillStyle = '#ff8a5c';
    ctx.fillRect(880, 74, 4, 66);
    text('RIVAL INTENT', 898, 96, 13, PALETTE.dim, 'left', true);
    text(state.intent ? state.intent.text : 'The Queen is thinking…', 898, 120, 15, PALETTE.cream, 'left', true);
  }

  function drawLegend(state) {
    panel(1000, 168, 264, 306);
    text('SUITS & COMBOS', 1016, 194, 16, PALETTE.gold, 'left', true);
    let y = 224;
    for (const key of SUIT_KEYS) {
      const suit = SUITS[key];
      drawGlyph(ctx, suit.glyph, 1032, y - 4, 11, suit.color);
      text(suit.name, 1050, y, 15, suit.color, 'left', true);
      text(suit.rule, 1050, y + 16, 12, PALETTE.muted, 'left');
      y += 42;
    }
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.beginPath();
    ctx.moveTo(1016, y - 6);
    ctx.lineTo(1248, y - 6);
    ctx.stroke();
    text('CHAIN: same suit twice', 1016, y + 16, 13, PALETTE.cream, 'left');
    text('in a row = +25% a step', 1016, y + 34, 13, PALETTE.cream, 'left');
    text('FLUSH: 3 same suit = +100', 1016, y + 58, 13, PALETTE.cream, 'left');
    text('COMBO: win tricks in a row', 1016, y + 82, 13, PALETTE.cream, 'left');
    text('to grow the xN multiplier', 1016, y + 100, 13, PALETTE.cream, 'left');
    // The old one-line BOON note lived here; the relics roster below names every pick.
  }

  /** RELICS & BOONS roster + COURT GOALS checklist, in the empty right column. */
  function drawRelicsAndGoals(state) {
    const relics = [
      { key: 'sigil', held: state.relic === 'sigil', line: 'EMBER SIGIL — +15% pts' },
      { key: 'ward', held: state.ward, line: 'THORN WARD — eats bonus' },
      { key: 'charm', held: state.charm, line: 'CHAIN CHARM — +50%/step' },
      { key: 'draw', held: state.handBonus > 0, line: 'DRAW +2 — 8-card hand' },
      { key: 'life', held: state.draftPick === '+1 LIFE', line: '+1 LIFE — mend a heart' },
    ];
    const heldCount = relics.filter((r) => r.held).length;
    panel(1000, 498, 264, 196);
    text(`RELICS & BOONS ${heldCount}/5`, 1016, 518, 15, PALETTE.gold, 'left', true);
    for (let i = 0; i < relics.length; i += 1) {
      const relic = relics[i];
      const y = 538 + i * 16;
      if (relic.held) text(`✓ ${relic.line}`, 1016, y, 13, PALETTE.gold, 'left', true);
      else text(`· ${relic.line}`, 1016, y, 13, PALETTE.dim, 'left');
    }
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.beginPath();
    ctx.moveTo(1016, 614);
    ctx.lineTo(1248, 614);
    ctx.stroke();
    text('COURT GOALS', 1016, 634, 15, PALETTE.gold, 'left', true);
    const flushDone = state.stats.flushes > 0;
    const chainDone = state.combo >= 3;
    text(`FLUSH 3 IN A ROW — ${flushDone ? '✓' : '—'}`, 1016, 653, 13, flushDone ? PALETTE.gold : PALETTE.cream, 'left', flushDone);
    text(`CHAIN x3 — ${chainDone ? '✓' : '—'}`, 1016, 669, 13, chainDone ? PALETTE.gold : PALETTE.cream, 'left', chainDone);
    text(`TAKE 2 ROUNDS — ${state.roundsWon.you}/2`, 1016, 685, 13, PALETTE.cream, 'left');
  }

  function drawTable(state) {
    ctx.fillStyle = PALETTE.felt;
    roundRect(ctx, 16, 168, 968, 306, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.feltEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Played-card slots.
    if (state.played.you) drawCard(state.played.you, CARD_W, CARD_H);
    else drawSlot(330, 226, CARD_W, CARD_H, 'YOUR CARD');
    if (state.played.rival) drawCard(state.played.rival, CARD_W, CARD_H);
    else drawSlot(560, 226, CARD_W, CARD_H, 'QUEEN\'S CARD');
    text('YOU', 376, 378, 15, PALETTE.cream, 'center', true);
    text('QUEEN', 606, 378, 15, '#ff8a5c', 'center', true);
    text('VS', 491, 306, 30, PALETTE.gold, 'center', true);
    // The callout: the last trick's result, in words.
    if (state.callout) {
      text(state.callout, 491, 416, 20, PALETTE.gold, 'center', true);
    }
    // Floating "+points" popups.
    for (const popup of state.popups) {
      ctx.globalAlpha = Math.max(0, 1 - popup.t / popup.life);
      text(popup.text, popup.x, popup.y, 24, popup.color, 'center', true);
      ctx.globalAlpha = 1;
    }
    // Top discard card, face up, at the table's right edge.
    text('DISCARD', 914, 222, 13, PALETTE.dim, 'center', true);
    if (state.piles && state.piles.discard && state.piles.discard.length > 0) {
      const top = state.piles.discard[state.piles.discard.length - 1];
      const shown = { ...top, x: 884, y: 232, face: 1 };
      drawCard(shown, 60, 88);
      text(`${state.piles.discard.length} CARDS`, 914, 340, 13, PALETTE.muted, 'center');
    } else {
      drawCardBack(884, 232, 60, 88);
      text('EMPTY', 914, 340, 13, PALETTE.muted, 'center');
    }
    // Your life, under the table.
    text('YOUR LIFE', 40, 446, 14, PALETTE.muted, 'left');
    hearts(40, 454, state.lives.you, 3, '#4ade80');
    text(`ROUNDS ${state.roundsWon.you}`, 200, 446, 14, PALETTE.muted, 'left');
    text(state.phase === 'reveal' ? 'The trick is on the table…' : 'YOUR TURN — play a card', 491, 458, 16, PALETTE.cream, 'center', true);
  }

  function drawHand(state) {
    for (let i = 0; i < state.hand.length; i += 1) {
      const card = state.hand[i];
      if (i === state.selectedIndex) {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 4;
        roundRect(ctx, card.x - 3, card.y - 3, CARD_W + 6, CARD_H + 6, 10);
        ctx.stroke();
      }
      drawCard(card, CARD_W, CARD_H);
    }
    text('Click a card or use ← → then Enter · P pauses', FIELD.width / 2, 700, 14, PALETTE.dim, 'center');
  }

  function drawMessage(state) {
    if (!state.message) return;
    text(state.message, FIELD.width / 2, 500 - 8, 17, PALETTE.muted, 'center');
  }

  function drawTitle(state, bests) {
    ctx.fillStyle = PALETTE.felt;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.strokeStyle = PALETTE.feltEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, FIELD.width - 20, FIELD.height - 20);
    text('EMBER COURT', FIELD.width / 2, 150, 76, PALETTE.gold, 'center', true);
    text('A duel of 4 suits against THE CINDER QUEEN', FIELD.width / 2, 192, 22, PALETTE.cream, 'center');
    text('4 SUITS · 3 ROUNDS · 48 CARDS · 3-PHASE RIVAL · 5 DRAFT RELICS · 2 MODES', FIELD.width / 2, 232, 20, PALETTE.gold, 'center', true);
    // Suits legend row: four centred blocks, glyph over name over rule.
    for (let i = 0; i < SUIT_KEYS.length; i += 1) {
      const suit = SUITS[SUIT_KEYS[i]];
      const cx = 220 + i * 280;
      drawGlyph(ctx, suit.glyph, cx, 292, 20, suit.color);
      text(suit.name, cx, 326, 18, suit.color, 'center', true);
      text(suit.rule, cx, 348, 13, PALETTE.muted, 'center');
    }
    // Mode select, with the best per mode.
    const modes = ['classic', 'master'];
    for (let i = 0; i < modes.length; i += 1) {
      const mode = MODES[modes[i]];
      const bx = 340 + i * 320;
      const selected = state.mode === modes[i];
      panel(bx, 360, 280, 130, selected ? '#3a2418' : PALETTE.panel);
      if (selected) {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 3;
        roundRect(ctx, bx, 360, 280, 130, 10);
        ctx.stroke();
      }
      text(`${i + 1} · ${mode.name}`, bx + 140, 402, 24, selected ? PALETTE.gold : PALETTE.cream, 'center', true);
      text(mode.label, bx + 140, 430, 14, PALETTE.muted, 'center');
      text(`BEST ${bests[modes[i]] || 0}`, bx + 140, 458, 16, PALETTE.gold, 'center', true);
    }
    text('WIN: take 2 rounds before your life hits 0 · LOSE: your life hits 0', FIELD.width / 2, 520, 17, PALETTE.cream, 'center');
    text('Play a higher card — or counter her suit for +4. Chain your suits. Flush for +100.', FIELD.width / 2, 548, 16, PALETTE.muted, 'center');
    text('AFTER EACH ROUND: DRAFT 1 OF 3 — NEW CARD · RELIC · +LIFE', FIELD.width / 2, 578, 16, PALETTE.gold, 'center', true);
    text('RELICS: EMBER SIGIL · THORN WARD · CHAIN CHARM · DRAW +2 · +1 LIFE', FIELD.width / 2, 604, 16, PALETTE.gold, 'center', true);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    text('CLICK A MODE, OR PRESS 1 / 2 — THEN ENTER TO BEGIN', FIELD.width / 2, 626, 20, PALETTE.gold, 'center', true);
    ctx.globalAlpha = 1;
    text('The Queen telegraphs every card she will play. Read her. Counter her.', FIELD.width / 2, 660, 15, PALETTE.dim, 'center');
  }

  function drawDraft(state) {
    ctx.fillStyle = PALETTE.felt;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('ROUND WON — CHOOSE A BOON', FIELD.width / 2, 120, 40, PALETTE.gold, 'center', true);
    text('Pick 1 of 3 — the Queen is already shuffling for the next round', FIELD.width / 2, 158, 18, PALETTE.muted, 'center');
    for (let i = 0; i < state.draft.length; i += 1) {
      const draft = state.draft[i];
      const bx = 190 + i * 320;
      panel(bx, 220, 280, 220);
      text(`${i + 1}`, bx + 140, 268, 30, PALETTE.dim, 'center');
      text(draft.name, bx + 140, 320, 24, PALETTE.gold, 'center', true);
      const words = draft.detail.split(' ');
      let line = '';
      let ly = 356;
      for (const word of words) {
        if ((line + ' ' + word).trim().length > 26) {
          text(line.trim(), bx + 140, ly, 15, PALETTE.cream, 'center');
          line = word;
          ly += 22;
        } else line += ' ' + word;
      }
      if (line.trim()) text(line.trim(), bx + 140, ly, 15, PALETTE.cream, 'center');
    }
    text('CLICK A CARD OR PRESS 1 / 2 / 3', FIELD.width / 2, 520, 20, PALETTE.gold, 'center', true);
  }

  function drawScorecard(state, won, bests) {
    const best = bests[state.mode] || 0;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 2.5);
    ctx.fillStyle = won ? '#2a1a05' : '#1c0d08';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.strokeStyle = won ? PALETTE.gold : '#7a1f16';
    ctx.lineWidth = 4;
    ctx.globalAlpha = pulse;
    ctx.strokeRect(14, 14, FIELD.width - 28, FIELD.height - 28);
    ctx.globalAlpha = 1;
    if (won) {
      // Frozen flourish: fixed confetti dots (deterministic — no random per frame).
      const confetti = [
        [80, 40, 4, 0], [160, 30, 3, 1], [240, 52, 4, 2], [320, 34, 3, 0], [420, 44, 4, 1], [520, 30, 3, 0],
        [620, 48, 4, 2], [720, 32, 3, 1], [820, 46, 4, 0], [920, 34, 3, 2], [1020, 44, 4, 1], [1120, 30, 3, 0],
        [1200, 52, 4, 2], [120, 64, 3, 1], [380, 66, 4, 0], [700, 68, 3, 1], [980, 64, 4, 0], [60, 90, 3, 2],
        [1240, 88, 3, 1], [200, 76, 3, 0], [560, 74, 4, 1], [860, 76, 3, 0], [1100, 72, 4, 1], [40, 130, 3, 0],
        [1240, 130, 3, 2], [120, 160, 4, 0], [220, 190, 3, 1], [80, 210, 4, 2], [1080, 160, 3, 0], [1180, 190, 4, 1],
        [1000, 210, 3, 2], [300, 150, 3, 0], [980, 150, 4, 1], [60, 400, 3, 0], [120, 440, 4, 1], [1220, 400, 3, 2],
        [1160, 440, 4, 0],
      ];
      const confettiColors = [PALETTE.gold, PALETTE.cream, '#ff6b35'];
      for (const dot of confetti) {
        ctx.fillStyle = confettiColors[dot[3]];
        ctx.beginPath();
        ctx.arc(dot[0], dot[1], dot[2], 0, Math.PI * 2);
        ctx.fill();
      }
      drawGlyph(ctx, 'spark', FIELD.width / 2, 62, 18, PALETTE.gold);
      text('THE COURT IS YOURS!', FIELD.width / 2, 130, 58, PALETTE.gold, 'center', true);
      text('The Cinder Queen bows — her crown is yours.', FIELD.width / 2, 172, 20, PALETTE.cream, 'center');
    } else {
      text('THE CINDER QUEEN KEEPS THE COURT', FIELD.width / 2, 130, 48, '#ff5a4e', 'center', true);
      text(state.endReason || 'The rival took the final round.', FIELD.width / 2, 172, 20, PALETTE.cream, 'center');
    }
    // The rival's winning hand, face up, on the loss screen.
    if (!won && state.rivalLastHand && state.rivalLastHand.length > 0) {
      text('HER WINNING HAND', FIELD.width / 2, 214, 16, '#ff8a5c', 'center', true);
      for (let i = 0; i < state.rivalLastHand.length; i += 1) {
        drawCard(state.rivalLastHand[i], 72, 104);
      }
    }
    // Your winning hand, face up, on the win screen: the last four cards YOU
    // played, recovered from the discard pile in play order (you, rival, you,
    // rival — every resolved trick discards both cards, so your last four are
    // the pile's last eight at even offsets). The hand is empty at match end
    // (all cards are played each round), so state.hand cannot supply it.
    if (won && state.piles && state.piles.discard && state.piles.discard.length >= 8) {
      const disc = state.piles.discard;
      const youCards = [disc[disc.length - 8], disc[disc.length - 6], disc[disc.length - 4], disc[disc.length - 2]];
      text('YOUR WINNING HAND', FIELD.width / 2, 214, 16, PALETTE.gold, 'center', true);
      const totalW = youCards.length * 72 + (youCards.length - 1) * 6;
      for (let i = 0; i < youCards.length; i += 1) {
        const shown = { ...youCards[i], x: 640 - totalW / 2 + i * 78, y: 226, face: 1 };
        drawCard(shown, 72, 104);
      }
    }
    const stats = [
      ['SCORE', String(state.score)],
      ['BEST', String(best)],
      ['NEW BEST', state.newBest ? 'YES!' : '—'],
      ['ROUNDS', `${state.roundsWon.you}–${state.roundsWon.rival}`],
      ['MODE', MODES[state.mode].name],
      ['CARDS PLAYED', String(state.stats.cardsPlayed)],
    ];
    const y0 = 380;
    for (let i = 0; i < stats.length; i += 1) {
      const bx = 190 + (i % 3) * 320;
      const by = y0 + Math.floor(i / 3) * 110;
      panel(bx, by, 280, 88);
      text(stats[i][0], bx + 140, by + 32, 15, PALETTE.dim, 'center', true);
      text(stats[i][1], bx + 140, by + 66, 28, stats[i][0] === 'NEW BEST' && state.newBest ? PALETTE.gold : PALETTE.cream, 'center', true);
    }
    text(`TRICKS WON ${state.stats.tricksWon} · FLUSHES ${state.stats.flushes} · BEST ${MODES[state.mode].name} ${best}`, FIELD.width / 2, y0 + 250, 16, PALETTE.muted, 'center');
    ctx.globalAlpha = pulse;
    text('PRESS ENTER OR CLICK TO PLAY AGAIN', FIELD.width / 2, y0 + 300, 20, PALETTE.gold, 'center', true);
    ctx.globalAlpha = 1;
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(10, 5, 3, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(FIELD.width / 2 - 300, 260, 600, 200);
    text('PAUSED', FIELD.width / 2, 330, 44, PALETTE.gold, 'center', true);
    text('The Queen waits. Press P to resume.', FIELD.width / 2, 380, 18, PALETTE.cream, 'center');
  }

  /** Paint one frame: the table and HUD, then the panel for the screen. */
  function draw(state, screen, bests) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, bests);
      return;
    }
    if (screen === SCREEN_DRAFT) {
      drawDraft(state);
      return;
    }
    if (screen === SCREEN_WIN) {
      drawScorecard(state, true, bests);
      return;
    }
    if (screen === SCREEN_LOSS) {
      drawScorecard(state, false, bests);
      return;
    }
    drawHud(state, bests);
    drawRivalRow(state);
    drawTable(state);
    drawLegend(state);
    drawRelicsAndGoals(state);
    drawMessage(state);
    drawHand(state);
    if (screen === SCREEN_PAUSED) drawPaused();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical };
}
