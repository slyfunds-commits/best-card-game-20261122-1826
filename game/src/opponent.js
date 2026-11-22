// The rival: THE CINDER QUEEN, a named 3-phase boss. Every turn she TELEGRAPHS
// her next card on screen (rivalIntent) so the player can read her and counter
// her — the card she commits to is the card she plays (rivalPlays).
import { RIVAL, SUITS } from './config.js';
import { beatenBy, cardLabel } from './cards.js';
import { rollInt } from './random.js';

/** The phase of the round: 1, 2 or 3, with its bonus and name. */
export function rivalPhase(round) {
  const phase = RIVAL.phases[Math.min(3, Math.max(1, round))];
  return { number: Math.min(3, Math.max(1, round)), ...phase };
}

/**
 * Pick the card the rival will play this turn and commit to it. Phase 1 plays a
 * middling card; phase 2 hunts value; phase 3 counters the player's last suit.
 * Returns { card, text } — the text is the telegraphed intent line on screen.
 */
export function rivalIntent(state, random) {
  const hand = state.rivalHand;
  if (hand.length === 0) return null;
  const phase = rivalPhase(state.round);
  let card;
  if (phase.number === 3 && state.lastSuit) {
    const counters = hand.filter((c) => SUITS[c.suit].beats === state.lastSuit);
    if (counters.length > 0) {
      card = counters.reduce((best, c) => (c.value > best.value ? c : best), counters[0]);
    }
  }
  if (!card && phase.number === 2) {
    // Hunt value: the strongest card, unless a cheap win is on the table.
    const sorted = hand.slice().sort((a, b) => b.value - a.value);
    card = random() < 0.7 ? sorted[0] : sorted[rollInt(random, Math.min(3, sorted.length))];
  }
  if (!card) card = hand[rollInt(random, hand.length)];
  const counter = beatenBy(card.suit);
  const text = `WILL PLAY: ${cardLabel(card)} · COUNTER: ${SUITS[counter].name}`;
  return { card, text };
}

/** Play the committed card: remove it from her hand and return it. */
export function rivalPlays(state) {
  const intent = state.intent;
  if (!intent) return null;
  const index = state.rivalHand.indexOf(intent.card);
  if (index >= 0) state.rivalHand.splice(index, 1);
  return intent.card;
}

/** Her life bar: lives left of the mode's starting lives. */
export function rivalLife(state) {
  return state.lives.rival;
}
