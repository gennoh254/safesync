import { LayoutDashboard, Users, Map, ClipboardList, Settings } from 'lucide-react';
import React, { useState } from 'react';
import { AdminDashboard } from './AdminDashboard';
import { AdminUserManagement } from './AdminUserManagement';
import { AdminAuditLogs } from './AdminAuditLogs';
import { AdminLiveMap } from './AdminLiveMap';
import { AdminSettings } from './AdminSettings';
import { useTheme } from '../context/ThemeContext';

export function AdminLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  return (
    <div className={`flex h-screen w-full ${darkMode ? 'bg-gray-950 text-white' : 'bg-gray-100 text-black'}`}>
      <aside className={`w-64 ${darkMode ? 'bg-gray-900 border-r border-gray-800' : 'bg-gray-900'} text-white p-6 flex flex-col`}>
        <h1 className="text-2xl font-bold mb-8">SafeSync Admin</h1>
        <nav className="space-y-4 flex-grow">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-3 w-full ${activeTab === 'dashboard' ? 'text-white' : 'text-gray-400'}`}><LayoutDashboard /> Dashboard</button>
          <button onClick={() => setActiveTab('users')} className={`flex items-center gap-3 w-full ${activeTab === 'users' ? 'text-white' : 'text-gray-400'}`}><Users /> Users</button>
          <button onClick={() => setActiveTab('logs')} className={`flex items-center gap-3 w-full ${activeTab === 'logs' ? 'text-white' : 'text-gray-400'}`}><ClipboardList /> Audit Logs</button>
          <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full ${activeTab === 'map' ? 'text-white' : 'text-gray-400'}`}><Map /> Live Map</button>
        </nav>
        <nav className="mt-auto">
          <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full ${activeTab === 'settings' ? 'text-white' : 'text-gray-400'}`}><Settings /> Settings</button>
        </nav>
      </aside>
      <main className="flex-grow p-8 overflow-y-auto">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'users' && <AdminUserManagement />}
        {activeTab === 'logs' && <AdminAuditLogs />}
        {activeTab === 'map' && <AdminLiveMap />}
        {activeTab === 'settings' && <AdminSettings />}
      </main>
    </div>
  );
}
