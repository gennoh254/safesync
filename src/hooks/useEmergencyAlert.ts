import { useRef, useCallback, useEffect } from 'react';

// Module-level AudioContext singleton - persists across React renders
// Must be created/resumed inside a user gesture to satisfy browser autoplay policy
let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;
// Track active audio nodes so we can stop them immediately
let _activeNodes: AudioNode[] = [];

export function getAudioCtx(): AudioContext | null {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    try {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return _audioCtx;
}

/** Stop all currently playing audio nodes immediately */
function stopAllNodes() {
  _activeNodes.forEach(node => {
    try {
      if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
        (node as OscillatorNode).stop();
      }
      node.disconnect();
    } catch {
      // Node may have already stopped
    }
  });
  _activeNodes = [];
}

/** Call this inside a click/tap handler to unlock the AudioContext. */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioCtx();
  if (!ctx) return false;
  try {
    await ctx.resume();
    // Play a 1ms silent buffer to satisfy Safari
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    _audioUnlocked = ctx.state === 'running';
    return _audioUnlocked;
  } catch {
    return false;
  }
}

export function isAudioUnlocked(): boolean {
  return _audioUnlocked || (_audioCtx?.state === 'running') || false;
}

// ---------------------------------------------------------------------------
// Siren synthesis — classic emergency wail: sweeps 600 Hz → 1200 Hz → 600 Hz
// Duration of one sweep cycle: ~1.2 s. Loops continuously.
// ---------------------------------------------------------------------------
function scheduleSirenCycle(ctx: AudioContext, startAt: number, cycles: number, stopRequested: () => boolean): void {
  for (let i = 0; i < cycles; i++) {
    // Check if we should stop scheduling
    if (stopRequested()) break;

    const cycleStart = startAt + i * 1.2;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';

    // Sweep up 600→1200 Hz in first 0.6s, then down 1200→600 Hz in next 0.6s
    osc.frequency.setValueAtTime(600, cycleStart);
    osc.frequency.linearRampToValueAtTime(1200, cycleStart + 0.6);
    osc.frequency.linearRampToValueAtTime(600, cycleStart + 1.2);

    // Gentle amplitude envelope to avoid clicks
    gain.gain.setValueAtTime(0, cycleStart);
    gain.gain.linearRampToValueAtTime(0.55, cycleStart + 0.05);
    gain.gain.setValueAtTime(0.55, cycleStart + 1.15);
    gain.gain.linearRampToValueAtTime(0, cycleStart + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(cycleStart);
    osc.stop(cycleStart + 1.2);

    // Second harmonic at half volume for body
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(1200, cycleStart);
    osc2.frequency.linearRampToValueAtTime(2400, cycleStart + 0.6);
    osc2.frequency.linearRampToValueAtTime(1200, cycleStart + 1.2);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, cycleStart);
    gain2.gain.linearRampToValueAtTime(0.2, cycleStart + 0.05);
    gain2.gain.setValueAtTime(0.2, cycleStart + 1.15);
    gain2.gain.linearRampToValueAtTime(0, cycleStart + 1.2);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(cycleStart);
    osc2.stop(cycleStart + 1.2);

    _activeNodes.push(osc, osc2, gain, gain2);
  }
}

// ---------------------------------------------------------------------------

interface EmergencyAlertOptions {
  duration?: number; // ms
  onVibrate?: boolean;
  onSound?: boolean;
}

export function useEmergencyAlert() {
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef(false);
  const stopRequestedRef = useRef(false);

  const stopAlert = useCallback(() => {
    stopRequestedRef.current = true;
    isPlayingRef.current = false;

    // Stop all audio nodes immediately
    stopAllNodes();

    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if ('vibrate' in navigator) navigator.vibrate(0);
  }, []);

  const startAlert = useCallback((options: EmergencyAlertOptions = {}) => {
    const { duration = 120000, onVibrate = true, onSound = true } = options;

    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    stopRequestedRef.current = false;

    // Clear any leftover nodes from previous alerts
    stopAllNodes();

    if (onSound) {
      const ctx = getAudioCtx();
      if (ctx) {
        // Resume in case context was suspended after being unlocked
        const doPlay = () => {
          if (stopRequestedRef.current) return;

          // Schedule 5 siren cycles (~6 s) ahead, then reschedule
          const BATCH = 5;
          const batchDuration = BATCH * 1.2; // 6 seconds
          scheduleSirenCycle(ctx, ctx.currentTime + 0.05, BATCH, () => stopRequestedRef.current);

          const rescheduleIn = (batchDuration - 0.2) * 1000;
          loopTimerRef.current = setTimeout(() => {
            if (!stopRequestedRef.current) doPlay();
          }, Math.max(50, rescheduleIn));
        };

        if (ctx.state === 'suspended') {
          ctx.resume().then(() => doPlay()).catch(() => {});
        } else {
          doPlay();
        }
      }
    }

    if (onVibrate && 'vibrate' in navigator) {
      const vibratePattern = () => navigator.vibrate([300, 150, 300, 150, 600]);
      vibratePattern();
      vibrationIntervalRef.current = setInterval(vibratePattern, 2000);
    }

    // Auto-stop after duration
    setTimeout(() => stopAlert(), duration);
  }, [stopAlert]);

  const testAlert = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;

    // Stop any existing nodes first
    stopAllNodes();

    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    resume.then(() => {
      scheduleSirenCycle(ctx, ctx.currentTime + 0.05, 3, () => false);
    }).catch(() => {});

    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, []);

  useEffect(() => {
    return () => { stopAlert(); };
  }, [stopAlert]);

  return { startAlert, stopAlert, testAlert, isPlaying: isPlayingRef.current };
}
