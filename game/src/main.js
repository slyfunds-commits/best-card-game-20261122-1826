// Boot and the one loop: input is read every frame, the match advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between
// title, play, draft, win and loss screens.
//
// ?seed=N fixes the shuffle. ?shot=start|play|loss|win (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, HAND_SIZE, MODES, REVEAL_SECONDS, ROUNDS_TO_WIN, STEP, TRICKS_PER_ROUND } from './config.js';
import { createRandom } from './random.js';
import { buildDeck, cardLabel, dealHand, shuffleDeck, sortHand } from './cards.js';
import { createPiles, deckCount, discardCard, discardCount, drawCard } from './deck.js';
import { chainInfo, checkLose, checkWin, counterBonus, goalLine, resolveTrick } from './rules.js';
import { addCombo, addPopup, breakCombo, FLUSH_BONUS, stepPopups, trickPoints } from './score.js';
import { applyDraft, offerDraft } from './draft.js';
import { rivalIntent, rivalPhase, rivalPlays } from './opponent.js';
import { audio } from './audio.js';
import { ACTION_CONFIRM, ACTION_DIGIT_1, ACTION_DIGIT_2, ACTION_DIGIT_3, ACTION_LEFT, ACTION_PAUSE, ACTION_RIGHT, createInput } from './input.js';
import { createRenderer, SCREEN_DRAFT, SCREEN_LOSS, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const renderer = createRenderer(canvas);

/** A fresh match state, before a mode is picked. */
function freshState() {
  return {
    mode: 'classic',
    screen: SCREEN_TITLE,
    phase: 'await',
    round: 1,
    turn: 1,
    lives: { you: 3, rival: 3 },
    roundsWon: { you: 0, rival: 0 },
    roundScore: { you: 0, rival: 0 },
    score: 0,
    bests: { classic: 0, master: 0 },
    newBest: false,
    combo: 0,
    rivalCombo: 0,
    chain: 0,
    lastSuit: null,
    prevSuits: [],
    piles: null,
    hand: [],
    rivalHand: [],
    played: { you: null, rival: null },
    intent: null,
    popups: [],
    message: 'The Queen shuffles. Read her intent — then answer it.',
    callout: '',
    draft: [],
    draftPick: '',
    relic: null,
    ward: false,
    charm: false,
    handBonus: 0,
    stats: { cardsPlayed: 0, tricksWon: 0, flushes: 0 },
    endReason: '',
    rivalLastHand: [],
    lastRivalPlays: [],
    selectedIndex: 0,
    time: 0,
    revealTimer: 0,
    deckCount: 0,
    discardCount: 0,
  };
}

const state = freshState();

function readBests() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(BEST_KEY) ?? '{}');
    return { classic: saved.classic | 0, master: saved.master | 0 };
  } catch {
    return { classic: 0, master: 0 };
  }
}

function saveBests() {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(state.bests));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

state.bests = readBests();

function announce(message) {
  status.textContent = message;
}

/** Where a hand card belongs on the table (fanned, centred). */
function handSlot(index, count) {
  const w = 92;
  const gap = 10;
  const total = count * w + (count - 1) * gap;
  const x = (FIELD.width - total) / 2 + index * (w + gap);
  const y = index === state.selectedIndex ? 496 : 520;
  return { x, y };
}

/** Where a rival back belongs (fanned, top centre). */
function rivalSlot(index, count) {
  const w = 56;
  const gap = 6;
  const total = count * w + (count - 1) * gap;
  return { x: (FIELD.width - total) / 2 + index * (w + gap), y: 84 };
}

function layoutHand(animate) {
  for (let i = 0; i < state.hand.length; i += 1) {
    const slot = handSlot(i, state.hand.length);
    const card = state.hand[i];
    card.tx = slot.x;
    card.ty = slot.y;
    if (!animate) {
      card.x = slot.x;
      card.y = slot.y;
    }
  }
}

