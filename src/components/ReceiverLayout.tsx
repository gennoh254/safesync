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
}

interface ReceiverLayoutProps {
  onLogout: () => void;
}

const ALERT_TIMEOUT_SECONDS = 120; // 2 minutes

export function ReceiverLayout({ onLogout }: ReceiverLayoutProps) {
    const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'map' | 'settings'>('home');
    const [acceptedAlert, setAcceptedAlert] = useState<AcceptedAlert | null>(null);
    const [incomingAlert, setIncomingAlert] = useState<IncomingAlert | null>(null);
    const { theme } = useTheme();
    const darkMode = theme === 'dark';

    // Function to find the nearest available responder for escalation
    const findNextResponder = useCallback(async (excludeIds: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Get current responder's location
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', user.id)
        .maybeSingle();

      // Get all on-duty responders excluding the ones already notified
      const { data: responders, error } = await supabase
        .from('profiles')
        .select('id, name, latitude, longitude')
        .eq('user_type', 'Responder')
        .eq('on_duty', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error || !responders || responders.length === 0) return null;

      // Filter out excluded responders and current user
      const availableResponders = responders.filter((r: any) =>
        r.id !== user.id && !excludeIds.includes(r.id)
      );

      if (availableResponders.length === 0) return null;

      // If we have location, find nearest; otherwise return first available
      if (currentProfile?.latitude && currentProfile?.longitude) {
        return availableResponders.sort((a: any, b: any) => {
          const distA = Math.sqrt(
            Math.pow((a.latitude - currentProfile.latitude), 2) +
            Math.pow((a.longitude - currentProfile.longitude), 2)
          );
          const distB = Math.sqrt(
            Math.pow((b.latitude - currentProfile.latitude), 2) +
            Math.pow((b.longitude - currentProfile.longitude), 2)
          );
          return distA - distB;
        })[0];
      }

      return availableResponders[0];
    }, []);

    // Function to escalate alert to next responder
    const escalateAlert = useCallback(async (alert: IncomingAlert) => {
      try {
        const notifiedIds = alert.current_responder_id
          ? [alert.current_responder_id]
          : [];

        // Find next responder
        const nextResponder = await findNextResponder(notifiedIds);

        if (!nextResponder) {
          // No more responders available
          console.log('No more responders available for escalation');
          return;
        }

        // Update alert to notify next responder
        const { error } = await supabase
          .from('alerts')
          .update({
            current_responder_id: (nextResponder as any).id,
            escalation_count: (await supabase
              .from('alerts')
              .select('escalation_count')
              .eq('id', alert.id)
              .maybeSingle()).data?.escalation_count || 0 + 1,
            notified_responder_ids: [...notifiedIds, (nextResponder as any).id],
            escalated_at: new Date().toISOString()
          })
          .eq('id', alert.id);

        if (error) throw error;
        console.log('Alert escalated to responder:', (nextResponder as any).id);
      } catch (err) {
        console.error('Failed to escalate alert:', err);
      }
    }, [findNextResponder]);

    // Subscribe to new alerts for this responder
    useEffect(() => {
      let channel: ReturnType<typeof supabase.channel>;

      const setupSubscription = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Listen for INSERT events on alerts table (new alerts)
        channel = supabase
          .channel('responder-alerts-channel')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'alerts',
              filter: `status=eq.ACTIVE`
            },
            async (payload) => {
              const newAlert = payload.new as any;

              // Check if this responder is the current target or no responder assigned yet
              if (!newAlert.current_responder_id || newAlert.current_responder_id === user.id) {
                setIncomingAlert({
                  id: newAlert.id,
                  emergency_type: newAlert.emergency_type,
                  location: newAlert.location,
                  latitude: newAlert.latitude,
                  longitude: newAlert.longitude,
                  client_id: newAlert.client_id,
                  created_at: newAlert.created_at,
                  current_responder_id: newAlert.current_responder_id
                });
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'alerts'
            },
            async (payload) => {
              const updatedAlert = payload.new as any;

              // If alert is assigned to this responder specifically
              if (
                updatedAlert.status === 'ACTIVE' &&
                updatedAlert.current_responder_id === user.id &&
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
                  current_responder_id: updatedAlert.current_responder_id
                });
              }
            }
          )
          .subscribe();
      };

      setupSubscription();

      return () => {
        if (channel) channel.unsubscribe();
      };
    }, [incomingAlert]);

    // Also poll for alerts assigned to this responder
    useEffect(() => {
      const checkForAssignedAlerts = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('alerts')
          .select('*')
          .eq('status', 'ACTIVE')
          .or(`current_responder_id.is.null,current_responder_id.eq.${user.id}`)
          .limit(1)
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
            current_responder_id: data.current_responder_id
          });
        }
      };

      // Check immediately and then every 5 seconds
      checkForAssignedAlerts();
      const interval = setInterval(checkForAssignedAlerts, 5000);

      return () => clearInterval(interval);
    }, [incomingAlert]);

    const handleAcceptAlert = (alert: AcceptedAlert) => {
      setAcceptedAlert(alert);
      setIncomingAlert(null);
      setActiveTab('map');
    };

    const handleAcceptIncomingAlert = async () => {
      if (!incomingAlert) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update alert status to ACCEPTED
      await supabase
        .from('alerts')
        .update({
          status: 'ACCEPTED',
          current_responder_id: user.id
        })
        .eq('id', incomingAlert.id);

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

      // Add this responder to notified list and escalate
      await supabase
        .from('alerts')
        .update({
          notified_responder_ids: [...(incomingAlert.current_responder_id ? [incomingAlert.current_responder_id] : []), user.id]
        })
        .eq('id', incomingAlert.id);

      await escalateAlert(incomingAlert);
      setIncomingAlert(null);
    };

    const handleTimeoutIncomingAlert = async () => {
      if (!incomingAlert) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Mark as timed out and escalate
      await supabase
        .from('alerts')
        .update({
          notified_responder_ids: [...(incomingAlert.current_responder_id ? [incomingAlert.current_responder_id] : []), user.id]
        })
        .eq('id', incomingAlert.id);

      await escalateAlert(incomingAlert);
      setIncomingAlert(null);
    };

    return (
        <div className={`flex flex-col lg:flex-row h-screen w-full ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'} font-sans`}>
            {/* Incoming Alert Overlay */}
            {incomingAlert && (
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
                <div className="space-y-4">
                  <button onClick={() => { setActiveTab('home'); setAcceptedAlert(null); }} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'home' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Home className="w-5 h-5 text-white" />Home</button>
                  <button onClick={() => { setActiveTab('alerts'); setAcceptedAlert(null); }} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'alerts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Bell className="w-5 h-5 text-white" />Alerts</button>
                  <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'map' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Map className="w-5 h-5 text-white" />Map</button>
                  <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
                </div>
                <button onClick={onLogout} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-slate-800 mt-auto text-gray-400 hover:text-white"><LogOut className="w-5 h-5" />Log Out</button>
            </nav>

            <div className="flex-grow overflow-auto p-4 lg:p-8">
                {activeTab === 'home' && <ReceiverHome onGoToMap={() => setActiveTab('map')} onGoToSettings={() => setActiveTab('settings')} />}
                {activeTab === 'alerts' && <ReceiverAlerts onAcceptAlert={handleAcceptAlert} />}
                {activeTab === 'map' && <ReceiverTrackingPage darkMode={darkMode} acceptedAlert={acceptedAlert} />}
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
