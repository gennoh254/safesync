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
    // Longer duration for a more continuous phone-like ring
    const duration = 2.0;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // Create a loud, urgent siren-like pattern
      const freq1 = 900 + 400 * Math.sin(t * Math.PI * 4); // Faster oscillation
      const freq2 = 1400 + 200 * Math.sin(t * Math.PI * 6);
      // Louder amplitude
      data[i] = 0.4 * Math.sin(2 * Math.PI * freq1 * t) + 0.3 * Math.sin(2 * Math.PI * freq2 * t);
      // Add urgent high-frequency component
      data[i] += 0.15 * Math.sin(2 * Math.PI * 1800 * t) * Math.sin(t * Math.PI * 8);
      data[i] *= 0.7; // Normalize
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
