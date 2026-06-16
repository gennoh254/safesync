import { useRef, useCallback, useEffect } from 'react';

interface EmergencyAlertOptions {
  duration?: number;
  onVibrate?: boolean;
  onSound?: boolean;
}

export function useEmergencyAlert() {
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  const createAlertSound = useCallback(() => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioCtx.sampleRate;
    // Create a longer siren sound like an ambulance/fire truck (4 seconds loop)
    const duration = 4.0;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;

      // Classic ambulance/fire siren: two tones alternating (wail)
      // Phase 1: Low tone (700Hz) for 0.5s
      // Phase 2: High tone (1500Hz) for 0.5s
      const cyclePos = (t % 1.0); // 1 second cycle
      let sample = 0;

      if (cyclePos < 0.5) {
        // Low tone with slight ramp up
        const ramp = cyclePos / 0.5;
        sample = 0.6 * Math.sin(2 * Math.PI * 700 * t) * ramp;
      } else {
        // High tone with slight ramp up
        const ramp = (cyclePos - 0.5) / 0.5;
        sample = 0.6 * Math.sin(2 * Math.PI * 1500 * t) * ramp;
      }

      // Add harmonics for richer sound
      sample += 0.2 * Math.sin(2 * Math.PI * 1400 * t);
      sample += 0.1 * Math.sin(2 * Math.PI * 2100 * t);

      data[i] = sample * 0.8;
    }

    const wavData = audioCtx.createWavBuffer ?
      buffer : encodeWAV(buffer);

    const blob = new Blob([wavData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    audioCtx.close();
    return url;
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

    if (onSound) {
      try {
        if (!audioElementRef.current) {
          const audioUrl = createAlertSound();
          audioElementRef.current = new Audio(audioUrl);
          audioElementRef.current.loop = true;
          audioElementRef.current.volume = 1.0;
        }

        const playPromise = audioElementRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.log('Audio autoplay blocked:', error);
          });
        }
      } catch (error) {
        console.log('Error creating audio:', error);
      }
    }

    if (onVibrate) {
      startVibration();
    }

    timeoutRef.current = setTimeout(() => {
      stopAlert();
    }, duration);
  }, [createAlertSound, startVibration]);

  const stopAlert = useCallback(() => {
    isPlayingRef.current = false;

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
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
    try {
      if (!audioElementRef.current) {
        const audioUrl = createAlertSound();
        audioElementRef.current = new Audio(audioUrl);
        audioElementRef.current.loop = false;
        audioElementRef.current.volume = 1.0;
      }

      const playPromise = audioElementRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log('Test audio failed:', error);
        });
      }
    } catch (error) {
      console.log('Test alert error:', error);
    }
    vibrate();
  }, [createAlertSound, vibrate]);

  useEffect(() => {
    return () => {
      stopAlert();
      if (audioElementRef.current) {
        audioElementRef.current = null;
      }
    };
  }, [stopAlert]);

  return {
    startAlert,
    stopAlert,
    testAlert,
    isPlaying: isPlayingRef.current
  };
}

function encodeWAV(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
