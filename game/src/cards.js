// The cards themselves: a 48-card deck of four original suits, values 1-12.
// A card is a plain object { suit, value, id, x, y, tx, ty, face, scale } —
// x/y is where it is drawn now, tx/ty where it is travelling to, face 0..1 is
// how far its flip has turned. Nothing here draws; render.js does that.
import { SUIT_KEYS, SUITS } from './config.js';

/** Build a fresh 48-card deck, unshuffled. */
export function buildDeck() {
  const deck = [];
  let id = 0;
  for (const key of SUIT_KEYS) {
    for (let value = 1; value <= 12; value += 1) {
      deck.push(makeCard(key, value, id));
      id += 1;
    }
  }
  return deck;
}

export function makeCard(suit, value, id) {
  return { suit, value, id, x: 0, y: 0, tx: 0, ty: 0, face: 1, scale: 1 };
}

/** Fisher-Yates shuffle, in place, with the seeded random. */
export function shuffleDeck(deck, random) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

/** Deal `count` cards off the top of the deck. */
export function dealHand(deck, count) {
  const hand = [];
  for (let i = 0; i < count && deck.length > 0; i += 1) hand.push(deck.pop());
  return hand;
}

/** The suit this card's suit beats, or null. */
export function counterSuit(suitKey) {
  return SUITS[suitKey].beats;
}

/** The suit that beats this card's suit (the one the player should play). */
export function beatenBy(suitKey) {
  for (const key of SUIT_KEYS) if (SUITS[key].beats === suitKey) return key;
  return null;
}

/** Short label for a card, e.g. "TIDE 9". */
export function cardLabel(card) {
  return `${SUITS[card.suit].name} ${card.value}`;
}

/** Sort a hand for display: by suit, then value. */
export function sortHand(hand) {
  hand.sort((a, b) => {
    const sa = SUIT_KEYS.indexOf(a.suit);
    const sb = SUIT_KEYS.indexOf(b.suit);
    return sa === sb ? a.value - b.value : sa - sb;
  });
  return hand;
}
