import { ClipboardList, Loader as Loader2, Download, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';

interface Profile {
  id: string;
  name: string;
  email: string;
  user_type: 'Client' | 'Responder';
}

interface Alert {
  id: string;
  emergency_type: string;
  location: string;
  status: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  client?: Profile;
  responder?: Profile;
}

export function AdminAuditLogs() {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('admin-audit-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data: alertsData, error: fetchError } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const alertsWithProfiles = await Promise.all(
        (alertsData || []).map(async (alert) => {
          const { data: client } = await supabase
            .from('profiles')
            .select('id, name, email, user_type')
            .eq('id', alert.client_id)
            .maybeSingle();
          return { ...alert, client: client || undefined } as Alert;
        })
      );

      setAlerts(alertsWithProfiles);
    } catch (err: any) {
      console.error('Error fetching alerts:', err);
      setError(err.message || 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  const calculateDuration = (createdAt: string, updatedAt: string, status: string) => {
    if (status === 'ACTIVE') return 'In progress...';
    const diff = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const exportToCSV = () => {
    const headers = ['Log ID', 'Sender', 'Sender Email', 'Responder', 'Location', 'Emergency Type', 'Created', 'Duration', 'Status'];
    const csvRows = [
      headers.join(','),
      ...filteredAlerts.map((a) =>
        [
          a.id,
          a.client?.name || 'Unknown',
          a.client?.email || '',
          a.responder?.name || 'Unassigned',
          a.location,
          a.emergency_type,
          new Date(a.created_at).toLocaleString(),
          calculateDuration(a.created_at, a.updated_at, a.status),
          a.status,
        ].join(',')
      ),
    ];
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
  };

  const filteredAlerts = alerts.filter((a) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      a.client?.name?.toLowerCase().includes(query) ||
      a.client?.email?.toLowerCase().includes(query) ||
      a.location?.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    if (status === 'ACTIVE') return 'bg-red-100 text-red-700';
    if (status === 'ACCEPTED') return 'bg-blue-100 text-blue-700';
    return 'bg-green-100 text-green-700';
  };

  if (loading) {
    return (
      <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900' : 'bg-white'} flex items-center justify-center h-64`}>
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><ClipboardList /> Audit Logs</h2>
        <button onClick={exportToCSV} className={`flex items-center gap-2 px-4 py-2 rounded font-bold ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <div className={`flex-grow flex items-center border rounded p-2 ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
          <Search className="w-5 h-5 text-gray-400 mr-2" />
          <input
            className="w-full bg-transparent outline-none"
            placeholder="Search by name, email, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className={`px-4 py-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <th className="p-3">Log ID</th>
              <th className="p-3">Sender</th>
              <th className="p-3">Responder</th>
              <th className="p-3">Location</th>
              <th className="p-3">Type</th>
              <th className="p-3">Time</th>
              <th className="p-3">Duration</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.map((alert) => (
              <tr key={alert.id} className={`border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                <td className="p-3 font-mono text-sm">{alert.id.substring(0, 8)}</td>
                <td className="p-3">
                  <div className="font-bold">{alert.client?.name || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{alert.client?.email || '-'}</div>
                </td>
                <td className="p-3">
                  <div className="font-bold">{alert.responder?.name || 'Unassigned'}</div>
                  <div className="text-xs text-gray-500">{alert.responder?.email || '-'}</div>
                </td>
                <td className="p-3 text-gray-600">{alert.location || 'Unknown'}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs ${alert.emergency_type === 'FIRE' ? 'bg-orange-100 text-orange-700' : alert.emergency_type === 'MEDICAL' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                    {alert.emergency_type}
                  </span>
                </td>
                <td className="p-3 text-gray-600 text-sm">{new Date(alert.created_at).toLocaleString()}</td>
                <td className="p-3 text-gray-600">{calculateDuration(alert.created_at, alert.updated_at, alert.status)}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs ${getStatusColor(alert.status)}`}>
                    {alert.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAlerts.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">No audit logs found</div>
      )}
    </div>
  );
}
