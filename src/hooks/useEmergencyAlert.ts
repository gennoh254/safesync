import { useRef, useCallback, useEffect, useState } from 'react';

// Module-level AudioContext singleton
let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;

// HTML5 Audio fallback element
let _fallbackAudio: HTMLAudioElement | null = null;
let _fallbackAudioLoop: ReturnType<typeof setInterval> | null = null;

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

// Base64 encoded siren sound (short alert beep fallback)
const FALLBACK_ALERT_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp+bjYF0aGNocHyMl5qZlIZ3bWxwfo+ZmpqUiX50bnF6houWmJaIfnVwcnuGipWUiH54d3R6gYaIkYp/e3Z0eYGEh4qHf3p2dXqBhImGf3p2dXl/gYOGfnl2dHh+goKFfXh1c3Z9gYKDfHd0cnV8gIGCenczcnR7f4CBgXp2cm9zeX6AgYF5dXJvcXh+gICBeXRyb3B3fn+AgXh0cW9vdnp9gYF3c3FubXZ5fYGBdnJwbmx1eHx+gXZwbWxtdXZ7fYF2cW1ram51eHx+gXZxbWtqbnV4e36BdXFsamptdHh6fYF1cWtqamxzdnl9gXRxbGlqbHN2eX1/dHFraWprc3Z5fX90cWtpanN1eHt+fnRxbGlpbnN1d3p+fnNwa2hpbXJ0dnl+enNwbWhpbHJzdXh6fntzbWtoamxxcnV3entzbW1rampxcXN2eHp5cm1sq6pwcnN1d3l5cW1sq6pvcHBzdHZ4eXBqbKuqb3Bwc3R1d3h5cGtsq6pvcHBxdXV3eHlwa2uqqm9wcHF1dXd3eXFra6uqb3BwcXV2d3h4cGtrq6pvcXFxdXZ3d3hwa2urqm9xcXF1dnZ3eHBra6uqbnFxcXV2dnd4cGtrq6tucXFxdXZ2d3dwa2urq65xcXFxdXZ2d3dwbKurq65xcXFxdXZ2dndwbKurq65xcXFxdXZ2dndwbKurq65xcXJxcXV1dndwbKurq61xcXJycXV1dndwa6urq61xcnJycnV1dndwa6urq61xcnJycnV1dndwa6urq61xcnJycnV1dndwa6urq61xcnJycnV1dndwa6urq61xcnJycnV1dndwa6urq61xcnJycnV1dXZwa6urq61xcnJycnV1dXZwa6urq61xcnJxcnV1dXZwa6urq61xcnFxcnV1dXVwa6urq61xcXFxcnV1dXVvbKurq61xcXFxcnV1dXVvbKurq61xcXFxcnV0dXVvbKurq61wcXFwcnV0dXVvbKurq61wcXFwcnV0dHVvbKurq61wcXFwcnR0dHVvbaurq61wcXFwcnR0dHVtbKurq61wcXFwcnR0dHVtbKurq61wcXFwcnR0dHVtbaurq6twcXFvcnR0dHNtbaurq6twcXFvcnR0c3Nt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AApSSkKKRILQcYeAAAAAAAAgZSSkKKRILQcYeAAAAAAAAgZSSkKKRILQcYeAAAAAAAAAZSSkKKRWLQcYeAAAAAAAAAZSSUkKKRULQcYeAAAAAAAAAZSSckKKMULQcYcAAAAAAAAAZSUkKKMUfQcYcAAAAAAAAAZSUkKKMkfQYccAAAAAAAAAZSUkKOM0fQ4ccAAAAAAAAAZSUUCOM0fQ4ccAAAAAAAAAZSUUCOM0fI4ccAAAAAAAAAZSUUyOM0fI4ccAAAAAAAAAZSU0yOM0h44gcAAAAAAAAAAASU0yKM0h44gcAAAAAAAAAAASU0yKM0h44gcAAAAAAAAAAAA0yKM0B44gcAAAAAAAAAAAA0yKM0B44wcAAAAAAAAAAAAA0yKM0B44wcAAAAAAAAAAAAA0xKMkB44wcAAAAAAAAAAAAA0xKMkB44gcAAAAAAAAAAAAAAAKMkB44gcAAAAAAAAAAAAAAAKMkBY4gcAAAAAAAAAAAAAAAKMkBY4gcAAAAAAAAAAAAAAAKMkBY4gcAAAAAAAAAAAAAAAS0kBY4gcAAAAAAAAAAAAAAAS0kxY44AcAAAAAAAAAAAAAAE0kxY44AcAAAAAAAAAAAAAAE0kxY44AcAAAAAAAAAAAAAAESkxYY4AcAAAAAAAAAAAAAAESkhYY4AcAAAAAAAAAAAAAAESkhYY4AcAAAAAAAAAAAAAAESkhYY4AAAAAAAAAAAAAAAAAkhYY4AAAAAAAAAAAAAAAAAkhYY4AAAAAAAAAAAAAAAAAkhYYwAAAAAAAAAAAAAAAAAkQYYwAAAAAAAAAAAAAAAAAkQYYwAAAAAAAAAAAAAAAAAkBYYwAAAAAAAAAAAAAAAAAkBYgwAAAAAAAAAAAAAAAAAggYgwAAAAAAAAAAAAAAAAAggYgwAAAAAAAAAAAAAAAAAgQYgwAAAAAAAAAAAAAAAAAAAMYgwAAAAAAAAAAAAAAAAAAAMYgwAAAAAAAAAAAAAAAAAAAMYAAAAAAAAAAAAAAAAAAAAMYAAAAAAAAAAAAAAAAAAANoAAAAAAAAAAAAAAAAAAAANoAAAAAAAAAAAAAAAAAAAAA';

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

