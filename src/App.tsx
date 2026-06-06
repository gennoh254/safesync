/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { AuthForm, AccountType } from './components/LoginForm';
import { PasswordRecovery } from './components/PasswordRecovery';
import { HomeDashboard } from './components/HomeDashboard';
import { ReceiverLayout } from './components/ReceiverLayout';
import { AdminLayout } from './components/AdminLayout';
import { AlertProvider } from './context/AlertContext';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { FooterStatusBar } from './components/Footer';

export default function App() {
  const [userType, setUserType] = useState<AccountType | null>(null);
  const [authView, setAuthView] = useState<'login' | 'recovery'>('login');

  return (
    <ThemeProvider>
      <AlertProvider>
        {!userType ? (
          <div className="flex flex-col min-h-screen bg-gray-100 text-black">
            <Header />
            <main className="flex-grow flex items-center justify-center p-8">
              {authView === 'login' ? (
                <AuthForm onAuthenticate={(type) => setUserType(type)} onRecoverPassword={() => setAuthView('recovery')} />
              ) : (
                <PasswordRecovery onBack={() => setAuthView('login')} />
              )}
            </main>
            <FooterStatusBar />
          </div>
        ) : (
          <div className="flex flex-col min-h-screen bg-white text-black items-center justify-center">
            {userType === 'Client' ? (
                <HomeDashboard />
            ) : (
                <ReceiverLayout />
            )}
          </div>
        )}
      </AlertProvider>
    </ThemeProvider>
  );
}
