import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Navigation, Phone, MapPin, Flame, HeartPulse, Layers, Loader as Loader2, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NearbyResponder {
  id: string;
  name: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  response_types: string[];
  last_location_update: string | null;
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

const toNum = (v: any): number | null => (v == null ? null : Number(v));

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

function EmergencyTypeBadge({ types }: { types: string[] }) {
  if (!types || types.length === 0) {
    return <span className="text-xs text-gray-400 italic">No specialty listed</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => {
        const config =
          t === 'FIRE'
            ? { icon: Flame, label: 'Fire', cls: 'bg-orange-100 text-orange-700 border-orange-200' }
            : t === 'MEDICAL'
            ? { icon: HeartPulse, label: 'Medical', cls: 'bg-red-100 text-red-700 border-red-200' }
            : { icon: Layers, label: t, cls: 'bg-purple-100 text-purple-700 border-purple-200' };
        const Icon = config.icon;
        return (
          <span key={t} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${config.cls}`}>
            <Icon className="w-3 h-3" />
            {config.label}
          </span>
        );
      })}
    </div>
  );
}

interface NearbyRespondersDropdownProps {
  onNavigateToMap?: () => void;
}

export function NearbyRespondersDropdown({ onNavigateToMap }: NearbyRespondersDropdownProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [responders, setResponders] = useState<NearbyResponder[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientLocation, setClientLocation] = useState<{ lat: number; lng: number } | null>(null);

  const fetchResponders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, phone, latitude, longitude, response_types, last_location_update')
        .eq('user_type', 'Responder')
        .eq('on_duty', true);

      if (error) throw error;

      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        name: r.name || 'Unknown',
        phone: r.phone || '',
        latitude: toNum(r.latitude),
        longitude: toNum(r.longitude),
        response_types: r.response_types || [],
        last_location_update: r.last_location_update,
      }));

      setResponders(mapped);
    } catch (err) {
      console.error('Failed to fetch nearby responders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setClientLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setClientLocation(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchResponders();
    }
  }, [isOpen, fetchResponders]);

  // Realtime subscription for responder updates while open
  useEffect(() => {
    if (!isOpen) return;
    const channel = supabase
      .channel('nearby-responders-dropdown')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const newData = payload.new as any;
          if (newData.user_type !== 'Responder') return;
          setResponders((prev) => {
            const filtered = prev.filter((r) => r.id !== newData.id);
            if (newData.on_duty) {
              return [...filtered, {
                id: newData.id,
                name: newData.name || 'Unknown',
                phone: newData.phone || '',
                latitude: toNum(newData.latitude),
                longitude: toNum(newData.longitude),
                response_types: newData.response_types || [],
                last_location_update: newData.last_location_update,
              }];
            }
            return filtered;
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isOpen]);

  const sortedResponders = [...responders].sort((a, b) => {
    if (!clientLocation) return 0;
    if (a.latitude == null || a.longitude == null) return 1;
    if (b.latitude == null || b.longitude == null) return -1;
    const distA = haversineDistance(clientLocation.lat, clientLocation.lng, a.latitude, a.longitude);
    const distB = haversineDistance(clientLocation.lat, clientLocation.lng, b.latitude, b.longitude);
    return distA - distB;
  });

  return (
    <div className="w-full max-w-md mx-auto mt-4">
      {/* Dropdown trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <Navigation className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-left">
            <span className="block font-bold text-sm text-gray-900">Nearby Responders</span>
            <span className="block text-xs text-gray-500">
              {responders.length > 0 ? `${responders.length} available now` : 'Tap to view available responders'}
            </span>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown content */}
      {isOpen && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : sortedResponders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <Navigation className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500 font-medium">No responders on duty right now</p>
              <p className="text-xs text-gray-400 mt-1">Check back later or send an alert to be matched automatically</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {sortedResponders.map((r) => {
                const distance =
                  clientLocation && r.latitude != null && r.longitude != null
                    ? haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude)
                    : null;

                return (
                  <div key={r.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">{r.name}</p>
                          {distance != null && (
                            <p className="text-xs text-blue-600 font-medium">{formatDistance(distance)}</p>
                          )}
                        </div>
                      </div>
                      {r.latitude != null && r.longitude != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          ONLINE
                        </span>
                      )}
                    </div>

                    <div className="ml-10 space-y-2">
                      {/* Emergency types */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Emergency Type</p>
                        <EmergencyTypeBadge types={r.response_types} />
                      </div>

                      {/* Contact + Location actions */}
                      <div className="flex items-center gap-3">
                        {r.phone ? (
                          <a
                            href={`tel:${r.phone}`}
                            className="w-9 h-9 bg-green-50 hover:bg-green-100 rounded-full flex items-center justify-center transition-colors group"
                            title={`Call ${r.phone}`}
                          >
                            <Phone className="w-4 h-4 text-green-600 group-hover:scale-110 transition-transform" />
                          </a>
                        ) : (
                          <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center" title="No phone number">
                            <Phone className="w-4 h-4 text-gray-300" />
                          </div>
                        )}

                        {r.latitude != null && r.longitude != null ? (
                          <button
                            onClick={() => onNavigateToMap?.()}
                            className="w-9 h-9 bg-blue-50 hover:bg-blue-100 rounded-full flex items-center justify-center transition-colors group"
                            title="View on map"
                          >
                            <MapPin className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                          </button>
                        ) : (
                          <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center" title="Location not shared">
                            <MapPin className="w-4 h-4 text-gray-300" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
