import { useState, useEffect } from 'react';
import { Power, TriangleAlert as AlertTriangle, Flame, HeartPulse, ShieldCheck, CircleCheck as CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ProfileCheck {
  on_duty: boolean;
  response_types: string[];
  phone: string | null;
}

const FIRE_EQUIPMENT = [
  'Fire extinguisher available',
  'Protective gear ready',
  'Communication device operational',
];

const MEDICAL_EQUIPMENT = [
  'First aid kit available',
  'Medical supplies stocked',
  'Communication device operational',
];

export function ReceiverHome({ onGoToMap, onGoToSettings }: { onGoToMap: () => void; onGoToSettings: () => void }) {
    const [onDuty, setOnDuty] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [profileIncomplete, setProfileIncomplete] = useState(false);
    const [responseTypes, setResponseTypes] = useState<string[]>([]);
    const [showEquipmentCheck, setShowEquipmentCheck] = useState(false);
    const [fireConfirmations, setFireConfirmations] = useState<Record<string, boolean>>({});
    const [medicalConfirmations, setMedicalConfirmations] = useState<Record<string, boolean>>({});

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
                setResponseTypes(profile.response_types || []);
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
                    if (payload.new && (payload.new as any).response_types) {
                        setResponseTypes((payload.new as any).response_types);
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

        // If going on-duty, show equipment check first
        if (!onDuty && !showEquipmentCheck) {
            setShowEquipmentCheck(true);
            setFireConfirmations({});
            setMedicalConfirmations({});
            return;
        }

        // Validate all equipment confirmations before proceeding
        if (!onDuty && showEquipmentCheck) {
            const hasFire = responseTypes.includes('FIRE');
            const hasMedical = responseTypes.includes('MEDICAL');

            if (hasFire) {
                const allFireConfirmed = FIRE_EQUIPMENT.every(item => fireConfirmations[item]);
                if (!allFireConfirmed) return;
            }
            if (hasMedical) {
                const allMedicalConfirmed = MEDICAL_EQUIPMENT.every(item => medicalConfirmations[item]);
                if (!allMedicalConfirmed) return;
            }
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
            setShowEquipmentCheck(false);
        } catch (err) {
            console.error('Failed to update on-duty status:', err);
        } finally {
            setUpdating(false);
        }
    };

    const handleCancelEquipmentCheck = () => {
        setShowEquipmentCheck(false);
        setFireConfirmations({});
        setMedicalConfirmations({});
    };

    const hasFire = responseTypes.includes('FIRE');
    const hasMedical = responseTypes.includes('MEDICAL');

    const fireAllConfirmed = hasFire ? FIRE_EQUIPMENT.every(item => fireConfirmations[item]) : true;
    const medicalAllConfirmed = hasMedical ? MEDICAL_EQUIPMENT.every(item => medicalConfirmations[item]) : true;
    const allEquipmentConfirmed = fireAllConfirmed && medicalAllConfirmed;

    return (
        <div className="p-4 flex flex-col h-full bg-gray-50">
            <header className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 mb-8">
                <span className="text-xs font-bold uppercase text-gray-500">Dispatch Status</span>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-colors ${onDuty ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                    <span className="text-xs font-bold">{onDuty ? 'On-Duty' : 'Off-Duty'}</span>
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
                  className={`w-56 h-56 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-300 shadow-lg border-8 ${onDuty ? 'bg-green-500 border-green-600 shadow-green-200' : profileIncomplete ? 'bg-gray-300 border-gray-400 cursor-not-allowed' : allEquipmentConfirmed && showEquipmentCheck ? 'bg-green-400 border-green-500 shadow-green-200' : 'bg-gray-100 border-gray-200'} ${updating ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                    <Power className={`w-16 h-16 transition-colors ${onDuty ? 'text-white' : profileIncomplete ? 'text-gray-500' : allEquipmentConfirmed && showEquipmentCheck ? 'text-white' : 'text-gray-400'} ${updating ? 'animate-pulse' : ''}`} />
                    <span className={`font-bold text-lg uppercase transition-colors ${onDuty ? 'text-white' : profileIncomplete ? 'text-gray-500' : allEquipmentConfirmed && showEquipmentCheck ? 'text-white' : 'text-gray-600'}`}>
                        {updating ? 'Updating...' : onDuty ? 'On-Duty' : profileIncomplete ? 'Profile Required' : showEquipmentCheck ? 'Confirm & Go Live' : 'Go On-Duty'}
                    </span>
                </button>
                {onDuty && (
                    <p className="text-green-600 text-sm font-bold text-center">
                        You are now online and visible to clients
                    </p>
                )}
            </div>

            {/* Equipment readiness section - replaces dummy stats */}
            <div className="mt-auto space-y-3">
                {showEquipmentCheck && !onDuty ? (
                    <>
                        {hasFire && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-2 mb-3">
                                    <Flame className="w-5 h-5 text-orange-500" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Fire Equipment Ready?</span>
                                </div>
                                <div className="space-y-2">
                                    {FIRE_EQUIPMENT.map(item => (
                                        <button
                                            key={item}
                                            onClick={() => setFireConfirmations(prev => ({ ...prev, [item]: !prev[item] }))}
                                            className="w-full flex items-center gap-3 text-left p-2 rounded-lg transition-colors hover:bg-gray-50"
                                        >
                                            {fireConfirmations[item] ? (
                                                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                                            )}
                                            <span className={`text-sm ${fireConfirmations[item] ? 'text-green-700 font-bold' : 'text-gray-600'}`}>
                                                {item}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {hasMedical && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-2 mb-3">
                                    <HeartPulse className="w-5 h-5 text-red-500" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Medical Equipment Ready?</span>
                                </div>
                                <div className="space-y-2">
                                    {MEDICAL_EQUIPMENT.map(item => (
                                        <button
                                            key={item}
                                            onClick={() => setMedicalConfirmations(prev => ({ ...prev, [item]: !prev[item] }))}
                                            className="w-full flex items-center gap-3 text-left p-2 rounded-lg transition-colors hover:bg-gray-50"
                                        >
                                            {medicalConfirmations[item] ? (
                                                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                                            )}
                                            <span className={`text-sm ${medicalConfirmations[item] ? 'text-green-700 font-bold' : 'text-gray-600'}`}>
                                                {item}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button
                            onClick={handleCancelEquipmentCheck}
                            className="w-full text-center text-sm text-gray-500 font-bold py-2 hover:text-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                    </>
                ) : onDuty ? (
                    <div className="bg-white p-4 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck className="w-5 h-5 text-green-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-green-600">Equipment Confirmed</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {hasFire && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold bg-orange-50 text-orange-600 px-2 py-1 rounded-full border border-orange-200">
                                    <Flame className="w-3 h-3" /> Fire
                                </span>
                            )}
                            {hasMedical && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-50 text-red-600 px-2 py-1 rounded-full border border-red-200">
                                    <HeartPulse className="w-3 h-3" /> Medical
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <ShieldCheck className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Equipment Readiness</span>
                        </div>
                        <p className="text-xs text-gray-400">Equipment confirmation required before going on duty</p>
                    </div>
                )}
            </div>
        </div>
    );
}
