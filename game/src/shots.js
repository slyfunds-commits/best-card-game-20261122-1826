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
    // Hunt a genuine payoff frame: a flush the player just landed with a
    // real combo behind it, then one more card led in the flush suit.
    // Popups never fade in a staged frame (the live loop steps them;
    // staging does not), so only the final trick's popups are kept — older
    // tricks' popups stack and read as a glitch. A match can end before
    // the frame appears, so retry with fresh matches; the random stream
    // advances, so each attempt deals a different game. Tier 1 wants
    // combo ≥ 2; tier 2 takes any flush. MEASURED (2026-11-22, 60 attempts):
    // a combo ≥ 2 flush shows in only ~8% of attempts, so 12 tries failed
    // 37% of the time — round 2's cover shipped combo x1. 80 tries makes
    // tier 1 near-certain (~0.1% miss).
    const hunt = (minCombo, tries) => {
      for (let attempt = 0; attempt < tries; attempt += 1) {
        driver.newMatch('classic');
        for (let i = 0; i < 18 && driver.state.screen === 'play'; i += 1) {
          const before = driver.state.popups.length;
          if (!driver.playAuto('best')) break;
          // Check the flush FIRST: a flush on the round's last trick flips
          // the screen to draft before it can be staged, so it is lost —
          // only a mid-round flush is stageable, and that is what we want.
          if (driver.state.combo >= minCombo && /FLUSH — 3 IN A ROW!$/.test(driver.state.callout)
              && driver.state.screen === 'play' && driver.state.phase === 'await') {
            driver.state.popups = driver.state.popups.slice(before);
            return true;
          }
          if (driver.state.screen === 'draft') { driver.chooseDraft(0); continue; }
          if (driver.state.screen !== 'play') break;
          driver.state.popups = driver.state.popups.slice(-2);
        }
      }
      return false;
    };
    let staged = hunt(2, 80) || hunt(1, 30);
    if (!staged) {
      // Fallback: a plain winning-trick frame from a fresh match.
      driver.newMatch('classic');
      for (let i = 0; i < 12 && driver.state.screen === 'play'; i += 1) {
        if (!driver.playAuto('best')) break;
        if (driver.state.screen === 'draft') { driver.chooseDraft(0); continue; }
        if (driver.state.screen !== 'play') break;
        if (driver.state.combo >= 1 && !/^The Queen takes it/.test(driver.state.callout)) break;
      }
      driver.state.popups = driver.state.popups.slice(-2);
    }
    if (driver.state.screen === 'play' && driver.state.phase === 'await') {
      const suit = driver.state.lastSuit;
      const idx = staged ? driver.state.hand.findIndex((c) => c.suit === suit) : bestIndex(state);
      driver.play(idx >= 0 ? idx : bestIndex(state));
      state.intent = rivalIntent(state, createRandom((seed || 7) + 101));
    }
    driver.state.message = '';
    driver.snap();
    return { screen: SCREEN_PLAY, bests: DEMO_BESTS };
  }
  if (name === 'loss' || name === 'win') {
    const style = name === 'win' ? 'best' : 'worst';
    const want = name === 'win' ? SCREEN_WIN : SCREEN_LOSS;
    // A win must show at least one flush: the scorecard footer prints
    // FLUSHES from the match stats, and round 2's win showed FLUSHES 0.
    // MEASURED (2026-11-22, 20 matches): 'best' wins 16/20, but only 3/20
    // wins carry a flush — so retry fresh matches (30 tries, ~1% miss) and
    // keep the first win as a snapshot fallback in case none does. The
    // state is plain data, so structuredClone keeps the fallback intact
    // while later matches overwrite it.
    const playMatch = () => {
      driver.newMatch('classic');
      let guard = 0;
      while (driver.state.screen !== want && guard < 300) {
        guard += 1;
        if (driver.state.screen === 'play') playTricks(driver, style, 6);
        else if (driver.state.screen === 'draft') driver.chooseDraft(0);
        else break;
      }
      return driver.state.screen === want;
    };
    let fallback = null;
    if (name === 'win') {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (!playMatch()) break;
        if (!fallback) fallback = structuredClone(driver.state);
        if (driver.state.stats.flushes >= 1) { fallback = null; break; }
      }
      if (fallback) Object.assign(driver.state, fallback);
    } else {
      playMatch();
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
