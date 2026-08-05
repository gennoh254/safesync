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
    return <span className="text-xs text-gray-500 italic">No specialty listed</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => {
        const config =
          t === 'FIRE'
            ? { icon: Flame, label: 'Fire', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
            : t === 'MEDICAL'
            ? { icon: HeartPulse, label: 'Medical', cls: 'bg-red-500/15 text-red-400 border-red-500/30' }
            : { icon: Layers, label: t, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' };
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
        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[#1a0a0a] to-[#2d1010] border border-red-900/40 rounded-2xl shadow-[0_4px_20px_rgba(220,38,38,0.15)] hover:shadow-[0_6px_28px_rgba(220,38,38,0.25)] hover:border-red-700/50 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-red-600 to-red-800 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-red-900/30 group-hover:scale-105 transition-transform">
            <Navigation className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <span className="block font-bold text-sm text-white tracking-tight">Nearby Responders</span>
            <span className="block text-xs text-red-300/80">
              {responders.length > 0 ? `${responders.length} available now` : 'Tap to view available responders'}
            </span>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-red-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown content */}
      {isOpen && (
        <div className="mt-2 bg-gradient-to-b from-[#1a0a0a] to-[#0f0707] border border-red-900/40 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
            </div>
          ) : sortedResponders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <div className="w-12 h-12 bg-red-950/40 rounded-full flex items-center justify-center mb-3">
                <Navigation className="w-6 h-6 text-red-500/60" />
              </div>
              <p className="text-sm text-gray-300 font-medium">No responders on duty right now</p>
              <p className="text-xs text-gray-500 mt-1">Check back later or send an alert to be matched automatically</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto custom-scroll-dark">
              {sortedResponders.map((r, idx) => {
                const distance =
                  clientLocation && r.latitude != null && r.longitude != null
                    ? haversineDistance(clientLocation.lat, clientLocation.lng, r.latitude, r.longitude)
                    : null;
                const hasLocation = r.latitude != null && r.longitude != null;

                return (
                  <div
                    key={r.id}
                    className={`p-4 transition-colors hover:bg-red-950/20 ${idx !== 0 ? 'border-t border-red-900/20' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 bg-gradient-to-br from-red-700/30 to-red-900/30 border border-red-700/30 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-red-400" />
                        </div>
                        {hasLocation && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-[#1a0a0a]" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-white truncate tracking-tight">{r.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {distance != null && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-red-300/80 font-medium">
                                  <Navigation className="w-3 h-3" />
                                  {formatDistance(distance)}
                                </span>
                              )}
                              {hasLocation && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  ONLINE
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Emergency types */}
                        <div className="mt-2">
                          <EmergencyTypeBadge types={r.response_types} />
                        </div>

                        {/* Action icons */}
                        <div className="flex items-center gap-2.5 mt-3">
                          {r.phone ? (
                            <a
                              href={`tel:${r.phone}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/15 hover:bg-green-600/25 border border-green-600/30 rounded-lg transition-all group/action"
                              title={`Call ${r.phone}`}
                            >
                              <Phone className="w-3.5 h-3.5 text-green-400 group-hover/action:scale-110 transition-transform" />
                              <span className="text-[11px] font-bold text-green-400">Call</span>
                            </a>
                          ) : (
                            <div
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/30 border border-gray-700/30 rounded-lg cursor-not-allowed"
                              title="No phone number"
                            >
                              <Phone className="w-3.5 h-3.5 text-gray-600" />
                              <span className="text-[11px] font-bold text-gray-600">No phone</span>
                            </div>
                          )}

                          {hasLocation ? (
                            <button
                              onClick={() => onNavigateToMap?.()}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-600/30 rounded-lg transition-all group/action"
                              title="View on map"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-400 group-hover/action:scale-110 transition-transform" />
                              <span className="text-[11px] font-bold text-blue-400">Locate</span>
                            </button>
                          ) : (
                            <div
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/30 border border-gray-700/30 rounded-lg cursor-not-allowed"
                              title="Location not shared"
                            >
                              <MapPin className="w-3.5 h-3.5 text-gray-600" />
                              <span className="text-[11px] font-bold text-gray-600">No location</span>
                            </div>
                          )}
                        </div>
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