function layoutRivalHand(animate) {
  for (let i = 0; i < state.rivalHand.length; i += 1) {
    const slot = rivalSlot(i, state.rivalHand.length);
    const card = state.rivalHand[i];
    card.tx = slot.x;
    card.ty = slot.y;
    if (!animate) {
      card.x = slot.x;
      card.y = slot.y;
    }
  }
}

/** Deal a round: fresh piles, hands, the rival's telegraphed first intent. */
function dealRound(round) {
  state.round = round;
  state.turn = 1;
  state.roundScore = { you: 0, rival: 0 };
  state.phase = 'await';
  state.played = { you: null, rival: null };
  state.callout = '';
  state.piles = createPiles(random);
  const size = HAND_SIZE + state.handBonus;
  state.hand = sortHand(dealHand(state.piles.deck, size));
  state.rivalHand = dealHand(state.piles.deck, size);
  state.deckCount = deckCount(state.piles);
  state.discardCount = discardCount(state.piles);
  // The deal slides in from the deck, top right.
  for (const card of state.hand) {
    card.x = 1180;
    card.y = 20;
    card.face = 1;
  }
  for (const card of state.rivalHand) {
    card.x = 1180;
    card.y = 20;
    card.face = 1;
  }
  layoutHand(true);
  layoutRivalHand(true);
  state.intent = rivalIntent(state, random);
  state.message = rivalPhase(round).note + '.';
  state.selectedIndex = 0;
}

/** Start a match in the chosen mode. */
function newMatch(mode) {
  const keep = freshState();
  keep.bests = state.bests;
  keep.mode = mode;
  Object.assign(state, keep);
  state.lives = { you: MODES[mode].lives, rival: MODES[mode].lives };
  state.screen = SCREEN_PLAY;
  dealRound(1);
  announce(`Playing ${MODES[mode].name}. ${state.lives.you} lives. ${goalLine()}`);
}

/** The rival's bonus this round: phase + mode, unless the ward ate it. */
function rivalBonus() {
  if (state.ward) return 0;
  return rivalPhase(state.round).bonus + MODES[state.mode].rivalBonus;
}

/** Play the selected hand card into the trick, and reveal the Queen's committed card. */
function playCard(index) {
  if (state.screen !== SCREEN_PLAY || state.phase !== 'await') return false;
  if (index < 0 || index >= state.hand.length) return false;
  const card = state.hand.splice(index, 1)[0];
  card.tx = 330;
  card.ty = 226;
  card.face = 0;
  state.played.you = card;
  const rivalCard = rivalPlays(state);
  if (rivalCard) {
    rivalCard.tx = 560;
    rivalCard.ty = 226;
    rivalCard.face = 0;
    state.played.rival = rivalCard;
  }
  state.phase = 'reveal';
  state.revealTimer = REVEAL_SECONDS;
  state.stats.cardsPlayed += 1;
  layoutHand(true);
  layoutRivalHand(true);
  audio.playCard();
  return true;
}

