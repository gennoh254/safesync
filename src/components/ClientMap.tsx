import { APIProvider, Map, AdvancedMarker, Polyline } from '@vis.gl/react-google-maps';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation, Hop as Home, Loader as Loader2, CircleAlert as AlertCircle, Users } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface ResponderLocation {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  last_location_update: string | null;
}

interface RouteInfo {
  distance: number;
  duration: number;
  polyline: Array<{ lat: number; lng: number }>;
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

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const poly = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return poly;
}

export function ClientMap() {
  const [clientLocation, setClientLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [responders, setResponders] = useState<ResponderLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [activeAlertResponder, setActiveAlertResponder] = useState<ResponderLocation | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(14);
  const prevResponderRef = useRef<ResponderLocation | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Get active alert if it exists
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: alerts } = await supabase
            .from('alerts')
            .select('*')
            .eq('client_id', user.id)
            .eq('status', 'ACCEPTED')
            .order('created_at', { ascending: false })
            .limit(1);

          if (alerts && alerts.length > 0 && mounted) {
            setActiveAlert(alerts[0]);

            // Get responder info for this alert
            if (alerts[0].current_responder_id) {
              const { data: responderData } = await supabase
                .from('profiles')
                .select('id, name, latitude, longitude')
                .eq('id', alerts[0].current_responder_id)
                .maybeSingle();

              if (responderData && mounted) {
                setActiveAlertResponder({
                  id: responderData.id,
                  name: responderData.name,
                  latitude: toNum(responderData.latitude),
                  longitude: toNum(responderData.longitude),
                  last_location_update: null,
                });
              }
            }
          }
        }

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
        if (mounted) setResponders(
          (data || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            latitude: toNum(r.latitude),
            longitude: toNum(r.longitude),
            last_location_update: r.last_location_update,
          })).filter((r: ResponderLocation) => r.latitude !== null && r.longitude !== null)
        );
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
              const lat = toNum(newData.latitude);
              const lng = toNum(newData.longitude);
              if (newData.on_duty && lat !== null && lng !== null) {
                return [...filtered, {
                  id: newData.id,
                  name: newData.name,
                  latitude: lat,
                  longitude: lng,
                  last_location_update: newData.last_location_update
                }];
              }
              return filtered;
            });

            // Update active alert responder location if this is them
            const newLat = toNum(newData.latitude);
            const newLng = toNum(newData.longitude);
            if (activeAlertResponder && newData.id === activeAlertResponder.id && newLat !== null && newLng !== null) {
              setActiveAlertResponder({
                ...activeAlertResponder,
                latitude: newLat,
                longitude: newLng
              });
            }
          }
        }
      )
      .subscribe();

    // Subscribe to alert changes
    const alertChannel = supabase
      .channel('client-alert-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        async (payload) => {
          if (payload.new && (payload.new as any).status === 'ACCEPTED' && mounted) {
            setActiveAlert(payload.new);

            // Fetch responder data for the accepted alert
            if ((payload.new as any).current_responder_id) {
              const { data: responderData } = await supabase
                .from('profiles')
                .select('id, name, latitude, longitude')
                .eq('id', (payload.new as any).current_responder_id)
                .maybeSingle();

              if (responderData && mounted) {
                setActiveAlertResponder({
                  id: responderData.id,
                  name: responderData.name,
                  latitude: toNum(responderData.latitude),
                  longitude: toNum(responderData.longitude),
                  last_location_update: null,
                });
              }
            }
          }
        }
      )
      .subscribe();

    // Periodically refresh responder list and active alert responder
    const interval = setInterval(async () => {
      // Refresh general responders list
      const { data } = await supabase
        .from('profiles')
        .select('id, name, latitude, longitude, last_location_update, on_duty')
        .eq('user_type', 'Responder')
        .eq('on_duty', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (mounted && data) setResponders(
        data.map((r: any) => ({
          id: r.id,
          name: r.name,
          latitude: toNum(r.latitude),
          longitude: toNum(r.longitude),
          last_location_update: r.last_location_update,
        })).filter((r: ResponderLocation) => r.latitude !== null && r.longitude !== null)
      );

      // Refresh active alert responder location if there is one
      const { data: { user } } = await supabase.auth.getUser();
      if (user && mounted) {
        const { data: alerts } = await supabase
          .from('alerts')
          .select('*')
          .eq('client_id', user.id)
          .eq('status', 'ACCEPTED')
          .order('created_at', { ascending: false })
          .limit(1);

        if (alerts && alerts.length > 0 && alerts[0].current_responder_id && mounted) {
          const { data: responderData } = await supabase
            .from('profiles')
            .select('id, name, latitude, longitude')
            .eq('id', alerts[0].current_responder_id)
            .maybeSingle();

          if (responderData && mounted) {
            setActiveAlertResponder({
              id: responderData.id,
              name: responderData.name,
              latitude: toNum(responderData.latitude),
              longitude: toNum(responderData.longitude),
              last_location_update: null,
            });
          }
        }
      }
    }, 5000);

    return () => {
      mounted = false;
      channel.unsubscribe();
      alertChannel.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Auto-center map when client or responder location changes
  useEffect(() => {
    if (!clientLocation) return;

    const hasLocation = activeAlertResponder
      && activeAlertResponder.latitude !== null
      && activeAlertResponder.longitude !== null;

    if (hasLocation && activeAlertResponder) {
      const lat = (clientLocation.lat + activeAlertResponder.latitude!) / 2;
      const lng = (clientLocation.lng + activeAlertResponder.longitude!) / 2;
      setMapCenter({ lat, lng });

      const dist = haversineDistance(clientLocation.lat, clientLocation.lng, activeAlertResponder.latitude!, activeAlertResponder.longitude!);
      if (dist > 5) setMapZoom(10);
      else if (dist > 2) setMapZoom(12);
      else setMapZoom(13);
    } else {
      setMapCenter(clientLocation);
      setMapZoom(14);
    }
  }, [clientLocation, activeAlertResponder?.latitude, activeAlertResponder?.longitude]);

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

  const responderHasLocation = activeAlertResponder
    && activeAlertResponder.latitude !== null
    && activeAlertResponder.longitude !== null;

  const nearestResponder = responders.length > 0
    ? responders.reduce((nearest, r) => {
        if (r.latitude === null || r.longitude === null) return nearest;
        const dist = haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude);
        return dist < nearest.dist ? { responder: r, dist } : nearest;
      }, { responder: responders[0], dist: Infinity } as { responder: ResponderLocation, dist: number })
    : null;

  return (
    <div className="flex flex-col flex-grow w-full h-full">
      {locationError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded p-2 mb-3">
          {locationError}
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Help Status</h2>
        {responderHasLocation ? (
          <div className="bg-green-900/30 text-green-500 px-3 py-1 rounded text-xs font-bold border border-green-900/50">
            ETA: ~{Math.max(1, Math.round(haversineDistance(clientLocation!.lat, clientLocation!.lng, activeAlertResponder.latitude!, activeAlertResponder.longitude!) / 0.5))} MINS
          </div>
        ) : nearestResponder && nearestResponder.responder.latitude !== null && nearestResponder.responder.longitude !== null && (
          <div className="bg-green-900/30 text-green-500 px-3 py-1 rounded text-xs font-bold border border-green-900/50">
            ETA: ~{Math.max(1, Math.round(nearestResponder.dist / 0.5))} MINS
          </div>
        )}
      </div>

      {/* Alert Status */}
      {activeAlert && (
        <div className="mb-3 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Active Emergency Alert</p>
          <p className="text-sm font-bold text-green-600 mt-1">{activeAlertResponder?.name} is en route</p>
        </div>
      )}

      {/* Map */}
      <div className="h-64 lg:h-[350px] relative overflow-hidden rounded-lg border border-gray-700">
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            center={mapCenter || clientLocation}
            zoom={mapZoom}
            mapId="CLIENT_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
            gestureHandling="greedy"
            disableDefaultUI={false}
          >
            {/* Route from responder to client */}
            {responderHasLocation && clientLocation && (
              <Polyline
                path={[
                  { lat: activeAlertResponder.latitude!, lng: activeAlertResponder.longitude! },
                  { lat: clientLocation.lat, lng: clientLocation.lng }
                ]}
                geodesic={true}
                strokeColor="#0ea5e9"
                strokeOpacity={0.8}
                strokeWeight={4}
              />
            )}

            {/* Client marker (self) */}
            <AdvancedMarker position={clientLocation}>
              <div className="relative">
                <div className="w-10 h-10 bg-red-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                  <Home className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                  YOUR LOCATION
                </div>
              </div>
            </AdvancedMarker>

            {/* Active alert responder marker */}
            {responderHasLocation && (
              <AdvancedMarker position={{ lat: activeAlertResponder.latitude!, lng: activeAlertResponder.longitude! }}>
                <div className="relative">
                  <div className="w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center animate-pulse">
                    <Navigation className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                    {activeAlertResponder.name}
                  </div>
                </div>
              </AdvancedMarker>
            )}

            {/* Other responder markers */}
            {responders.filter(r => !activeAlertResponder || r.id !== activeAlertResponder.id).filter(r => r.latitude !== null && r.longitude !== null).map((responder) => {
              const dist = haversineDistance(clientLocation.lat, clientLocation.lng, responder.latitude!, responder.longitude!);
              return (
                <AdvancedMarker
                  key={responder.id}
                  position={{ lat: responder.latitude!, lng: responder.longitude! }}
                >
                  <div className="relative">
                    <div className="w-9 h-9 bg-slate-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                      <Navigation className="w-4 h-4 text-white" />
                    </div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                      {dist.toFixed(1)} km
                    </div>
                  </div>
                </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>

        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-gray-700 shadow-sm border border-gray-100">
          LIVE TRACKING
        </div>

        {responders.length > 0 && (
          <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm">
            {responders.length} RESPONDER{responders.length !== 1 ? 'S' : ''} ONLINE
          </div>
        )}
      </div>

      {/* Info panel */}
      <div className="mt-4 bg-gray-900 border border-gray-800 p-4 rounded-lg text-center">
        {responderHasLocation ? (
          <>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Responder En Route</p>
            <p className="text-xl font-bold text-white mt-1">
              {activeAlertResponder.name}
            </p>
            <p className="text-blue-400 font-bold">
              {haversineDistance(clientLocation!.lat, clientLocation!.lng, activeAlertResponder.latitude!, activeAlertResponder.longitude!).toFixed(2)} km away
            </p>
            <p className="text-xs text-gray-400 mt-2">Blue line shows the shortest route</p>
          </>
        ) : activeAlertResponder && !responderHasLocation ? (
          <>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Responder Assigned</p>
            <p className="text-xl font-bold text-white mt-1">
              {activeAlertResponder.name}
            </p>
            <p className="text-xs text-gray-500 mt-1">Waiting for responder location...</p>
          </>
        ) : nearestResponder && nearestResponder.responder.latitude !== null && nearestResponder.responder.longitude !== null ? (
          <>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Nearest responder available</p>
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
              const dist = r.latitude !== null && r.longitude !== null
                ? haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude)
                : 0;
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
