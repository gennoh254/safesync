import { useState, useEffect } from 'react';
import { AuthForm, AccountType } from './components/LoginForm';
import { PasswordRecovery } from './components/PasswordRecovery';
import { HomeDashboard } from './components/HomeDashboard';
import { ReceiverLayout } from './components/ReceiverLayout';
import { AdminLayout } from './components/AdminLayout';
import { AlertProvider } from './context/AlertContext';
import { ThemeProvider } from './context/ThemeContext';
import { PushNotificationProvider } from './context/PushNotificationContext';
import { Header } from './components/Header';
import { FooterStatusBar } from './components/Footer';
import { supabase } from './lib/supabase';

type AppView = 'login' | 'recovery' | 'admin';

export default function App() {
  const [userType, setUserType] = useState<AccountType | null>(null);
  const [authView, setAuthView] = useState<AppView>('login');
  const [initializing, setInitializing] = useState(true);

  // Listen for auth state changes (handles session restore, login, logout)
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && mounted) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile && mounted) {
          setUserType(profile.user_type as AccountType);
        } else if (session.user.user_metadata?.user_type && mounted) {
          // Fallback to user_metadata if profile doesn't exist
          // Create missing profile
          const userType = session.user.user_metadata.user_type as AccountType;
          await supabase.from('profiles').upsert({
            id: session.user.id,
            name: session.user.user_metadata.name || '',
            email: session.user.email || '',
            user_type: userType,
            organization_name: session.user.user_metadata.organization_name || '',
            phone: '',
            response_types: [],
          }, { onConflict: 'id' });
          setUserType(userType);
        }
      }
      if (mounted) setInitializing(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        setUserType(null);
        setAuthView('login');
        return;
      }

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile) {
          setUserType(profile.user_type as AccountType);
        } else if (session.user.user_metadata?.user_type) {
          // Fallback to user_metadata if profile doesn't exist
          // Create missing profile
          const userType = session.user.user_metadata.user_type as AccountType;
          await supabase.from('profiles').upsert({
            id: session.user.id,
            name: session.user.user_metadata.name || '',
            email: session.user.email || '',
            user_type: userType,
            organization_name: session.user.user_metadata.organization_name || '',
            phone: '',
            response_types: [],
          }, { onConflict: 'id' });
          setUserType(userType);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserType(null);
    setAuthView('login');
  };

  // Admin portal view (no auth required)
  if (authView === 'admin') {
    return (
      <ThemeProvider>
        <AdminLayout onExit={() => setAuthView('login')} />
      </ThemeProvider>
    );
  }

  if (initializing) {
    return (
      <ThemeProvider>
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full"></div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <PushNotificationProvider>
      <AlertProvider>
        {!userType ? (
          <div className="flex flex-col min-h-screen bg-gray-100 text-black">
            <Header />

            <main className="flex-grow flex items-center justify-center p-8">
              {authView === 'login' ? (
                <AuthForm
                  onAuthenticate={(type) => setUserType(type)}
                  onRecoverPassword={() => setAuthView('recovery')}
                  onAdminPortal={() => setAuthView('admin')}
                />
              ) : (
                <PasswordRecovery
                  onBack={() => setAuthView('login')}
                />
              )}
            </main>

            <FooterStatusBar />
          </div>
        ) : (
          <div className="flex flex-col min-h-screen bg-white text-black items-center justify-center">
            {userType === 'Client' ? (
              <HomeDashboard onLogout={handleLogout} />
            ) : userType === 'Administrator' ? (
              <AdminLayout onExit={handleLogout} />
            ) : (
              <ReceiverLayout onLogout={handleLogout} />
            )}
          </div>
        )}
      </AlertProvider>
      </PushNotificationProvider>
    </ThemeProvider>
  );
}
