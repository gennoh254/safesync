import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation, Hop as Home, Loader as Loader2, CircleAlert as AlertCircle, Phone, CircleCheck as CheckCircle, Flame, HeartPulse, CircleAlert as AlertTriangle, User } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface AlertLocation {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number;
  longitude: number;
  status: string;
  client_id: string;
  created_at: string;
}

interface AcceptedAlert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number;
  longitude: number;
  client_id: string;
}

interface ClientInfo {
  id: string;
  name: string;
  email: string;
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

export function ResponderMap({ darkMode, acceptedAlert }: { darkMode: boolean; acceptedAlert?: AcceptedAlert | null }) {
  const [responderLocation, setResponderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [alerts, setAlerts] = useState<AlertLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertLocation | null>(acceptedAlert || null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);

  // Fetch client info when selected alert changes
  useEffect(() => {
    const fetchClientInfo = async () => {
      if (selectedAlert?.client_id) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('id', selectedAlert.client_id)
          .maybeSingle();
        if (data) setClientInfo(data as ClientInfo);
      }
    };
    fetchClientInfo();
  }, [selectedAlert?.client_id]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Get responder's real location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              if (!mounted) return;
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              setResponderLocation({ lat, lng });

              // Update profile with current location and timestamp
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase
                  .from('profiles')
                  .update({
                    latitude: lat,
                    longitude: lng,
                    last_location_update: new Date().toISOString()
                  })
                  .eq('id', user.id);
              }
            },
            () => {
              if (!mounted) return;
              setResponderLocation({ lat: -1.2921, lng: 36.8219 });
              setLocationError('Location access denied — using default location');
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        } else {
          setResponderLocation({ lat: -1.2921, lng: 36.8219 });
          setLocationError('Geolocation not supported — using default location');
        }

