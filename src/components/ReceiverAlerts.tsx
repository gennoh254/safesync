import { MapPin, Clock, TriangleAlert as AlertTriangle, Flame, HeartPulse, Info, Loader as Loader2, Volume2, Volume1, Zap } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface Alert {
  id: string;
  emergency_type: string;
  location: string;
  created_at: string;
  status: string;
  client_id: string;
  latitude: number | null;
  longitude: number | null;
}

interface AcceptedAlertData {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number;
  longitude: number;
  client_id: string;
}

export function ReceiverAlerts({ onAcceptAlert }: { onAcceptAlert: (alert: AcceptedAlertData) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousAlertsRef = useRef<Set<string>>(new Set());

  const playAlertSound = () => {
    if (!soundEnabled || !audioRef.current) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;

    // Create oscillator for alert sound (siren-like)
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc1.type = 'sine';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(800, now);
    osc2.frequency.setValueAtTime(1200, now);

    // Create frequency sweep effect
    osc1.frequency.exponentialRampToValueAtTime(600, now + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(900, now + 0.3);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.3);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);

    // Play second burst
    setTimeout(() => {
      const osc3 = audioContext.createOscillator();
      const osc4 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();

      osc3.type = 'sine';
      osc4.type = 'square';
      osc3.frequency.setValueAtTime(900, audioContext.currentTime);
      osc4.frequency.setValueAtTime(1200, audioContext.currentTime);
      osc3.frequency.exponentialRampToValueAtTime(700, audioContext.currentTime + 0.3);
      osc4.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.3);

      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.3);

      osc3.connect(gain2);
      osc4.connect(gain2);
      gain2.connect(audioContext.destination);

      osc3.start(audioContext.currentTime);
      osc4.start(audioContext.currentTime);
      osc3.stop(audioContext.currentTime + 0.3);
      osc4.stop(audioContext.currentTime + 0.3);
    }, 350);
  };

  useEffect(() => {
    fetchAlerts(true);

    const subscription = supabase
      .channel('receiver-alerts-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new && (payload.new as any).status === 'ACTIVE') {
            playAlertSound();
          }
          fetchAlerts(false);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [soundEnabled]);

  const fetchAlerts = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const { data, error: err } = await supabase
        .from('alerts')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setAlerts(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptAlert = async (alert: Alert) => {
    try {
      const { error: err } = await supabase
        .from('alerts')
        .update({ status: 'ACCEPTED' })
        .eq('id', alert.id);

      if (err) throw err;
      setAlerts(alerts.filter(a => a.id !== alert.id));

      // Navigate to map with alert data
      onAcceptAlert({
        id: alert.id,
        emergency_type: alert.emergency_type,
        location: alert.location,
        latitude: alert.latitude || 0,
        longitude: alert.longitude || 0,
        client_id: alert.client_id,
      });
    } catch (err: any) {
      setError(err.message ?? 'Failed to accept alert');
    }
  };

  const getPriority = (emergencyType: string) => {
    if (emergencyType === 'MEDICAL') return { label: 'Critical', color: 'bg-red-500 text-white' };
    if (emergencyType === 'FIRE') return { label: 'High', color: 'bg-orange-500 text-white' };
    return { label: 'Medium', color: 'bg-yellow-500 text-black' };
  };

  const getIcon = (emergencyType: string) => {
    if (emergencyType === 'FIRE') return <Flame className="w-5 h-5 text-red-500" />;
    if (emergencyType === 'MEDICAL') return <HeartPulse className="w-5 h-5 text-red-500" />;
    return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  };

  const formatTime = (createdAt: string) => {
    const date = new Date(createdAt);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          <p className="text-slate-600">Loading alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Active Alerts ({alerts.length})</h2>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
            soundEnabled
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
          }`}
        >
          {soundEnabled ? (
            <>
              <Volume2 className="w-4 h-4" />
              Sound On
            </>
          ) : (
            <>
              <Volume1 className="w-4 h-4 line-through" />
              Sound Off
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded p-4">
          {error}
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center">
          <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No active alerts at this time</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {alerts.map(alert => {
            const priority = getPriority(alert.emergency_type);
            return (
              <div key={alert.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${priority.color}`}>
                    {priority.label}
                  </span>
                  <div className="flex items-center text-slate-400 text-xs font-bold gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(alert.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  {getIcon(alert.emergency_type)}
                  <h3 className="font-bold text-lg text-slate-900 tracking-tight">
                    {alert.emergency_type === 'FIRE' ? 'Building Fire' : alert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Emergency'}
                  </h3>
                </div>

                <p className="text-sm text-slate-600 mb-6 flex items-start gap-1">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <span>{alert.location}</span>
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptAlert(alert)}
                    className="flex-grow bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
                  >
                    ACCEPT
                  </button>
                  <button className="px-4 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500">
                    <Info className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
