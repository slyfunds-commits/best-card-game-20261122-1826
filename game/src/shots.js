// The screenshot scenes behind ?shot=start|play|loss|win. Each one plays the
// real rules forward from a fresh match, steered by a simple autopilot — 'best'
// plays the strongest card against the Queen's telegraphed intent, 'worst'
// plays the weakest — so the frame is what a real game really looks like and
// the same seed always gives the same frame.
import { createRandom } from './random.js';
import { counterBonus } from './rules.js';
import { rivalIntent } from './opponent.js';
import { SCREEN_LOSS, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** The best scores the title shot shows: a court with history behind it. */
const DEMO_BESTS = { classic: 1240, master: 860 };

/** The strongest card in hand against the telegraphed card. */
function bestIndex(state) {
  const intentCard = state.intent ? state.intent.card : null;
  let best = 0;
  for (let i = 1; i < state.hand.length; i += 1) {
    const eff = (c) => c.value + (intentCard ? counterBonus(c, intentCard) : 0);
    if (eff(state.hand[i]) > eff(state.hand[best])) best = i;
  }
  return best;
}

/** Play tricks with the autopilot until the round ends or the cap is hit. */
function playTricks(driver, style, cap) {
  let played = 0;
  while (played < cap && driver.state.screen === 'play') {
    if (!driver.playAuto(style)) break;
    played += 1;
    // A round's end drops into the draft screen: take the first boon and go on.
    if (driver.state.screen === 'draft') driver.chooseDraft(0);
  }
  return played;
}

/**
 * Set the driver to the named scene and return the screen to draw and the best
 * scores to show. The game is not running after this: the frame is frozen.
 */
export function stageShot(name, driver, seed) {
  const state = driver.state;
  if (name === 'play') {
    driver.newMatch('classic');
    playTricks(driver, 'best', 6);
    if (driver.state.screen === 'draft') driver.chooseDraft(0);
    playTricks(driver, 'best', 1);
    // One more card on the table, unrevealed: both cards face up in their
    // slots, the combo and the last "+points" popup still hanging in the frame.
    // Four cards stay in hand, so the frame reads as mid-game, not end-game.
    if (driver.state.screen === 'play' && driver.state.phase === 'await') {
      driver.play(bestIndex(state));
      // Preview her next intent so the telegraph line is live in the frame.
      state.intent = rivalIntent(state, createRandom((seed || 7) + 101));
    }
    driver.snap();
    return { screen: SCREEN_PLAY, bests: DEMO_BESTS };
  }
  if (name === 'loss' || name === 'win') {
    const style = name === 'win' ? 'best' : 'worst';
    const want = name === 'win' ? SCREEN_WIN : SCREEN_LOSS;
    driver.newMatch('classic');
    let guard = 0;
    while (driver.state.screen !== want && guard < 300) {
      guard += 1;
      if (driver.state.screen === 'play') playTricks(driver, style, 6);
      else if (driver.state.screen === 'draft') driver.chooseDraft(0);
      else break;
    }
    driver.snap();
    // Make the scorecard coherent: a win beats the shown BEST, a loss does not.
    if (driver.state.screen === SCREEN_WIN) {
      state.bests = { classic: Math.max(0, state.score - 40), master: 860 };
      state.newBest = true;
    } else if (driver.state.screen === SCREEN_LOSS) {
      state.bests = { classic: Math.max(1240, state.score + 50), master: 860 };
      state.newBest = false;
    }
    return { screen: driver.state.screen, bests: state.bests };
  }
  // Any other name is the title screen.
  state.screen = SCREEN_TITLE;
  state.mode = 'classic';
  return { screen: SCREEN_TITLE, bests: DEMO_BESTS };
}
