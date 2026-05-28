import { useRef, useCallback, useEffect } from 'react';

interface EmergencyAlertOptions {
  duration?: number; // in milliseconds, default 2 minutes
  onVibrate?: boolean;
  onSound?: boolean;
}

export function useEmergencyAlert() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  // Create a loud emergency siren sound
  const playSiren = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    // Create multiple oscillators for a richer, louder sound
    const frequencies = [800, 1000, 1200, 600];
    const types: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];

    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = types[index];
      osc.frequency.setValueAtTime(freq, now);

      // Create a sweeping siren effect
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.5);
      osc.frequency.linearRampToValueAtTime(freq, now + 1);

      // Volume envelope
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.setValueAtTime(0.3, now + 0.9);
      gain.gain.linearRampToValueAtTime(0, now + 1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1);

      oscillatorsRef.current.push(osc);
      gainNodesRef.current.push(gain);
    });

    // Add a high-pitched chirp for urgency
    const chirpOsc = ctx.createOscillator();
    const chirpGain = ctx.createGain();
    chirpOsc.type = 'sine';
    chirpOsc.frequency.setValueAtTime(1500, now);
    chirpOsc.frequency.linearRampToValueAtTime(2000, now + 0.1);
    chirpOsc.frequency.linearRampToValueAtTime(1500, now + 0.2);
    chirpGain.gain.setValueAtTime(0.25, now);
    chirpGain.gain.linearRampToValueAtTime(0, now + 0.2);
    chirpOsc.connect(chirpGain);
    chirpGain.connect(ctx.destination);
    chirpOsc.start(now);
    chirpOsc.stop(now + 0.2);
  }, []);

  // Vibrate device (mobile only)
  const vibrate = useCallback(() => {
    if ('vibrate' in navigator) {
      // SOS pattern: 3 short, 3 long, 3 short
      navigator.vibrate([
        200, 100, 200, 100, 200, // 3 short
        400, 200, 400, 200, 400, // 3 long
        200, 100, 200, 100, 200  // 3 short
      ]);
    }
  }, []);

  // Start continuous vibration pattern
  const startVibration = useCallback(() => {
    vibrate();
    // Repeat vibration pattern every 2.5 seconds
    vibrationIntervalRef.current = setInterval(() => {
      vibrate();
    }, 2500);
  }, [vibrate]);

  // Start the emergency alert (sound + vibration)
  const startAlert = useCallback((options: EmergencyAlertOptions = {}) => {
    const { duration = 120000, onVibrate = true, onSound = true } = options;

    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    // Resume audio context if suspended (required by browsers)
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }

    // Start sound
    if (onSound) {
      playSiren();
      // Repeat siren every 1 second
      soundIntervalRef.current = setInterval(() => {
        playSiren();
      }, 1000);
    }

    // Start vibration
    if (onVibrate) {
      startVibration();
    }

    // Auto-stop after duration
    timeoutRef.current = setTimeout(() => {
      stopAlert();
    }, duration);

  }, [playSiren, startVibration]);

  // Stop the emergency alert
  const stopAlert = useCallback(() => {
    isPlayingRef.current = false;

    // Stop all oscillators
    oscillatorsRef.current.forEach(osc => {
      try {
        osc.stop();
      } catch {}
    });
    oscillatorsRef.current = [];

    // Clear intervals
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
      soundIntervalRef.current = null;
    }

    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }

    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Stop vibration
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // Test the alert (for user to verify sound/vibration works)
  const testAlert = useCallback(() => {
    playSiren();
    vibrate();
  }, [playSiren, vibrate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAlert();
    };
  }, [stopAlert]);

  return {
    startAlert,
    stopAlert,
    testAlert,
    isPlaying: isPlayingRef.current
  };
}
