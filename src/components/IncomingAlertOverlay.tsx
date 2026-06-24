import { Flame, HeartPulse, MapPin, Clock, Phone, X, CircleCheck as CheckCircle, Volume2, VolumeX, Layers } from 'lucide-react';
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
  soundEnabled?: boolean;
}

export function IncomingAlertOverlay({
  alert,
  onAccept,
  onDecline,
  onTimeout,
  duration = 120,
  soundEnabled = true
}: IncomingAlertOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isMuted, setIsMuted] = useState(!soundEnabled);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const { startAlert, stopAlert } = useEmergencyAlert();
  const alertStartedRef = useRef(false);

  // Auto-start alert sound immediately on mount
  useEffect(() => {
    // Reset alert started flag on mount (key prop ensures fresh component)
    alertStartedRef.current = false;

    return () => {
      // Clean up on unmount
      stopAlert();
    };
  }, [stopAlert]);

  // Start alert on first render after mount cleanup completes
  useEffect(() => {
    if (alertStartedRef.current) return;
    alertStartedRef.current = true;

    // Small delay to ensure cleanup from any previous component has completed
    const timer = setTimeout(() => {
      // Focus accept button
      acceptButtonRef.current?.focus();

      console.log('[IncomingAlertOverlay] Starting alert, soundEnabled:', soundEnabled);

      // Stop any lingering audio first
      stopAlert();

      // Small delay before starting fresh
      setTimeout(() => {
        if (soundEnabled) {
          startAlert({
            duration: duration * 1000,
            onVibrate: true,
            onSound: true
          });
        } else {
          // Still vibrate even if sound is off
          startAlert({
            duration: duration * 1000,
            onVibrate: true,
            onSound: false
          });
        }
      }, 50);
    }, 50);

    return () => clearTimeout(timer);
  }, []); // Empty deps - only run once on mount

  // Timer countdown
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
  }, [timeLeft, onTimeout, stopAlert]);

  const handleAccept = () => {
    stopAlert();
    onAccept();
  };

  const handleDecline = () => {
    stopAlert();
    onDecline();
  };

  const handleMuteToggle = () => {
    const nowMuting = !isMuted;
    if (!nowMuting) {
      // Unmuting - stop current, then start with sound
      stopAlert();
      setTimeout(() => {
        startAlert({ duration: timeLeft * 1000, onVibrate: true, onSound: true });
      }, 50);
    } else {
      // Muting - just stop
      stopAlert();
    }
    setIsMuted(nowMuting);
    try { localStorage.setItem('safesync_responder_sound_enabled', String(!nowMuting)); } catch {}
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getEmergencyIcon = () => {
    switch (alert.emergency_type) {
      case 'FIRE':
        return <Flame className="w-20 h-20 text-orange-500" />;
      case 'MEDICAL':
        return <HeartPulse className="w-20 h-20 text-red-500" />;
      default:
        return <Layers className="w-20 h-20 text-purple-500" />;
    }
  };

  const getEmergencyLabel = () => {
    switch (alert.emergency_type) {
      case 'FIRE':
        return { title: 'FIRE EMERGENCY', subtitle: 'Building Fire / Fire Outbreak', color: 'text-orange-500', bgColor: 'from-orange-600 to-red-600' };
      case 'MEDICAL':
        return { title: 'MEDICAL EMERGENCY', subtitle: 'Medical Assistance Required', color: 'text-red-500', bgColor: 'from-red-600 to-rose-600' };
      default:
        return { title: 'OTHER CATASTROPHIES', subtitle: 'Emergency Assistance Required', color: 'text-purple-500', bgColor: 'from-purple-600 to-indigo-600' };
    }
  };

  const emergencyInfo = getEmergencyLabel();
  const progressPercentage = (timeLeft / duration) * 100;
  const isUrgent = timeLeft <= 30;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      {/* Pulsing background rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full border-4 border-red-500/20 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full border-4 border-orange-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full border-4 border-red-500/30 animate-pulse" />
      </div>

      <div className="relative w-full max-w-lg mx-4">
        <div className={`relative bg-gradient-to-br ${emergencyInfo.bgColor} rounded-3xl shadow-2xl overflow-hidden border-4 border-white/20`}>
          {/* Timer header */}
          <div className={`flex justify-between items-center p-4 ${isUrgent ? 'bg-red-800' : 'bg-black/30'}`}>
            <div className="flex items-center gap-3 text-white">
              <Clock className="w-6 h-6" />
              <span className="font-bold text-2xl tabular-nums">{formatTime(timeLeft)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMuteToggle}
                className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white"
                title={isMuted ? 'Unmute alert' : 'Mute alert'}
              >
                {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6 animate-pulse" />}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-black/30">
            <div
              className={`h-full transition-all duration-1000 ${isUrgent ? 'bg-red-400' : 'bg-white/50'}`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Main content */}
          <div className="p-8 text-center text-white">
            {/* Icon with pulsing ring */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" style={{ animationDuration: '1s' }} />
                <div className="relative bg-white/10 rounded-full p-6">
                  {getEmergencyIcon()}
                </div>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-black uppercase tracking-wider mb-2 text-white drop-shadow-lg">
              {emergencyInfo.title}
            </h1>
            <p className="text-white/80 text-lg mb-8">{emergencyInfo.subtitle}</p>

            {/* Location card */}
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 mb-8">
              <div className="flex items-start gap-3 text-left">
                <MapPin className="w-6 h-6 text-white shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white">Location</p>
                  <p className="text-white/80">{alert.location || 'Location not available'}</p>
                  {alert.latitude && alert.longitude && (
                    <p className="text-xs text-white/60 mt-1">
                      {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Time reported */}
            <div className="flex items-center justify-center gap-2 text-white/60 text-sm mb-8">
              <Clock className="w-4 h-4" />
              <span>Reported {new Date(alert.created_at).toLocaleTimeString()}</span>
            </div>

            {/* Action buttons */}
            <div className="space-y-4">
              <button
                ref={acceptButtonRef}
                onClick={handleAccept}
                className="w-full py-5 bg-green-600 hover:bg-green-500 text-white font-bold text-xl rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg shadow-green-600/40 border-2 border-white/20"
              >
                <CheckCircle className="w-7 h-7" />
                ACCEPT & RESPOND
              </button>
              <button
                onClick={handleDecline}
                className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 border border-white/20"
              >
                <X className="w-6 h-6" />
                Decline (Will escalate to next responder)
              </button>
            </div>
          </div>

          {/* Urgent warning */}
          {isUrgent && (
            <div className="bg-red-900/80 text-white text-center py-3 text-sm font-bold animate-pulse">
              ALERT WILL ESCALATE IN {timeLeft} SECONDS
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
