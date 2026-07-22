// Tactile (vibration) + audio "tick" feedback for gesture-heavy UI like the
// Schedule tile's swipe/hold/scroll picker. Both are best-effort: iOS Safari
// has no Vibration API and some browsers block audio until a user gesture
// has unlocked it, so every call here is a silent no-op rather than a throw
// when unsupported.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function playTone(frequency: number, duration: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.value = 0.06;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** A short, light tick - crossing a swipe threshold or stepping the cycle picker. */
export function feedbackTick(frequency = 600) {
  vibrate(8);
  playTone(frequency, 0.03);
}

/** A firmer, double-pulse tick - releasing a swipe to actually trigger an action. */
export function feedbackConfirm(frequency = 500) {
  vibrate([10, 30, 10]);
  playTone(frequency, 0.05);
}