function stopFallbackAudio() {
  if (_fallbackAudioLoop) {
    clearInterval(_fallbackAudioLoop);
    _fallbackAudioLoop = null;
  }
  if (_fallbackAudio) {
    try {
      _fallbackAudio.pause();
      _fallbackAudio.currentTime = 0;
    } catch {}
    _fallbackAudio = null;
  }
}

function startFallbackAudio(sessionId: number) {
  stopFallbackAudio();

  try {
    _fallbackAudio = new Audio(FALLBACK_ALERT_SOUND);
    _fallbackAudio.volume = 1.0;

    let playAttempts = 0;
    const maxAttempts = 5;

    const playSound = async () => {
      if (_currentSessionId !== sessionId || !_fallbackAudio) return;
      if (playAttempts >= maxAttempts) {
        console.error('[Fallback Audio] Max play attempts reached');
        return;
      }

      playAttempts++;
      try {
        _fallbackAudio.currentTime = 0;
        await _fallbackAudio.play();
        console.log('[Fallback Audio] Playing successfully, attempt:', playAttempts);
        playAttempts = 0; // Reset on success
      } catch (e) {
        console.error('[Fallback Audio] Play failed (attempt', playAttempts, '):', e);
        // Retry after a short delay
        if (_currentSessionId === sessionId && playAttempts < maxAttempts) {
          setTimeout(() => playSound(), 200);
        }
      }
    };

    playSound();
    _fallbackAudioLoop = setInterval(() => {
      if (_currentSessionId === sessionId) {
        playSound();
      }
    }, 1200);

    console.log('[Fallback Audio] Started for session', sessionId);
  } catch (e) {
    console.error('[Fallback Audio] Setup failed:', e);
  }
}

export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioCtx();
  if (!ctx) return false;
  try {
    // Always try to resume, even if already running
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Play a short silent buffer to unlock audio
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);

    _audioUnlocked = ctx.state === 'running';
    console.log('[EmergencyAlert] Audio unlocked:', _audioUnlocked, 'ctx state:', ctx.state);
    return _audioUnlocked;
  } catch (e) {
    console.error('[EmergencyAlert] unlockAudio failed:', e);
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

    // Primary oscillator - louder siren
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, cycleStart);
    osc.frequency.linearRampToValueAtTime(1200, cycleStart + 0.6);
    osc.frequency.linearRampToValueAtTime(600, cycleStart + 1.2);

    gain.gain.setValueAtTime(0, cycleStart);
    gain.gain.linearRampToValueAtTime(0.85, cycleStart + 0.05);
    gain.gain.setValueAtTime(0.85, cycleStart + 1.15);
    gain.gain.linearRampToValueAtTime(0, cycleStart + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(cycleStart);
    osc.stop(cycleStart + 1.2);
    _activeOscillators.push(osc);
    _activeGains.push(gain);

    // Secondary oscillator - higher pitch harmony
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(1200, cycleStart);
    osc2.frequency.linearRampToValueAtTime(2400, cycleStart + 0.6);
    osc2.frequency.linearRampToValueAtTime(1200, cycleStart + 1.2);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, cycleStart);
    gain2.gain.linearRampToValueAtTime(0.45, cycleStart + 0.05);
    gain2.gain.setValueAtTime(0.45, cycleStart + 1.15);
    gain2.gain.linearRampToValueAtTime(0, cycleStart + 1.2);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(cycleStart);
    osc2.stop(cycleStart + 1.2);
    _activeOscillators.push(osc2);
    _activeGains.push(gain2);

    // Third oscillator - deep bass for more presence
    const osc3 = ctx.createOscillator();
    osc3.type = 'square';
    osc3.frequency.setValueAtTime(150, cycleStart);
    osc3.frequency.linearRampToValueAtTime(300, cycleStart + 0.6);
    osc3.frequency.linearRampToValueAtTime(150, cycleStart + 1.2);

    const gain3 = ctx.createGain();
    gain3.gain.setValueAtTime(0, cycleStart);
    gain3.gain.linearRampToValueAtTime(0.35, cycleStart + 0.05);
    gain3.gain.setValueAtTime(0.35, cycleStart + 1.15);
    gain3.gain.linearRampToValueAtTime(0, cycleStart + 1.2);

    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(cycleStart);
    osc3.stop(cycleStart + 1.2);
    _activeOscillators.push(osc3);
    _activeGains.push(gain3);
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

  // Stop fallback audio
  stopFallbackAudio();

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
            console.log('[EmergencyAlert] Web Audio started successfully');
            playSirenBatch();
          };

          // Try to resume and start audio
          if (ctx.state === 'suspended') {
            console.log('[EmergencyAlert] Context suspended, attempting resume...');
            ctx.resume().then(() => {
              if (_currentSessionId === thisSessionId) {
                startAudio();
              }
            }).catch((err) => {
              console.error('[EmergencyAlert] Failed to resume context:', err);
              // Fallback to HTML5 audio if Web Audio fails
              if (_currentSessionId === thisSessionId) {
                console.log('[EmergencyAlert] Using fallback audio due to resume failure');
                startFallbackAudio(thisSessionId);
              }
            });
          } else {
            startAudio();
          }
        } else {
          console.error('[EmergencyAlert] Could not get audio context - using fallback');
          startFallbackAudio(thisSessionId);
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
