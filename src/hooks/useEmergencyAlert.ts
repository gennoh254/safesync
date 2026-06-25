import { useRef, useCallback, useEffect, useState } from 'react';

// Module-level AudioContext singleton
let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;
let _activeOscillators: OscillatorNode[] = [];
let _activeGains: GainNode[] = [];

// Module-level tracking variables
let _isPlaying = false;
let _loopTimer: ReturnType<typeof setTimeout> | null = null;
let _vibrationInterval: ReturnType<typeof setInterval> | null = null;
let _autoStopTimer: ReturnType<typeof setTimeout> | null = null;

// Alert session ID to track which alert is currently playing
let _currentSessionId: string | null = null;

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

function stopAllNodes() {
  _activeOscillators.forEach(osc => {
    try { osc.stop(0); } catch {}
  });
  _activeOscillators.forEach(osc => {
    try { osc.disconnect(); } catch {}
  });
  _activeGains.forEach(gain => {
    try { gain.disconnect(); } catch {}
  });
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

function scheduleSirenCycle(ctx: AudioContext, startAt: number, cycles: number, sessionId: string): void {
  // If session changed, don't schedule any more audio
  if (sessionId !== _currentSessionId) return;

  for (let i = 0; i < cycles; i++) {
    // Check if session changed mid-scheduling
    if (sessionId !== _currentSessionId) break;

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
  sessionId?: string;
}

function stopAll() {
  // Clear the session so any scheduled audio knows to stop
  _currentSessionId = null;

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

  stopAllNodes();

  if ('vibrate' in navigator) navigator.vibrate(0);

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
    const { duration = 120000, onVibrate = true, onSound = true, sessionId } = options;

    // Generate a new session ID for this alert if not provided
    const newSessionId = sessionId || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // CRITICAL: Stop everything first before starting new
    stopAll();

    // Small delay to ensure all cleanup is complete, then start fresh
    // This is necessary because stopAllNodes() uses stop(0) which may still be processing
    setTimeout(() => {
      if (!mountedRef.current) return;

      // Set the new session ID
      _currentSessionId = newSessionId;

      // Clear any remaining timers
      if (_loopTimer) clearTimeout(_loopTimer);
      if (_autoStopTimer) clearTimeout(_autoStopTimer);
      if (_vibrationInterval) clearInterval(_vibrationInterval);

      setGlobalPlaying(true);

      if (onSound) {
        const ctx = getAudioCtx();
        if (ctx) {
          const doPlay = () => {
            // Check if session is still valid before playing
            if (_currentSessionId !== newSessionId) return;
            if (!mountedRef.current) return;

            const BATCH = 5;
            const batchDuration = BATCH * 1.2;
            const now = ctx.currentTime;

            scheduleSirenCycle(ctx, now + 0.05, BATCH, newSessionId);

            const rescheduleIn = (batchDuration - 0.2) * 1000;
            _loopTimer = setTimeout(() => {
              // Check session is still valid before rescheduling
              if (_currentSessionId !== newSessionId) return;
              if (!mountedRef.current) return;
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
          if (_currentSessionId !== newSessionId) return;
          navigator.vibrate([300, 150, 300, 150, 600]);
        };
        vibratePattern();
        _vibrationInterval = setInterval(vibratePattern, 2000);
      }

      _autoStopTimer = setTimeout(() => {
        // Only auto-stop if this session is still active
        if (_currentSessionId === newSessionId) {
          stopAll();
        }
      }, duration);
    }, 10); // Small delay to ensure cleanup completes
  }, []);

  const testAlert = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;

    stopAll();

    setTimeout(() => {
      _currentSessionId = `test-${Date.now()}`;

      const playTest = () => {
        const now = ctx.currentTime;
        scheduleSirenCycle(ctx, now + 0.05, 3, _currentSessionId!);
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(playTest).catch(() => {});
      } else {
        playTest();
      }
    }, 10);

    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, []);

  return { startAlert, stopAlert, testAlert, isPlaying };
}
