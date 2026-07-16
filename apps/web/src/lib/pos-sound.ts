/** Lightweight Web Audio beeps for POS scan / sale feedback. */

type PosSoundKind = "scan_ok" | "scan_fail" | "sale_ok" | "click";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, type: OscillatorType = "sine", gain = 0.08) {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audio.destination);
  const now = audio.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

export function playPosSound(kind: PosSoundKind, enabled = true) {
  if (!enabled) return;
  try {
    switch (kind) {
      case "scan_ok":
        tone(880, 60);
        break;
      case "scan_fail":
        tone(220, 140, "square", 0.06);
        break;
      case "sale_ok":
        tone(523, 70);
        setTimeout(() => tone(659, 70), 80);
        setTimeout(() => tone(784, 100), 160);
        break;
      case "click":
        tone(600, 30, "triangle", 0.04);
        break;
    }
  } catch {
    /* ignore autoplay / audio errors */
  }
}
