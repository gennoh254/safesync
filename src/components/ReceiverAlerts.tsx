import { MapPin, Clock, TriangleAlert as AlertTriangle, Flame, HeartPulse, Info, Loader as Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Alert {
  id: string;
  emergency_type: string;
  location: string;
  created_at: string;
  status: string;
  client_id: string;
}

export function ReceiverAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts();

    const subscription = supabase
      .channel('alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
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

  const handleAcceptAlert = async (alertId: string) => {
    try {
      const { error: err } = await supabase
        .from('alerts')
        .update({ status: 'ACCEPTED' })
        .eq('id', alertId);

      if (err) throw err;
      setAlerts(alerts.filter(a => a.id !== alertId));
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
      <h2 className="text-3xl font-bold mb-8 text-slate-900">Active Alerts ({alerts.length})</h2>

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
                    onClick={() => handleAcceptAlert(alert.id)}
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
