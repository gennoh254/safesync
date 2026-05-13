import { User, Bell, Shield, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export function ReceiverSettings() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === 'dark';

  return (
    <div className={`p-4 font-sans ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'} min-h-screen`}>
      <h2 className="text-xl font-bold mb-8 uppercase tracking-widest">Settings</h2>
      
      <div className="space-y-6">
        <div className="flex items-center justify-between">
            <span className="font-bold">Dark Mode</span>
            <button onClick={toggleTheme} className={`w-12 h-6 ${darkMode ? 'bg-blue-600' : 'bg-gray-400'} rounded-full transition-all`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'ml-7' : 'ml-1'}`}></div>
            </button>
        </div>
        
        <div className="border-t pt-6">
            <span className="font-bold block mb-4">Account Notifications</span>
            <div className="flex justify-between items-center">
                <span className="text-sm">Enable Sound</span>
                <button onClick={() => setNotificationsEnabled(!notificationsEnabled)} className={`w-12 h-6 ${notificationsEnabled ? 'bg-blue-600' : 'bg-gray-400'} rounded-full transition-all`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-all ${notificationsEnabled ? 'ml-7' : 'ml-1'}`}></div>
                </button>
            </div>
        </div>

        <div className="border-t pt-6">
            <button className="flex items-center gap-4 w-full text-left font-bold">
                <User className="w-5 h-5" />
                Profile
            </button>
        </div>
        
        <div className="border-t pt-6">
            <button className="flex items-center gap-4 w-full text-left font-bold text-red-600">
                <LogOut className="w-5 h-5" />
                Log Out
            </button>
        </div>
      </div>
    </div>
  );
}
