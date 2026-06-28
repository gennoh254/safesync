import { User, Flame, HeartPulse, Save, Loader, Volume2, VolumeX, Bell, BellRing, BellOff, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { useEmergencyAlert, unlockAudio, isAudioUnlocked } from '../hooks/useEmergencyAlert';
import { usePushNotifications } from '../context/PushNotificationContext';

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  response_types: string[];
  invited_by: string | null;
  organization_name: string;
}

export const SOUND_PREF_KEY = 'safesync_responder_sound_enabled';

export function getResponderSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem(SOUND_PREF_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

interface ReceiverSettingsProps {
  isAdmin?: boolean;
  organizationName?: string;
}

export function ReceiverSettings({ isAdmin: isAdminProp, organizationName: orgNameProp }: ReceiverSettingsProps = {}) {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === 'dark';
  const { testAlert } = useEmergencyAlert();
  const push = usePushNotifications();

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getResponderSoundEnabled());
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({ name: '', email: '', phone: '', response_types: [], invited_by: null, organization_name: '' });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Derived from profile (or props as fallback)
  const isAdmin = profile.invited_by === null;
  const organizationName = profile.organization_name;

  // Account management state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);
  const [addUserSuccess, setAddUserSuccess] = useState<string | null>(null);
  const [invitedUsers, setInvitedUsers] = useState<{ id: string; name: string; email: string; created_at: string }[]>([]);
  const [organizationMembers, setOrganizationMembers] = useState<{ id: string; name: string; email: string; created_at: string; is_admin: boolean }[]>([]);

  // Organization setup state
  const [editOrgName, setEditOrgName] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaveMessage, setOrgSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setAudioUnlocked(isAudioUnlocked());
  }, []);

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(enabled));
    } catch {
      // ignore
    }
  };

  const handleUnlockAudio = async () => {
    const success = await unlockAudio();
    if (success) {
      setAudioUnlocked(true);
      handleToggleSound(true);
      setTimeout(() => testAlert(), 100);
    }
  };

  const handleTestAlertSound = () => {
    testAlert();
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('name, email, phone, response_types, invited_by, organization_name')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setProfile({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            response_types: data.response_types || [],
            invited_by: data.invited_by || null,
            organization_name: data.organization_name || '',
          });

          // Fetch invited users if this user is an admin (can add others)
          if (!data.invited_by) {
            const { data: invited } = await supabase
              .from('profiles')
              .select('id, name, email, created_at')
              .eq('invited_by', user.id);
            if (invited) setInvitedUsers(invited);
          }

          // Fetch all organization members for both admin and member
          if (data.organization_name) {
            // If admin (not invited), get all users with same organization except self
            // If member (invited), get all users with same organization including the admin who invited them
            const orgName = data.organization_name;
            const { data: orgMembers } = await supabase
              .from('profiles')
              .select('id, name, email, created_at, invited_by')
              .eq('organization_name', orgName)
              .neq('id', user.id);

            if (orgMembers) {
              const isAdmin = !data.invited_by;
              setOrganizationMembers(
                orgMembers.map((m) => ({
                  id: m.id,
                  name: m.name,
                  email: m.email,
                  created_at: m.created_at,
                  is_admin: isAdmin && !m.invited_by, // Admin's perspective: users without invited_by are also admins
                }))
              );
            }
          }
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const toggleResponseType = (type: string) => {
    setProfile((prev) => {
      const current = prev.response_types;
      if (current.includes(type)) {
        return { ...prev, response_types: current.filter((t) => t !== type) };
      }
      return { ...prev, response_types: [...current, type] };
    });
  };

  const handleSave = async () => {
    if (profile.response_types.length === 0) {
      setSaveMessage('Please select at least one response type.');
      return;
    }
    if (!profile.phone.trim()) {
      setSaveMessage('Please enter your mobile number.');
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          phone: profile.phone.trim(),
          response_types: profile.response_types,
        })
        .eq('id', user.id);

      if (error) throw error;
      setSaveMessage('Profile saved successfully.');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setSaveMessage('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isProfileComplete = profile.response_types.length > 0 && profile.phone.trim().length > 0;

  // Handler for saving organization name for admins
  const handleSaveOrganization = async () => {
    if (!editOrgName.trim()) {
      setOrgSaveMessage('Please enter an organization name.');
      return;
    }

    setSavingOrg(true);
    setOrgSaveMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const orgName = editOrgName.trim();

      // Update admin's profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ organization_name: orgName })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Update all invited users to have the same organization
      const { error: batchError } = await supabase
        .from('profiles')
        .update({ organization_name: orgName })
        .eq('invited_by', user.id);

      if (batchError) console.warn('Could not update invited users:', batchError);

      setProfile((prev) => ({ ...prev, organization_name: orgName }));
      setOrgSaveMessage('Organization saved successfully!');
      setEditOrgName('');

      // Refresh organization members
      const { data: orgMembers } = await supabase
        .from('profiles')
        .select('id, name, email, created_at, invited_by')
        .eq('organization_name', orgName)
        .neq('id', user.id);

      if (orgMembers) {
        setOrganizationMembers(
          orgMembers.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            created_at: m.created_at,
            is_admin: !m.invited_by,
          }))
        );
      }

      setTimeout(() => setOrgSaveMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save organization:', err);
      setOrgSaveMessage('Failed to save organization. Please try again.');
    } finally {
      setSavingOrg(false);
    }
  };

  if (loading) {
    return (
      <div className={`p-4 font-sans flex items-center justify-center min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'}`}>
        <Loader className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={`p-4 font-sans ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'} min-h-screen`}>
      <h2 className="text-xl font-bold mb-8 uppercase tracking-widest">Settings</h2>

      <div className="space-y-6">
        {/* Audio Permission Banner */}
        {!audioUnlocked && (
          <div className={`border-2 rounded-xl p-5 ${darkMode ? 'bg-yellow-900/30 border-yellow-600' : 'bg-yellow-50 border-yellow-400'}`}>
            <div className="flex items-center gap-3 mb-3">
              <Bell className="w-6 h-6 text-yellow-600 shrink-0" />
              <h3 className="font-bold text-yellow-700">Enable Alert Audio</h3>
            </div>
            <p className={`text-sm mb-4 ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
              Browsers block audio until you interact with the page. Tap the button below to allow alert sounds — you will hear a test ring to confirm it is working.
            </p>
            <button
              onClick={handleUnlockAudio}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Volume2 className="w-5 h-5" />
              Tap to Enable Alert Sounds
            </button>
          </div>
        )}

        {audioUnlocked && soundEnabled && (
          <div className={`border rounded-xl p-4 flex items-center gap-3 ${darkMode ? 'bg-green-900/30 border-green-700' : 'bg-green-50 border-green-300'}`}>
            <Volume2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className={`text-sm font-bold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
              Alert sounds are enabled. You will hear incoming alerts.
            </p>
          </div>
        )}

        {/* Organization Setup - for admins without organization */}
        {!profile.invited_by && !profile.organization_name && (
          <div className={`border-2 rounded-xl p-6 ${darkMode ? 'bg-blue-900/30 border-blue-600' : 'bg-blue-50 border-blue-400'}`}>
            <div className="flex items-center gap-3 mb-3">
              <Users className="w-6 h-6 text-blue-600 shrink-0" />
              <h3 className="font-bold text-blue-700">Set Up Your Organization</h3>
            </div>
            <p className={`text-sm mb-4 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
              You need to set up your organization name before you can add team members and track their activities.
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={editOrgName}
                onChange={(e) => setEditOrgName(e.target.value)}
                placeholder="Enter your organization name"
                className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              {orgSaveMessage && (
                <p className={`text-sm font-medium ${orgSaveMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                  {orgSaveMessage}
                </p>
              )}
              <button
                onClick={handleSaveOrganization}
                disabled={savingOrg}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {savingOrg ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5" />
                    Save Organization
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Profile Section */}
        <div className={`border rounded-xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-3 mb-6">
            <User className="w-5 h-5" />
            <h3 className="font-bold text-lg">Profile</h3>
            {!isProfileComplete && (
              <span className="text-xs font-bold bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Incomplete</span>
            )}
            {isProfileComplete && (
              <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded-full">Complete</span>
            )}
          </div>

          {!isProfileComplete && (
            <div className={`mb-5 p-3 rounded-lg text-sm border ${darkMode ? 'bg-yellow-900/30 border-yellow-700 text-yellow-300' : 'bg-yellow-50 border-yellow-300 text-yellow-800'}`}>
              Complete your profile before going on duty. You must select at least one response type and provide a mobile number.
            </div>
          )}

          <div className="space-y-4">
            {/* Name - read only */}
            <div>
              <label className="block text-sm font-bold mb-1 text-gray-500">Name</label>
              <input
                type="text"
                value={profile.name}
                disabled
                className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-500'} cursor-not-allowed`}
              />
              <p className="text-xs text-gray-400 mt-1">From your signup account</p>
            </div>

            {/* Organization - read only */}
            {profile.organization_name && (
              <div>
                <label className="block text-sm font-bold mb-1 text-gray-500">Organization</label>
                <input
                  type="text"
                  value={profile.organization_name}
                  disabled
                  className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-500'} cursor-not-allowed`}
                />
                {profile.invited_by ? (
                  <p className="text-xs text-gray-400 mt-1">You are a member of this organization</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">You are the admin of this organization</p>
                )}
              </div>
            )}

            {/* Organization members list - show for all org members */}
            {organizationMembers.length > 0 && !profile.invited_by && (
              <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-200'}`}>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Organization Members</p>
                <div className="space-y-2">
                  {organizationMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-3 h-3 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                        {member.is_admin ? 'Admin' : 'Member'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Show organization members for invited users */}
            {organizationMembers.length > 0 && profile.invited_by && (
              <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-200'}`}>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Organization Members</p>
                <div className="space-y-2">
                  {organizationMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-3 h-3 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${member.is_admin ? (darkMode ? 'bg-green-900 text-green-400' : 'bg-green-100 text-green-700') : (darkMode ? 'bg-gray-600' : 'bg-gray-200')}`}>
                        {member.is_admin ? 'Admin' : 'Member'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email - read only */}
            <div>
              <label className="block text-sm font-bold mb-1 text-gray-500">Email</label>
              <input
                type="email"
                value={profile.email}
                disabled
                className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-500'} cursor-not-allowed`}
              />
              <p className="text-xs text-gray-400 mt-1">From your signup account</p>
            </div>

            {/* Phone - editable */}
            <div>
              <label className="block text-sm font-bold mb-1 text-gray-500">Mobile Number</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="e.g. +254 712 345 678"
                className={`w-full p-3 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>

            {/* Response Type Selection */}
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-500">Response Types</label>
              <p className="text-xs text-gray-400 mb-3">Select the emergency types you respond to</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => toggleResponseType('FIRE')}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all font-bold text-sm ${
                    profile.response_types.includes('FIRE')
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : darkMode
                      ? 'border-gray-600 text-gray-400 hover:border-gray-500'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Flame className="w-4 h-4" />
                  Fire
                </button>
                <button
                  type="button"
                  onClick={() => toggleResponseType('MEDICAL')}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all font-bold text-sm ${
                    profile.response_types.includes('MEDICAL')
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : darkMode
                      ? 'border-gray-600 text-gray-400 hover:border-gray-500'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <HeartPulse className="w-4 h-4" />
                  Medical
                </button>
              </div>
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`mt-6 w-full flex items-center justify-center gap-2 p-3 rounded-lg font-bold text-sm transition-all ${
              saving
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Profile'}
          </button>

          {saveMessage && (
            <p className={`mt-3 text-sm font-medium ${saveMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage}
            </p>
          )}
        </div>

        {/* Dark Mode */}
        <div className="flex items-center justify-between">
          <span className="font-bold">Dark Mode</span>
          <button onClick={toggleTheme} className={`w-12 h-6 ${darkMode ? 'bg-blue-600' : 'bg-gray-400'} rounded-full transition-all`}>
            <div className={`w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'ml-7' : 'ml-1'}`}></div>
          </button>
        </div>

        {/* Push Notification Settings */}
        <div className={`border rounded-xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <span className="font-bold block mb-4">Push Notifications</span>

          {!push.isSupported && (
            <p className="text-sm text-gray-500">Push notifications are not supported in this browser. Try Chrome or Edge on desktop/Android.</p>
          )}

          {push.isSupported && (
            <div className="space-y-4">
              {/* Status pill */}
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                push.isSubscribed
                  ? darkMode ? 'bg-green-900/30 border-green-700' : 'bg-green-50 border-green-300'
                  : darkMode ? 'bg-yellow-900/30 border-yellow-700' : 'bg-yellow-50 border-yellow-400'
              }`}>
                {push.isSubscribed
                  ? <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
                  : <BellOff className="w-5 h-5 text-yellow-600 shrink-0" />
                }
                <div>
                  <p className={`text-sm font-bold ${push.isSubscribed ? (darkMode ? 'text-green-400' : 'text-green-700') : (darkMode ? 'text-yellow-300' : 'text-yellow-700')}`}>
                    {push.isSubscribed ? 'Push notifications are ON' : 'Push notifications are OFF'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {push.isSubscribed
                      ? 'You will receive emergency alert calls even when this tab is in the background.'
                      : 'Enable to receive alert calls in the background or when the tab is closed.'}
                  </p>
                </div>
              </div>

              {/* Error message */}
              {push.errorMessage && (
                <div className={`p-3 rounded-lg text-sm border ${darkMode ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-red-50 border-red-300 text-red-700'}`}>
                  {push.errorMessage}
                </div>
              )}

              {/* Blocked message */}
              {push.permission === 'denied' && (
                <div className={`p-3 rounded-lg text-sm border ${darkMode ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-red-50 border-red-300 text-red-700'}`}>
                  Notifications are blocked in your browser. To fix:<br />
                  Chrome: click the lock icon in the address bar → Notifications → Allow<br />
                  Firefox: Preferences → Privacy → Notifications → remove block for this site
                </div>
              )}

              {/* Enable button */}
              {!push.isSubscribed && push.permission !== 'denied' && (
                <button
                  disabled={push.subscribing || push.permission === 'loading'}
                  onClick={async () => {
                    const ok = await push.subscribe();
                    if (ok && !audioUnlocked) await handleUnlockAudio();
                  }}
                  className={`w-full font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                    push.subscribing || push.permission === 'loading'
                      ? 'bg-gray-400 cursor-not-allowed text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {push.subscribing
                    ? <><Loader className="w-5 h-5 animate-spin" /> Enabling...</>
                    : <><BellRing className="w-5 h-5" /> Enable Emergency Alert Notifications</>
                  }
                </button>
              )}

              {/* Disable button */}
              {push.isSubscribed && (
                <button
                  disabled={push.subscribing}
                  onClick={() => push.unsubscribe()}
                  className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-colors flex items-center justify-center gap-2 ${
                    push.subscribing
                      ? 'opacity-50 cursor-not-allowed'
                      : darkMode ? 'border-gray-600 text-gray-400 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {push.subscribing
                    ? <Loader className="w-4 h-4 animate-spin" />
                    : <BellOff className="w-4 h-4" />
                  }
                  Disable Push Notifications
                </button>
              )}
            </div>
          )}
        </div>

        {/* Alert Sound Settings */}
        <div className={`border rounded-xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <span className="font-bold block mb-4">Alert Sound Settings</span>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-bold">Enable Sound Alerts</span>
                <p className="text-xs text-gray-500 mt-0.5">Plays a ring tone when a new alert arrives</p>
              </div>
              <button
                onClick={() => handleToggleSound(!soundEnabled)}
                className={`w-12 h-6 ${soundEnabled ? 'bg-blue-600' : 'bg-gray-400'} rounded-full transition-all shrink-0`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-all ${soundEnabled ? 'ml-7' : 'ml-1'}`}></div>
              </button>
            </div>

            {!audioUnlocked && (
              <button
                onClick={handleUnlockAudio}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Bell className="w-4 h-4" />
                Unlock Audio Permission
              </button>
            )}

            <button
              onClick={handleTestAlertSound}
              className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-bold transition-all ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              Test Alert Sound
            </button>
          </div>
        </div>

        {/* Account Management - Only for responders who weren't invited */}
        {!profile.invited_by && (
          <div className={`border rounded-xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <span className="font-bold">Account Management</span>
              </div>
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                disabled={!profile.organization_name}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  showAddUser
                    ? 'bg-gray-200 text-gray-700'
                    : profile.organization_name
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                {showAddUser ? 'Cancel' : 'Add User'}
              </button>
            </div>

            {/* Warning if no organization */}
            {!profile.organization_name && (
              <div className={`p-4 rounded-lg mb-4 ${darkMode ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-yellow-50 border border-yellow-300'}`}>
                <p className={`text-sm font-bold ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
                  Set up your organization name above before adding team members.
                </p>
              </div>
            )}

            <p className="text-xs text-gray-500 mb-4">
              Add new responder users to your organization. They will log in with the email and password you provide.
            </p>

            {/* Add User Form */}
            {showAddUser && profile.organization_name && (
              <div className={`p-4 rounded-lg border mb-4 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold mb-1 text-gray-500">Full Name</label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Enter their name"
                      className={`w-full p-2.5 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1 text-gray-500">Email</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="responder@email.com"
                      className={`w-full p-2.5 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1 text-gray-500">Password</label>
                    <input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="Set a password for them"
                      className={`w-full p-2.5 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-black'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>

                  {addUserError && (
                    <p className="text-red-500 text-xs">{addUserError}</p>
                  )}
                  {addUserSuccess && (
                    <p className="text-green-500 text-xs">{addUserSuccess}</p>
                  )}

                  <button
                    onClick={async () => {
                      setAddingUser(true);
                      setAddUserError(null);
                      setAddUserSuccess(null);

                      if (!newUserEmail.trim() || !newUserPassword.trim() || !newUserName.trim()) {
                        setAddUserError('Please fill in all fields.');
                        setAddingUser(false);
                        return;
                      }

                      if (newUserPassword.length < 6) {
                        setAddUserError('Password must be at least 6 characters.');
                        setAddingUser(false);
                        return;
                      }

                      try {
                        const { data: { user: currentUser } } = await supabase.auth.getUser();
                        if (!currentUser) {
                          setAddUserError('Not authenticated.');
                          return;
                        }

                        // Sign up the new user using admin edge function
                        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
                        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

                        // First, sign up the user with Supabase auth
                        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                          email: newUserEmail.trim(),
                          password: newUserPassword.trim(),
                          options: {
                            data: {
                              name: newUserName.trim(),
                              user_type: 'Responder',
                              invited_by: currentUser.id,
                              organization_name: profile.organization_name,
                            },
                          },
                        });

                        if (signUpError) {
                          setAddUserError(signUpError.message);
                          return;
                        }

                        if (!signUpData.user) {
                          setAddUserError('Failed to create user.');
                          return;
                        }

                        // Create or update the profile with invited_by and organization_name
                        // Use upsert to handle both creating new profile and updating existing
                        const { error: profileError } = await supabase
                          .from('profiles')
                          .upsert({
                            id: signUpData.user.id,
                            name: newUserName.trim(),
                            email: newUserEmail.trim(),
                            user_type: 'Responder',
                            invited_by: currentUser.id,
                            organization_name: profile.organization_name,
                            response_types: [],
                            phone: '',
                          }, { onConflict: 'id' });

                        if (profileError) {
                          console.error('Failed to update profile:', profileError);
                          setAddUserError('User created but failed to link to your account.');
                          return;
                        }

                        setAddUserSuccess(`User "${newUserName.trim()}" created successfully!`);
                        setNewUserName('');
                        setNewUserEmail('');
                        setNewUserPassword('');
                        setShowAddUser(false);

                        // Refresh invited users list
                        const { data: invited } = await supabase
                          .from('profiles')
                          .select('id, name, email, created_at')
                          .eq('invited_by', currentUser.id);
                        if (invited) setInvitedUsers(invited);

                        // Refresh organization members
                        if (profile.organization_name) {
                          const { data: orgMembers } = await supabase
                            .from('profiles')
                            .select('id, name, email, created_at, invited_by')
                            .eq('organization_name', profile.organization_name)
                            .neq('id', currentUser.id);
                          if (orgMembers) {
                            setOrganizationMembers(
                              orgMembers.map((m) => ({
                                id: m.id,
                                name: m.name,
                                email: m.email,
                                created_at: m.created_at,
                                is_admin: !m.invited_by,
                              }))
                            );
                          }
                        }
                      } catch (err: any) {
                        console.error('Failed to add user:', err);
                        setAddUserError(err.message || 'Failed to add user.');
                      } finally {
                        setAddingUser(false);
                      }
                    }}
                    disabled={addingUser}
                    className={`w-full flex items-center justify-center gap-2 p-2.5 rounded-lg font-bold text-sm transition-colors ${
                      addingUser
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {addingUser ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Create Responder User
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* List of invited users */}
            {invitedUsers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Users you've added</p>
                {invitedUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      Added {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {invitedUsers.length === 0 && !showAddUser && (
              <p className="text-xs text-gray-500 text-center py-4">
                You haven't added any users yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
