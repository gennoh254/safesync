import { MapPin, CircleAlert as AlertCircle, Settings, Bell, Hop as Home, Map as MapIcon, Flame, HeartPulse, Navigation, LogOut, Loader as Loader2, CircleCheck as CheckCircle, Clock, User, Save, TriangleAlert as AlertTriangle, Star, Layers, Wallet } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { AlertSentDashboard } from './AlertSentDashboard';
import { ClientMap } from './ClientMap';
import { AlertDetailView } from './AlertDetailView';
import { ClientAccounts } from './ClientAccounts';
import { PromoCard } from './PromoCard';
import { supabase } from '../lib/supabase';

interface HomeDashboardProps {
  onLogout: () => void;
}

interface AlertRecord {
  id: string;
  emergency_type: string;
  location: string;
  status: string;
  created_at: string;
  updated_at: string;
  responder_id?: string;
  responder?: { name: string; email: string } | null;
  responder_rating?: number | null;
  description?: string | null;
}

interface ClientProfile {
  name: string;
  email: string;
  phone: string;
}

export function HomeDashboard({ onLogout }: HomeDashboardProps) {
    const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'map' | 'accounts' | 'settings'>('home');
    const [emergencyType, setEmergencyType] = useState<string | null>(null);
    const [otherDescription, setOtherDescription] = useState('');
    const [isAlertActive, setIsAlertActive] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertRecord[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile>({ name: '', email: '', phone: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveMsg, setProfileSaveMsg] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const fetchAlertHistory = async () => {
    setAlertsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlertHistory((data || []) as AlertRecord[]);
    } catch (err) {
      console.error('Failed to fetch alert history:', err);
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'alerts') {
      fetchAlertHistory();
    }
  }, [activeTab]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('name, email, phone')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setClientProfile({ name: data.name || '', email: data.email || '', phone: data.phone || '' });
        }
      } catch (err) {
        console.error('Failed to load client profile:', err);
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // Check for existing active alerts on mount
  useEffect(() => {
    const checkActiveAlert = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existingAlerts } = await supabase
        .from('alerts')
        .select('id, status')
        .eq('client_id', user.id)
        .in('status', ['ACTIVE', 'ACCEPTED'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingAlerts && existingAlerts.length > 0) {
        setIsAlertActive(true);
        setSelectedAlertId(existingAlerts[0].id);
      }
    };

    checkActiveAlert();
  }, []);

  // Subscribe to alert changes to auto-reset isAlertActive when alert is resolved
  useEffect(() => {
    let mounted = true;

    const channel = supabase
      .channel('home-dashboard-alert-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        (payload) => {
          if (payload.new && mounted) {
            const updated = payload.new as any;
            if (['RESOLVED', 'UNRESOLVED', 'CANCELLED'].includes(updated.status)) {
              setIsAlertActive(false);
              setSelectedAlertId(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, []);

  const triggerEmergency = async () => {
    if (!emergencyType) {
        alert("Please select an emergency type first.");
        return;
    }

    if (!clientProfile.phone.trim()) {
      setActiveTab('settings');
      return;
    }

    // Clear any previous error
    setAlertError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAlertError('Not authenticated');
        return;
      }

      // Check balance for MEDICAL alerts only - require minimum Ksh 500
      if (emergencyType === 'MEDICAL') {
        const { data: payments } = await supabase
          .from('client_payments')
          .select('amount, payment_type, status')
          .eq('client_id', user.id);

        if (payments) {
          const totalCredits = payments
            .filter(p => p.payment_type === 'subscription' && p.status === 'completed')
            .reduce((sum, p) => sum + (p.amount || 0), 0);
          const totalDebits = payments
            .filter(p => p.payment_type === 'alert_fee' && p.status === 'completed')
            .reduce((sum, p) => sum + (p.amount || 0), 0);
          const balance = totalCredits - totalDebits;

          if (balance < 500) {
            setAlertError('Medical alerts require a minimum balance of Ksh 500. Please top up your account.');
            setTimeout(() => {
              setActiveTab('accounts');
              setAlertError(null);
            }, 2000);
            return;
          }
        } else {
          // No payments found = zero balance
          setAlertError('Medical alerts require a minimum balance of Ksh 500. Please top up your account.');
          setTimeout(() => {
            setActiveTab('accounts');
            setAlertError(null);
          }, 2000);
          return;
        }
      }

      // Check for existing active alerts - client can only have one active alert at a time
      const { data: existingAlerts } = await supabase
        .from('alerts')
        .select('id')
        .eq('client_id', user.id)
        .in('status', ['ACTIVE', 'ACCEPTED'])
        .limit(1);

      if (existingAlerts && existingAlerts.length > 0) {
        setAlertError('You already have an active alert. Please resolve it before creating a new one.');
        setActiveTab('alerts');
        return;
      }

      // Get real location from browser
      let latitude: number | null = null;
      let longitude: number | null = null;
      let locationText = 'Current Location';

      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
            });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          locationText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        } catch {
          // Geolocation denied or unavailable — proceed without coordinates
        }
      }

      // Insert alert with no responder assigned initially
      const { data: alertData, error } = await supabase.from('alerts').insert({
        client_id: user.id,
        emergency_type: emergencyType,
        location: locationText,
        latitude,
        longitude,
        status: 'ACTIVE',
        notified_responder_ids: [],
        description: emergencyType === 'OTHER' ? otherDescription.trim() : '',
      }).select('id').single();

      if (error) throw error;

      setIsAlertActive(true);
      setAlertError(null);

      // Call edge function to find and assign nearest responder
      if (alertData?.id) {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
          await fetch(`${supabaseUrl}/functions/v1/find_nearest_responder`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ alertId: alertData.id }),
          });
        } catch (routeErr) {
          console.warn('Failed to route alert to responder:', routeErr);
          // Alert was still created, just routing failed
        }
      }
    } catch (err: any) {
      setAlertError(err.message ?? 'Failed to send alert');
    }
  };

  const handleAlertAccepted = (alertId: string) => {
    setIsAlertActive(false);
    setSelectedAlertId(alertId);
    setActiveTab('map');
  };

  const handleSaveProfile = async () => {
    if (!clientProfile.phone.trim()) {
      setProfileSaveMsg('Please enter your mobile number.');
      return;
    }
    setProfileSaving(true);
    setProfileSaveMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('profiles')
        .update({ phone: clientProfile.phone.trim() })
        .eq('id', user.id);
      if (error) throw error;
      setProfileSaveMsg('Profile saved successfully.');
      setTimeout(() => setProfileSaveMsg(null), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setProfileSaveMsg('Failed to save profile. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const clientProfileIncomplete = !clientProfile.phone.trim();

  if (isAlertActive) {
        return (
            <div className={`flex flex-col lg:flex-row flex-grow w-full h-screen ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans`}>
                <nav className="hidden lg:flex flex-col w-64 border-r bg-[#0B1727] border-slate-800 p-6 text-white">
                    <h1 className="text-xl font-bold mb-10">SafeSync</h1>
                    <div className="space-y-4">
                      <button onClick={() => setActiveTab('home')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'home' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Home className="w-5 h-5 text-white" />Home</button>
                      <button onClick={() => setActiveTab('alerts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'alerts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Bell className="w-5 h-5 text-white" />Alerts</button>
                      <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'map' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><MapIcon className="w-5 h-5 text-white" />Map</button>
                      <button onClick={() => setActiveTab('accounts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'accounts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Wallet className="w-5 h-5 text-white" />Accounts</button>
                      <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
                    </div>
                </nav>
                <div className="flex-grow flex flex-col overflow-hidden">
                    {activeTab === 'home' && (
                        <div className="flex-grow p-8 overflow-auto">
                            <AlertSentDashboard onCancel={() => setIsAlertActive(false)} darkMode={darkMode} setActiveTab={setActiveTab} emergencyType={emergencyType} onAlertAccepted={handleAlertAccepted} />
                        </div>
                    )}
                    {activeTab === 'alerts' && (
                        <div className="flex-grow p-4 overflow-auto">
                          {selectedAlertId ? (
                            <AlertDetailView
                              alertId={selectedAlertId}
                              onBack={() => { setSelectedAlertId(null); setIsAlertActive(false); }}
                              onViewMap={() => setActiveTab('map')}
                            />
                          ) : (
                            <div className={`p-4 ${darkMode ? 'text-white' : 'text-black'}`}>
                              <h2 className="text-xl font-bold uppercase tracking-widest mb-6">Alert History</h2>
                              <p className="text-gray-500 text-sm">No active alerts</p>
                            </div>
                          )}
                        </div>
                    )}
                    {activeTab === 'map' && (
                        <div className="flex-grow flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
                            <ClientMap focusedAlertId={selectedAlertId} />
                        </div>
                    )}
                </div>
            </div>
        );
    }

  return (
    <div className={`flex flex-col lg:flex-row flex-grow w-full h-screen overflow-hidden ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-sans`}>
      {/* Sidebar for Desktop */}
      <nav className="hidden lg:flex flex-col w-64 border-r bg-[#0B1727] border-slate-800 p-6 text-white">
        <h1 className="text-xl font-bold mb-10">SafeSync</h1>
        <div className="space-y-4">
          <button onClick={() => setActiveTab('home')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'home' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Home className="w-5 h-5 text-white" />Home</button>
          <button onClick={() => setActiveTab('alerts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'alerts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Bell className="w-5 h-5 text-white" />Alerts</button>
          <button onClick={() => setActiveTab('map')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'map' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><MapIcon className="w-5 h-5 text-white" />Map</button>
          <button onClick={() => setActiveTab('accounts')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'accounts' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Wallet className="w-5 h-5 text-white" />Accounts</button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 w-full p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5 text-white" />Settings</button>
        </div>
        <button onClick={onLogout} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-slate-800 mt-auto text-gray-400 hover:text-white"><LogOut className="w-5 h-5" />Log Out</button>
      </nav>

      {/* Main Content */}
      <div className="relative flex-grow flex flex-col p-8 overflow-y-auto w-full max-w-7xl mx-auto min-h-0">
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
                  {/* Error message */}
                  {alertError && (
                    <div className="w-full mb-6 border border-red-300 bg-red-50 rounded-xl p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-red-700 font-bold text-sm mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        Error
                      </div>
                      <p className="text-red-700 text-xs mb-3">{alertError}</p>
                      <button
                        onClick={() => setAlertError(null)}
                        className="text-red-600 text-xs underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  {clientProfileIncomplete && !profileLoading && (
                    <div className="w-full mb-6 border border-yellow-300 bg-yellow-50 rounded-xl p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-yellow-700 font-bold text-sm mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        Profile Incomplete
                      </div>
                      <p className="text-yellow-700 text-xs mb-3">Add your mobile number before sending an alert.</p>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                      >
                        Go to Settings
                      </button>
                    </div>
                  )}
                  <button onClick={triggerEmergency} className={`w-56 h-56 rounded-full flex flex-col items-center justify-center gap-2 shadow-lg border-4 transition-all ${emergencyType ? 'bg-red-600 border-red-800 hover:bg-red-700' : 'bg-gray-400 border-gray-600 cursor-not-allowed'}`}>
                      <AlertCircle className="w-16 h-16 text-white" />
                      <span className="font-bold text-lg uppercase tracking-widest text-white">Alertify</span>
                  </button>
                  <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-center mt-6 max-w-xs text-sm font-medium`}>Instantly trigger emergency protocol</p>
                  
                  <div className="grid grid-cols-3 gap-3 w-full mt-8 max-w-md">
                      <button onClick={() => { setEmergencyType('FIRE'); setOtherDescription(''); }} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${emergencyType === 'FIRE' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                          <Flame className={`w-7 h-7 mb-1 ${emergencyType === 'FIRE' ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-[10px] text-center">Fire</span>
                      </button>
                      <button onClick={() => { setEmergencyType('MEDICAL'); setOtherDescription(''); }} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${emergencyType === 'MEDICAL' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                          <HeartPulse className={`w-7 h-7 mb-1 ${emergencyType === 'MEDICAL' ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-[10px] text-center">Medical</span>
                      </button>
                      <button onClick={() => { setEmergencyType('OTHER'); }} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${emergencyType === 'OTHER' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}>
                          <Layers className={`w-7 h-7 mb-1 ${emergencyType === 'OTHER' ? 'text-purple-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-[10px] text-center">Other</span>
                      </button>
                  </div>

                  {/* Other emergency description - Mobile */}
                  {emergencyType === 'OTHER' && (
                    <div className="w-full mt-4 max-w-md">
                      <label className="block text-xs font-bold mb-1 text-gray-600">Describe your emergency</label>
                      <textarea
                        value={otherDescription}
                        onChange={(e) => setOtherDescription(e.target.value)}
                        placeholder="Describe the nature of your emergency..."
                        rows={3}
                        className="w-full p-3 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}
              </div>

              {/* Web View: More structured SOS and Emergency Buttons */}
              <div className="hidden lg:flex flex-col items-center justify-center w-full border rounded-2xl p-12">
                  {/* Error message */}
                  {alertError && (
                    <div className="w-full max-w-md mb-6 border border-red-300 bg-red-50 rounded-xl p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-red-700 font-bold text-sm mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        Error
                      </div>
                      <p className="text-red-700 text-xs mb-3">{alertError}</p>
                      <button
                        onClick={() => setAlertError(null)}
                        className="text-red-600 text-xs underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  {clientProfileIncomplete && !profileLoading && (
                    <div className="w-full max-w-md mb-6 border border-yellow-300 bg-yellow-50 rounded-xl p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-yellow-700 font-bold text-sm mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        Profile Incomplete
                      </div>
                      <p className="text-yellow-700 text-xs mb-3">Add your mobile number before sending an alert.</p>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                      >
                        Go to Settings
                      </button>
                    </div>
                  )}
                  <button onClick={triggerEmergency} className={`w-64 h-64 rounded-full flex flex-col items-center justify-center gap-2 shadow-lg border-4 transition-all ${emergencyType ? 'bg-red-600 border-red-800 hover:bg-red-700' : 'bg-gray-400 border-gray-600 cursor-not-allowed'}`}>
                      <AlertCircle className="w-24 h-24 text-white" />
                      <span className="font-bold text-xl uppercase tracking-widest text-white">Alertify</span>
                  </button>
                  <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-center mt-6 max-w-xs text-sm font-medium`}>Instantly trigger emergency protocol</p>
                  
                  <div className="grid grid-cols-3 gap-3 w-full mt-8 max-w-md">
                      <button onClick={() => { setEmergencyType('FIRE'); setOtherDescription(''); }} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${emergencyType === 'FIRE' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                          <Flame className={`w-7 h-7 mb-1 ${emergencyType === 'FIRE' ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-[10px] text-center">Fire</span>
                      </button>
                      <button onClick={() => { setEmergencyType('MEDICAL'); setOtherDescription(''); }} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${emergencyType === 'MEDICAL' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                          <HeartPulse className={`w-7 h-7 mb-1 ${emergencyType === 'MEDICAL' ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-[10px] text-center">Medical</span>
                      </button>
                      <button onClick={() => { setEmergencyType('OTHER'); }} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${emergencyType === 'OTHER' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}>
                          <Layers className={`w-7 h-7 mb-1 ${emergencyType === 'OTHER' ? 'text-purple-500' : 'text-gray-400'}`} />
                          <span className="font-bold text-[10px] text-center">Other</span>
                      </button>
                  </div>

                  {/* Other emergency description - Desktop */}
                  {emergencyType === 'OTHER' && (
                    <div className="w-full mt-4 max-w-md">
                      <label className="block text-xs font-bold mb-1 text-gray-600">Describe your emergency</label>
                      <textarea
                        value={otherDescription}
                        onChange={(e) => setOtherDescription(e.target.value)}
                        placeholder="Describe the nature of your emergency..."
                        rows={3}
                        className="w-full p-3 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}
              </div>

              {/* Promotional Information Card */}
              <PromoCard />
            </div>
          </div>
        )}
        
        {/* Other Tabs (Map, Alerts, Settings) - Needs update too for responsive layout */}
        
        {activeTab === 'map' && (
            <div className="flex flex-col w-full" style={{ height: 'calc(100vh - 80px)' }}>
                <ClientMap focusedAlertId={selectedAlertId} />
            </div>
        )}
        {activeTab === 'alerts' && (
            <div className={`flex flex-col h-full ${darkMode ? 'text-white' : 'text-black'}`}>
              {selectedAlertId ? (
                <div className="flex-grow overflow-y-auto p-4">
                  <AlertDetailView
                    alertId={selectedAlertId}
                    onBack={() => { setSelectedAlertId(null); fetchAlertHistory(); }}
                    onViewMap={() => setActiveTab('map')}
                  />
                </div>
              ) : (
                <>
                  {/* Fixed header */}
                  <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold uppercase tracking-widest">Alert History</h2>
                      <span className="text-sm text-gray-500">{alertHistory.length} total</span>
                    </div>
                  </div>

                  {/* Scrollable content */}
                  <div className="flex-grow overflow-y-auto p-4">
                    {alertsLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                      </div>
                    ) : alertHistory.length === 0 ? (
                      <div className={`text-center py-16 rounded-xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
                        <Bell className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-gray-500 font-medium">No alerts sent yet</p>
                        <p className="text-gray-400 text-sm mt-2">Your emergency alerts will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-4 pb-4">
                        {alertHistory.map((alert, index) => {
                          const isResolved = alert.status === 'RESOLVED';
                          const isUnresolved = alert.status === 'UNRESOLVED';
                          const isActive = alert.status === 'ACTIVE';
                          const isAccepted = alert.status === 'ACCEPTED';
                          const isLive = isActive || isAccepted;
                          const isNewestLive = isLive && index === 0;
                          const statusColor = isResolved
                            ? 'text-green-600 bg-green-50 border-green-200'
                            : isUnresolved
                            ? 'text-red-600 bg-red-50 border-red-200'
                            : isAccepted
                            ? 'text-blue-600 bg-blue-50 border-blue-200'
                            : 'text-yellow-600 bg-yellow-50 border-yellow-200';
                          const typeIcon = alert.emergency_type === 'FIRE'
                            ? <Flame className="w-5 h-5 text-orange-500" />
                            : alert.emergency_type === 'MEDICAL'
                            ? <HeartPulse className="w-5 h-5 text-red-500" />
                            : <Layers className="w-5 h-5 text-purple-500" />;

                          return (
                            <button
                              key={alert.id}
                              onClick={() => setSelectedAlertId(alert.id)}
                              className={`w-full text-left border rounded-xl p-4 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} ${isLive ? 'shadow-md' : 'shadow-sm'} hover:shadow-lg transition-all cursor-pointer`}
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                  <div className={`p-1.5 rounded-lg ${alert.emergency_type === 'FIRE' ? 'bg-orange-100' : alert.emergency_type === 'MEDICAL' ? 'bg-red-100' : 'bg-yellow-100'}`}>
                                    {typeIcon}
                                  </div>
                                  <div className="text-left">
                                    <span className="font-bold text-sm uppercase tracking-wide block">
                                      {alert.emergency_type === 'FIRE' ? 'Fire Emergency' : alert.emergency_type === 'MEDICAL' ? 'Medical Emergency' : 'Other Catastrophies'}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {new Date(alert.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                                <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full border ${statusColor}`}>
                                  {isActive ? 'TRANSMITTED' : alert.status}
                                </span>
                              </div>
                              <div className="space-y-1.5 text-sm">
                                <div className="flex items-center gap-2 text-gray-500">
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span>{new Date(alert.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-500">
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{alert.location || 'Location not recorded'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-500">
                                  <User className="w-3.5 h-3.5 shrink-0" />
                                  <span>{isResolved ? 'Incident resolved' : isUnresolved ? 'Incident not resolved' : isAccepted ? 'Responder en route' : 'Awaiting responder'}</span>
                                </div>
                              </div>
                              {/* Show description for OTHER alerts */}
                              {(alert as any).description && alert.emergency_type === 'OTHER' && (
                                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                  <p className="text-xs font-bold text-purple-700 mb-1">Description:</p>
                                  <p className="text-xs text-purple-900">{(alert as any).description}</p>
                                </div>
                              )}
                              {isResolved && (
                                <div className="mt-3 flex items-center gap-1.5 text-green-600 text-xs font-bold">
                                  <CheckCircle className="w-4 h-4" />
                                  Resolved
                                </div>
                              )}
                              {isResolved && alert.responder_rating && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <span className="text-xs text-gray-500">Rating:</span>
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <Star
                                        key={star}
                                        className={`w-3.5 h-3.5 ${
                                          star <= alert.responder_rating!
                                            ? 'text-yellow-400 fill-yellow-400'
                                            : 'text-gray-300'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                  <span className="text-xs text-yellow-600 font-bold">{alert.responder_rating}/5</span>
                                </div>
                              )}
                              {isNewestLive && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedAlertId(alert.id); setActiveTab('map'); }}
                                  className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all"
                                >
                                  <MapIcon className="w-4 h-4" />
                                  VIEW LIVE MAP
                                </button>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
        )}
        {activeTab === 'settings' && (
            <div className={`p-4 ${darkMode ? 'text-white' : 'text-black'}`}>
                <h2 className="text-xl font-bold uppercase tracking-widest">Settings</h2>
                <div className="space-y-6 mt-8">
                    {/* Client Profile Section */}
                    <div className={`border rounded-xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-3 mb-6">
                        <User className="w-5 h-5" />
                        <h3 className="font-bold text-lg">Profile</h3>
                        {clientProfileIncomplete && !profileLoading && (
                          <span className="text-xs font-bold bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Incomplete</span>
                        )}
                        {!clientProfileIncomplete && !profileLoading && (
                          <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded-full">Complete</span>
                        )}
                      </div>

                      {clientProfileIncomplete && !profileLoading && (
                        <div className={`mb-5 p-3 rounded-lg text-sm border ${darkMode ? 'bg-yellow-900/30 border-yellow-700 text-yellow-300' : 'bg-yellow-50 border-yellow-300 text-yellow-800'}`}>
                          Add your mobile number before sending an alert.
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold mb-1 text-gray-500">Name</label>
                          <input
                            type="text"
                            value={clientProfile.name}
                            disabled
                            className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-500'} cursor-not-allowed`}
                          />
                          <p className="text-xs text-gray-400 mt-1">From your signup account</p>
                        </div>
                        <div>
                          <label className="block text-sm font-bold mb-1 text-gray-500">Email</label>
                          <input
                            type="email"
                            value={clientProfile.email}
                            disabled
                            className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-500'} cursor-not-allowed`}
                          />
                          <p className="text-xs text-gray-400 mt-1">From your signup account</p>
                        </div>
                        <div>
                          <label className="block text-sm font-bold mb-1 text-gray-500">Mobile Number</label>
                          <input
                            type="tel"
                            value={clientProfile.phone}
                            onChange={(e) => setClientProfile((prev) => ({ ...prev, phone: e.target.value }))}
                            placeholder="e.g. +254 712 345 678"
                            className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleSaveProfile}
                        disabled={profileSaving}
                        className={`mt-6 w-full flex items-center justify-center gap-2 p-3 rounded-lg font-bold text-sm transition-all ${profileSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                      >
                        {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {profileSaving ? 'Saving...' : 'Save Profile'}
                      </button>

                      {profileSaveMsg && (
                        <p className={`mt-3 text-sm font-medium ${profileSaveMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                          {profileSaveMsg}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="font-bold">Dark Mode</span>
                        <button onClick={() => setDarkMode(!darkMode)} className={`w-12 h-6 ${darkMode ? 'bg-blue-600' : 'bg-gray-400'} rounded-full transition-all`}>
                            <div className={`w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'ml-7' : 'ml-1'}`}></div>
                        </button>
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
        {activeTab === 'accounts' && (
          <ClientAccounts darkMode={darkMode} />
        )}
      </div>
      
      {/* Navbar */}
      <footer className="lg:hidden sticky bottom-0 z-50 grid grid-cols-6 bg-[#0B1727] border-t border-slate-800 pt-3 text-white" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button onClick={() => { setActiveTab('home'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-400' : 'text-white'}`}><Home className="w-6 h-6" /><span className="text-[10px] font-bold">HOME</span></button>
        <button onClick={() => setActiveTab('alerts')} className={`flex flex-col items-center gap-1 ${activeTab === 'alerts' ? 'text-blue-400' : 'text-white'}`}><Bell className="w-6 h-6" /><span className="text-[10px] font-bold">ALERTS</span></button>
        <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 ${activeTab === 'map' ? 'text-blue-400' : 'text-white'}`}><MapIcon className="w-6 h-6" /><span className="text-[10px] font-bold">MAP</span></button>
        <button onClick={() => setActiveTab('accounts')} className={`flex flex-col items-center gap-1 ${activeTab === 'accounts' ? 'text-blue-400' : 'text-white'}`}><Wallet className="w-6 h-6" /><span className="text-[10px] font-bold">ACCOUNTS</span></button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-400' : 'text-white'}`}><Settings className="w-6 h-6" /><span className="text-[10px] font-bold">SETTINGS</span></button>
        <button onClick={onLogout} className="flex flex-col items-center gap-1 text-gray-400"><LogOut className="w-6 h-6" /><span className="text-[10px] font-bold">LOGOUT</span></button>
      </footer>
    </div>
  );
}
