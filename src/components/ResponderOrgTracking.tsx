import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Users, CircleCheck, CircleX, Clock, MapPin, Navigation, Loader, Flame, HeartPulse, Layers, User, Phone, ArrowLeft, Power, CircleCheck as CheckCircle, X, ListFilter as Filter } from 'lucide-react';

interface OrgMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  on_duty: boolean;
  has_active_alert: boolean;
  last_location_update: string | null;
  response_types: string[];
  created_at: string;
  invited_by: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface OrgAlert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  created_at: string;
  accepted_at: string | null;
  resolved_at: string | null;
  current_responder_id: string | null;
  client_id: string;
  responder_rating: number | null;
  description: string | null;
  client_name?: string;
  client_phone?: string;
  responder_name?: string;
}

interface ResponderOrgTrackingProps {
  darkMode?: boolean;
  onBack?: () => void;
}

export function ResponderOrgTracking({ darkMode = false, onBack }: ResponderOrgTrackingProps) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [alerts, setAlerts] = useState<OrgAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'alerts'>('members');
  const [selectedResponder, setSelectedResponder] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<OrgAlert | null>(null);
  const [myProfile, setMyProfile] = useState<OrgMember | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Get my profile to determine organization
      const { data: myProfileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!myProfileData) {
        setError('Profile not found');
        setLoading(false);
        return;
      }

      const myOrg = myProfileData.organization_name;
      if (!myOrg) {
        setError('You are not part of an organization. Create an organization in Settings.');
        setLoading(false);
        return;
      }

      setMyProfile(myProfileData as unknown as OrgMember);

      // Get all org members
      const { data: orgMembers, error: membersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_name', myOrg)
        .eq('user_type', 'Responder')
        .neq('id', user.id);

      if (membersError) throw membersError;
      setMembers((orgMembers || []) as unknown as OrgMember[]);

      // Get all alerts handled by org members
      const { data: orgAlerts, error: alertsError } = await supabase
        .from('alerts')
        .select('*')
        .not('current_responder_id', 'is', null);

      if (alertsError) throw alertsError;

      // Get client info for these alerts
      const alertData = (orgAlerts || []) as unknown as OrgAlert[];
      const clientIds = [...new Set(alertData.map(a => a.client_id))];
      const responderIds = [...new Set(alertData.map(a => a.current_responder_id).filter(Boolean))];

      // Fetch client names
      let clientMap: Record<string, { name: string; phone: string | null }> = {};
      if (clientIds.length > 0) {
        const { data: clientData } = await supabase
          .from('profiles')
          .select('id, name, phone')
          .in('id', clientIds);
        (clientData || []).forEach((c: any) => {
          clientMap[c.id] = { name: c.name || 'Unknown', phone: c.phone || null };
        });
      }

      // Fetch responder names
      let responderMap: Record<string, string> = {};
      if (responderIds.length > 0) {
        const { data: responderData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', responderIds);
        (responderData || []).forEach((r: any) => {
          responderMap[r.id] = r.name || 'Unknown';
        });
      }

      // Filter alerts to only those handled by org members
      const orgMemberIds = (orgMembers || []).map((m: any) => m.id);
      const filteredAlerts = alertData
        .filter(a => orgMemberIds.includes(a.current_responder_id || '') || a.current_responder_id === user.id)
        .map(a => ({
          ...a,
          client_name: clientMap[a.client_id]?.name || 'Unknown',
          client_phone: clientMap[a.client_id]?.phone || null,
          responder_name: a.current_responder_id ? responderMap[a.current_responder_id] || 'Unknown' : 'Unknown',
        }));

      setAlerts(filteredAlerts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch org data:', err);
      setError(err.message || 'Failed to load organization data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { label: 'Active', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
      case 'ACCEPTED':
        return { label: 'In Progress', color: 'bg-blue-100 text-blue-700 border-blue-200' };
      case 'RESOLVED':
        return { label: 'Resolved', color: 'bg-green-100 text-green-700 border-green-200' };
      case 'UNRESOLVED':
        return { label: 'Unresolved', color: 'bg-red-100 text-red-700 border-red-200' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const getAlertIcon = (type: string) => {
    if (type === 'FIRE') return <Flame className="w-5 h-5 text-orange-500" />;
    if (type === 'MEDICAL') return <HeartPulse className="w-5 h-5 text-red-500" />;
    return <Layers className="w-5 h-5 text-purple-500" />;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDuration = (start: string | null, end: string | null) => {
    if (!start) return '—';
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    const diffSec = Math.floor((endMs - startMs) / 1000);
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const filteredAlerts = selectedResponder
    ? alerts.filter(a => a.current_responder_id === selectedResponder)
    : alerts;

  const myAlertCount = alerts.filter(a => a.current_responder_id === myProfile?.id).length;

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-[400px] ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-gray-500 text-sm">Loading organization data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'}`}>
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
        <div className="text-center py-12">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 inline-block">
            <p className="text-red-700 font-bold text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 lg:p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'} font-sans`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <h2 className="text-xl font-bold uppercase tracking-widest">Organization Tracking</h2>
        </div>
        <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
          {members.length + 1} members
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Alerts</p>
          <p className="text-2xl font-bold">{alerts.length}</p>
        </div>
        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Active</p>
          <p className="text-2xl font-bold text-blue-600">
            {alerts.filter(a => a.status === 'ACTIVE' || a.status === 'ACCEPTED').length}
          </p>
        </div>
        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Resolved</p>
          <p className="text-2xl font-bold text-green-600">
            {alerts.filter(a => a.status === 'RESOLVED').length}
          </p>
        </div>
        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Online</p>
          <p className="text-2xl font-bold text-green-600">
            {members.filter(m => m.on_duty).length + (myProfile?.on_duty ? 1 : 0)}
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'members'
              ? 'bg-blue-600 text-white shadow-lg'
              : darkMode ? 'bg-gray-800 text-gray-300 border border-gray-700' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Members
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'alerts'
              ? 'bg-blue-600 text-white shadow-lg'
              : darkMode ? 'bg-gray-800 text-gray-300 border border-gray-700' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          <Filter className="w-4 h-4" />
          Alerts ({alerts.length})
        </button>
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {/* Myself card */}
          {myProfile && (
            <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-gray-800 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold">{myProfile.name} (You)</p>
                    <p className="text-xs text-gray-500">{myProfile.email}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  myProfile.on_duty
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  <Power className="w-3 h-3" />
                  {myProfile.on_duty ? 'On-Duty' : 'Off-Duty'}
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span>{myProfile.phone || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  <span>{myProfile.response_types?.join(', ') || 'No types'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>{myAlertCount} alerts handled</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{myProfile.last_location_update ? formatDate(myProfile.last_location_update) : 'Never updated'}</span>
                </div>
              </div>
              {myProfile.has_active_alert && (
                <div className="mt-3 px-3 py-2 bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold text-blue-700">
                  Currently handling an active alert
                </div>
              )}
            </div>
          )}

          {/* Organization members */}
          {members.length === 0 ? (
            <div className={`text-center py-12 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No other members</p>
              <p className="text-gray-400 text-sm mt-1">Add responders from Settings to build your team</p>
            </div>
          ) : (
            members.map((member) => {
              const memberAlerts = alerts.filter(a => a.current_responder_id === member.id);
              const activeAlert = memberAlerts.find(a => a.status === 'ACCEPTED');
              return (
                <div key={member.id} className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        member.on_duty ? 'bg-green-500' : 'bg-gray-400'
                      }`}>
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold">{member.name}</p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      member.on_duty
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${member.on_duty ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                      {member.on_duty ? 'On-Duty' : 'Off-Duty'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-gray-500 mb-3">
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <span>{member.phone || 'No phone'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Navigation className="w-3 h-3" />
                      <span>{member.response_types?.join(', ') || 'No types'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>{memberAlerts.length} alerts handled</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{member.last_location_update ? formatDate(member.last_location_update) : 'Never updated'}</span>
                    </div>
                  </div>
                  {activeAlert && (
                    <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 mb-2">
                      Active alert: {activeAlert.emergency_type} — {activeAlert.location}
                    </div>
                  )}
                  <button
                    onClick={() => { setSelectedResponder(member.id); setActiveTab('alerts'); }}
                    className="w-full py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    View {memberAlerts.length} Alert{memberAlerts.length !== 1 ? 's' : ''}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {/* Filter info */}
          {selectedResponder && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">
                Showing {members.find(m => m.id === selectedResponder)?.name || 'Member'}'s alerts
              </span>
              <button
                onClick={() => setSelectedResponder(null)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                Show All
              </button>
            </div>
          )}

          {filteredAlerts.length === 0 ? (
            <div className={`text-center py-12 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No alerts handled yet</p>
              <p className="text-gray-400 text-sm mt-1">When responders accept alerts, they will appear here</p>
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const status = getStatusBadge(alert.status);
              return (
                <div
                  key={alert.id}
                  onClick={() => setSelectedAlert(alert)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                    darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        alert.emergency_type === 'FIRE' ? 'bg-orange-100' :
                        alert.emergency_type === 'MEDICAL' ? 'bg-red-100' : 'bg-purple-100'
                      }`}>
                        {getAlertIcon(alert.emergency_type)}
                      </div>
                      <div>
                        <p className="font-bold text-sm">
                          {alert.emergency_type === 'FIRE' ? 'Fire Emergency' :
                           alert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Other Catastrophes'}
                        </p>
                        <p className="text-xs text-gray-500">{alert.responder_name}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 shrink-0" />
                      <span className="font-medium text-gray-700">{alert.client_name}</span>
                      {alert.client_phone && (
                        <span className="text-gray-400">({alert.client_phone})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{alert.location || 'No location'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>Alert: {formatDate(alert.created_at)}</span>
                    </div>
                    {alert.accepted_at && (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 shrink-0 text-blue-500" />
                        <span>Accepted: {formatDate(alert.accepted_at)}</span>
                      </div>
                    )}
                    {alert.resolved_at && (
                      <div className="flex items-center gap-2">
                        <CircleCheck className="w-3 h-3 shrink-0 text-green-500" />
                        <span>Resolved: {formatDate(alert.resolved_at)}</span>
                      </div>
                    )}
                    {(alert.status === 'ACCEPTED' || alert.status === 'RESOLVED') && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 shrink-0 text-gray-400" />
                        <span>Duration: {getDuration(alert.accepted_at, alert.resolved_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Description for OTHER alerts */}
                  {alert.emergency_type === 'OTHER' && alert.description && (
                    <div className={`mt-3 p-3 rounded-lg border text-xs ${
                      darkMode ? 'bg-purple-900/20 border-purple-700 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-700'
                    }`}>
                      <span className="font-bold">Description:</span> {alert.description}
                    </div>
                  )}

                  {alert.responder_rating && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Rating:</span>
                      <span className="font-bold text-yellow-600">{alert.responder_rating}/5</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'}`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    selectedAlert.emergency_type === 'FIRE' ? 'bg-orange-100' :
                    selectedAlert.emergency_type === 'MEDICAL' ? 'bg-red-100' : 'bg-purple-100'
                  }`}>
                    {getAlertIcon(selectedAlert.emergency_type)}
                  </div>
                  <div>
                    <h3 className="font-bold">
                      {selectedAlert.emergency_type === 'FIRE' ? 'Fire Emergency' :
                       selectedAlert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Other Catastrophes'}
                    </h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(selectedAlert.status).color}`}>
                      {getStatusBadge(selectedAlert.status).label}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedAlert(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Client Info</p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-bold">{selectedAlert.client_name}</span>
                    {selectedAlert.client_phone && (
                      <span className="text-gray-500">({selectedAlert.client_phone})</span>
                    )}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Location</p>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span>{selectedAlert.location || 'No location'}</span>
                  </div>
                  {selectedAlert.latitude && selectedAlert.longitude && (
                    <p className="text-xs text-gray-400 mt-1">
                      {selectedAlert.latitude.toFixed(4)}, {selectedAlert.longitude.toFixed(4)}
                    </p>
                  )}
                </div>

                <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Timeline</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span>Alert triggered: {formatDate(selectedAlert.created_at)}</span>
                    </div>
                    {selectedAlert.accepted_at && (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-blue-500" />
                        <span>Accepted: {formatDate(selectedAlert.accepted_at)}</span>
                      </div>
                    )}
                    {selectedAlert.resolved_at && (
                      <div className="flex items-center gap-2">
                        <CircleCheck className="w-3 h-3 text-green-500" />
                        <span>Resolved: {formatDate(selectedAlert.resolved_at)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span>Response duration: {getDuration(selectedAlert.accepted_at, selectedAlert.resolved_at)}</span>
                    </div>
                  </div>
                </div>

                {selectedAlert.emergency_type === 'OTHER' && selectedAlert.description && (
                  <div className={`p-3 rounded-lg border ${darkMode ? 'bg-purple-900/20 border-purple-700' : 'bg-purple-50 border-purple-200'}`}>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Description</p>
                    <p className="text-sm">{selectedAlert.description}</p>
                  </div>
                )}

                {selectedAlert.responder_rating && (
                  <div className={`p-3 rounded-lg border ${darkMode ? 'bg-yellow-900/20 border-yellow-700' : 'bg-yellow-50 border-yellow-200'}`}>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Client Rating</p>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-yellow-600 text-lg">{selectedAlert.responder_rating}/5</span>
                      <span className="text-xs text-gray-500">stars</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
