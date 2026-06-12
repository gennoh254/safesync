import { KeyRound, ShieldCheck, User, Mail, Building, Eye, EyeOff, Loader as Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export type AccountType = 'Client' | 'Responder' | 'Administrator';

export function AuthForm({ onAuthenticate, onRecoverPassword }: { onAuthenticate: (type: AccountType) => void, onRecoverPassword: () => void }) {
  const [mode, setMode] = useState<'Login' | 'Signup'>('Login');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('Client');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'Signup') {
        if (!name.trim()) {
          setError('Please enter your full name');
          setLoading(false);
          return;
        }

        // Sign up with Supabase Auth
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: pin,
          options: {
            data: {
              name: name.trim(),
              user_type: accountType,
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }

        // Create profile in profiles table
        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            name: name.trim(),
            email: email.trim(),
            user_type: accountType,
            company: company.trim() || null,
          });

          if (profileError) {
            console.error('Profile creation error:', profileError);
          }
        }

        onAuthenticate(accountType);
      } else {
        // Login
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pin,
        });

        if (loginError) {
          setError(loginError.message);
          setLoading(false);
          return;
        }

        // Get user type from profile
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', data.user.id)
            .maybeSingle();

          onAuthenticate((profile?.user_type as AccountType) || 'Client');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pin,
      });

      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', data.user.id)
          .maybeSingle();

        const userType = (profile?.user_type as AccountType) || 'Client';

        if (userType !== 'Administrator') {
          setError('Access denied. Admin privileges required.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        onAuthenticate('Administrator');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg bg-white border border-gray-200 p-10 shadow-2xl">
      <div className="flex justify-center mb-6">
        <div className="flex items-center gap-2 border border-gray-200 px-6 py-2 rounded-full">
            <ShieldCheck className="text-red-500 w-6 h-6" />
            <span className="text-xl font-bold tracking-tight text-gray-900 uppercase">SafeSync</span>
        </div>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome!</h1>
        <p className="text-gray-600">{mode === 'Login' ? 'Log in to your account' : 'Create your account'}</p>
      </div>

      <div className="border-t border-gray-200 w-full mb-8"></div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === 'Signup' && (
            <div className="space-y-2">
                <label className="text-sm text-gray-900 font-medium">Full Name</label>
                <input
                    className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none disabled:opacity-50"
                    placeholder="Full Name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                />
            </div>
        )}

        <div className="space-y-2">
            <label className="text-sm text-gray-900 font-medium">Email address</label>
            <input
                className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none disabled:opacity-50"
                placeholder="Enter email address"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
            />
        </div>

        <div className="space-y-2">
            <label className="text-sm text-gray-900 font-medium">Password</label>
            <div className="relative">
                <input
                    className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none pr-10 disabled:opacity-50"
                    placeholder={mode === 'Signup' ? 'Create a password (min 6 characters)' : 'Enter password'}
                    required
                    minLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    disabled={loading}
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>
        </div>

        {mode === 'Signup' && (
          <div className="space-y-2">
              <label className="text-sm text-gray-900 font-medium">Company/Organization (Optional)</label>
              <input
                  className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none disabled:opacity-50"
                  placeholder="Company name"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={loading}
              />
          </div>
        )}

        <div className="space-y-2">
            <label className="text-sm text-gray-900 font-medium">Account Type</label>
            <select
                className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none disabled:opacity-50"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                disabled={loading}
            >
                <option value="Client">Client</option>
                <option value="Responder">Responder</option>
            </select>
        </div>

        {mode === 'Login' && (
            <div className="text-sm">
                <span className="text-gray-600">Forgot your password? </span>
                <button type="button" onClick={onRecoverPassword} className="text-red-600 hover:text-red-700 font-medium">Recover</button>
            </div>
        )}

        <button
          className={`w-full bg-red-600 text-white py-3 h-12 rounded-none font-bold hover:bg-red-700 transition-all uppercase flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          type="submit"
          disabled={loading}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'Login' ? 'Log in to account' : 'Sign Up'}
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
            {mode === 'Login' ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              className="text-red-600 font-bold disabled:opacity-50"
              onClick={() => { setMode(mode === 'Login' ? 'Signup' : 'Login'); setError(null); }}
              disabled={loading}
            >
                {mode === 'Login' ? 'Register now' : 'Login'}
            </button>
        </p>

        <div className="text-center mt-6">
            <button
              type="button"
              onClick={handleAdminLogin}
              className="text-xs text-gray-500 hover:text-red-500 disabled:opacity-50"
              disabled={loading}
            >
              Administrative Portal
            </button>
        </div>


      </form>
    </div>
  );
}
