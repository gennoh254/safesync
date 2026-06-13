import { Flame, HeartPulse, MapPin, Clock, Phone, X, CircleCheck as CheckCircle, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEmergencyAlert } from '../hooks/useEmergencyAlert';

interface IncomingAlert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  client_id: string;
  created_at: string;
}

interface IncomingAlertOverlayProps {
  alert: IncomingAlert;
  onAccept: () => void;
  onDecline: () => void;
  onTimeout: () => void;
  duration?: number;
}

export function IncomingAlertOverlay({
  alert,
  onAccept,
  onDecline,
  onTimeout,
  duration = 120
}: IncomingAlertOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isMuted, setIsMuted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showEnableButton, setShowEnableButton] = useState(true);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const { startAlert, stopAlert, testAlert } = useEmergencyAlert();

  useEffect(() => {
    acceptButtonRef.current?.focus();
  }, []);

  const handleEnableSound = () => {
    setAudioEnabled(true);
    setShowEnableButton(false);
    // Start alert with continuous sound like a phone call
    startAlert({
      duration: timeLeft * 1000,
      onVibrate: true,
      onSound: true
    });
  };

  // Auto-play sound attempt on mount (may be blocked by browser)
  useEffect(() => {
    const tryAutoPlay = async () => {
      try {
        // Attempt to create and play audio on first user interaction
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioCtx.close();
      } catch (e) {
        console.log('Auto-play blocked, showing enable button');
      }
    };
    tryAutoPlay();
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      stopAlert();
      onTimeout();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onTimeout]);

  const handleAccept = () => {
    stopAlert();
    onAccept();
  };

  const handleDecline = () => {
    stopAlert();
    onDecline();
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      stopAlert();
      setAudioEnabled(false);
    } else if (audioEnabled) {
      startAlert({ duration: timeLeft * 1000, onVibrate: true, onSound: true });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getEmergencyIcon = () => {
    switch (alert.emergency_type) {
      case 'FIRE':
        return <Flame className="w-16 h-16 text-orange-500" />;
      case 'MEDICAL':
        return <HeartPulse className="w-16 h-16 text-red-500" />;
      default:
        return <Phone className="w-16 h-16 text-blue-500" />;
    }
  };

  const getEmergencyLabel = () => {
    switch (alert.emergency_type) {
      case 'FIRE':
        return { title: 'FIRE EMERGENCY', subtitle: 'Building Fire / Fire Outbreak', color: 'text-orange-500' };
      case 'MEDICAL':
        return { title: 'MEDICAL EMERGENCY', subtitle: 'Medical Assistance Required', color: 'text-red-500' };
      default:
        return { title: 'EMERGENCY', subtitle: 'Assistance Required', color: 'text-blue-500' };
    }
  };

  const emergencyInfo = getEmergencyLabel();
  const progressPercentage = (timeLeft / duration) * 100;
  const isUrgent = timeLeft <= 30;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 animate-pulse">
        <div className="absolute inset-0 bg-red-500/20 rounded-3xl animate-ping" />
        <div className="absolute inset-0 bg-orange-500/10 rounded-3xl" />

        <div className="relative bg-slate-900 rounded-3xl border-4 border-red-500 shadow-2xl overflow-hidden">
          <div className={`flex justify-between items-center p-4 ${isUrgent ? 'bg-red-600' : 'bg-slate-800'}`}>
            <div className="flex items-center gap-2 text-white">
              <Clock className="w-5 h-5" />
              <span className="font-bold text-lg">{formatTime(timeLeft)}</span>
            </div>
            <div className="flex items-center gap-2">
              {showEnableButton && !audioEnabled && (
                <button
                  onClick={handleEnableSound}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 text-black text-sm font-bold hover:bg-yellow-400 transition-colors animate-pulse shadow-lg shadow-yellow-500/50"
                >
                  <Volume2 className="w-5 h-5" />
                  TAP TO ENABLE ALERT SOUND
                </button>
              )}
              {audioEnabled && (
                <button
                  onClick={handleMuteToggle}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors text-white"
                  title={isMuted ? 'Unmute alert' : 'Mute alert'}
                >
                  {isMuted ? <VolumeX className="w-5 h-5 opacity-50" /> : <Volume2 className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          <div className="h-1 bg-slate-700">
            <div
              className={`h-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : 'bg-orange-500'}`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-red-500/30 rounded-full animate-ping" />
                <div className="relative bg-slate-800 rounded-full p-4 border-2 border-red-500">
                  {getEmergencyIcon()}
                </div>
              </div>
            </div>

            <h1 className={`text-2xl font-black uppercase tracking-wider mb-2 ${emergencyInfo.color}`}>
              {emergencyInfo.title}
            </h1>
            <p className="text-slate-400 text-sm mb-6">{emergencyInfo.subtitle}</p>

            <div className="bg-slate-800 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-red-500 mt-1 shrink-0" />
                <div className="text-left">
                  <p className="font-bold text-sm">Location</p>
                  <p className="text-sm text-slate-400">{alert.location || 'Location not available'}</p>
                </div>
              </div>
              {alert.latitude && alert.longitude && (
                <p className="text-xs text-slate-500 mt-2">
                  Coordinates: {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mb-8">
              <Clock className="w-4 h-4" />
              <span>Reported {new Date(alert.created_at).toLocaleTimeString()}</span>
            </div>

            <div className="space-y-3">
              <button
                ref={acceptButtonRef}
                onClick={handleAccept}
                className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-green-600/30"
              >
                <CheckCircle className="w-6 h-6" />
                ACCEPT & RESPOND
              </button>
              <button
                onClick={handleDecline}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" />
                Decline (Will escalate to next responder)
              </button>
            </div>
          </div>

          {isUrgent && (
            <div className="bg-red-900/50 text-red-200 text-center py-2 text-xs font-bold">
              ALERT WILL ESCALATE TO NEXT RESPONDER IN {timeLeft} SECONDS
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
