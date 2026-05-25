import { useState, useEffect } from 'react';
import { Power } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function ReceiverHome({ onGoToMap }: { onGoToMap: () => void }) {
    const [onDuty, setOnDuty] = useState(false);
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        const loadOnDutyStatus = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('profiles')
                .select('on_duty')
                .eq('id', user.id)
                .maybeSingle();

            if (!error && data) {
                setOnDuty(data.on_duty || false);
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
        setUpdating(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const newStatus = !onDuty;
            const { error } = await supabase
                .from('profiles')
                .update({
                    on_duty: newStatus,
                    latitude: user.user_metadata?.latitude || null,
                    longitude: user.user_metadata?.longitude || null,
                    last_location_update: new Date().toISOString()
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
                <button
                  onClick={handleToggleDuty}
                  disabled={updating}
                  className={`w-56 h-56 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-300 shadow-lg border-8 ${onDuty ? 'bg-green-500 border-green-600 shadow-green-200' : 'bg-gray-100 border-gray-200'} ${updating ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    <Power className={`w-16 h-16 transition-colors ${onDuty ? 'text-white' : 'text-gray-400'} ${updating ? 'animate-pulse' : ''}`} />
                    <span className={`font-bold text-lg uppercase transition-colors ${onDuty ? 'text-white' : 'text-gray-600'}`}>
                        {updating ? 'Updating...' : onDuty ? 'On-Duty' : 'Go On-Duty'}
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