        // Fetch active alerts with location data
        const { data, error: fetchError } = await supabase
          .from('alerts')
          .select('*')
          .eq('status', 'ACTIVE')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        if (mounted) setAlerts((data || []) as AlertLocation[]);
      } catch (err: any) {
        if (mounted) setError(err.message ?? 'Failed to load map data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    // Subscribe to alert changes for real-time updates
    const channel = supabase
      .channel('responder-map-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    async function fetchAlerts() {
      const { data } = await supabase
        .from('alerts')
        .select('*')
        .eq('status', 'ACTIVE')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('created_at', { ascending: false });
      if (mounted && data) setAlerts(data as AlertLocation[]);
    }

    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, []);

  const handleResolveAlert = async (alertId: string) => {
    try {
      const { error: err } = await supabase
        .from('alerts')
        .update({ status: 'RESOLVED' })
        .eq('id', alertId);
      if (err) throw err;
      setAlerts(alerts.filter(a => a.id !== alertId));
      setSelectedAlert(null);
      setClientInfo(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to resolve alert');
    }
  };

  const getAlertIcon = (type: string) => {
    if (type === 'FIRE') return <Flame className="w-4 h-4 text-white" />;
    if (type === 'MEDICAL') return <HeartPulse className="w-4 h-4 text-white" />;
    return <AlertTriangle className="w-4 h-4 text-white" />;
  };

  const getAlertColor = (type: string) => {
    if (type === 'FIRE') return 'bg-orange-500';
    if (type === 'MEDICAL') return 'bg-red-600';
    return 'bg-yellow-500';
  };

  if (loading) {
    return (
      <div className={`flex flex-col flex-grow w-full h-full items-center justify-center gap-4 p-8 ${darkMode ? 'bg-black text-white' : 'bg-white text-black'}`}>
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-gray-500 text-sm">Loading map...</p>
      </div>
    );
  }

  if (!responderLocation) {
    return (
      <div className={`flex flex-col flex-grow w-full h-full items-center justify-center gap-4 p-8 ${darkMode ? 'bg-black text-white' : 'bg-white text-black'}`}>
        <AlertCircle className="w-8 h-8 text-gray-400" />
        <p className="text-gray-500 text-sm">Unable to determine location</p>
      </div>
    );
  }

  const distanceToSelected = selectedAlert && selectedAlert.latitude && selectedAlert.longitude
    ? haversineDistance(responderLocation.lat, responderLocation.lng, selectedAlert.latitude, selectedAlert.longitude)
    : null;

  return (
    <div className={`flex flex-col flex-grow w-full h-full ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans`}>
      {locationError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded p-2 mb-3">
          {locationError}
        </div>
      )}

      {/* Map */}
      <div className="h-64 lg:h-[500px] relative overflow-hidden rounded-lg border border-gray-200">
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            defaultCenter={selectedAlert?.latitude && selectedAlert?.longitude
              ? { lat: selectedAlert.latitude, lng: selectedAlert.longitude }
              : responderLocation}
            defaultZoom={14}
            mapId="RESPONDER_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
            gestureHandling="greedy"
            disableDefaultUI={false}
          >
            {/* Responder marker (self) */}
            <AdvancedMarker position={responderLocation}>
              <div className="relative">
                <div className="w-10 h-10 bg-blue-500 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                  YOU
                </div>
              </div>
            </AdvancedMarker>

            {/* Selected/target alert marker */}
            {selectedAlert && selectedAlert.latitude && selectedAlert.longitude && (
              <AdvancedMarker position={{ lat: selectedAlert.latitude, lng: selectedAlert.longitude }}>
                <div className="relative">
                  <div className={`w-12 h-12 ${getAlertColor(selectedAlert.emergency_type)} rounded-full border-4 border-white shadow-lg flex items-center justify-center animate-pulse`}>
                    {getAlertIcon(selectedAlert.emergency_type)}
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                    {selectedAlert.emergency_type}
                  </div>
                </div>
              </AdvancedMarker>
            )}

            {/* Other alert markers */}
            {alerts.filter(a => !selectedAlert || a.id !== selectedAlert.id).map((alert) => {
              const dist = haversineDistance(responderLocation.lat, responderLocation.lng, alert.latitude, alert.longitude);
              return (
                <AdvancedMarker
                  key={alert.id}
                  position={{ lat: alert.latitude, lng: alert.longitude }}
                  onClick={() => setSelectedAlert(alert)}
                >
                  <div className="relative cursor-pointer">
                    <div className={`w-9 h-9 ${getAlertColor(alert.emergency_type)} rounded-full border-3 border-white shadow-lg flex items-center justify-center`}>
                      {getAlertIcon(alert.emergency_type)}
                    </div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                      {dist.toFixed(1)} km
                    </div>
                  </div>
                </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>

        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-gray-700 shadow-sm border border-gray-100">
          LIVE STATUS
        </div>

        {alerts.length > 0 && !selectedAlert && (
          <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm">
            {alerts.length} ACTIVE ALERT{alerts.length !== 1 ? 'S' : ''}
          </div>
        )}
      </div>

      {/* Selected alert detail / Info panel */}
      <div className="p-6">
        {selectedAlert ? (
          <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg">
                  {selectedAlert.emergency_type === 'FIRE' ? 'Building Fire' :
                   selectedAlert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Emergency'}
                </h3>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <Home className="w-3 h-3" />
                  {selectedAlert.location}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getAlertColor(selectedAlert.emergency_type)} text-white`}>
                {selectedAlert.emergency_type}
              </span>
            </div>

            {/* Distance and ETA */}
            <div className={`flex items-center justify-between p-3 rounded-lg mb-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div>
                <span className="text-sm text-gray-500">Distance</span>
                <p className="font-bold text-lg">
                  {distanceToSelected ? `${distanceToSelected.toFixed(1)} km` : 'Calculating...'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500">ETA</span>
                <p className="font-bold text-lg text-blue-600">
                  ~{distanceToSelected ? Math.max(1, Math.round(distanceToSelected / 0.5)) : '?'} mins
                </p>
              </div>
            </div>

            {/* Client Info */}
            {clientInfo && (
              <div className={`flex items-center gap-3 p-3 rounded-lg mb-4 ${darkMode ? 'bg-gray-800' : 'bg-white border border-gray-100'}`}>
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-grow">
                  <p className="font-bold">{clientInfo.name}</p>
                  <p className="text-xs text-gray-500">{clientInfo.email}</p>
                </div>
                <a
                  href={`mailto:${clientInfo.email}`}
                  className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors"
                >
                  <Phone className="w-5 h-5 text-white" />
                </a>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleResolveAlert(selectedAlert.id)}
                className="flex-grow bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                RESOLVE
              </button>
              <button
                onClick={() => { setSelectedAlert(null); setClientInfo(null); }}
                className="px-4 bg-gray-200 hover:bg-gray-300 rounded-xl text-gray-700 transition-colors font-bold"
              >
                BACK
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-4">Responder View</h2>
            <div className={`p-4 rounded-lg flex items-center justify-between mb-6 ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
              <span className="text-gray-600">
                {alerts.length > 0
                  ? 'Click on an alert marker to see details'
                  : 'No active alerts to respond to'}
              </span>
              {alerts.length > 0 && (
                <span className="text-blue-600 font-bold">{alerts.length} pending</span>
              )}
            </div>
            {alerts.length > 0 && (
              <p className="text-sm text-gray-500 text-center">
                Select a marker on the map to view emergency details
              </p>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mx-6 mb-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded p-3">
          {error}
        </div>
      )}
    </div>
  );
}
