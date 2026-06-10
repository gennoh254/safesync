import { useState, useEffect, useCallback } from 'react';
import { Hop as Home, Bell, Map, Settings, LogOut } from 'lucide-react';
import { ReceiverAlerts } from './ReceiverAlerts';
import { ReceiverHome } from './ReceiverHome';
import { ReceiverTrackingPage } from './ReceiverTrackingPage';
import { ReceiverSettings } from './ReceiverSettings';
import { IncomingAlertOverlay } from './IncomingAlertOverlay';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

interface AcceptedAlert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number;
  longitude: number;
  client_id: string;
}

interface IncomingAlert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  client_id: string;
  created_at: string;
  current_responder_id: string | null;
  notified_responder_ids: string[] | null;
}

interface ReceiverLayoutProps {
  onLogout: () => void;
}

const ALERT_TIMEOUT_SECONDS = 120; // 2 minutes

export function ReceiverLayout({ onLogout }: ReceiverLayoutProps) {
    const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'map' | 'settings'>('home');
    const [acceptedAlert, setAcceptedAlert] = useState<AcceptedAlert | null>(null);
    const [incomingAlert, setIncomingAlert] = useState<IncomingAlert | null>(null);
    const [hasActiveAlert, setHasActiveAlert] = useState(false);
    const { theme } = useTheme();
    const darkMode = theme === 'dark';

    // Check if this responder already has an active alert
    useEffect(() => {
      const checkActiveAlert = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('alerts')
          .select('id, emergency_type, location, latitude, longitude, client_id')
          .eq('current_responder_id', user.id)
          .eq('status', 'ACCEPTED')
          .maybeSingle();

        if (data) {
          setHasActiveAlert(true);
          setAcceptedAlert({
            id: data.id,
            emergency_type: data.emergency_type,
            location: data.location,
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
            client_id: data.client_id
          });
        } else {
          setHasActiveAlert(false);
        }
      };

      checkActiveAlert();
    }, []);

    // Function to call edge function for routing alert to next responder
    const escalateAlert = useCallback(async (alertId: string, notifiedIds: string[]) => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        await fetch(`${supabaseUrl}/functions/v1/find_nearest_responder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ alertId, excludeIds: notifiedIds }),
        });
      } catch (err) {
        console.error('Failed to escalate alert:', err);
      }
    }, []);

    // Subscribe to alerts assigned to this responder
    useEffect(() => {
      let channel: ReturnType<typeof supabase.channel>;

      const setupSubscription = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Listen for alerts assigned specifically to this responder
        channel = supabase
          .channel('responder-alerts-channel')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'alerts',
              filter: `current_responder_id=eq.${user.id}`
            },
            async (payload) => {
              const newAlert = payload.new as any;

              // Only show if responder is on duty and doesn't already have an active alert
              if (!hasActiveAlert && newAlert.status === 'ACTIVE') {
                setIncomingAlert({
                  id: newAlert.id,
                  emergency_type: newAlert.emergency_type,
                  location: newAlert.location,
                  latitude: newAlert.latitude,
                  longitude: newAlert.longitude,
                  client_id: newAlert.client_id,
                  created_at: newAlert.created_at,
                  current_responder_id: newAlert.current_responder_id,
                  notified_responder_ids: newAlert.notified_responder_ids
                });
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'alerts',
              filter: `current_responder_id=eq.${user.id}`
            },
            async (payload) => {
              const updatedAlert = payload.new as any;

              // Incoming alert notification (ACTIVE status, assigned to me)
              if (
                updatedAlert.status === 'ACTIVE' &&
                !hasActiveAlert &&
                (!incomingAlert || incomingAlert.id !== updatedAlert.id)
              ) {
                setIncomingAlert({
                  id: updatedAlert.id,
                  emergency_type: updatedAlert.emergency_type,
                  location: updatedAlert.location,
                  latitude: updatedAlert.latitude,
                  longitude: updatedAlert.longitude,
                  client_id: updatedAlert.client_id,
                  created_at: updatedAlert.created_at,
                  current_responder_id: updatedAlert.current_responder_id,
                  notified_responder_ids: updatedAlert.notified_responder_ids
                });
              }
            }
          )
          .subscribe();
      };

      setupSubscription();

      // Poll for alerts assigned to this responder (fallback for missed real-time events)
      const pollInterval = setInterval(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || hasActiveAlert) return;

        const { data } = await supabase
          .from('alerts')
          .select('*')
          .eq('status', 'ACTIVE')
          .eq('current_responder_id', user.id)
          .maybeSingle();

        if (data && !incomingAlert) {
          setIncomingAlert({
            id: data.id,
            emergency_type: data.emergency_type,
            location: data.location,
            latitude: data.latitude,
            longitude: data.longitude,
            client_id: data.client_id,
            created_at: data.created_at,
            current_responder_id: data.current_responder_id,
            notified_responder_ids: data.notified_responder_ids
          });
        }
      }, 5000);

      return () => {
        if (channel) channel.unsubscribe();
        clearInterval(pollInterval);
      };
    }, [hasActiveAlert, incomingAlert]);

    const handleAcceptAlert = (alert: AcceptedAlert) => {
      setAcceptedAlert(alert);
      setIncomingAlert(null);
      setHasActiveAlert(true);
      setActiveTab('map');
    };

    const handleAcceptIncomingAlert = async () => {
      if (!incomingAlert) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update alert status to ACCEPTED and mark responder as busy
      await supabase
        .from('alerts')
        .update({
          status: 'ACCEPTED',
          accepted_at: new Date().toISOString()
        })
        .eq('id', incomingAlert.id);

      // Mark this responder as having an active alert
      await supabase
        .from('profiles')
        .update({ has_active_alert: true })
        .eq('id', user.id);

      handleAcceptAlert({
        id: incomingAlert.id,
        emergency_type: incomingAlert.emergency_type,
        location: incomingAlert.location,
        latitude: incomingAlert.latitude || 0,
        longitude: incomingAlert.longitude || 0,
        client_id: incomingAlert.client_id
      });
    };

    const handleDeclineIncomingAlert = async () => {
      if (!incomingAlert) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current notified responder ids
      const currentNotified = incomingAlert.notified_responder_ids || [];

      // Update alert to mark this responder as notified (declined)
      await supabase
        .from('alerts')
        .update({
          notified_responder_ids: [...currentNotified, user.id],
          last_declined_at: new Date().toISOString()
        })
        .eq('id', incomingAlert.id);

      // Clear current responder so edge function can find next one
      await supabase
        .from('alerts')
        .update({ current_responder_id: null })
        .eq('id', incomingAlert.id);

      // Trigger escalation to next responder
      await escalateAlert(incomingAlert.id, [...currentNotified, user.id]);
      setIncomingAlert(null);
    };

    const handleTimeoutIncomingAlert = async () => {
      if (!incomingAlert) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const currentNotified = incomingAlert.notified_responder_ids || [];

      // Same as decline - mark as notified and escalate
      await supabase
        .from('alerts')
        .update({
          notified_responder_ids: [...currentNotified, user.id],
          current_responder_id: null
        })
        .eq('id', incomingAlert.id);

      await escalateAlert(incomingAlert.id, [...currentNotified, user.id]);
      setIncomingAlert(null);
    };

    // Function to clear active alert status when done
    const handleClearActiveAlert = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({ has_active_alert: false })
        .eq('id', user.id);

      setAcceptedAlert(null);
      setHasActiveAlert(false);
    };

    return (
        <div className={`flex flex-col lg:flex-row h-screen w-full ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'} font-sans`}>
            {/* Incoming Alert Overlay */}
            {incomingAlert && !hasActiveAlert && (
              <IncomingAlertOverlay
                alert={incomingAlert}
                onAccept={handleAcceptIncomingAlert}
                onDecline={handleDeclineIncomingAlert}
                onTimeout={handleTimeoutIncomingAlert}
                duration={ALERT_TIMEOUT_SECONDS}
              />
            )}

            {/* Sidebar for Desktop */}
            <nav className="hidden lg:flex flex-col w-64 border-r bg-[#0B1727] border-slate-800 p-6 text-white">
                <h1 className="text-xl font-bold mb-10">SafeSync Responder</h1>
                {hasActiveAlert && (
                  <div className="mb-4 p-2 bg-green-900/50 border border-green-700 rounded text-xs text-green-400 text-center">
                    Active Alert in Progress
                  </div>
                )}
                <div className="space-y-4">
                  <button onClick={() => setActiveTab('home')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'home' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Home className="w-5 h-5 text-white" />Home</button>
                  <button onClick={() => setActiveTab('alerts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'alerts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Bell className="w-5 h-5 text-white" />Alerts</button>
                  <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'map' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Map className="w-5 h-5 text-white" />Map</button>
                  <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
                </div>
                <button onClick={onLogout} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-slate-800 mt-auto text-gray-400 hover:text-white"><LogOut className="w-5 h-5" />Log Out</button>
            </nav>

            <div className="flex-grow overflow-auto p-4 lg:p-8">
                {activeTab === 'home' && <ReceiverHome onGoToMap={() => setActiveTab('map')} onGoToSettings={() => setActiveTab('settings')} />}
                {activeTab === 'alerts' && <ReceiverAlerts onAcceptAlert={handleAcceptAlert} />}
                {activeTab === 'map' && <ReceiverTrackingPage darkMode={darkMode} acceptedAlert={acceptedAlert} onAlertResolved={handleClearActiveAlert} />}
                {activeTab === 'settings' && <ReceiverSettings />}
            </div>

            {/* Navbar for Mobile */}
            <nav className="lg:hidden sticky bottom-0 z-50 grid grid-cols-5 bg-[#0B1727] border-t border-slate-800 py-4 text-white">
                <button onClick={() => { setActiveTab('home'); setAcceptedAlert(null); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-400' : 'text-white'}`}><Home className="w-6 h-6" /><span className="text-[10px] font-bold">HOME</span></button>
                <button onClick={() => { setActiveTab('alerts'); setAcceptedAlert(null); }} className={`flex flex-col items-center gap-1 ${activeTab === 'alerts' ? 'text-blue-400' : 'text-white'}`}><Bell className="w-6 h-6" /><span className="text-[10px] font-bold">ALERTS</span></button>
                <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 ${activeTab === 'map' ? 'text-blue-400' : 'text-white'}`}><Map className="w-6 h-6" /><span className="text-[10px] font-bold">MAP</span></button>
                <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-400' : 'text-white'}`}><Settings className="w-6 h-6" /><span className="text-[10px] font-bold">SETTINGS</span></button>
                <button onClick={onLogout} className="flex flex-col items-center gap-1 text-gray-400"><LogOut className="w-6 h-6" /><span className="text-[10px] font-bold">LOGOUT</span></button>
            </nav>
        </div>
    );
}
