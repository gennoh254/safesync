import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation, Hop as Home, Loader as Loader2, CircleAlert as AlertCircle, MapPin, Users } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || '';

interface ResponderLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  last_location_update: string | null;
  on_duty: boolean;
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

export function ClientMap() {
  const [clientLocation, setClientLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [responders, setResponders] = useState<ResponderLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Get client's real location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              if (!mounted) return;
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              setClientLocation({ lat, lng });

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
              setClientLocation({ lat: -1.2921, lng: 36.8219 });
              setLocationError('Location access denied — using default location (Nairobi)');
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        } else {
          setClientLocation({ lat: -1.2921, lng: 36.8219 });
          setLocationError('Geolocation not supported — using default location (Nairobi)');
        }

        // Fetch online responders (on_duty = true with valid coordinates)
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id, name, latitude, longitude, last_location_update, on_duty')
          .eq('user_type', 'Responder')
          .eq('on_duty', true)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);

        if (fetchError) throw fetchError;
        if (mounted) setResponders((data || []) as ResponderLocation[]);
      } catch (err: any) {
        if (mounted) setError(err.message ?? 'Failed to load map data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    // Subscribe to profile changes for real-time responder status updates
    const channel = supabase
      .channel('client-map-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.new && (payload.new as any).user_type === 'Responder') {
            const newData = payload.new as any;
            // Update responders list based on on_duty status
            setResponders((prev) => {
              const filtered = prev.filter((r) => r.id !== newData.id);
              if (newData.on_duty && newData.latitude && newData.longitude) {
                return [...filtered, {
                  id: newData.id,
                  name: newData.name,
                  latitude: newData.latitude,
                  longitude: newData.longitude,
                  last_location_update: newData.last_location_update,
                  on_duty: newData.on_duty
                }];
              }
              return filtered;
            });
          }
        }
      )
      .subscribe();

    // Periodically refresh responder list
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, latitude, longitude, last_location_update, on_duty')
        .eq('user_type', 'Responder')
        .eq('on_duty', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (mounted && data) setResponders(data as ResponderLocation[]);
    }, 15000);

    // Timeout to detect if map fails to load (API key issues)
    const mapTimeout = setTimeout(() => {
      if (API_KEY && mounted && !mapLoadError) {
        // Check if Google Maps loaded successfully by looking for the google object
        if (typeof (window as any).google === 'undefined' || !(window as any).google?.maps) {
          setMapLoadError('Google Maps failed to load. The API key may have restrictions or is invalid.');
        }
      }
    }, 5000);

    return () => {
      mounted = false;
      channel.unsubscribe();
      clearInterval(interval);
      clearTimeout(mapTimeout);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col flex-grow w-full h-full items-center justify-center gap-4 p-8">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-gray-500 text-sm">Loading map...</p>
      </div>
    );
  }

  if (!clientLocation) {
    return (
      <div className="flex flex-col flex-grow w-full h-full items-center justify-center gap-4 p-8">
        <AlertCircle className="w-8 h-8 text-gray-400" />
        <p className="text-gray-500 text-sm">Unable to determine location</p>
      </div>
    );
  }

  const nearestResponder = responders.length > 0
    ? responders.reduce((nearest, r) => {
        const dist = haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude);
        return dist < nearest.dist ? { responder: r, dist } : nearest;
      }, { responder: responders[0], dist: Infinity })
    : null;

  // Render fallback if Google Maps API key is missing or map failed to load
  if (!API_KEY || mapLoadError) {
    return (
      <div className="flex flex-col w-full h-full">
        {locationError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded p-2 mb-3">
            {locationError}
          </div>
        )}
        {mapLoadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2 mb-3">
            {mapLoadError}
          </div>
        )}
        <div className="flex-grow rounded-lg border border-gray-300 bg-gray-100 flex flex-col items-center justify-center p-8">
          <MapPin className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-bold text-gray-700 mb-2">Map Unavailable</h3>
          <p className="text-gray-500 text-center text-sm mb-4">
            {!API_KEY
              ? 'Google Maps API key is not configured. Contact your administrator.'
              : 'Unable to load Google Maps. The API key may have restrictions.'}
          </p>
          <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md">
            <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Online Responders ({responders.length})
            </h4>
            {responders.length === 0 ? (
              <p className="text-gray-500 text-sm">No responders currently online. When a responder goes on-duty and shares their location, they will appear here.</p>
            ) : (
              <div className="space-y-2">
                {responders.map((r) => {
                  const dist = haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude);
                  return (
                    <div key={r.id} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                      <span className="font-medium text-gray-800">{r.name}</span>
                      <span className="text-sm text-blue-600 font-bold">{dist.toFixed(1)} km away</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4 text-center">
              Your location: {clientLocation.lat.toFixed(4)}, {clientLocation.lng.toFixed(4)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-grow w-full h-full">
      {locationError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded p-2 mb-3">
          {locationError}
        </div>
      )}

      {mapLoadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2 mb-3">
          {mapLoadError}
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Help Status</h2>
        {nearestResponder && (
          <div className="bg-red-900/30 text-red-500 px-3 py-1 rounded text-xs font-bold border border-red-900/50">
            ETA: {Math.max(1, Math.round(nearestResponder.dist / 0.5))} MINS
          </div>
        )}
      </div>

      <div className="relative flex-grow rounded-lg border border-gray-800 overflow-hidden" style={{ minHeight: '400px' }}>
        <APIProvider
          apiKey={API_KEY}
          version="weekly"
          onError={(e: Error) => {
            console.error('Google Maps API error:', e);
            setMapLoadError('Failed to load Google Maps. The API key may have access restrictions. Please check the Google Cloud Console.');
          }}
        >
          <Map
            defaultCenter={clientLocation}
            defaultZoom={14}
            style={{ width: '100%', height: '100%', minHeight: '400px' }}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="rounded-lg"
          >
            {/* Client marker */}
            <AdvancedMarker position={clientLocation}>
              <div className="relative">
                <div className="w-10 h-10 bg-red-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                  <Home className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                  YOU
                </div>
              </div>
            </AdvancedMarker>

            {/* Responder markers */}
            {responders.map((r) => {
              const dist = haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude);
              return (
                <AdvancedMarker key={r.id} position={{ lat: r.latitude, lng: r.longitude }}>
                  <div className="relative">
                    <div className="w-9 h-9 bg-blue-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center animate-pulse">
                      <Navigation className="w-4 h-4 text-white" />
                    </div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
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

        {responders.length > 0 && (
          <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm">
            {responders.length} RESPONDER{responders.length !== 1 ? 'S' : ''} ONLINE
          </div>
        )}
      </div>

      {/* Info panel */}
      <div className="mt-4 bg-gray-900 border border-gray-800 p-4 rounded-lg text-center">
        {nearestResponder ? (
          <>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Nearest responder en route</p>
            <p className="text-xl font-bold text-white mt-1">
              {nearestResponder.dist.toFixed(1)} km away
            </p>
          </>
        ) : responders.length > 0 ? (
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Responders available</p>
        ) : (
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">No responders online yet</p>
        )}
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded p-3">
          {error}
        </div>
      )}
    </div>
  );
}