/** Resolve the trick on the table: points, combo, chain, flush, then advance. */
function resolveTrickNow() {
  const you = state.played.you;
  const rival = state.played.rival;
  if (!you || !rival) return;
  const result = resolveTrick(you, rival, rivalBonus());
  const info = chainInfo(you.suit, state.prevSuits);
  state.prevSuits.unshift(you.suit);
  state.prevSuits = state.prevSuits.slice(0, 3);
  state.lastSuit = you.suit;
  if (result.winner === 'you') {
    addCombo(state);
    state.rivalCombo = 0;
    const points = trickPoints(state, you, info.chain);
    state.score += points;
    state.roundScore.you += points;
    state.stats.tricksWon += 1;
    state.chain = info.chain;
    addPopup(state, 376, 210, `+${points}`, '#f2c94c');
    state.callout = result.counter ? `COUNTER! ${cardLabel(you)} beats ${cardLabel(rival)}` : `${cardLabel(you)} takes the trick`;
    if (info.flush) {
      state.score += FLUSH_BONUS;
      state.roundScore.you += FLUSH_BONUS;
      state.stats.flushes += 1;
      addPopup(state, 491, 180, `FLUSH +${FLUSH_BONUS}`, '#ff6b35');
      state.callout = `${you.suit.toUpperCase()} FLUSH — 3 IN A ROW!`;
      audio.flush();
    } else {
      audio.winTrick();
    }
    state.message = `Combo x${Math.max(1, state.combo)} — the Queen's ${cardLabel(rival)} falls.`;
  } else {
    breakCombo(state);
    state.chain = 0;
    // Her tricks scale the same way yours do: her own combo grows per win.
    state.rivalCombo = Math.min(4, state.rivalCombo + 1);
    const rivalPoints = rival.value * 10 * Math.max(1, state.rivalCombo);
    state.roundScore.rival += rivalPoints;
    addPopup(state, 606, 210, `+${rivalPoints}`, '#ff5a4e');
    state.callout = `The Queen takes it — ${cardLabel(rival)} over ${cardLabel(you)}`;
    state.message = 'The combo breaks. Answer her next intent.';
    audio.loseTrick();
  }
  discardCard(state.piles, you);
  discardCard(state.piles, rival);
  // Remember her last plays: the loss screen shows her winning hand.
  state.lastRivalPlays.push(rival);
  state.lastRivalPlays = state.lastRivalPlays.slice(-4);
  state.deckCount = deckCount(state.piles);
  state.discardCount = discardCount(state.piles);
  state.played = { you: null, rival: null };
  advanceTurn();
}

/** Move to the next turn, or end the round when the hands are empty. */
function advanceTurn() {
  state.turn += 1;
  if (state.turn > TRICKS_PER_ROUND || state.hand.length === 0) {
    endRound();
    return;
  }
  state.phase = 'await';
  state.intent = rivalIntent(state, random);
  state.selectedIndex = Math.min(state.selectedIndex, state.hand.length - 1);
}

/** Score the round, take a life from the loser, and decide the match. */
function endRound() {
  const youWin = state.roundScore.you > state.roundScore.rival;
  const tie = state.roundScore.you === state.roundScore.rival;
  if (!tie) {
    if (youWin) {
      state.roundsWon.you += 1;
      state.lives.rival -= 1;
      state.message = `Round ${state.round} is yours, ${state.roundScore.you}–${state.roundScore.rival}. The Queen loses a life.`;
    } else {
      state.roundsWon.rival += 1;
      state.lives.you -= 1;
      state.message = `The Queen takes round ${state.round}, ${state.roundScore.rival}–${state.roundScore.you}. You lose a life.`;
    }
  } else {
    state.message = `Round ${state.round} ties ${state.roundScore.you}–${state.roundScore.rival}. No life lost.`;
  }
  state.ward = false;
  state.handBonus = 0;
  if (checkWin(state)) {
    endMatch(true, `You took ${state.roundsWon.you} rounds — the court is yours.`);
    return;
  }
  if (checkLose(state)) {
    const reason = state.lives.you <= 0
      ? 'YOUR LIFE HIT 0 — THE RIVAL TOOK THE FINAL ROUND'
      : `THE RIVAL TOOK THE FINAL ROUND — ${state.roundsWon.rival}–${state.roundsWon.you}`;
    endMatch(false, reason);
    return;
  }
  if (state.round >= 3) {
    // Three rounds, no one at two: the higher total score takes the court.
    const won = state.score >= 0 && (state.roundsWon.you > state.roundsWon.rival
      || (state.roundsWon.you === state.roundsWon.rival && state.roundScore.you >= state.roundScore.rival));
    endMatch(won, won
      ? `Three rounds, and your score stands taller — ${state.roundsWon.you}–${state.roundsWon.rival}.`
      : `Three rounds — the Queen's score stands taller, ${state.roundsWon.rival}–${state.roundsWon.you}.`);
    return;
  }
  state.draft = offerDraft(random);
  state.screen = SCREEN_DRAFT;
  announce('Round over. Choose a boon.');
}

