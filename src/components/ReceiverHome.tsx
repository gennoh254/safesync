import { useState } from 'react';
import { Power } from 'lucide-react';

export function ReceiverHome({ onGoToMap }: { onGoToMap: () => void }) {
    const [onDuty, setOnDuty] = useState(false);

    const handleToggleDuty = () => {
        setOnDuty((prev) => !prev);
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
                  className={`w-56 h-56 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-300 shadow-lg border-8 ${onDuty ? 'bg-green-500 border-green-600 shadow-green-200' : 'bg-gray-100 border-gray-200'}`}
                >
                    <Power className={`w-16 h-16 transition-colors ${onDuty ? 'text-white' : 'text-gray-400'}`} />
                    <span className={`font-bold text-lg uppercase transition-colors ${onDuty ? 'text-white' : 'text-gray-600'}`}>
                        {onDuty ? 'On-Duty' : 'Go On-Duty'}
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
