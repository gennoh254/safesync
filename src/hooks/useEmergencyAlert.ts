import { useRef, useCallback, useEffect, useState } from 'react';

// Module-level AudioContext singleton
let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;

// Active audio nodes - cleared completely on each new alert
let _activeOscillators: OscillatorNode[] = [];
let _activeGains: GainNode[] = [];

// Module-level tracking - ALL cleared on each stop
let _isPlaying = false;
let _loopTimer: ReturnType<typeof setTimeout> | null = null;
let _vibrationInterval: ReturnType<typeof setInterval> | null = null;
let _autoStopTimer: ReturnType<typeof setTimeout> | null = null;

// Keep an array of listeners to notify all mounted hooks of state changes
const _listeners = new Set<(playing: boolean) => void>();

function setGlobalPlaying(playing: boolean) {
  _isPlaying = playing;
  _listeners.forEach(listener => listener(playing));
}

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

// Completely stop and clear ALL audio state
function stopAllNodes() {
  // Stop each oscillator immediately with stop(0)
  for (const osc of _activeOscillators) {
    try { osc.stop(0); } catch {}
    try { osc.disconnect(); } catch {}
  }
  // Disconnect all gain nodes
  for (const gain of _activeGains) {
    try { gain.disconnect(); } catch {}
  }
  // Clear the arrays
  _activeOscillators = [];
  _activeGains = [];
}

export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioCtx();
  if (!ctx) return false;
  try {
    await ctx.resume();
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

function scheduleSirenCycle(ctx: AudioContext, startAt: number, cycles: number): void {
  for (let i = 0; i < cycles; i++) {
    const cycleStart = startAt + i * 1.2;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, cycleStart);
    osc.frequency.linearRampToValueAtTime(1200, cycleStart + 0.6);
    osc.frequency.linearRampToValueAtTime(600, cycleStart + 1.2);

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

interface EmergencyAlertOptions {
  duration?: number;
  onVibrate?: boolean;
  onSound?: boolean;
}

// COMPLETE STOP - clears everything
function stopAll() {
  // Clear all timers first
  if (_loopTimer) {
    clearTimeout(_loopTimer);
    _loopTimer = null;
  }
  if (_vibrationInterval) {
    clearInterval(_vibrationInterval);
    _vibrationInterval = null;
  }
  if (_autoStopTimer) {
    clearTimeout(_autoStopTimer);
    _autoStopTimer = null;
  }

  // Stop all audio nodes
  stopAllNodes();

  // Stop vibration
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }

  // Update global state
  setGlobalPlaying(false);
}

export function useEmergencyAlert() {
  const mountedRef = useRef(true);
  const [isPlaying, setIsPlayingState] = useState(_isPlaying);

  useEffect(() => {
    mountedRef.current = true;

    const listener = (playing: boolean) => {
      if (mountedRef.current) setIsPlayingState(playing);
    };
    _listeners.add(listener);

    return () => {
      mountedRef.current = false;
      _listeners.delete(listener);
    };
  }, []);

  const stopAlert = useCallback(() => {
    stopAll();
  }, []);

  const startAlert = useCallback((options: EmergencyAlertOptions = {}) => {
    const { duration = 120000, onVibrate = true, onSound = true } = options;

    // ALWAYS stop everything first before starting new
    stopAll();

    // Use requestAnimationFrame to ensure cleanup completes in the browser's event loop
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;

      // Double-check cleanup
      stopAllNodes();

      setGlobalPlaying(true);

      if (onSound) {
        const ctx = getAudioCtx();
        if (ctx) {
          const doPlay = () => {
            if (!mountedRef.current) return;
            if (!_isPlaying) return; // Check if we were stopped

            const BATCH = 5;
            const batchDuration = BATCH * 1.2;
            const now = ctx.currentTime;

            scheduleSirenCycle(ctx, now + 0.05, BATCH);

            const rescheduleIn = (batchDuration - 0.2) * 1000;
            _loopTimer = setTimeout(() => {
              if (!mountedRef.current || !_isPlaying) return;
              doPlay();
            }, Math.max(50, rescheduleIn));
          };

          const startPlaying = () => {
            _audioUnlocked = true;
            doPlay();
          };

          if (ctx.state === 'suspended') {
            ctx.resume().then(startPlaying).catch((err) => {
              console.error('[EmergencyAlert] Context resume failed:', err);
            });
          } else {
            startPlaying();
          }
        }
      }

      if (onVibrate && 'vibrate' in navigator) {
        const vibratePattern = () => {
          if (!_isPlaying) return;
          navigator.vibrate([300, 150, 300, 150, 600]);
        };
        vibratePattern();
        _vibrationInterval = setInterval(vibratePattern, 2000);
      }

      _autoStopTimer = setTimeout(() => {
        stopAll();
      }, duration);
    });
  }, []);

  const testAlert = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;

    stopAll();

    requestAnimationFrame(() => {
      const playTest = () => {
        const now = ctx.currentTime;
        scheduleSirenCycle(ctx, now + 0.05, 3);
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(playTest).catch(() => {});
      } else {
        playTest();
      }
    });

    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, []);

  return { startAlert, stopAlert, testAlert, isPlaying };
}
