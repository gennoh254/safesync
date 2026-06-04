import { useState, useEffect } from 'react';
import { Power, TriangleAlert as AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ProfileCheck {
  on_duty: boolean;
  response_types: string[];
  phone: string | null;
}

export function ReceiverHome({ onGoToMap, onGoToSettings }: { onGoToMap: () => void; onGoToSettings: () => void }) {
    const [onDuty, setOnDuty] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [profileIncomplete, setProfileIncomplete] = useState(false);

    useEffect(() => {
        const loadOnDutyStatus = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('profiles')
                .select('on_duty, response_types, phone')
                .eq('id', user.id)
                .maybeSingle();

            if (!error && data) {
                const profile = data as ProfileCheck;
                setOnDuty(profile.on_duty || false);
                const isComplete = (profile.response_types?.length ?? 0) > 0 && profile.phone?.trim().length > 0;
                setProfileIncomplete(!isComplete);
            }
        };

        loadOnDutyStatus();

        const subscription = supabase
            .channel('responder-duty-channel')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${supabase.auth.getUser().then(({ data }) => data.user?.id)}` },
                (payload) => {
                    if (payload.new && (payload.new as any).on_duty !== undefined) {
                        setOnDuty((payload.new as any).on_duty);
                    }
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const handleToggleDuty = async () => {
        if (!onDuty && profileIncomplete) {
            return;
        }
        setUpdating(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const newStatus = !onDuty;

            let latitude: number | null = null;
            let longitude: number | null = null;

            if (newStatus && navigator.geolocation) {
                try {
                    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 10000,
                        });
                    });
                    latitude = position.coords.latitude;
                    longitude = position.coords.longitude;
                } catch (geoErr) {
                    console.warn('Could not get location:', geoErr);
                }
            }

            const { error } = await supabase
                .from('profiles')
                .update({
                    on_duty: newStatus,
                    latitude: newStatus ? latitude : null,
                    longitude: newStatus ? longitude : null,
                    last_location_update: newStatus ? new Date().toISOString() : null
                })
                .eq('id', user.id);

            if (error) throw error;
            setOnDuty(newStatus);
        } catch (err) {
            console.error('Failed to update on-duty status:', err);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="p-4 flex flex-col h-full bg-gray-50">
            <header className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 mb-8">
                <span className="text-xs font-bold uppercase text-gray-500">Dispatch Status</span>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-colors ${onDuty ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                    <span className="text-xs font-bold">{onDuty ? 'Unit #42 Active' : 'Off-Duty'}</span>
                </div>
            </header>

            <div className="flex flex-col items-center justify-center flex-grow gap-6">
                {profileIncomplete && !onDuty && (
                    <div className="mb-4 w-full max-w-sm border border-yellow-300 bg-yellow-50 rounded-xl p-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-yellow-700 font-bold text-sm mb-2">
                            <AlertTriangle className="w-5 h-5" />
                            Profile Incomplete
                        </div>
                        <p className="text-yellow-700 text-xs mb-3">Complete your profile with a mobile number and response type before going on duty.</p>
                        <button
                            onClick={onGoToSettings}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                        >
                            Go to Settings
                        </button>
                    </div>
                )}
                <button
                  onClick={handleToggleDuty}
                  disabled={updating || (profileIncomplete && !onDuty)}
                  className={`w-56 h-56 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-300 shadow-lg border-8 ${onDuty ? 'bg-green-500 border-green-600 shadow-green-200' : profileIncomplete ? 'bg-gray-300 border-gray-400 cursor-not-allowed' : 'bg-gray-100 border-gray-200'} ${updating ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                    <Power className={`w-16 h-16 transition-colors ${onDuty ? 'text-white' : profileIncomplete ? 'text-gray-500' : 'text-gray-400'} ${updating ? 'animate-pulse' : ''}`} />
                    <span className={`font-bold text-lg uppercase transition-colors ${onDuty ? 'text-white' : profileIncomplete ? 'text-gray-500' : 'text-gray-600'}`}>
                        {updating ? 'Updating...' : onDuty ? 'On-Duty' : profileIncomplete ? 'Profile Required' : 'Go On-Duty'}
                    </span>
                </button>
                {onDuty && (
                    <p className="text-green-600 text-sm font-bold text-center">
                        You are now online and visible to clients
                    </p>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-auto">
                <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Assigned Alerts</p>
                    <p className="text-2xl font-bold mt-1 text-red-600">0</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Nearby Units</p>
                    <p className="text-2xl font-bold mt-1 text-blue-600">4</p>
                </div>
            </div>
        </div>
    );
}
