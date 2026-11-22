// The draw pile and the discard pile: how many cards are left, what has been
// played, and the reshuffle when the deck runs dry.
import { buildDeck, shuffleDeck } from './cards.js';

/** A fresh shuffled pile: the draw deck and an empty discard. */
export function createPiles(random) {
  return { deck: shuffleDeck(buildDeck(), random), discard: [] };
}

/** Draw one card, reshuffling the discard into the deck when it runs out. */
export function drawCard(piles, random) {
  if (piles.deck.length === 0) {
    if (piles.discard.length === 0) return null;
    piles.deck = shuffleDeck(piles.discard.splice(0), random);
  }
  return piles.deck.pop();
}

/** Played cards go here at the end of a trick. */
export function discardCard(piles, card) {
  piles.discard.push(card);
}

export function deckCount(piles) {
  return piles.deck.length;
}

export function discardCount(piles) {
  return piles.discard.length;
}
