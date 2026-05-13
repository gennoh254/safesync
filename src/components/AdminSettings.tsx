import { Settings, Bell, Shield, User } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function AdminSettings() {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === 'dark';

  return (
    <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings /> Settings</h2>
      
      <div className="space-y-6">
        <div className="border-b border-gray-700 pb-4">
            <h3 className="font-bold mb-2">Display</h3>
            <button onClick={toggleTheme} className="flex items-center gap-2 text-gray-400">Toggle {darkMode ? 'Light' : 'Dark'} Mode</button>
        </div>
        <div className="border-b border-gray-700 pb-4">
            <h3 className="font-bold mb-2">Profile</h3>
            <button className="flex items-center gap-2 text-gray-400"><User className="w-4 h-4" /> Edit Admin Profile</button>
        </div>
        <div className="border-b border-gray-700 pb-4">
            <h3 className="font-bold mb-2">System</h3>
            <button className="flex items-center gap-2 text-gray-400"><Bell className="w-4 h-4" /> Notification Preferences</button>
            <button className="flex items-center gap-2 text-gray-400 mt-2"><Shield className="w-4 h-4" /> Security & API Keys</button>
        </div>
      </div>
    </div>
  );
}
