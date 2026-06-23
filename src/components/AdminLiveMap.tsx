import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader as Loader2, Hop as Home, Navigation, Flame, HeartPulse, CircleAlert as AlertTriangle, User } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface Profile {
  id: string;
  name: string;
  email: string;
  user_type: 'Client' | 'Responder';
  latitude: number | null;
  longitude: number | null;
  last_location_update: string | null;
}

interface Alert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  client_id: string;
  created_at: string;
}

export function AdminLiveMap() {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const [clients, setClients] = useState<Profile[]>([]);
  const [responders, setResponders] = useState<Profile[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [center, setCenter] = useState({ lat: -1.2921, lng: 36.8219 });
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('admin-map-channel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const updated = payload.new as Profile;
        if (updated.user_type === 'Client') {
          setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        } else {
          setResponders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    // Periodically refresh locations
    const interval = setInterval(fetchData, 30000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const fetchData = async () => {
    try {
      const { data: clientsData, error: clientsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_type', 'Client')
        .not('latitude', 'is', null);
      if (clientsError) throw clientsError;
      setClients((clientsData || []) as Profile[]);

      const { data: respondersData, error: respondersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_type', 'Responder')
        .not('latitude', 'is', null);
      if (respondersError) throw respondersError;
      setResponders((respondersData || []) as Profile[]);

      await fetchAlerts();
    } catch (err: any) {
      console.error('Error fetching map data:', err);
      setError(err.message || 'Failed to fetch map data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const { data: alertsData, error: alertsError } = await supabase
        .from('alerts')
        .select('*')
        .in('status', ['ACTIVE', 'ACCEPTED'])
        .not('latitude', 'is', null);
      if (alertsError) throw alertsError;
      setAlerts((alertsData || []) as Alert[]);
    } catch (err: any) {
      console.error('Error fetching alerts for map:', err);
    }
  };

  const getAlertIcon = (type: string) => {
    if (type === 'FIRE') return <Flame className="w-4 h-4 text-white" />;
    if (type === 'MEDICAL') return <HeartPulse className="w-4 h-4 text-white" />;
    return <AlertTriangle className="w-4 h-4 text-white" />;
  };

  const getAlertColor = (type: string) => {
    if (type === 'FIRE') return 'bg-orange-500';
    if (type === 'MEDICAL') return 'bg-red-600';
    return 'bg-yellow-500';
  };

  if (loading) {
    return (
      <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900' : 'bg-white'} flex items-center justify-center h-[500px]`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading live map data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg shadow overflow-hidden ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold">Central Live Map View</h2>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Alerts ({alerts.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Clients ({clients.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Responders ({responders.length})</span>
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: '500px' }}>
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            defaultCenter={center}
            defaultZoom={13}
            mapId="ADMIN_MAP_ID"
            style={{ width: '100%', height: '100%' }}
            gestureHandling="greedy"
            disableDefaultUI={false}
            zoomControl={true}
            mapTypeControl={true}
            fullscreenControl={true}
          >
            {alerts.map((alert) => (
              <AdvancedMarker
                key={`alert-${alert.id}`}
                position={{ lat: alert.latitude!, lng: alert.longitude! }}
                onClick={() => setSelectedAlert(alert)}
              >
                <div className="relative cursor-pointer">
                  <div className={`w-10 h-10 ${getAlertColor(alert.emergency_type)} rounded-full border-4 border-white shadow-lg flex items-center justify-center animate-pulse`}>
                    {getAlertIcon(alert.emergency_type)}
                  </div>
                </div>
              </AdvancedMarker>
            ))}

            {clients.map((client) => (
              <AdvancedMarker
                key={`client-${client.id}`}
                position={{ lat: client.latitude!, lng: client.longitude! }}
                onClick={() => setSelectedUser(client)}
              >
                <div className="relative cursor-pointer">
                  <div className="w-8 h-8 bg-green-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                    <Home className="w-4 h-4 text-white" />
                  </div>
                </div>
              </AdvancedMarker>
            ))}

            {responders.map((responder) => (
              <AdvancedMarker
                key={`responder-${responder.id}`}
                position={{ lat: responder.latitude!, lng: responder.longitude! }}
                onClick={() => setSelectedUser(responder)}
              >
                <div className="relative cursor-pointer">
                  <div className="w-8 h-8 bg-blue-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                    <Navigation className="w-4 h-4 text-white" />
                  </div>
                </div>
              </AdvancedMarker>
            ))}
          </Map>
        </APIProvider>

        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded text-xs font-bold text-gray-700 shadow-sm">
          LIVE TRACKING
        </div>
      </div>

      {(selectedAlert || selectedUser) && (
        <div className={`p-4 border-t ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          {selectedAlert && (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${getAlertColor(selectedAlert.emergency_type)} text-white`}>
                    {selectedAlert.emergency_type}
                  </span>
                  <span className="font-bold">{selectedAlert.location || 'Unknown Location'}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Status: <span className={`font-bold ${selectedAlert.status === 'ACTIVE' ? 'text-red-600' : 'text-blue-600'}`}>{selectedAlert.status}</span>
                  {' '} | Created: {new Date(selectedAlert.created_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="text-gray-500 hover:text-gray-700">Close</button>
            </div>
          )}
          {selectedUser && !selectedAlert && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedUser.user_type === 'Client' ? 'bg-green-500' : 'bg-blue-500'}`}>
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold">{selectedUser.name}</p>
                  <p className="text-xs text-gray-500">{selectedUser.email} | {selectedUser.user_type}</p>
                  {selectedUser.last_location_update && (
                    <p className="text-xs text-gray-400">
                      Last update: {new Date(selectedUser.last_location_update).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-gray-700">Close</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
