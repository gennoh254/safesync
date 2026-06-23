import { CircleCheck as CheckCircle, Clock, Phone, X, ShieldAlert, Navigation, Hop as Home, Map as MapIcon, Bell, Settings, Loader as Loader2, Flame, HeartPulse, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { supabase } from '../lib/supabase';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface AlertData {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number;
  longitude: number;
  status: string;
  current_responder_id?: string;
}

interface ResponderInfo {
  id: string;
  name: string;
  email: string;
  latitude: number;
  longitude: number;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AlertSentDashboard({ onCancel, darkMode, setActiveTab, emergencyType, onAlertAccepted }: { onCancel: () => void, darkMode: boolean, setActiveTab: (tab: 'home' | 'alerts' | 'map' | 'settings') => void, emergencyType: string | null, onAlertAccepted: (alertId: string) => void }) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [alertData, setAlertData] = useState<AlertData | null>(null);
  const [responder, setResponder] = useState<ResponderInfo | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusStep, setStatusStep] = useState<'transmitted' | 'accepted'>('transmitted');

  useEffect(() => {
    let mounted = true;

    const fetchLatestAlert = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: alerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('client_id', user.id)
        .in('status', ['ACTIVE', 'ACCEPTED'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (alerts && alerts.length > 0 && mounted) {
        const alert = alerts[0] as AlertData;
        setAlertData(alert);

        if (alert.status === 'ACCEPTED') {
          setStatusStep('accepted');

          if (alert.current_responder_id) {
            const { data: responderData } = await supabase
              .from('profiles')
              .select('id, name, email, latitude, longitude')
              .eq('id', alert.current_responder_id)
              .maybeSingle();

            if (responderData && alert.latitude && alert.longitude) {
              const dist = haversineDistance(
                alert.latitude,
                alert.longitude,
                responderData.latitude,
                responderData.longitude
              );
              setResponder(responderData as ResponderInfo);
              setDistance(dist);
              setEta(Math.max(1, Math.round(dist / 0.5)));
            }
          }
        } else {
          setStatusStep('transmitted');
          setResponder(null);
          setDistance(null);
          setEta(null);
        }

        setLoading(false);
      } else if (mounted) {
        setLoading(false);
      }
    };

    fetchLatestAlert();

    // Subscribe to alert updates - use async IIFE inside callback to avoid deadlock
    const channel = supabase
      .channel('alert-status-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as AlertData;

            setAlertData(prev => {
              // Only process if this is our alert
              if (prev && updated.id !== prev.id) return prev;

              // Schedule state updates outside the subscription context
              if (updated.status === 'ACCEPTED') {
                setStatusStep('accepted');
                if (updated.current_responder_id) {
                  (async () => {
                    const { data: responderData } = await supabase
                      .from('profiles')
                      .select('id, name, email, latitude, longitude')
                      .eq('id', updated.current_responder_id!)
                      .maybeSingle();

                    if (responderData && updated.latitude && updated.longitude && mounted) {
                      const dist = haversineDistance(
                        updated.latitude,
                        updated.longitude,
                        responderData.latitude,
                        responderData.longitude
                      );
                      setResponder(responderData as ResponderInfo);
                      setDistance(dist);
                      setEta(Math.max(1, Math.round(dist / 0.5)));
                    }

                    // Auto-navigate to alert detail page after acceptance
                    if (mounted) {
                      onAlertAccepted(updated.id);
                    }
                  })();
                } else {
                  // No responder but still accepted - navigate anyway
                  if (mounted) {
                    onAlertAccepted(updated.id);
                  }
                }
              }
              return updated;
            });
          }
        }
      )
      .subscribe();

    // Fallback: poll every 3 seconds to catch missed real-time events
    const pollInterval = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const { data: alerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('client_id', user.id)
        .in('status', ['ACTIVE', 'ACCEPTED'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (alerts && alerts.length > 0 && mounted) {
        const alert = alerts[0] as AlertData;
        setAlertData(alert);

        if (alert.status === 'ACCEPTED' && statusStep === 'transmitted') {
          setStatusStep('accepted');

          if (alert.current_responder_id) {
            const { data: responderData } = await supabase
              .from('profiles')
              .select('id, name, email, latitude, longitude')
              .eq('id', alert.current_responder_id)
              .maybeSingle();

            if (responderData && alert.latitude && alert.longitude && mounted) {
              const dist = haversineDistance(
                alert.latitude,
                alert.longitude,
                responderData.latitude,
                responderData.longitude
              );
              setResponder(responderData as ResponderInfo);
              setDistance(dist);
              setEta(Math.max(1, Math.round(dist / 0.5)));
            }
          }

          // Auto-navigate to alert detail page after acceptance
          if (mounted) {
            onAlertAccepted(alert.id);
          }
        }
      }
    }, 3000);

    return () => {
      mounted = false;
      channel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  if (loading) {
    return (
      <div className={`flex flex-col flex-grow w-full max-w-md items-center justify-center gap-4 ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans p-8`}>
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-gray-500 text-sm">Loading alert status...</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col flex-grow w-full max-w-md ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans relative`}>
        {showConfirmCancel && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className={`p-6 rounded-lg shadow-xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
                    <h2 className="text-lg font-bold mb-4">Confirm Cancellation</h2>
                    <p className="mb-6 text-sm">Are you sure you want to cancel this emergency alert? This action cannot be undone.</p>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setShowConfirmCancel(false)} className={`py-2 px-4 rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>Back</button>
                        <button onClick={onCancel} className="py-2 px-4 rounded bg-red-600 text-white font-bold">Confirm Cancel</button>
                    </div>
                </div>
            </div>
        )}
        <div className="flex-grow p-4">
          <div className="text-center mb-4">
            <div className={`inline-flex p-3 rounded-full ${
              alertData?.emergency_type === 'FIRE'
                ? 'bg-orange-100 border-orange-200'
                : alertData?.emergency_type === 'MEDICAL'
                ? 'bg-red-100 border-red-200'
                : 'bg-purple-100 border-purple-200'
            } border mb-2`}>
              {alertData?.emergency_type === 'FIRE' ? (
                <Flame className="w-8 h-8 text-orange-500" />
              ) : alertData?.emergency_type === 'MEDICAL' ? (
                <HeartPulse className="w-8 h-8 text-red-500" />
              ) : (
                <Layers className="w-8 h-8 text-purple-500" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-red-500 tracking-tight uppercase">
              {alertData?.emergency_type === 'FIRE'
                ? 'Fire'
                : alertData?.emergency_type === 'MEDICAL'
                ? 'Medical'
                : 'Other Catastrophies'} Alert Confirmed
            </h1>
            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                Help is arriving at your venue.
            </p>
          </div>

          {/* Responder Info Card */}
          {statusStep === 'accepted' && responder && (
            <div className={`${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4 mb-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-gray-400">Assigned Responder</span>
                <span className="text-xs font-bold text-green-500 flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  EN ROUTE
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                  <Navigation className="w-6 h-6 text-white" />
                </div>
                <div className="flex-grow">
                  <p className="font-bold">{responder.name}</p>
                  <p className="text-sm text-gray-500">{responder.email}</p>
                </div>
                <a
                  href={`tel:${responder.email}`}
                  className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center"
                >
                  <Phone className="w-5 h-5 text-white" />
                </a>
              </div>
            </div>
          )}

          {/* ETA Display */}
          {statusStep === 'accepted' && eta !== null && (
            <div className="flex items-center justify-between mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-red-500" />
                <span className="font-bold text-red-700">Estimated Time</span>
              </div>
              <span className="text-2xl font-bold text-red-600">
                {eta ? `${eta} min` : 'Calculating...'}
              </span>
            </div>
          )}

          {/* Distance Display */}
          {statusStep === 'accepted' && distance !== null && (
            <div className="text-center mb-4">
              <span className="text-sm text-gray-500">Responder is </span>
              <span className="font-bold text-blue-600">{distance.toFixed(1)} km</span>
              <span className="text-sm text-gray-500"> away</span>
            </div>
          )}

          {/* Map */}
          <div className="border border-gray-200/50 rounded-2xl mb-4 h-64 relative overflow-hidden shadow-sm">
            <APIProvider apiKey={API_KEY} version="weekly">
                <Map
                    defaultCenter={alertData?.latitude && alertData?.longitude
                      ? { lat: alertData.latitude, lng: alertData.longitude }
                      : { lat: -1.2921, lng: 36.8219 }}
                    defaultZoom={15}
                    mapId="ALERT_MAP_ID"
                    style={{width: '100%', height: '100%'}}
                    gestureHandling={'greedy'}
                    disableDefaultUI={false}
                    zoomControl={true}
                    mapTypeControl={true}
                    fullscreenControl={true}
                    className="rounded-2xl"
                >
                    {/* Client/Alert marker */}
                    {alertData?.latitude && alertData?.longitude && (
                      <AdvancedMarker position={{ lat: alertData.latitude, lng: alertData.longitude }}>
                        <div className="relative">
                          <div className="w-10 h-10 bg-red-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                            <Home className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      </AdvancedMarker>
                    )}
                    {/* Responder marker - only show when accepted */}
                    {responder && statusStep === 'accepted' && (
                      <AdvancedMarker position={{ lat: responder.latitude, lng: responder.longitude }}>
                        <div className="relative">
                          <div className="w-9 h-9 bg-blue-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center animate-pulse">
                            <Navigation className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      </AdvancedMarker>
                    )}
                </Map>
            </APIProvider>
          </div>

          {/* Status Message */}
          {statusStep === 'transmitted' && (
            <div className="text-center mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Bell className="w-5 h-5 text-yellow-600" />
                <span className="font-bold text-yellow-700">ALERT TRANSMITTED</span>
              </div>
              <p className="text-sm text-yellow-600">Emergency alert sent to responders</p>
            </div>
          )}

          {statusStep === 'accepted' && responder && (
            <div className="text-center mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-bold text-green-700">ALERT ACCEPTED</span>
              </div>
              <p className="text-sm text-green-600">{responder.name} has acknowledged and is en route</p>
            </div>
          )}

          {statusStep === 'accepted' ? (
            <button onClick={() => setActiveTab('map')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded font-bold transition-all text-sm flex items-center justify-center gap-2">
              <MapIcon className="w-5 h-5" />
              VIEW MAP
            </button>
          ) : (
            <button onClick={() => setShowConfirmCancel(true)} className={`w-full ${darkMode ? 'bg-gray-900 text-gray-300 border-gray-700' : 'bg-gray-200 text-gray-800 border-gray-300'} border py-3 rounded font-bold hover:bg-gray-800 transition-all text-sm`}>
              Cancel Alert
            </button>
          )}
        </div>
    </div>
  );
}
