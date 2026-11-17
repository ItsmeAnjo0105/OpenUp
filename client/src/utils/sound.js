// Soft, synthesized UI feedback sounds -- no audio file to host, just a very
// short filtered tone via the Web Audio API. Kept deliberately quiet (low
// gain, brief envelope) so it reads as a premium/subtle tactile cue rather
// than a notification chime.
let audioCtx = null;
let lastHoverPlay = 0;
const HOVER_COOLDOWN_MS = 140; // avoids a rattle of overlapping sounds when the
// pointer sweeps across a list of nav items or cards in quick succession.

function getContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone({ frequency, duration, peakGain }) {
  const ctx = getContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    // best-effort: a failed synth tone should never break the interaction it's decorating
  }
}

export function playHover() {
  const now = performance.now();
  if (now - lastHoverPlay < HOVER_COOLDOWN_MS) return;
  lastHoverPlay = now;
  tone({ frequency: 720, duration: 0.05, peakGain: 0.025 });
}

export function playClick() {
  tone({ frequency: 480, duration: 0.07, peakGain: 0.045 });
}