/** Close the match: save the best, show the scorecard. */
function endMatch(won, reason) {
  state.endReason = reason;
  state.rivalLastHand = state.lastRivalPlays.slice();
  const totalW = state.rivalLastHand.length * 72 + Math.max(0, state.rivalLastHand.length - 1) * 6;
  for (let i = 0; i < state.rivalLastHand.length; i += 1) {
    const slot = { x: 640 - totalW / 2 + i * 78, y: 226 };
    const card = state.rivalLastHand[i];
    card.x = slot.x;
    card.y = slot.y;
    card.tx = slot.x;
    card.ty = slot.y;
    card.face = 1;
  }
  if (state.score > state.bests[state.mode]) {
    state.bests[state.mode] = state.score;
    state.newBest = true;
    saveBests();
  }
  state.screen = won ? SCREEN_WIN : SCREEN_LOSS;
  if (won) audio.winMatch();
  else audio.loseMatch();
  announce(won ? `You win. Score ${state.score}. Best ${state.bests[state.mode]}.` : `You lose. Score ${state.score}. Best ${state.bests[state.mode]}.`);
}

/** Snap every card to its target: used by the screenshot scenes. */
function snapAll() {
  for (const card of [...state.hand, ...state.rivalHand, ...state.rivalLastHand]) {
    card.x = card.tx;
    card.y = card.ty;
    card.face = 1;
  }
  if (state.played.you) {
    state.played.you.x = state.played.you.tx;
    state.played.you.y = state.played.you.ty;
    state.played.you.face = 1;
  }
  if (state.played.rival) {
    state.played.rival.x = state.played.rival.tx;
    state.played.rival.y = state.played.rival.ty;
    state.played.rival.face = 1;
  }
}

/** Pick a hand index the way an autopilot would: 'best' or 'worst'. */
function autoPick(style) {
  if (state.hand.length === 0) return -1;
  const intentCard = state.intent ? state.intent.card : null;
  let best = 0;
  for (let i = 1; i < state.hand.length; i += 1) {
    const card = state.hand[i];
    const current = state.hand[best];
    if (style === 'best') {
      // Highest effective value against the telegraphed card: value + counter +4.
      const eff = (c) => c.value + (intentCard ? counterBonus(c, intentCard) : 0);
      if (eff(card) > eff(current)) best = i;
    } else if (card.value < state.hand[best].value) {
      best = i;
    }
  }
  return best;
}

/** The driver the screenshot scenes use: the real rules, stepped by hand. */
const driver = {
  state,
  newMatch,
  play(index) {
    return playCard(index);
  },
  resolve() {
    resolveTrickNow();
  },
  /** Play one full trick with the autopilot, then resolve it at once. */
  playAuto(style) {
    const index = autoPick(style);
    if (index < 0) return false;
    if (!playCard(index)) return false;
    resolveTrickNow();
    return true;
  },
  chooseDraft(index) {
    if (index < 0 || index >= state.draft.length) return false;
    applyDraft(state, state.draft[index]);
    state.screen = SCREEN_PLAY;
    dealRound(state.round + 1);
    return true;
  },
  snap: snapAll,
  layoutHand,
  layoutRivalHand,
};

