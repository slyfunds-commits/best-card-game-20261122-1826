// The draft between rounds: pick 1 of 3. Offered after every round that does
// not end the match; the pick applies at once and shows on the next round.
import { rollInt } from './random.js';

export const DRAFTS = [
  { key: 'life', name: '+1 LIFE', detail: 'Mend one heart. Never above your mode\'s start.' },
  { key: 'draw', name: 'DRAW +2', detail: 'A fuller hand next round: 8 cards, not 6.' },
  { key: 'sigil', name: 'EMBER SIGIL', detail: 'All your points +15% for the rest of the match.' },
  { key: 'ward', name: 'THORN WARD', detail: 'The Queen loses her phase bonus next round.' },
  { key: 'charm', name: 'CHAIN CHARM', detail: 'Your chains pay double: +50% a step, not +25%.' },
];

/** Offer three different draft picks. */
export function offerDraft(random) {
  const pool = DRAFTS.slice();
  const offered = [];
  while (offered.length < 3 && pool.length > 0) {
    offered.push(pool.splice(rollInt(random, pool.length), 1)[0]);
  }
  return offered;
}

/** Apply the picked draft to the state. */
export function applyDraft(state, draft) {
  if (draft.key === 'life') {
    const max = state.mode === 'master' ? 2 : 3;
    state.lives.you = Math.min(max, state.lives.you + 1);
  } else if (draft.key === 'draw') {
    state.handBonus = 2;
  } else if (draft.key === 'sigil') {
    state.relic = 'sigil';
  } else if (draft.key === 'ward') {
    state.ward = true;
  } else if (draft.key === 'charm') {
    state.charm = true;
  }
  state.draftPick = draft.name;
}
