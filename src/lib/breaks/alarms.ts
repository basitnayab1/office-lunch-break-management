/**
 * Browser audio alarms synthesized with Web Audio API (no external audio files).
 * Must be unlocked from a user gesture (e.g. Start Break).
 *
 * Only one alarm loop may run at a time (module-level singleton).
 */

let sharedCtx: AudioContext | null = null;
let alarmIntervalId: ReturnType<typeof setInterval> | null = null;
let alarmMode: "off" | "warning" | "exceeded" = "off";

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx) sharedCtx = new AudioCtx();
  return sharedCtx;
}

/** Call from a click handler so later alarms are allowed to play. */
export async function unlockBreakAlarmAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    return true;
  } catch {
    return false;
  }
}

function playSequence(
  freqs: number[],
  noteMs: number,
  gapMs: number,
  volume: number
) {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);

  let t = ctx.currentTime + 0.01;
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + noteMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + noteMs / 1000 + 0.02);
    t += (noteMs + gapMs) / 1000;
  }
}

/** Softer two-tone warning (~0.5s). */
export function playWarningAlarm() {
  playSequence([880, 988], 160, 60, 0.2);
}

/** Stronger short alarm (~0.7s) so it can repeat every 1s. */
export function playExceededAlarm() {
  playSequence([784, 659, 523], 150, 40, 0.32);
}

/** Immediately clear any running warning/overtime alarm loop. */
export function stopBreakAlarms() {
  if (alarmIntervalId != null) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  alarmMode = "off";
}

/**
 * Warning loop: play immediately, then every 3 seconds.
 * Replaces any other alarm loop.
 */
export function startWarningAlarmLoop() {
  if (alarmMode === "warning" && alarmIntervalId != null) return;
  stopBreakAlarms();
  alarmMode = "warning";
  playWarningAlarm();
  alarmIntervalId = setInterval(() => {
    playWarningAlarm();
  }, 3000);
}

/**
 * Overtime loop: play immediately, then every 1 second until stopped.
 * Replaces any other alarm loop.
 */
export function startExceededAlarmLoop() {
  if (alarmMode === "exceeded" && alarmIntervalId != null) return;
  stopBreakAlarms();
  alarmMode = "exceeded";
  playExceededAlarm();
  alarmIntervalId = setInterval(() => {
    playExceededAlarm();
  }, 1000);
}

export function getBreakAlarmMode() {
  return alarmMode;
}
