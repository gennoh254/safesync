import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader as Loader2, CircleAlert as AlertCircle, Users, MapPin, Navigation } from 'lucide-react';
import { SimpleMapView } from './SimpleMapView';

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

    return () => {
      mounted = false;
      channel.unsubscribe();
      clearInterval(interval);
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

  // Prepare locations for the simple map
  const mapLocations = responders.map(r => ({
    lat: r.latitude,
    lng: r.longitude,
    name: r.name,
    type: 'responder' as const,
    id: r.id
  }));

  return (
    <div className="flex flex-col flex-grow w-full h-full">
      {locationError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded p-2 mb-3">
          {locationError}
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Help Status</h2>
        {nearestResponder && (
          <div className="bg-green-900/30 text-green-500 px-3 py-1 rounded text-xs font-bold border border-green-900/50">
            ETA: ~{Math.max(1, Math.round(nearestResponder.dist / 0.5))} MINS
          </div>
        )}
      </div>

      {/* Simple Map View */}
      <div className="flex-grow rounded-lg border border-gray-700 overflow-hidden" style={{ minHeight: '350px' }}>
        <SimpleMapView
          centerLat={clientLocation.lat}
          centerLng={clientLocation.lng}
          locations={mapLocations}
          title={nearestResponder ? `${nearestResponder.responder.name} en route` : 'Waiting for responders'}
          mode="client"
        />
      </div>

      {/* Info panel */}
      <div className="mt-4 bg-gray-900 border border-gray-800 p-4 rounded-lg text-center">
        {nearestResponder ? (
          <>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Nearest responder en route</p>
            <p className="text-xl font-bold text-white mt-1">
              {nearestResponder.responder.name}
            </p>
            <p className="text-blue-400 font-bold">
              {nearestResponder.dist.toFixed(2)} km away
            </p>
          </>
        ) : responders.length > 0 ? (
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Responders available but not on-duty</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">No responders online yet</p>
            <p className="text-xs text-gray-500">When responders go on-duty and share their location, they will appear here</p>
          </div>
        )}
      </div>

      {/* Responder list */}
      {responders.length > 0 && (
        <div className="mt-4 bg-gray-900 border border-gray-800 p-4 rounded-lg">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Online Responders ({responders.length})
          </h3>
          <div className="space-y-2">
            {responders.map(r => {
              const dist = haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude);
              return (
                <div key={r.id} className="flex justify-between items-center bg-gray-800 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <Navigation className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-medium text-white">{r.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-blue-400 font-bold text-sm">{dist.toFixed(2)} km</span>
                    <p className="text-xs text-gray-500">~{Math.max(1, Math.round(dist / 0.5))} min ETA</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded p-3">
          {error}
        </div>
      )}
    </div>
  );
}
