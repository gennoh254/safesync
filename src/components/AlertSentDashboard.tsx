import { CheckCircle, Clock, Phone, X, ShieldAlert, Navigation, Home, Map as MapIcon, Bell, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

export function AlertSentDashboard({ onCancel, darkMode, setActiveTab, emergencyType }: { onCancel: () => void, darkMode: boolean, setActiveTab: (tab: 'home' | 'alerts' | 'map' | 'settings') => void, emergencyType: string | null }) {
  const [eta, setEta] = useState(4);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  useEffect(() => {
    if (eta <= 0) return;
    const interval = setInterval(() => {
      setEta((prev) => (prev > 0 ? prev - 1 : 0));
    }, 15000); 
    return () => clearInterval(interval);
  }, [eta]);

  return (
    <div className={`flex flex-col flex-grow w-full max-w-md ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans relative`}>
        {showConfirmCancel && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className={`p-6 rounded-lg shadow-xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
                    <h2 className="text-lg font-bold mb-4">Confirm Cancellation</h2>
                    <p className="mb-6 text-sm">Are you sure you want to cancel this emergency alert? This action cannot be undone.</p>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setShowConfirmCancel(false)} className={`py-2 px-4 rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>Back</button>
                        <button onClick={onCancel} className="py-2 px-4 rounded bg-red-600 text-white font-bold">Confirm Cancel</button>
                    </div>
                </div>
            </div>
        )}
        <div className="flex-grow p-4">
          <div className="text-center mb-4">
            <div className={`inline-flex p-3 rounded-full ${darkMode ? 'bg-red-950/50 border-red-900/50' : 'bg-red-100 border-red-200'} border mb-2`}>
                <Navigation className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-red-500 tracking-tight uppercase">
                {emergencyType} Alert Confirmed
            </h1>
            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                Help is arriving at your venue.
            </p>
            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm mt-1`}>Contact: <span className="font-bold">+254 700 000 000</span></p>
            <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-black'} mt-1`}>ETA: {eta} {eta === 1 ? 'min' : 'mins'}</p>
          </div>
          
          {/* Real Map */}
          <div className="border border-gray-200/50 rounded-2xl mb-4 h-64 relative overflow-hidden shadow-sm">
            <APIProvider apiKey={API_KEY} version="weekly">
                <Map
                    defaultCenter={{lat: -1.2921, lng: 36.8219}} // Nairobi
                    defaultZoom={15}
                    mapId="DEMO_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{width: '100%', height: '100%'}}
                    gestureHandling={'greedy'}
                    disableDefaultUI={false}
                    className="rounded-2xl"
                >
                    <AdvancedMarker position={{lat: -1.2921, lng: 36.8219}}>
                        <Pin background="#ef4444" glyphColor="#fff" borderColor="#b91c1c" />
                    </AdvancedMarker>
                    <AdvancedMarker position={{lat: -1.295, lng: 36.825}}>
                        <Pin background="#3b82f6" glyphColor="#fff" borderColor="#1e40af" />
                    </AdvancedMarker>
                </Map>
            </APIProvider>
            {/* Loading/Error layer placeholder */}
            <div className="absolute top-2 left-2 bg-white/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-gray-700 shadow-sm border border-gray-100">
                LIVE STATUS
            </div>
          </div>

          <div className={`${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-100 border-gray-200'} border rounded-lg p-4 mb-4`}>
            <div className={`relative border-l-2 ${darkMode ? 'border-gray-700' : 'border-gray-300'} ml-2 pl-4 space-y-4`}>
                <div className="relative">
                    <div className="absolute -left-7 p-0.5 bg-green-500 rounded-full"><CheckCircle className="w-3 h-3 text-white" /></div>
                    <h3 className={`font-bold text-sm ${darkMode ? '' : 'text-gray-800'}`}>Alert Transmitted</h3>
                </div>
                <div className="relative">
                    <div className="absolute -left-7 p-0.5 bg-red-600 rounded-full"><ShieldAlert className="w-3 h-3 text-white" /></div>
                    <h3 className={`font-bold text-sm ${darkMode ? '' : 'text-gray-800'}`}>Help Dispatched</h3>
                </div>
            </div>
          </div>

          <div className="mb-4">
          </div>

          <button onClick={() => setShowConfirmCancel(true)} className={`w-full ${darkMode ? 'bg-gray-900 text-gray-300 border-gray-700' : 'bg-gray-200 text-gray-800 border-gray-300'} border py-3 rounded font-bold hover:bg-gray-800 transition-all text-sm`}>
            Cancel Alert
          </button>
        </div>
    </div>
  );
}
