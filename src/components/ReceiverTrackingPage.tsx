import { Map as MapIcon, Phone, CheckCircle } from 'lucide-react';

export function ReceiverTrackingPage({ darkMode }: { darkMode: boolean }) {
  return (
    <div className={`flex flex-col flex-grow w-full ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans`}>
        <div className="h-64 lg:h-[500px] bg-gray-200 relative">
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                <MapIcon className="w-16 h-16" />
                <p>Map View</p>
            </div>
        </div>
        <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Responder is En Route</h2>
            <div className={`p-4 rounded-lg flex items-center justify-between mb-6 ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                <span>ETA: 4 mins</span>
                <button className="bg-red-600 text-white p-2 rounded-full"><Phone /></button>
            </div>
            <button className="w-full bg-green-600 text-white font-bold py-4 rounded-lg uppercase flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Arrived at Scene
            </button>
        </div>
    </div>
  );
}
