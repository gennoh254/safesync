import { MapPin, Clock, Search, ListFilter as Filter, Download, Flame, HeartPulse, TriangleAlert as AlertTriangle, Loader as Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';

interface Profile {
  id: string;
  name: string;
  email: string;
  user_type: 'Client' | 'Responder';
  company: string;
}

interface Alert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  client?: Profile;
  responder?: Profile;
}

export function AdminDashboard() {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState({ active: 0, accepted: 0, resolved: 0, total: 0 });
  const [userStats, setUserStats] = useState({ clients: 0, responders: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchDashboardData();
    fetchUserStats();

    const channel = supabase
      .channel('admin-dashboard-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUserStats();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { data: alertsData, error: alertsError } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (alertsError) throw alertsError;

      const alertsWithProfiles = await Promise.all(
        (alertsData || []).map(async (alert) => {
          const { data: client } = await supabase
            .from('profiles')
            .select('id, name, email, user_type, company')
            .eq('id', alert.client_id)
            .maybeSingle();

          return { ...alert, client: client || undefined } as Alert;
        })
      );

      setAlerts(alertsWithProfiles);

      const active = alertsData?.filter(a => a.status === 'ACTIVE').length || 0;
      const accepted = alertsData?.filter(a => a.status === 'ACCEPTED').length || 0;
      const resolved = alertsData?.filter(a => a.status === 'RESOLVED').length || 0;
      setStats({ active, accepted, resolved, total: alertsData?.length || 0 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStats = async () => {
    try {
      const { data: clients, error: clientsError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_type', 'Client');
      if (clientsError) throw clientsError;

      const { data: responders, error: respondersError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_type', 'Responder');
      if (respondersError) throw respondersError;

      setUserStats({
        clients: clients?.length || 0,
        responders: responders?.length || 0,
      });
    } catch (err: any) {
      console.error('Error fetching user stats:', err);
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Type', 'Location', 'Time', 'Status', 'Sender', 'Sender Email'];
    const csvRows = [
      headers.join(','),
      ...alerts.map((a) =>
        [a.id, a.emergency_type, a.location, new Date(a.created_at).toLocaleString(), a.status, a.client?.name || 'Unknown', a.client?.email || ''].join(',')
      ),
    ];
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `incidents-${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
  };

  const getAlertIcon = (type: string) => {
    if (type === 'FIRE') return <Flame className="text-red-500 w-5 h-5" />;
    if (type === 'MEDICAL') return <HeartPulse className="text-blue-500 w-5 h-5" />;
    return <AlertTriangle className="text-yellow-500 w-5 h-5" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'ACTIVE') return 'bg-red-100 text-red-700';
    if (status === 'ACCEPTED') return 'bg-blue-100 text-blue-700';
    return 'bg-green-100 text-green-700';
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredAlerts = alerts.filter((a) => {
    const query = searchQuery.toLowerCase();
    return (
      a.location?.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query) ||
      a.emergency_type.toLowerCase().includes(query) ||
      a.client?.name?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-gray-500">Loading dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div className={`p-6 rounded-lg shadow flex justify-between items-center ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
        <div>
            <h2 className="text-xl font-bold">Emergency Response Center</h2>
            <p className="text-gray-500">Real-time surveillance and incident monitoring.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-red-100 text-red-800 px-4 py-2 rounded-full font-bold text-sm">
            {stats.active} Active
          </div>
          <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-bold text-sm">
            {stats.accepted} In Progress
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
          <p className="text-gray-500 text-xs font-bold uppercase">Total Alerts</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
          <p className="text-gray-500 text-xs font-bold uppercase">Active</p>
          <p className="text-2xl font-bold text-red-600">{stats.active}</p>
        </div>
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
          <p className="text-gray-500 text-xs font-bold uppercase">Clients</p>
          <p className="text-2xl font-bold text-blue-600">{userStats.clients}</p>
        </div>
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
          <p className="text-gray-500 text-xs font-bold uppercase">Responders</p>
          <p className="text-2xl font-bold text-green-600">{userStats.responders}</p>
        </div>
      </div>

      <div className={`p-4 rounded-lg shadow flex gap-4 ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
         <div className={`flex-grow flex items-center border rounded p-2 ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
            <Search className="w-5 h-5 text-gray-400 mr-2" />
            <input
              className="w-full bg-transparent outline-none"
              placeholder="Search by location, incident ID, or personnel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
         </div>
         <button className={`flex items-center gap-2 px-4 py-2 rounded font-bold ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}><Filter className="w-4 h-4"/> Filter</button>
         <button onClick={exportToCSV} className={`flex items-center gap-2 px-4 py-2 rounded font-bold ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}><Download className="w-4 h-4"/> Export</button>
      </div>

      <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
         <div className="space-y-4">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No alerts found</p>
              </div>
            ) : (
              filteredAlerts.map((alert) => (
                <div key={alert.id} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-4`}>
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 font-bold">
                          {getAlertIcon(alert.emergency_type)}
                          {alert.emergency_type === 'FIRE' ? 'Building Fire' :
                           alert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Other Emergency'}
                          <span className="text-xs text-gray-500 font-normal">{alert.id.substring(0, 8)}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(alert.status)}`}>
                          {alert.status.toUpperCase()}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-gray-600">
                        <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {alert.location || 'Unknown'}</div>
                        <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(alert.created_at)}</div>
                        <div><strong>Sender:</strong> {alert.client?.name || 'Unknown'} {alert.client?.email && <span className="text-xs text-gray-400">({alert.client.email})</span>}</div>
                        <div><strong>Responder:</strong> {alert.responder?.name || 'Unassigned'}</div>
                    </div>
                </div>
              ))
            )}
         </div>
      </div>
    </div>
  );
}
