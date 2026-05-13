/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AuthForm, AccountType } from './components/LoginForm';
import { HomeDashboard } from './components/HomeDashboard';
import { ReceiverLayout } from './components/ReceiverLayout';
import { AdminLayout } from './components/AdminLayout';
import { ThemeProvider } from './context/ThemeContext';
import { supabase } from './lib/supabase';

export default function App() {
  const [userType, setUserType] = useState<AccountType | 'Administrator' | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        (async () => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', session.user.id)
            .maybeSingle();
          if (profile?.user_type) {
            setUserType(profile.user_type as AccountType);
          }
        })();
      }
      setSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUserType(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <div className="flex flex-col min-h-screen bg-white text-black items-center justify-center">
        {!userType ? (
          <>
            <AuthForm onAuthenticate={(type) => setUserType(type)} />
            <button
              className="mt-6 text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setUserType('Administrator')}
            >
              Administrative Portal
            </button>
          </>
        ) : userType === 'Client' ? (
          <HomeDashboard />
        ) : userType === 'Responder' ? (
          <ReceiverLayout />
        ) : (
          <AdminLayout />
        )}
      </div>
    </ThemeProvider>
  );
}
