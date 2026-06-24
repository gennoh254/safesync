import { useRef, useCallback, useEffect } from 'react';

// Module-level AudioContext singleton - persists across React renders
// Must be created/resumed inside a user gesture to satisfy browser autoplay policy
let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;
// Track active oscillators so we can stop them immediately
let _activeOscillators: OscillatorNode[] = [];
let _activeGains: GainNode[] = [];
// Module-level playing state to prevent multiple concurrent alerts
let _isPlaying = false;
let _stopRequested = false;
let _loopTimer: ReturnType<typeof setTimeout> | null = null;
let _vibrationInterval: ReturnType<typeof setInterval> | null = null;

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
  // Stop oscillators immediately (time = 0 means now)
  _activeOscillators.forEach(osc => {
    try {
      osc.stop(0);
    } catch {
      // Already stopped
    }
  });

  // Disconnect all nodes
  _activeOscillators.forEach(osc => {
    try { osc.disconnect(); } catch {}
  });
  _activeGains.forEach(gain => {
    try { gain.disconnect(); } catch {}
  });

  _activeOscillators = [];
  _activeGains = [];
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
  const ctx = _audioCtx;
  if (ctx && ctx.state === 'running') {
    _audioUnlocked = true;
    return true;
  }
  return _audioUnlocked;
}

// ---------------------------------------------------------------------------
// Siren synthesis — classic emergency wail: sweeps 600 Hz → 1200 Hz → 600 Hz
// Duration of one sweep cycle: ~1.2 s. Loops continuously.
// ---------------------------------------------------------------------------
function scheduleSirenCycle(ctx: AudioContext, startAt: number, cycles: number): void {
  for (let i = 0; i < cycles; i++) {
    // Check if we should stop scheduling
    if (_stopRequested) break;

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

    _activeOscillators.push(osc);
    _activeGains.push(gain);

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

    _activeOscillators.push(osc2);
    _activeGains.push(gain2);
  }
}

// ---------------------------------------------------------------------------

interface EmergencyAlertOptions {
  duration?: number; // ms
  onVibrate?: boolean;
  onSound?: boolean;
}

// Module-level stop function for immediate use
function stopAll() {
  _stopRequested = true;
  _isPlaying = false;
  stopAllNodes();

  if (_loopTimer) {
    clearTimeout(_loopTimer);
    _loopTimer = null;
  }
  if (_vibrationInterval) {
    clearInterval(_vibrationInterval);
    _vibrationInterval = null;
  }
  if ('vibrate' in navigator) navigator.vibrate(0);
}

export function useEmergencyAlert() {
  // Refs are just for cleanup tracking now
  const mountedRef = useRef(true);

  const stopAlert = useCallback(() => {
    stopAll();
  }, []);

  const startAlert = useCallback((options: EmergencyAlertOptions = {}) => {
    const { duration = 120000, onVibrate = true, onSound = true } = options;

    // Use module-level flag instead of ref
    if (_isPlaying) {
      console.log('[EmergencyAlert] Already playing, skipping');
      return;
    }

    _isPlaying = true;
    _stopRequested = false;

    // Stop any existing audio first
    stopAllNodes();

    if (onSound) {
      const ctx = getAudioCtx();
      if (ctx) {
        const doPlay = () => {
          if (_stopRequested || !mountedRef.current) return;

          // Schedule 5 siren cycles (~6 s) ahead, then reschedule
          const BATCH = 5;
          const batchDuration = BATCH * 1.2; // 6 seconds

          // Get fresh currentTime for each batch
          const now = ctx.currentTime;
          scheduleSirenCycle(ctx, now + 0.05, BATCH);

          const rescheduleIn = (batchDuration - 0.2) * 1000;
          _loopTimer = setTimeout(() => {
            if (!_stopRequested && mountedRef.current) doPlay();
          }, Math.max(50, rescheduleIn));
        };

        // Always ensure context is running before playing
        const startPlaying = () => {
          _audioUnlocked = true;
          doPlay();
        };

        if (ctx.state === 'suspended') {
          ctx.resume().then(startPlaying).catch((err) => {
            console.error('[EmergencyAlert] Failed to resume AudioContext:', err);
          });
        } else {
          startPlaying();
        }
      }
    }

    if (onVibrate && 'vibrate' in navigator) {
      const vibratePattern = () => navigator.vibrate([300, 150, 300, 150, 600]);
      vibratePattern();
      _vibrationInterval = setInterval(vibratePattern, 2000);
    }

    // Auto-stop after duration
    setTimeout(() => {
      if (_isPlaying) stopAll();
    }, duration);
  }, []);

  const testAlert = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;

    // Stop any existing nodes first
    stopAllNodes();

    const playTest = () => {
      const now = ctx.currentTime;
      scheduleSirenCycle(ctx, now + 0.05, 3);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(playTest).catch(() => {});
    } else {
      playTest();
    }

    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAll();
    };
  }, []);

  return { startAlert, stopAlert, testAlert, isPlaying: _isPlaying };
}
