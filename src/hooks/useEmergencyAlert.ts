import { useRef, useCallback, useEffect } from 'react';

interface EmergencyAlertOptions {
  duration?: number;
  onVibrate?: boolean;
  onSound?: boolean;
}

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  return sharedAudioContext;
}

export function initAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

export function useEmergencyAlert() {
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  const playSiren = useCallback(() => {
    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume();
    }

    const ctx = sharedAudioContext;
    const now = ctx.currentTime;

    const frequencies = [800, 1000, 1200, 600];
    const types: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];

    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = types[index];
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.5);
      osc.frequency.linearRampToValueAtTime(freq, now + 1);

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

  const vibrate = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate([
        200, 100, 200, 100, 200,
        400, 200, 400, 200, 400,
        200, 100, 200, 100, 200
      ]);
    }
  }, []);

  const startVibration = useCallback(() => {
    vibrate();
    vibrationIntervalRef.current = setInterval(() => {
      vibrate();
    }, 2500);
  }, [vibrate]);

  const startAlert = useCallback((options: EmergencyAlertOptions = {}) => {
    const { duration = 120000, onVibrate = true, onSound = true } = options;

    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume();
    }

    if (onSound) {
      playSiren();
      soundIntervalRef.current = setInterval(() => {
        playSiren();
      }, 1000);
    }

    if (onVibrate) {
      startVibration();
    }

    timeoutRef.current = setTimeout(() => {
      stopAlert();
    }, duration);
  }, [playSiren, startVibration]);

  const stopAlert = useCallback(() => {
    isPlayingRef.current = false;

    oscillatorsRef.current.forEach(osc => {
      try {
        osc.stop();
      } catch {}
    });
    oscillatorsRef.current = [];
    gainNodesRef.current = [];

    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
      soundIntervalRef.current = null;
    }

    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  }, []);

  const testAlert = useCallback(() => {
    initAudioContext();
    playSiren();
    vibrate();
  }, [playSiren, vibrate]);

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
