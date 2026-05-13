import { useState } from 'react';
import { Home, Bell, Map, Settings } from 'lucide-react';
import { ReceiverAlerts } from './ReceiverAlerts';
import { ReceiverHome } from './ReceiverHome';
import { ReceiverTrackingPage } from './ReceiverTrackingPage';
import { ReceiverSettings } from './ReceiverSettings';
import { useTheme } from '../context/ThemeContext';

export function ReceiverLayout() {
    const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'map' | 'settings'>('home');
    const { theme } = useTheme();
    const darkMode = theme === 'dark';

    return (
        <div className={`flex flex-col lg:flex-row h-screen w-full ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'} font-sans`}>
            {/* Sidebar for Desktop */}
            <nav className="hidden lg:flex flex-col w-64 border-r bg-[#0B1727] border-slate-800 p-6 text-white">
                <h1 className="text-xl font-bold mb-10">SafeSync Responder</h1>
                <div className="space-y-4">
                  <button onClick={() => setActiveTab('home')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'home' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Home className="w-5 h-5 text-white" />Home</button>
                  <button onClick={() => setActiveTab('alerts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'alerts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Bell className="w-5 h-5 text-white" />Alerts</button>
                  <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'map' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Map className="w-5 h-5 text-white" />Map</button>
                  <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
                </div>
            </nav>

            <div className="flex-grow overflow-auto p-4 lg:p-8">
                {activeTab === 'home' && <ReceiverHome onGoToMap={() => setActiveTab('map')} />}
                {activeTab === 'alerts' && <ReceiverAlerts />}
                {activeTab === 'map' && <ReceiverTrackingPage darkMode={darkMode} />}
                {activeTab === 'settings' && <ReceiverSettings />}
            </div>
            
            {/* Navbar for Mobile */}
            <nav className="lg:hidden sticky bottom-0 z-50 grid grid-cols-4 bg-[#0B1727] border-t border-slate-800 py-4 text-white">
                <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-400' : 'text-white'}`}><Home className="w-6 h-6" /><span className="text-[10px] font-bold">HOME</span></button>
                <button onClick={() => setActiveTab('alerts')} className={`flex flex-col items-center gap-1 ${activeTab === 'alerts' ? 'text-blue-400' : 'text-white'}`}><Bell className="w-6 h-6" /><span className="text-[10px] font-bold">ALERTS</span></button>
                <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 ${activeTab === 'map' ? 'text-blue-400' : 'text-white'}`}><Map className="w-6 h-6" /><span className="text-[10px] font-bold">MAP</span></button>
                <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-400' : 'text-white'}`}><Settings className="w-6 h-6" /><span className="text-[10px] font-bold">SETTINGS</span></button>
            </nav>
        </div>
    );
}
