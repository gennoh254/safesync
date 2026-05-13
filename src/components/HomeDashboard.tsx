import { ShieldCheck, MapPin, AlertCircle, Settings, Bell, Home, Map as MapIcon, Flame, HeartPulse, Navigation } from 'lucide-react';
import React, { useState } from 'react';
import { AlertSentDashboard } from './AlertSentDashboard';

export function HomeDashboard() {
    const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'map' | 'settings'>('home');
    const [emergencyType, setEmergencyType] = useState<string | null>(null);
    const [isAlertActive, setIsAlertActive] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const triggerEmergency = () => {
    if (!emergencyType) {
        alert("Please select an emergency type first.");
        return;
    }
    setIsAlertActive(true);
  };

  if (isAlertActive) {
        return (
            <div className={`flex flex-col lg:flex-row flex-grow w-full h-screen ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans`}>
                <nav className="hidden lg:flex flex-col w-64 border-r bg-[#0B1727] border-slate-800 p-6 text-white">
                    <h1 className="text-xl font-bold mb-10">SafeSync</h1>
                    <div className="space-y-4">
                      <button onClick={() => setActiveTab('home')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'home' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Home className="w-5 h-5 text-white" />Home</button>
                      <button onClick={() => setActiveTab('alerts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'alerts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Bell className="w-5 h-5 text-white" />Alerts</button>
                      <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'map' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><MapIcon className="w-5 h-5 text-white" />Map</button>
                      <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
                    </div>
                </nav>
                <div className="flex-grow p-8">
                     <AlertSentDashboard onCancel={() => setIsAlertActive(false)} darkMode={darkMode} setActiveTab={setActiveTab} emergencyType={emergencyType} />
                </div>
            </div>
        );
    }

  return (
    <div className={`flex flex-col lg:flex-row flex-grow w-full h-screen ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans`}>
      {/* Sidebar for Desktop */}
      <nav className="hidden lg:flex flex-col w-64 border-r bg-[#0B1727] border-slate-800 p-6 text-white">
        <h1 className="text-xl font-bold mb-10">SafeSync</h1>
        <div className="space-y-4">
          <button onClick={() => setActiveTab('home')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'home' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Home className="w-5 h-5 text-white" />Home</button>
          <button onClick={() => setActiveTab('alerts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'alerts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Bell className="w-5 h-5 text-white" />Alerts</button>
          <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'map' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><MapIcon className="w-5 h-5 text-white" />Map</button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative flex-grow flex flex-col p-8 overflow-hidden w-full max-w-7xl mx-auto">
        {activeTab === 'home' && (
          <div className="flex flex-col lg:flex-row flex-grow lg:gap-8">
            <div className="flex flex-col w-full lg:max-w-2xl">
              <div className="lg:hidden flex justify-between items-center mb-8">
                <h1 className="text-xl font-bold">SafeSync</h1>
                <div className="flex items-center gap-2 text-xs font-bold bg-gray-900 px-3 py-1 rounded-full text-gray-200">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div> Connected #442
                </div>
              </div>
              <div className="hidden lg:flex justify-between items-center mb-8 w-full">
                <h1 className="text-2xl font-bold">SafeSync</h1>
                <div className="flex items-center gap-2 text-xs font-bold bg-gray-200 text-black px-3 py-1 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div> Connected #442
                </div>
              </div>

              {/* Mobile View: Simple SOS Button and Emergency Buttons */}
              <div className="flex flex-col items-center justify-center w-full p-4 lg:hidden">
                  <button onClick={triggerEmergency} className={`w-56 h-56 rounded-full flex flex-col items-center justify-center gap-2 shadow-lg border-4 transition-all ${emergencyType ? 'bg-red-600 border-red-800 hover:bg-red-700' : 'bg-gray-400 border-gray-600 cursor-not-allowed'}`}>
                      <AlertCircle className="w-16 h-16 text-white" />
                      <span className="font-bold text-lg uppercase tracking-widest text-white">Alertify</span>
                  </button>
                  <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-center mt-6 max-w-xs text-sm font-medium`}>Instantly trigger emergency protocol</p>
                  
                  <div className="grid grid-cols-2 gap-4 w-full mt-8 max-w-md">
                      <button onClick={() => setEmergencyType('FIRE')} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${emergencyType === 'FIRE' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                          <Flame className={`w-8 h-8 mb-2 ${emergencyType === 'FIRE' ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-xs text-center">Fire Emergency</span>
                      </button>
                      <button onClick={() => setEmergencyType('MEDICAL')} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${emergencyType === 'MEDICAL' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                          <HeartPulse className={`w-8 h-8 mb-2 ${emergencyType === 'MEDICAL' ? 'text-blue-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-xs text-center">Medical Emergency</span>
                      </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 w-full mt-8 max-w-md">
                      <div className={`border p-4 rounded-xl text-center shadow-sm ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Status</p>
                          <p className="font-bold text-green-600">ALL SAFE</p>
                      </div>
                      <div className={`border p-4 rounded-xl text-center shadow-sm ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Active Alerts</p>
                          <p className="font-bold">0</p>
                      </div>
                  </div>
              </div>

              {/* Web View: More structured SOS and Emergency Buttons */}
              <div className="hidden lg:flex flex-col items-center justify-center w-full border rounded-2xl p-12">
                  <button onClick={triggerEmergency} className={`w-64 h-64 rounded-full flex flex-col items-center justify-center gap-2 shadow-lg border-4 transition-all ${emergencyType ? 'bg-red-600 border-red-800 hover:bg-red-700' : 'bg-gray-400 border-gray-600 cursor-not-allowed'}`}>
                      <AlertCircle className="w-24 h-24 text-white" />
                      <span className="font-bold text-xl uppercase tracking-widest text-white">Alertify</span>
                  </button>
                  <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-center mt-6 max-w-xs text-sm font-medium`}>Instantly trigger emergency protocol</p>
                  
                  <div className="grid grid-cols-2 gap-4 w-full mt-8 max-w-md">
                      <button onClick={() => setEmergencyType('FIRE')} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${emergencyType === 'FIRE' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                          <Flame className={`w-8 h-8 mb-2 ${emergencyType === 'FIRE' ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-xs text-center">Fire Emergency</span>
                      </button>
                      <button onClick={() => setEmergencyType('MEDICAL')} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${emergencyType === 'MEDICAL' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                          <HeartPulse className={`w-8 h-8 mb-2 ${emergencyType === 'MEDICAL' ? 'text-blue-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-xs text-center">Medical Emergency</span>
                      </button>
                  </div>
              </div>
            </div>
            
            {/* Summary Cards for Webview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4 w-full lg:w-80 mt-8 lg:mt-0 h-fit">
                <div className={`border p-6 rounded-2xl ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} shadow-sm`}>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Status</p>
                    <p className="text-2xl font-bold text-green-600">ALL SAFE</p>
                </div>
                <div className={`border p-6 rounded-2xl ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} shadow-sm`}>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Active Alerts</p>
                    <p className="text-2xl font-bold">0</p>
                </div>
            </div>
          </div>
        )}
        
        {/* Other Tabs (Map, Alerts, Settings) - Needs update too for responsive layout */}
        
        {activeTab === 'map' && (
            <div className="flex flex-col flex-grow w-full h-full p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Help Status</h2>
                    <div className="bg-red-900/30 text-red-500 px-3 py-1 rounded text-xs font-bold border border-red-900/50">
                        ETA: 4 MINS
                    </div>
                </div>
                
                {/* Simplified Client Map */}
                <div className="relative flex-grow bg-gray-950 rounded-lg border border-gray-800 overflow-hidden flex items-center justify-center">
                    {/* Simulated Map Background */}
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', backgroundSize: '15px 15px' }}></div>
                    
                    {/* Simplified Markers: User Location (Venue) and Responder */}
                    <div className="relative w-full h-full">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-3 bg-red-600 rounded-full border-4 border-black">
                            <Home className="w-6 h-6 text-white" />
                        </div>
                        <div className="absolute top-1/4 left-1/4 p-2 bg-blue-500 rounded-full border-2 border-black animate-pulse">
                            <Navigation className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </div>

                <div className="mt-4 bg-gray-900 border border-gray-800 p-4 rounded-lg text-center">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Responder is en route</p>
                    <p className="text-xl font-bold text-white mt-1">Help is approaching...</p>
                </div>
            </div>
        )}
        {activeTab === 'alerts' && (
            <div className={`p-4 ${darkMode ? 'text-white' : 'text-black'}`}>
                <h2 className="text-xl font-bold uppercase tracking-widest">Alert History</h2>
                <div className="space-y-4 mt-6">
                    <div className={`${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-100 border-gray-200'} border p-4 rounded-lg`}>
                        <div className="flex justify-between items-center mb-2">
                             <span className="font-bold">MEDICAL ASSISTANCE</span>
                             <span className="text-green-500 text-xs font-bold uppercase">Resolved</span>
                        </div>
                        <p className="text-sm text-gray-500">May 5, 2026 • 14:02</p>
                    </div>
                </div>
            </div>
        )}
        {activeTab === 'settings' && (
            <div className={`p-4 ${darkMode ? 'text-white' : 'text-black'}`}>
                <h2 className="text-xl font-bold uppercase tracking-widest">Settings</h2>
                <div className="space-y-6 mt-8">
                     <div className="flex items-center justify-between">
                        <span className="font-bold">Dark Mode</span>
                        <button onClick={() => setDarkMode(!darkMode)} className={`w-12 h-6 ${darkMode ? 'bg-blue-600' : 'bg-gray-400'} rounded-full transition-all`}>
                            <div className={`w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'ml-7' : 'ml-1'}`}></div>
                        </button>
                    </div>
                    <div className="border-t border-gray-700 pt-6">
                        <span className="font-bold block mb-2">Emergency Contacts</span>
                        <button className="text-blue-500 text-sm font-bold">Manage Contacts</button>
                    </div>
                    <div className="border-t border-gray-700 pt-6">
                        <span className="font-bold block mb-2">Account Notifications</span>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500">Enable Sound</span>
                            <button onClick={() => setNotificationsEnabled(!notificationsEnabled)} className={`w-12 h-6 ${notificationsEnabled ? 'bg-blue-600' : 'bg-gray-400'} rounded-full transition-all`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-all ${notificationsEnabled ? 'ml-7' : 'ml-1'}`}></div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
      
      {/* Navbar */}
      <footer className="lg:hidden sticky bottom-0 z-50 grid grid-cols-4 bg-[#0B1727] border-t border-slate-800 py-4">
        <button onClick={() => { setActiveTab('home'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-400' : 'text-white'}`}><Home className="w-6 h-6" /><span className="text-[10px] font-bold">HOME</span></button>
        <button onClick={() => setActiveTab('alerts')} className={`flex flex-col items-center gap-1 ${activeTab === 'alerts' ? 'text-blue-400' : 'text-white'}`}><Bell className="w-6 h-6" /><span className="text-[10px] font-bold">ALERTS</span></button>
        <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 ${activeTab === 'map' ? 'text-blue-400' : 'text-white'}`}><MapIcon className="w-6 h-6" /><span className="text-[10px] font-bold">MAP</span></button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-400' : 'text-white'}`}><Settings className="w-6 h-6" /><span className="text-[10px] font-bold">SETTINGS</span></button>
      </footer>
    </div>
  );
}
