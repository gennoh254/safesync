import { APIProvider, Map, AdvancedMarker, Polyline } from '@vis.gl/react-google-maps';
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation, Hop as Home, Loader as Loader2, CircleAlert as AlertCircle, Users, CircleCheck as CheckCircle, X, ChevronDown, ChevronUp, Phone, MapPin, Locate, Maximize2, Star } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface ResponderLocation {
  id: string;
  name: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  last_location_update: string | null;
  response_types: string[];
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

export function ClientMap({ focusedAlertId }: { focusedAlertId?: string | null }) {
  const [clientLocation, setClientLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [responders, setResponders] = useState<ResponderLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [activeAlertResponder, setActiveAlertResponder] = useState<ResponderLocation | null>(null);
  const [initialCenter, setInitialCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [initialZoom] = useState(14);
  const [showResponderList, setShowResponderList] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const activeAlertResponderRef = useRef<ResponderLocation | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Recenter on client location
  const handleRecenterClient = useCallback(() => {
    if (clientLocation && mapRef.current) {
      mapRef.current.panTo(clientLocation);
      mapRef.current.setZoom(15);
    }
  }, [clientLocation]);

  // Recenter to show both client and responder
  const handleRecenterBoth = useCallback(() => {
    if (!mapRef.current || !clientLocation) return;

    if (activeAlertResponder?.latitude && activeAlertResponder?.longitude) {
      const lat = (clientLocation.lat + activeAlertResponder.latitude) / 2;
      const lng = (clientLocation.lng + activeAlertResponder.longitude) / 2;
      mapRef.current.panTo({ lat, lng });

      const dist = haversineDistance(clientLocation.lat, clientLocation.lng, activeAlertResponder.latitude, activeAlertResponder.longitude);
      if (dist > 5) mapRef.current.setZoom(10);
      else if (dist > 2) mapRef.current.setZoom(12);
      else mapRef.current.setZoom(14);
    } else {
      handleRecenterClient();
    }
  }, [clientLocation, activeAlertResponder, handleRecenterClient]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let alertQuery;

          if (focusedAlertId) {
            alertQuery = await supabase
              .from('alerts')
              .select('*')
              .eq('id', focusedAlertId)
              .eq('client_id', user.id)
              .maybeSingle();
          } else {
            alertQuery = await supabase
              .from('alerts')
              .select('*')
              .eq('client_id', user.id)
              .in('status', ['ACTIVE', 'ACCEPTED'])
              .order('created_at', { ascending: false })
              .limit(1);
          }

          if (alertQuery.data && mounted) {
            const alert = Array.isArray(alertQuery.data) ? alertQuery.data[0] : alertQuery.data;
            if (alert) {
              setActiveAlert(alert);

              if (alert.current_responder_id) {
                const { data: responderData } = await supabase
                  .from('profiles')
                  .select('id, name, phone, latitude, longitude, response_types')
                  .eq('id', alert.current_responder_id)
                  .maybeSingle();

                if (responderData && mounted) {
                  setActiveAlertResponder({
                    id: responderData.id,
                    name: responderData.name,
                    phone: responderData.phone,
                    latitude: toNum(responderData.latitude),
                    longitude: toNum(responderData.longitude),
                    last_location_update: null,
                    response_types: responderData.response_types || [],
                  });
                }
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

        // Fetch on-duty responders
        const { data: onDutyResponders, error: fetchError } = await supabase
          .from('profiles')
          .select('id, name, latitude, longitude, last_location_update, on_duty, response_types')
          .eq('user_type', 'Responder')
          .eq('on_duty', true);

        if (fetchError) throw fetchError;
        if (mounted) setResponders(
          (onDutyResponders || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            latitude: toNum(r.latitude),
            longitude: toNum(r.longitude),
            last_location_update: r.last_location_update,
            response_types: r.response_types || [],
          }))
        );
      } catch (err: any) {
        if (mounted) setError(err.message ?? 'Failed to load map data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const channel = supabase
      .channel('client-map-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.new && (payload.new as any).user_type === 'Responder') {
            const newData = payload.new as any;
            const lat = toNum(newData.latitude);
            const lng = toNum(newData.longitude);
            setResponders((prev) => {
              const filtered = prev.filter((r) => r.id !== newData.id);
              if (newData.on_duty) {
                return [...filtered, {
                  id: newData.id,
                  name: newData.name,
                  latitude: lat,
                  longitude: lng,
                  last_location_update: newData.last_location_update,
                  response_types: newData.response_types || [],
                }];
              }
              return filtered;
            });

            const current = activeAlertResponderRef.current;
            if (current && newData.id === current.id && lat !== null && lng !== null) {
              setActiveAlertResponder({
                ...current,
                latitude: lat,
                longitude: lng
              });
            }
          }
        }
      )
      .subscribe();

    const alertChannel = supabase
      .channel('client-alert-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        async (payload) => {
          if (payload.new && (payload.new as any).status === 'ACCEPTED' && mounted) {
            setActiveAlert(payload.new);

            if ((payload.new as any).current_responder_id) {
              const { data: responderData } = await supabase
                .from('profiles')
                .select('id, name, phone, latitude, longitude, response_types')
                .eq('id', (payload.new as any).current_responder_id)
                .maybeSingle();

              if (responderData && mounted) {
                setActiveAlertResponder({
                  id: responderData.id,
                  name: responderData.name,
                  phone: responderData.phone,
                  latitude: toNum(responderData.latitude),
                  longitude: toNum(responderData.longitude),
                  last_location_update: null,
                  response_types: responderData.response_types || [],
                });
              }
            }
          }
        }
      )
      .subscribe();

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, latitude, longitude, last_location_update, on_duty, response_types')
        .eq('user_type', 'Responder')
        .eq('on_duty', true);
      if (mounted && data) setResponders(
        data.map((r: any) => ({
          id: r.id,
          name: r.name,
          latitude: toNum(r.latitude),
          longitude: toNum(r.longitude),
          last_location_update: r.last_location_update,
          response_types: r.response_types || [],
        }))
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (user && mounted) {
        const currentAlertId = focusedAlertId || undefined;
        let alertQuery;
        if (currentAlertId) {
          alertQuery = await supabase
            .from('alerts')
            .select('*')
            .eq('id', currentAlertId)
            .eq('client_id', user.id)
            .maybeSingle();
        } else {
          alertQuery = await supabase
            .from('alerts')
            .select('*')
            .eq('client_id', user.id)
            .in('status', ['ACTIVE', 'ACCEPTED'])
            .order('created_at', { ascending: false })
            .limit(1);
        }

        const alerts = Array.isArray(alertQuery.data) ? alertQuery.data : alertQuery.data ? [alertQuery.data] : [];
        if (alerts && alerts.length > 0 && alerts[0].current_responder_id && mounted) {
          const { data: responderData } = await supabase
            .from('profiles')
            .select('id, name, phone, latitude, longitude, response_types')
            .eq('id', alerts[0].current_responder_id)
            .maybeSingle();

          if (responderData && mounted) {
            setActiveAlertResponder({
              id: responderData.id,
              name: responderData.name,
              phone: responderData.phone,
              latitude: toNum(responderData.latitude),
              longitude: toNum(responderData.longitude),
              last_location_update: null,
              response_types: responderData.response_types || [],
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
  }, [focusedAlertId]);

  // Keep ref in sync
  useEffect(() => {
    activeAlertResponderRef.current = activeAlertResponder;
  }, [activeAlertResponder]);

  // Set initial center once when location is determined
  useEffect(() => {
    if (!clientLocation || initialCenter) return;

    const hasLocation = activeAlertResponder
      && activeAlertResponder.latitude !== null
      && activeAlertResponder.longitude !== null;

    if (hasLocation && activeAlertResponder) {
      const lat = (clientLocation.lat + activeAlertResponder.latitude!) / 2;
      const lng = (clientLocation.lng + activeAlertResponder.longitude!) / 2;
      setInitialCenter({ lat, lng });
    } else {
      setInitialCenter(clientLocation);
    }
  }, [clientLocation, activeAlertResponder, initialCenter]);

  const handleResolveAlert = async () => {
    if (!activeAlert) return;
    setShowRating(true);
  };

  const handleSubmitRating = async () => {
    if (!activeAlert || rating === 0) return;
    setResolving(true);
    setResolveError(null);
    try {
      const { error: err } = await supabase
        .from('alerts')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
          responder_rating: rating,
        })
        .eq('id', activeAlert.id);
      if (err) throw err;
      setActiveAlert({
        ...activeAlert,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
        responder_rating: rating,
      });
      setRatingSubmitted(true);
      setShowRating(false);
    } catch (err: any) {
      setResolveError(err.message ?? 'Failed to resolve alert');
    } finally {
      setResolving(false);
    }
  };

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

  const respondersWithLocation = responders.filter(r => r.latitude !== null && r.longitude !== null);

  const nearestResponder = respondersWithLocation.length > 0
    ? respondersWithLocation.reduce((nearest, r) => {
        const dist = haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude!, r.longitude!);
        return dist < nearest.dist ? { responder: r, dist } : nearest;
      }, { responder: respondersWithLocation[0], dist: Infinity } as { responder: ResponderLocation, dist: number })
    : null;

  const isActive = activeAlert?.status === 'ACTIVE';
  const isAccepted = activeAlert?.status === 'ACCEPTED';
  const isResolved = activeAlert?.status === 'RESOLVED';

  return (
    <div className="flex flex-col flex-grow w-full h-full overflow-hidden">
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
        ) : nearestResponder && (
          <div className="bg-green-900/30 text-green-500 px-3 py-1 rounded text-xs font-bold border border-green-900/50">
            ETA: ~{Math.max(1, Math.round(nearestResponder.dist / 0.5))} MINS
          </div>
        )}
      </div>

      {/* Map - larger for better navigation */}
      <div className={`${isMapExpanded ? 'h-[500px]' : 'h-[300px] lg:h-[450px]'} relative overflow-hidden rounded-lg border border-gray-700 shrink-0 transition-all duration-300`}>
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            defaultCenter={initialCenter || clientLocation}
            defaultZoom={initialZoom}
            mapId="CLIENT_MAP_ID"
            style={{ width: '100%', height: '100%' }}
            gestureHandling="greedy"
            disableDefaultUI={false}
            zoomControl={true}
            streetViewControl={false}
            mapTypeControl={true}
            fullscreenControl={true}
            onIdle={(e) => { mapRef.current = e.map; }}
          >
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

            {/* Client marker */}
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

            {/* Other on-duty responder markers */}
            {respondersWithLocation.filter(r => !activeAlertResponder || r.id !== activeAlertResponder.id).map((responder) => {
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
                      {responder.name} - {dist.toFixed(1)} km
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

        {/* Tappable responder count badge */}
        {responders.length > 0 && (
          <button
            onClick={() => setShowResponderList(!showResponderList)}
            className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Users className="w-3 h-3" />
            {responders.length} RESPONDER{responders.length !== 1 ? 'S' : ''}
            {showResponderList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {/* Map controls - recenter buttons */}
        <div className="absolute bottom-2 right-2 flex flex-col gap-2">
          <button
            onClick={handleRecenterBoth}
            className="w-9 h-9 bg-white hover:bg-gray-50 rounded-lg shadow-md flex items-center justify-center transition-colors"
            title="Recenter map"
          >
            <Locate className="w-5 h-5 text-gray-700" />
          </button>
          <button
            onClick={handleRecenterClient}
            className="w-9 h-9 bg-white hover:bg-gray-50 rounded-lg shadow-md flex items-center justify-center transition-colors"
            title="My location"
          >
            <MapPin className="w-5 h-5 text-red-600" />
          </button>
          <button
            onClick={() => setIsMapExpanded(!isMapExpanded)}
            className="w-9 h-9 bg-white hover:bg-gray-50 rounded-lg shadow-md flex items-center justify-center transition-colors lg:hidden"
            title="Toggle map size"
          >
            <Maximize2 className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      {/* Scrollable info section */}
      <div className="flex-grow overflow-y-auto mt-4 pb-4">
        {/* Active alert responder detail + resolve */}
        {activeAlert && !isResolved && (
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg mb-4">
            {responderHasLocation ? (
              <>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Responder En Route</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <Navigation className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-grow">
                    <p className="font-bold text-white">{activeAlertResponder.name}</p>
                    <p className="text-xs text-gray-400">{activeAlertResponder.phone || 'No phone number'}</p>
                    <p className="text-blue-400 font-bold text-sm mt-0.5">
                      {haversineDistance(clientLocation!.lat, clientLocation!.lng, activeAlertResponder.latitude!, activeAlertResponder.longitude!).toFixed(2)} km away
                    </p>
                  </div>
                  {activeAlertResponder.phone && (
                    <a
                      href={`tel:${activeAlertResponder.phone}`}
                      className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors shrink-0"
                    >
                      <Phone className="w-5 h-5 text-white" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">Blue line shows the shortest route</p>
              </>
            ) : activeAlertResponder ? (
              <>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Responder Assigned</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <Navigation className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-grow">
                    <p className="font-bold text-white">{activeAlertResponder.name}</p>
                    <p className="text-xs text-gray-400">{activeAlertResponder.phone || 'No phone number'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Waiting for responder location...</p>
                  </div>
                  {activeAlertResponder.phone && (
                    <a
                      href={`tel:${activeAlertResponder.phone}`}
                      className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors shrink-0"
                    >
                      <Phone className="w-5 h-5 text-white" />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Awaiting Responder</p>
                <p className="text-xs text-gray-500 mt-1">Your alert has been transmitted. A responder will be assigned shortly.</p>
              </>
            )}

            {/* Resolve button + rating flow */}
            {isAccepted && !showRating && !ratingSubmitted && (
              <button
                onClick={handleResolveAlert}
                disabled={resolving}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {resolving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                {resolving ? 'Resolving...' : 'RESOLVE EMERGENCY'}
              </button>
            )}

            {/* Rating UI */}
            {showRating && !ratingSubmitted && (
              <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-800 rounded-xl">
                <p className="text-sm font-bold text-yellow-400 text-center mb-3">Rate your responder's service</p>
                <div className="flex justify-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          star <= (hoveredRating || rating)
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-center text-gray-500 mb-3">
                  {rating === 0 ? 'Click to rate' : `${rating} star${rating > 1 ? 's' : ''}`}
                </p>
                <button
                  onClick={handleSubmitRating}
                  disabled={rating === 0 || resolving}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {resolving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {resolving ? 'Submitting...' : 'Submit Rating & Resolve'}
                </button>
              </div>
            )}
            {resolveError && (
              <p className="text-red-400 text-xs mt-2">{resolveError}</p>
            )}
          </div>
        )}

        {/* Resolved confirmation */}
        {activeAlert && isResolved && (
          <div className="bg-green-900/30 border border-green-800 p-4 rounded-lg mb-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-400 uppercase tracking-wide text-sm">Emergency Resolved</p>
            <p className="text-xs text-green-500/70 mt-1">This incident has been marked as resolved</p>
            {activeAlert.responder_rating && (
              <div className="mt-3 pt-3 border-t border-green-800">
                <p className="text-xs text-gray-400 mb-1">Your rating:</p>
                <div className="flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= activeAlert.responder_rating
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No active alert info */}
        {!activeAlert && (
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg text-center mb-4">
            {nearestResponder ? (
              <>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Nearest responder available</p>
                <p className="text-xl font-bold text-white mt-1">{nearestResponder.responder.name}</p>
                <p className="text-blue-400 font-bold">{nearestResponder.dist.toFixed(2)} km away</p>
              </>
            ) : responders.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">{responders.length} responder{responders.length !== 1 ? 's' : ''} online</p>
                <p className="text-xs text-gray-500">Location data not yet available</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">No responders online yet</p>
                <p className="text-xs text-gray-500">When responders go on-duty, they will appear here</p>
              </div>
            )}
          </div>
        )}

        {/* Collapsible responder list */}
        {showResponderList && responders.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Online Responders ({responders.length})
            </h3>
            <div className="space-y-2">
              {responders.map(r => {
                const hasLoc = r.latitude !== null && r.longitude !== null;
                const dist = hasLoc
                  ? haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude!, r.longitude!)
                  : null;
                const types = r.response_types || [];
                return (
                  <div key={r.id} className="flex justify-between items-center bg-gray-800 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                        <Navigation className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <span className="font-medium text-white block text-sm">{r.name}</span>
                        {types.length > 0 && (
                          <span className="text-[10px] text-gray-400">{types.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {dist !== null ? (
                        <>
                          <span className="text-blue-400 font-bold text-sm">{dist.toFixed(2)} km</span>
                          <p className="text-xs text-gray-500">~{Math.max(1, Math.round(dist / 0.5))} min</p>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">Location pending</span>
                      )}
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
    </div>
  );
}
