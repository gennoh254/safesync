import { User, Flame, HeartPulse, Save, Loader, Volume2, VolumeX, Bell, BellRing, BellOff, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { useEmergencyAlert, unlockAudio, isAudioUnlocked } from '../hooks/useEmergencyAlert';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  response_types: string[];
}

const SOUND_PREF_KEY = 'safesync_responder_sound_enabled';

export function getResponderSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem(SOUND_PREF_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function ReceiverSettings() {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === 'dark';
  const { testAlert } = useEmergencyAlert();
  const push = usePushNotifications();

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getResponderSoundEnabled());
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({ name: '', email: '', phone: '', response_types: [] });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          .select('name, email, phone, response_types')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setProfile({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            response_types: data.response_types || [],
          });
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
            <p className="text-sm text-gray-500">Push notifications are not supported in this browser.</p>
          )}
          {push.isSupported && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                push.isSubscribed
                  ? darkMode ? 'bg-green-900/30 border border-green-700' : 'bg-green-50 border border-green-300'
                  : darkMode ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-yellow-50 border border-yellow-400'
              }`}>
                {push.isSubscribed
                  ? <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
                  : <BellOff className="w-5 h-5 text-yellow-600 shrink-0" />
                }
                <div>
                  <p className={`text-sm font-bold ${push.isSubscribed ? (darkMode ? 'text-green-400' : 'text-green-700') : (darkMode ? 'text-yellow-300' : 'text-yellow-700')}`}>
                    {push.isSubscribed ? 'Push notifications enabled' : 'Push notifications not enabled'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {push.isSubscribed
                      ? 'You will receive alert calls even when the app is in the background.'
                      : 'Enable to receive emergency alert calls in the background or when the tab is closed.'}
                  </p>
                </div>
              </div>

              {push.permission === 'denied' && (
                <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                  Notifications are blocked. To fix: open browser Settings → Site Settings → Notifications → allow this site.
                </p>
              )}

              {!push.isSubscribed && push.permission !== 'denied' && (
                <button
                  onClick={async () => {
                    await push.subscribe();
                    if (!audioUnlocked) await handleUnlockAudio();
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <BellRing className="w-5 h-5" />
                  Enable Emergency Alert Notifications
                </button>
              )}

              {push.isSubscribed && (
                <button
                  onClick={() => push.unsubscribe()}
                  className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-colors flex items-center justify-center gap-2 ${
                    darkMode ? 'border-gray-600 text-gray-400 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <BellOff className="w-4 h-4" />
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
      </div>
    </div>
  );
}