function runShot(name) {
  const scene = stageShot(name, driver, seed);
  window.__shotScreen = scene.screen;
  window.__ember = { state, driver, screen: () => state.screen };
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.bests);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (px, py, w, h) => renderer.toLogical(px, py, w, h));
  let accumulator = 0;
  let last = performance.now();
  let pausedFrom = null;

  function startMatch() {
    audio.unlock();
    newMatch(state.mode);
  }

  function backToTitle() {
    audio.unlock();
    const keep = freshState();
    keep.bests = state.bests;
    Object.assign(state, keep);
    announce('Ember Court. Press Space or click to start.');
  }

  function clickPoint(point) {
    const { x, y } = point;
    if (state.screen === SCREEN_TITLE) {
      if (y >= 360 && y <= 490) {
        if (x >= 340 && x <= 620) { state.mode = 'classic'; return; }
        if (x >= 660 && x <= 940) { state.mode = 'master'; return; }
      }
      startMatch();
      return;
    }
    if (state.screen === SCREEN_DRAFT) {
      for (let i = 0; i < state.draft.length; i += 1) {
        const bx = 190 + i * 320;
        if (x >= bx && x <= bx + 280 && y >= 220 && y <= 440) {
          driver.chooseDraft(i);
          return;
        }
      }
      return;
    }
    if (state.screen === SCREEN_WIN || state.screen === SCREEN_LOSS) {
      backToTitle();
      return;
    }
    if (state.screen === SCREEN_PLAY && state.phase === 'await') {
      for (let i = 0; i < state.hand.length; i += 1) {
        const card = state.hand[i];
        if (x >= card.x && x <= card.x + 92 && y >= card.y && y <= card.y + 132) {
          state.selectedIndex = i;
          playCard(i);
          return;
        }
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const clicks = input.takeClicks();
    for (const point of clicks) clickPoint(point);
    if (actions & ACTION_PAUSE) {
      if (state.screen === SCREEN_PLAY) {
        pausedFrom = SCREEN_PLAY;
        state.screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (state.screen === SCREEN_PAUSED) {
        state.screen = pausedFrom || SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (state.screen === SCREEN_TITLE) {
      if (actions & ACTION_DIGIT_1) state.mode = 'classic';
      else if (actions & ACTION_DIGIT_2) state.mode = 'master';
      else if (actions & ACTION_CONFIRM) startMatch();
    } else if (state.screen === SCREEN_DRAFT) {
      if (actions & ACTION_DIGIT_1) driver.chooseDraft(0);
      else if (actions & ACTION_DIGIT_2) driver.chooseDraft(1);
      else if (actions & ACTION_DIGIT_3) driver.chooseDraft(2);
    } else if (state.screen === SCREEN_WIN || state.screen === SCREEN_LOSS) {
      if (actions & ACTION_CONFIRM) backToTitle();
    } else if (state.screen === SCREEN_PLAY && state.phase === 'await') {
      if (actions & ACTION_LEFT) {
        state.selectedIndex = (state.selectedIndex - 1 + state.hand.length) % state.hand.length;
        layoutHand(true);
      } else if (actions & ACTION_RIGHT) {
        state.selectedIndex = (state.selectedIndex + 1) % state.hand.length;
        layoutHand(true);
      } else if (actions & ACTION_CONFIRM) {
        playCard(state.selectedIndex);
      }
    }
  }

  function step(dt) {
    state.time += dt;
    // Cards slide toward their targets and flips turn.
    for (const card of [...state.hand, ...state.rivalHand]) {
      card.x += (card.tx - card.x) * Math.min(1, dt * 12);
      card.y += (card.ty - card.y) * Math.min(1, dt * 12);
      if (card.face < 1) card.face = Math.min(1, card.face + dt * 3.5);
    }
    for (const card of [state.played.you, state.played.rival]) {
      if (!card) continue;
      card.x += (card.tx - card.x) * Math.min(1, dt * 12);
      card.y += (card.ty - card.y) * Math.min(1, dt * 12);
      if (card.face < 1) card.face = Math.min(1, card.face + dt * 3.5);
    }
    stepPopups(state, dt);
    if (state.screen === SCREEN_PLAY && state.phase === 'reveal') {
      state.revealTimer -= dt;
      if (state.revealTimer <= 0) resolveTrickNow();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
    renderer.draw(state, state.screen, state.bests);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === SCREEN_PLAY) {
      pausedFrom = SCREEN_PLAY;
      state.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A handle for scripted playtests: the real state, driven by real input.
  window.__ember = { state, driver, screen: () => state.screen };
  announce('Ember Court. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
