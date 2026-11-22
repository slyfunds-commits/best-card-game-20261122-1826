// Sound, synthesized with WebAudio — no audio files, no network. A tiny blip
// for a played card, a rising pair for a won trick, a low thud for a lost one,
// a fanfare for the win. Silent until the first interaction creates the context.
let context = null;

function ensure() {
  if (context) return context;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
  } catch {
    return null;
  }
  return context;
}

function tone(freq, seconds, type, gain, when) {
  const ctx = ensure();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain || 0.08, ctx.currentTime + (when || 0));
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (when || 0) + seconds);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(ctx.currentTime + (when || 0));
    osc.stop(ctx.currentTime + (when || 0) + seconds + 0.02);
  } catch {
    // Sound is garnish: never let it break the game.
  }
}

export const audio = {
  /** Call on the first user gesture so the context is allowed to start. */
  unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  },
  playCard() {
    tone(520, 0.09, 'triangle', 0.09);
    tone(780, 0.07, 'triangle', 0.05, 0.05);
  },
  winTrick() {
    tone(660, 0.1, 'sine', 0.09);
    tone(990, 0.14, 'sine', 0.08, 0.08);
  },
  loseTrick() {
    tone(220, 0.16, 'sawtooth', 0.05);
  },
  flush() {
    tone(880, 0.1, 'triangle', 0.09);
    tone(1108, 0.1, 'triangle', 0.09, 0.09);
    tone(1318, 0.18, 'triangle', 0.09, 0.18);
  },
  winMatch() {
    [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.22, 'triangle', 0.09, i * 0.12));
  },
  loseMatch() {
    [392, 330, 262].forEach((freq, i) => tone(freq, 0.25, 'sine', 0.07, i * 0.15));
  },
};
