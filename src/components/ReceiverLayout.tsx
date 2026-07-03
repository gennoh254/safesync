import { useState, useEffect, useCallback, useRef } from 'react';
import { Hop as Home, Bell, Map, Settings, LogOut, Volume2, BellRing, Users } from 'lucide-react';
import { ReceiverAlerts } from './ReceiverAlerts';
import { ReceiverHome } from './ReceiverHome';
import { ReceiverTrackingPage } from './ReceiverTrackingPage';
import { ReceiverSettings, getResponderSoundEnabled, SOUND_PREF_KEY } from './ReceiverSettings';
import { ResponderOrgTracking } from './ResponderOrgTracking';
import { IncomingAlertOverlay } from './IncomingAlertOverlay';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { unlockAudio, isAudioUnlocked, getAudioCtx } from '../hooks/useEmergencyAlert';
import { usePushNotifications } from '../context/PushNotificationContext';

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
  description?: string | null;
}

// Helper to convert string/number to number (Postgres numeric returns strings)
function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === 'string' ? parseFloat(val) : typeof val === 'number' ? val : null;
  return num !== null && !isNaN(num) ? num : null;
}

interface ReceiverLayoutProps {
  onLogout: () => void;
}

const ALERT_TIMEOUT_SECONDS = 120; // 2 minutes

