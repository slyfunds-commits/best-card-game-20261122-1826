// The rules of Ember Court: how a trick is won, how cards combine, and how a
// match is won or lost. No drawing and no browser in here.
//
// A trick: both sides play one card face up. The higher effective value wins.
// Effective value is the card's value, +4 when its suit counters the other card's
// suit, + the rival's phase bonus. A tie goes to the counter suit, else the rival.
// Cards combine two ways: CHAIN (playing the same suit as your previous play) and
// FLUSH (three same-suit plays in a row). Both are scored in score.js.
import { SUITS } from './config.js';

/** +4 when `card`'s suit counters `other`'s suit, else 0. */
export function counterBonus(card, other) {
  return SUITS[card.suit].beats === other.suit ? 4 : 0;
}

/** The value a card fights with in this trick. */
export function effectiveValue(card, other, bonus) {
  return card.value + counterBonus(card, other) + (bonus || 0);
}

/**
 * Resolve one trick. Returns { winner: 'you'|'rival', youValue, rivalValue,
 * counter: true when the player's suit countered the rival's }.
 */
export function resolveTrick(yourCard, rivalCard, rivalBonus) {
  const youValue = effectiveValue(yourCard, rivalCard, 0);
  const rivalValue = effectiveValue(rivalCard, yourCard, rivalBonus);
  let winner;
  if (youValue > rivalValue) winner = 'you';
  else if (rivalValue > youValue) winner = 'rival';
  else winner = counterBonus(yourCard, rivalCard) > 0 ? 'you' : 'rival';
  return { winner, youValue, rivalValue, counter: counterBonus(yourCard, rivalCard) > 0 };
}

/**
 * Chain and flush: given the suit just played and the suits played before it
 * (most recent first), return { chain: length of the same-suit run, flush: true
 * when the run reaches three }.
 */
export function chainInfo(suit, previousSuits) {
  let chain = 1;
  for (let i = 0; i < previousSuits.length; i += 1) {
    if (previousSuits[i] === suit) chain += 1;
    else break;
  }
  return { chain, flush: chain >= 3 };
}

/** The match ends when a side has taken 2 rounds, or a side's life hits 0. */
export function checkWin(state) {
  if (state.roundsWon.you >= 2 && state.lives.you > 0) return 'you';
  if (state.lives.rival <= 0 && state.lives.you > 0) return 'you';
  return null;
}

export function checkLose(state) {
  if (state.lives.you <= 0) return 'rival';
  if (state.roundsWon.rival >= 2) return 'rival';
  return null;
}

/** One-line goal, shown on the play HUD: the win and the loss, together. */
export function goalLine() {
  return 'WIN: take 2 rounds before your life hits 0  ·  LOSE: your life hits 0';
}
