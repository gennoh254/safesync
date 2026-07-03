import { MapPin, Clock, TriangleAlert as AlertTriangle, Flame, HeartPulse, Info, Loader as Loader2, Volume2, Volume1, Zap, CircleCheck as CheckCircle, X, Navigation, History, Star, Layers } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAudioCtx } from '../hooks/useEmergencyAlert';

interface Alert {
  id: string;
  emergency_type: string;
  location: string;
  created_at: string;
  status: string;
  client_id: string;
  latitude: number | null;
  longitude: number | null;
  accepted_at?: string | null;
  resolved_at?: string | null;
  responder_rating?: number | null;
  description?: string | null;
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
  const [myAlerts, setMyAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const previousAlertsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(true);

  // Keep ref in sync
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playAlertSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;

      console.log('[ReceiverAlerts] Playing short alert notification');

      const doPlay = (c: AudioContext) => {
        const now = c.currentTime;
        // Two short siren cycles
        for (let i = 0; i < 2; i++) {
          const t = now + i * 1.2;
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(600, t);
          osc.frequency.linearRampToValueAtTime(1200, t + 0.6);
          osc.frequency.linearRampToValueAtTime(600, t + 1.2);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.4, t + 0.05);
          gain.gain.setValueAtTime(0.4, t + 1.15);
          gain.gain.linearRampToValueAtTime(0, t + 1.2);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(t);
          osc.stop(t + 1.2);
        }
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(() => doPlay(ctx)).catch((e) => console.warn('[ReceiverAlerts] Audio resume failed:', e));
      } else {
        doPlay(ctx);
      }
    } catch (e) {
      console.warn('[ReceiverAlerts] Failed to play alert sound:', e);
    }
  }, []);

  useEffect(() => {
    fetchAlerts(true);
    fetchMyAlerts();

    const channelName = `receiver-alerts-list-${Date.now()}`;
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new && (payload.new as any).status === 'ACTIVE') {
            playAlertSound();
          }
          fetchAlerts(false);
          fetchMyAlerts();
        }
      )
      .subscribe((status) => {
        console.log('[ReceiverAlerts] subscription:', status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [playAlertSound]);

  const fetchAlerts = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch all ACTIVE alerts (available for any responder to accept)
      const { data: activeAlerts, error: activeErr } = await supabase
        .from('alerts')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (activeErr) throw activeErr;

      // Also fetch this responder's own ACCEPTED alerts (in progress)
      let myActive: Alert[] = [];
      if (user) {
        const { data: acceptedData } = await supabase
          .from('alerts')
          .select('*')
          .eq('current_responder_id', user.id)
          .eq('status', 'ACCEPTED')
          .order('created_at', { ascending: false });
        myActive = acceptedData || [];
      }

      // Combine and sort by created_at descending (newest first)
      const allAlerts = [...myActive, ...(activeAlerts || [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setAlerts(allAlerts);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyAlerts = async () => {
    try {
      setHistoryLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: err } = await supabase
        .from('alerts')
        .select('*')
        .eq('current_responder_id', user.id)
        .in('status', ['RESOLVED', 'UNRESOLVED'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (err) throw err;
      setMyAlerts(data || []);
    } catch (err: any) {
      console.error('Failed to fetch my alerts:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAcceptAlert = async (alert: Alert) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: err } = await supabase
        .from('alerts')
        .update({
          status: 'ACCEPTED',
          current_responder_id: user.id,
          accepted_at: new Date().toISOString(),
        })
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
    return { label: 'Medium', color: 'bg-purple-500 text-white' };
  };

  const getIcon = (emergencyType: string) => {
    if (emergencyType === 'FIRE') return <Flame className="w-5 h-5 text-orange-500" />;
    if (emergencyType === 'MEDICAL') return <HeartPulse className="w-5 h-5 text-red-500" />;
    return <Layers className="w-5 h-5 text-purple-500" />;
  };

  const getStatusConfig = (status: string) => {
    if (status === 'ACCEPTED') return { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: <Navigation className="w-4 h-4" /> };
    if (status === 'RESOLVED') return { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-4 h-4" /> };
    if (status === 'UNRESOLVED') return { label: 'Unresolved', color: 'bg-red-100 text-red-700', icon: <X className="w-4 h-4" /> };
    return { label: status, color: 'bg-gray-100 text-gray-700', icon: null };
  };

  const formatTime = (createdAt: string) => {
    const date = new Date(createdAt);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading && activeTab === 'active') {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          <p className="text-slate-600">Loading alerts...</p>
        </div>
      </div>
    );
  }

  const activeCount = alerts.length;
  const historyCount = myAlerts.length;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header - Fixed */}
      <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 p-4 lg:px-8 lg:pt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-slate-900">
            {activeTab === 'active' ? `Active Alerts (${activeCount})` : `My Responses (${historyCount})`}
          </h2>
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

        {/* Tab Switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'active'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Zap className="w-4 h-4" />
            Active ({activeCount})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            My Responses ({historyCount})
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 lg:mx-8 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-grow overflow-y-auto p-4 lg:px-8 lg:py-6">
        {activeTab === 'active' ? (
          // Active Alerts Tab
          alerts.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center">
              <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No active alerts at this time</p>
              <p className="text-slate-400 text-sm mt-2">New alerts will appear here in real-time</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {alerts.map(alert => {
                const priority = getPriority(alert.emergency_type);
                const isMyActive = alert.status === 'ACCEPTED';
                return (
                  <div key={alert.id} className={`bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${isMyActive ? 'border-blue-200 shadow-blue-100' : 'border-slate-100'}`}>
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
                        {alert.emergency_type === 'FIRE' ? 'Building Fire' : alert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Other Catastrophies'}
                      </h3>
                    </div>

                    {isMyActive && (
                      <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-700 text-sm font-bold">
                          <Navigation className="w-4 h-4" />
                          In Progress
                        </div>
                        <p className="text-xs text-blue-500 mt-1">You have accepted this alert. Check the Map tab.</p>
                      </div>
                    )}

                    <p className="text-sm text-slate-600 mb-6 flex items-start gap-1">
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <span>{alert.location || 'Location not available'}</span>
                    </p>

                    {/* Show description for OTHER emergency type */}
                    {alert.emergency_type === 'OTHER' && alert.description && (
                      <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <p className="text-xs font-bold text-purple-700 mb-1">Description:</p>
                        <p className="text-sm text-purple-900">{alert.description}</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {isMyActive ? (
                        <div className="flex-grow py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm text-center flex items-center justify-center gap-2">
                          <Navigation className="w-4 h-4" />
                          Assigned to You
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAcceptAlert(alert)}
                          className="flex-grow bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
                        >
                          ACCEPT
                        </button>
                      )}
                      <button className="px-4 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500">
                        <Info className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // History Tab
          historyLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : myAlerts.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center">
              <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No response history yet</p>
              <p className="text-slate-400 text-sm mt-2">Alerts you accept will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myAlerts.map(alert => {
                const statusConfig = getStatusConfig(alert.status);
                const isActive = alert.status === 'ACCEPTED';

                return (
                  <div
                    key={alert.id}
                    className={`bg-white p-5 rounded-xl border shadow-sm transition-all ${
                      isActive
                        ? 'border-blue-200 shadow-blue-100 hover:shadow-md'
                        : 'border-slate-100 hover:shadow-md'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          alert.emergency_type === 'FIRE'
                            ? 'bg-orange-100'
                            : alert.emergency_type === 'MEDICAL'
                            ? 'bg-red-100'
                            : 'bg-purple-100'
                        }`}>
                          {getIcon(alert.emergency_type)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">
                            {alert.emergency_type === 'FIRE'
                              ? 'Fire Emergency'
                              : alert.emergency_type === 'MEDICAL'
                              ? 'Medical Emergency'
                              : 'Other Catastrophies'}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <Clock className="w-3 h-3" />
                            <span>{formatDateTime(alert.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${statusConfig.color}`}>
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-slate-600 mb-3">
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <span>{alert.location || 'Location not available'}</span>
                    </div>

                    {/* Timeline info */}
                    {alert.accepted_at && (
                      <div className="flex items-center gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3 mt-3">
                        <div className="flex items-center gap-1">
                          <Navigation className="w-3 h-3 text-blue-500" />
                          <span>Accepted: {formatDateTime(alert.accepted_at)}</span>
                        </div>
                        {alert.resolved_at && (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span>Resolved: {formatDateTime(alert.resolved_at)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rating display */}
                    {alert.responder_rating && (
                      <div className="flex items-center gap-2 text-xs border-t border-slate-100 pt-3 mt-3">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-slate-600 font-medium">Client Rating:</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                star <= alert.responder_rating!
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Active alert action */}
                    {isActive && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-xs text-blue-600 font-bold">This alert is currently active. Check the Map tab for navigation.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