export function ReceiverLayout({ onLogout }: ReceiverLayoutProps) {
    const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'map' | 'tracking' | 'settings'>('home');
    const [acceptedAlert, setAcceptedAlert] = useState<AcceptedAlert | null>(null);
    const [incomingAlert, setIncomingAlert] = useState<IncomingAlert | null>(null);
    const [hasActiveAlert, setHasActiveAlert] = useState(false);
    const [showAudioBanner, setShowAudioBanner] = useState(false);
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(() => getResponderSoundEnabled());
    const [isAdmin, setIsAdmin] = useState(false); // True if user created the org (invited_by is null)
    const [organizationName, setOrganizationName] = useState('');
    const { theme } = useTheme();
    const darkMode = theme === 'dark';
    const push = usePushNotifications();

    // Listen for sound preference changes from other tabs/components
    useEffect(() => {
      const handleStorage = (e: StorageEvent) => {
        if (e.key === SOUND_PREF_KEY) {
          setSoundEnabled(e.newValue === 'true');
        }
      };
      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
    }, []);

    // Also poll for changes within same tab
    useEffect(() => {
      const interval = setInterval(() => {
        const currentPref = getResponderSoundEnabled();
        if (currentPref !== soundEnabled) {
          setSoundEnabled(currentPref);
        }
      }, 1000);
      return () => clearInterval(interval);
    }, [soundEnabled]);

    // Use refs to avoid stale closure issues in subscriptions
    const hasActiveAlertRef = useRef(false);
    const incomingAlertRef = useRef<IncomingAlert | null>(null);
    const processedAlertsRef = useRef<Set<string>>(new Set());
    const declineHandlerRef = useRef<(() => void) | null>(null);

    // Keep refs in sync with state
    useEffect(() => {
      hasActiveAlertRef.current = hasActiveAlert;
    }, [hasActiveAlert]);

    useEffect(() => {
      incomingAlertRef.current = incomingAlert;
    }, [incomingAlert]);

    // Check audio unlock state and show banner if needed
    useEffect(() => {
      const unlocked = isAudioUnlocked();
      setAudioUnlocked(unlocked);
      if (!unlocked) setShowAudioBanner(true);

      // Try to unlock audio on first user interaction
      const unlockOnInteraction = () => {
        if (!audioUnlocked) {
          unlockAudio().then((success) => {
            if (success) {
              setAudioUnlocked(true);
              setShowAudioBanner(false);
            }
          });
        }
      };

      // Unlock on any user interaction
      document.addEventListener('click', unlockOnInteraction, { once: true });
      document.addEventListener('touchstart', unlockOnInteraction, { once: true });

      return () => {
        document.removeEventListener('click', unlockOnInteraction);
        document.removeEventListener('touchstart', unlockOnInteraction);
      };
    }, [audioUnlocked]);

    // Listen for messages from the service worker (push notifications hitting the SW)
    useEffect(() => {
      if (!('serviceWorker' in navigator)) return;

      const handleSWMessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'INCOMING_ALERT') {
          const alertData = msg as {
            type: string;
            alertId: string;
            emergencyType: string;
            location: string;
            latitude: number | null;
            longitude: number | null;
            clientId: string;
            createdAt: string;
          };

          if (hasActiveAlertRef.current) return;
          if (processedAlertsRef.current.has(alertData.alertId)) return;

          console.log('[Receiver] SW push message: INCOMING_ALERT', alertData.alertId);
          processedAlertsRef.current.add(alertData.alertId);

          setIncomingAlert({
            id: alertData.alertId,
            emergency_type: alertData.emergencyType,
            location: alertData.location,
            latitude: alertData.latitude,
            longitude: alertData.longitude,
            client_id: alertData.clientId,
            created_at: alertData.createdAt,
            current_responder_id: null,
            notified_responder_ids: null,
            description: (alertData as any).description || null,
          });
        }

        if (msg.type === 'DECLINE_ALERT' && incomingAlertRef.current?.id === msg.alertId) {
          declineHandlerRef.current?.();
        }
      };

      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleUnlockAudio = async () => {
      const success = await unlockAudio();
      if (success) {
        setAudioUnlocked(true);
        setShowAudioBanner(false);
        try { localStorage.setItem('safesync_responder_sound_enabled', 'true'); } catch {}
      }
    };

    // Check if this responder already has an active alert on mount
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

    // Check if user is admin (created the org) and get organization info
    useEffect(() => {
      const checkAdminStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('invited_by, organization_name')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          // Admin = invited_by is null (they created the org)
          const userIsAdmin = profile.invited_by === null;
          setIsAdmin(userIsAdmin);
          setOrganizationName(profile.organization_name || '');
        }
      };

      checkAdminStatus();
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
      let userId: string | undefined;

      const setupSubscription = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('[Receiver] No user found for subscription');
          return;
        }
        userId = user.id;
        console.log('[Receiver] Setting up subscription for user:', userId);

        const handleAlertData = (alertData: any) => {
          console.log('[Receiver] handleAlertData called:', {
            id: alertData?.id,
            current_responder_id: alertData?.current_responder_id,
            userId: userId,
            status: alertData?.status,
            hasActiveAlertRef: hasActiveAlertRef.current,
            processed: processedAlertsRef.current.has(alertData?.id)
          });

          if (!alertData) {
            console.log('[Receiver] Skipping - no alertData');
            return;
          }
          if (alertData.current_responder_id !== userId) {
            console.log('[Receiver] Skipping - not my alert. responder:', alertData.current_responder_id);
            return;
          }
          if (alertData.status !== 'ACTIVE') {
            console.log('[Receiver] Skipping - not ACTIVE:', alertData.status);
            return;
          }
          if (hasActiveAlertRef.current) {
            console.log('[Receiver] Skipping - already has active alert');
            return;
          }
          if (processedAlertsRef.current.has(alertData.id)) {
            console.log('[Receiver] Skipping - already processed');
            return;
          }

          console.log('[Receiver] *** ALERT ASSIGNED TO ME *** - showing overlay:', alertData.id);
          processedAlertsRef.current.add(alertData.id);

          setIncomingAlert({
            id: alertData.id,
            emergency_type: alertData.emergency_type,
            location: alertData.location,
            latitude: toNumber(alertData.latitude),
            longitude: toNumber(alertData.longitude),
            client_id: alertData.client_id,
            created_at: alertData.created_at,
            current_responder_id: alertData.current_responder_id,
            notified_responder_ids: alertData.notified_responder_ids,
            description: alertData.description
          });
        };

        // Listen for both INSERT and UPDATE — edge function may set current_responder_id at creation
        channel = supabase
          .channel(`responder-alerts-v6-${user.id}-${Date.now()}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' },
            (payload) => { console.log('[Receiver] INSERT event received:', payload.new?.id); handleAlertData(payload.new); }
          )
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alerts' },
            (payload) => { console.log('[Receiver] UPDATE event received:', payload.new?.id, 'responder:', (payload.new as any)?.current_responder_id); handleAlertData(payload.new); }
          )
          .subscribe((status) => {
            console.log('[Receiver] Subscription status:', status);
            if (status === 'CHANNEL_ERROR') {
              console.error('[Receiver] Channel error - realtime may not be configured');
            }
            if (status === 'TIMED_OUT') {
              console.error('[Receiver] Subscription timed out');
            }
          });
      };

      setupSubscription();

      // Poll for alerts assigned to this responder (fallback for missed real-time events)
      const pollInterval = setInterval(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('[Receiver] Poll: No user');
          return;
        }
        if (hasActiveAlertRef.current) {
          console.log('[Receiver] Poll: Already has active alert, skipping');
          return;
        }

        const { data, error } = await supabase
          .from('alerts')
          .select('*')
          .eq('status', 'ACTIVE')
          .eq('current_responder_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('[Receiver] Poll error:', error);
          return;
        }

        if (data) {
          console.log('[Receiver] Poll found alert:', data.id, 'incomingAlertRef:', !!incomingAlertRef.current, 'processed:', processedAlertsRef.current.has(data.id));
        }

        if (data && !incomingAlertRef.current && !processedAlertsRef.current.has(data.id)) {
          console.log('[Receiver] *** POLL FOUND ALERT *** - showing overlay:', data.id);
          processedAlertsRef.current.add(data.id);
          setIncomingAlert({
            id: data.id,
            emergency_type: data.emergency_type,
            location: data.location,
            latitude: toNumber(data.latitude),
            longitude: toNumber(data.longitude),
            client_id: data.client_id,
            created_at: data.created_at,
            current_responder_id: data.current_responder_id,
            notified_responder_ids: data.notified_responder_ids,
            description: data.description
          });
        }
      }, 3000); // Poll every 3 seconds

      return () => {
        console.log('[Receiver] Cleaning up subscription');
        if (channel) channel.unsubscribe();
        clearInterval(pollInterval);
      };
    }, []); // Empty dependency array - we use refs for values that change

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

      // Clear from processed set since we're handling it
      processedAlertsRef.current.delete(incomingAlert.id);

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

      // Clear the alert but keep it in processed set so we don't get re-assigned
      setIncomingAlert(null);
    };
    // Keep ref in sync so SW message handler can call it
    declineHandlerRef.current = handleDeclineIncomingAlert;

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

      // Clear the alert but keep it in processed set
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

      // Clear the processed alert when done
      if (acceptedAlert) {
        processedAlertsRef.current.delete(acceptedAlert.id);
      }

      setAcceptedAlert(null);
      setHasActiveAlert(false);
    };

    return (
        <div className={`flex flex-col lg:flex-row h-screen w-full ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'} font-sans`}>
            {/* Push + Audio permission banner */}
            {(push.isSupported && !push.isSubscribed && push.permission !== 'loading') && (
              <div className="fixed top-0 inset-x-0 z-[9998] bg-red-600 text-white px-4 py-3 shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BellRing className="w-5 h-5 shrink-0 animate-bounce" />
                    <span className="text-sm font-bold truncate">
                      Enable notifications to receive emergency alert calls
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {push.permission !== 'denied' && (
                      <button
                        disabled={push.subscribing}
                        onClick={async () => {
                          const ok = await push.subscribe();
                          if (ok) await handleUnlockAudio();
                        }}
                        className={`font-bold text-sm px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                          push.subscribing
                            ? 'bg-white/40 text-white cursor-wait'
                            : 'bg-white text-red-700 hover:bg-red-50'
                        }`}
                      >
                        {push.subscribing ? 'Enabling...' : 'Enable Alerts'}
                      </button>
                    )}
                    <button
                      onClick={() => setShowAudioBanner(false)}
                      className="text-white/70 hover:text-white text-lg px-1 leading-none"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {push.permission === 'denied' && (
                  <p className="text-xs text-white/80 mt-1 pl-8">
                    Blocked by browser. Click the lock icon in the address bar → Notifications → Allow.
                  </p>
                )}
                {push.errorMessage && (
                  <p className="text-xs text-yellow-200 mt-1 pl-8">{push.errorMessage}</p>
                )}
              </div>
            )}

            {/* Incoming Alert Overlay - key ensures fresh component for each new alert */}
            {(() => {
              console.log('[Receiver] Render check - incomingAlert:', !!incomingAlert, 'hasActiveAlert:', hasActiveAlert);
              if (incomingAlert && !hasActiveAlert) {
                console.log('[Receiver] *** RENDERING OVERLAY *** for alert:', incomingAlert.id);
                return (
                  <IncomingAlertOverlay
                    key={incomingAlert.id}
                    alert={incomingAlert}
                    onAccept={handleAcceptIncomingAlert}
                    onDecline={handleDeclineIncomingAlert}
                    onTimeout={handleTimeoutIncomingAlert}
                    duration={ALERT_TIMEOUT_SECONDS}
                    soundEnabled={soundEnabled}
                  />
                );
              }
              return null;
            })()}

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
                  {isAdmin && (
                    <button onClick={() => setActiveTab('tracking')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'tracking' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Users className="w-5 h-5 text-white" />Team</button>
                  )}
                  <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
                </div>
                <button onClick={onLogout} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-slate-800 mt-auto text-gray-400 hover:text-white"><LogOut className="w-5 h-5" />Log Out</button>
            </nav>

            <div className="flex-grow overflow-auto p-4 lg:p-8">
                {activeTab === 'home' && <ReceiverHome onGoToMap={() => setActiveTab('map')} onGoToSettings={() => setActiveTab('settings')} />}
                {activeTab === 'alerts' && <ReceiverAlerts onAcceptAlert={handleAcceptAlert} />}
                {activeTab === 'map' && <ReceiverTrackingPage darkMode={darkMode} acceptedAlert={acceptedAlert} onAlertResolved={handleClearActiveAlert} />}
                {activeTab === 'tracking' && isAdmin && <ResponderOrgTracking darkMode={darkMode} onBack={() => setActiveTab('home')} />}
                {activeTab === 'settings' && <ReceiverSettings isAdmin={isAdmin} organizationName={organizationName} />}
            </div>

            {/* Navbar for Mobile */}
            <nav className={`lg:hidden sticky bottom-0 z-50 grid ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'} bg-[#0B1727] border-t border-slate-800 pt-3 pb-safe text-white`} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <button onClick={() => { setActiveTab('home'); setAcceptedAlert(null); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-400' : 'text-white'}`}><Home className="w-6 h-6" /><span className="text-[10px] font-bold">HOME</span></button>
                <button onClick={() => { setActiveTab('alerts'); setAcceptedAlert(null); }} className={`flex flex-col items-center gap-1 ${activeTab === 'alerts' ? 'text-blue-400' : 'text-white'}`}><Bell className="w-6 h-6" /><span className="text-[10px] font-bold">ALERTS</span></button>
                <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 ${activeTab === 'map' ? 'text-blue-400' : 'text-white'}`}><Map className="w-6 h-6" /><span className="text-[10px] font-bold">MAP</span></button>
                {isAdmin && (
                  <button onClick={() => setActiveTab('tracking')} className={`flex flex-col items-center gap-1 ${activeTab === 'tracking' ? 'text-blue-400' : 'text-white'}`}><Users className="w-6 h-6" /><span className="text-[10px] font-bold">TEAM</span></button>
                )}
                <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-400' : 'text-white'}`}><Settings className="w-6 h-6" /><span className="text-[10px] font-bold">SETTINGS</span></button>
                <button onClick={onLogout} className="flex flex-col items-center gap-1 text-gray-400"><LogOut className="w-6 h-6" /><span className="text-[10px] font-bold">LOGOUT</span></button>
            </nav>
        </div>
    );
}
