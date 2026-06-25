import { useRef, useCallback, useEffect, useState } from 'react';

// Module-level AudioContext singleton
let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;

// Active audio nodes
let _activeOscillators: OscillatorNode[] = [];
let _activeGains: GainNode[] = [];

// Timers
let _loopTimer: ReturnType<typeof setTimeout> | null = null;
let _vibrationInterval: ReturnType<typeof setInterval> | null = null;
let _autoStopTimer: ReturnType<typeof setTimeout> | null = null;

// Alert session tracking - incremented for each new alert
let _alertSessionId = 0;
let _currentSessionId = 0;

// State listeners
const _listeners = new Set<(playing: boolean) => void>();

function notifyListeners(playing: boolean) {
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

function stopAllNodes() {
  for (const osc of _activeOscillators) {
    try { osc.stop(0); } catch {}
    try { osc.disconnect(); } catch {}
  }
  for (const gain of _activeGains) {
    try { gain.disconnect(); } catch {}
  }
  _activeOscillators = [];
  _activeGains = [];
}

function stopAllTimers() {
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

// Complete stop - clears everything for fresh start
function stopAll() {
  // Increment session ID to invalidate any pending callbacks
  _alertSessionId++;
  _currentSessionId = _alertSessionId;

  // Stop timers first
  stopAllTimers();

  // Stop audio nodes
  stopAllNodes();

  // Stop vibration
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }

  // Notify listeners that we stopped
  notifyListeners(false);
}

export function useEmergencyAlert() {
  const mountedRef = useRef(true);
  const [isPlaying, setIsPlayingState] = useState(false);

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

    // STOP EVERYTHING first
    stopAll();

    // Generate new session ID for this alert
    const thisSessionId = ++_alertSessionId;
    _currentSessionId = thisSessionId;

    // Notify that we're starting
    notifyListeners(true);

    // Use setTimeout with 0 delay to let the stopAll cleanup complete in the event loop
    setTimeout(() => {
      // Verify this session is still active
      if (_currentSessionId !== thisSessionId) {
        console.log('[EmergencyAlert] Session cancelled before start');
        return;
      }

      console.log('[EmergencyAlert] Starting alert, session:', thisSessionId);

      if (onSound) {
        const ctx = getAudioCtx();
        if (ctx) {
          const playSirenBatch = () => {
            // Check if our session is still the active one
            if (_currentSessionId !== thisSessionId) {
              console.log('[EmergencyAlert] Session stopped, not playing more audio');
              return;
            }

            const BATCH = 5;
            const batchDuration = BATCH * 1.2;
            const now = ctx.currentTime;

            // Schedule this batch
            scheduleSirenCycle(ctx, now + 0.05, BATCH);

            // Schedule next batch
            const nextBatchDelay = (batchDuration - 0.2) * 1000;
            _loopTimer = setTimeout(() => {
              playSirenBatch();
            }, Math.max(50, nextBatchDelay));
          };

          const startAudio = () => {
            _audioUnlocked = true;
            playSirenBatch();
          };

          if (ctx.state === 'suspended') {
            ctx.resume().then(startAudio).catch((err) => {
              console.error('[EmergencyAlert] Failed to resume context:', err);
            });
          } else {
            startAudio();
          }
        } else {
          console.error('[EmergencyAlert] Could not get audio context');
        }
      }

      if (onVibrate && 'vibrate' in navigator) {
        const doVibrate = () => {
          if (_currentSessionId !== thisSessionId) return;
          navigator.vibrate([300, 150, 300, 150, 600]);
        };
        doVibrate();
        _vibrationInterval = setInterval(doVibrate, 2000);
      }

      // Auto-stop after duration
      _autoStopTimer = setTimeout(() => {
        if (_currentSessionId === thisSessionId) {
          console.log('[EmergencyAlert] Auto-stopping after duration');
          stopAll();
        }
      }, duration);

    }, 0); // End of setTimeout
  }, []);

  const testAlert = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;

    stopAll();

    setTimeout(() => {
      const testSession = ++_alertSessionId;
      _currentSessionId = testSession;

      scheduleSirenCycle(ctx, ctx.currentTime + 0.05, 3);

      // Auto-stop test after 4 seconds
      setTimeout(() => {
        if (_currentSessionId === testSession) {
          stopAllNodes();
        }
      }, 4000);
    }, 0);

    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, []);

  return { startAlert, stopAlert, testAlert, isPlaying };
}
