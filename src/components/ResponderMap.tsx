import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation, Hop as Home, Loader as Loader2, CircleAlert as AlertCircle, Phone, CircleCheck as CheckCircle, Flame, HeartPulse, CircleAlert as AlertTriangle, User, MapPin, CircleAlert as AlertCircle } from 'lucide-react';
import { SimpleMapView } from './SimpleMapView';

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

  // Set selected alert from acceptedAlert prop
  useEffect(() => {
    if (acceptedAlert) {
      setSelectedAlert({
        id: acceptedAlert.id,
        emergency_type: acceptedAlert.emergency_type,
        location: acceptedAlert.location,
        latitude: acceptedAlert.latitude,
        longitude: acceptedAlert.longitude,
        status: 'ACCEPTED',
        client_id: acceptedAlert.client_id,
        created_at: new Date().toISOString()
      });
    }
  }, [acceptedAlert]);

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
              setLocationError('Location access denied — using default location (Nairobi)');
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        } else {
          setResponderLocation({ lat: -1.2921, lng: 36.8219 });
          setLocationError('Geolocation not supported — using default location (Nairobi)');
        }

        // Fetch active alerts with location data
        const { data, error: fetchError } = await supabase
          .from('alerts')
          .select('*')
          .eq('status', 'ACCEPTED')
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
        .eq('status', 'ACCEPTED')
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
    return <AlertTriangleIcon className="w-4 h-4 text-white" />;
  };

  // Separate alert icon component for inline use
  const AlertTriangleIcon = AlertCircle;

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

  // Prepare locations for the simple map
  const mapLocations = alerts
    .filter(a => !selectedAlert || a.id !== selectedAlert.id)
    .map(alert => ({
      lat: alert.latitude,
      lng: alert.longitude,
      name: alert.emergency_type,
      type: 'client' as const,
      id: alert.id
    }));

  // Add selected alert to map if exists
  if (selectedAlert && selectedAlert.latitude && selectedAlert.longitude) {
    mapLocations.push({
      lat: selectedAlert.latitude,
      lng: selectedAlert.longitude,
      name: selectedAlert.emergency_type,
      type: 'client' as const,
      id: selectedAlert.id
    });
  }

  return (
    <div className={`flex flex-col flex-grow w-full h-full ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans`}>
      {locationError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded p-2 mb-3">
          {locationError}
        </div>
      )}

      {/* Map */}
      <div className="h-64 lg:h-[350px] relative overflow-hidden rounded-lg border border-gray-700">
        <SimpleMapView
          centerLat={selectedAlert?.latitude || responderLocation.lat}
          centerLng={selectedAlert?.longitude || responderLocation.lng}
          locations={mapLocations}
          title={selectedAlert ? `${selectedAlert.emergency_type} Emergency - ${selectedAlert.location}` : 'Responder View'}
          mode="responder"
        />

        {/* Overlay for selected alert */}
        {selectedAlert && (
          <div className={`absolute top-2 left-2 right-2 p-2 rounded-lg shadow-md ${getAlertColor(selectedAlert.emergency_type)} text-white`}>
            <div className="flex items-center gap-2">
              {getAlertIcon(selectedAlert.emergency_type)}
              <span className="font-bold text-sm uppercase">{selectedAlert.emergency_type} Emergency</span>
            </div>
          </div>
        )}
      </div>

      {/* Selected alert detail / Info panel */}
      <div className="p-4">
        {selectedAlert ? (
          <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg">
                  {selectedAlert.emergency_type === 'FIRE' ? 'Building Fire' :
                   selectedAlert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Emergency'}
                </h3>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" />
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
                  ? 'Click on an alert to see details'
                  : 'No active alerts to respond to'}
              </span>
              {alerts.length > 0 && (
                <span className="text-blue-600 font-bold">{alerts.length} pending</span>
              )}
            </div>

            {/* Alert list */}
            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map(alert => {
                  const dist = haversineDistance(responderLocation.lat, responderLocation.lng, alert.latitude, alert.longitude);
                  return (
                    <button
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className={`w-full p-3 rounded-lg flex items-center justify-between ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50 border border-gray-200'} transition-colors`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${getAlertColor(alert.emergency_type)} flex items-center justify-center`}>
                          {getAlertIcon(alert.emergency_type)}
                        </div>
                        <div className="text-left">
                          <p className="font-bold">{alert.emergency_type}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[200px]">{alert.location}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">{dist.toFixed(1)} km</p>
                        <p className="text-xs text-gray-500">~{Math.max(1, Math.round(dist / 0.5))} min</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded p-3">
          {error}
        </div>
      )}
    </div>
  );
}
