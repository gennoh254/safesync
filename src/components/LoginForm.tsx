import { ShieldCheck, User, Mail, Loader } from 'lucide-react';
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export type AccountType = 'Client' | 'Responder';

interface AuthFormProps {
  onAuthenticate: (type: AccountType) => void;
  onRecoverPassword: () => void;
}

export function AuthForm({ onAuthenticate, onRecoverPassword }: AuthFormProps) {
  const [mode, setMode] = useState<'Login' | 'Signup'>('Login');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('Client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'Signup') {
        // Use edge function to create user + profile atomically
        const { data, error: fnError } = await supabase.functions.invoke('create_profile', {
          body: {
            name: name.trim(),
            email: email.trim(),
            password: pin,
            user_type: accountType,
            company: '',
          },
        });

        if (fnError) {
          const msg = await fnError.context?.text?.();
          try {
            const parsed = JSON.parse(msg || '{}');
            setError(parsed.error || fnError.message);
          } catch {
            setError(fnError.message);
          }
          return;
        }

        if (data?.error) {
          setError(data.error);
          return;
        }

        // After signup, sign in automatically
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pin,
        });

        if (signInError) {
          setError('Account created! Please log in manually.');
          setMode('Login');
          return;
        }

        onAuthenticate(accountType);
      } else {
        // Login
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pin,
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        // Fetch user_type from profile
        const userId = data.user?.id;
        if (userId) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', userId)
            .maybeSingle();

          if (profileError || !profile) {
            setError('Profile not found. Please contact support.');
            await supabase.auth.signOut();
            return;
          }

          onAuthenticate(profile.user_type as AccountType);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
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
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === 'Signup' && (
          <div className="space-y-2">
            <label className="text-sm text-gray-900 font-medium">Full Name</label>
            <input
              className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none"
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
            className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none"
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
          <input
            className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none"
            placeholder="Enter password"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            disabled={loading}
            minLength={6}
          />
        </div>

        {mode === 'Signup' && (
          <div className="space-y-2">
            <label className="text-sm text-gray-900 font-medium">Account Type</label>
            <select
              className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
              disabled={loading}
            >
              <option value="Client">Client</option>
              <option value="Responder">Responder</option>
            </select>
          </div>
        )}

        {mode === 'Login' && (
          <div className="text-sm">
            <span className="text-gray-600">Forgot your password? </span>
            <button type="button" onClick={onRecoverPassword} className="text-red-600 hover:text-red-700 font-medium">Recover</button>
          </div>
        )}

        <button
          className="w-full bg-red-600 text-white py-3 h-12 rounded-none font-bold hover:bg-red-700 transition-all uppercase flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              {mode === 'Login' ? 'Logging in...' : 'Creating account...'}
            </>
          ) : (
            mode === 'Login' ? 'Log in to account' : 'Sign Up'
          )}
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
          {mode === 'Login' ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            className="text-red-600 font-bold"
            onClick={() => { setMode(mode === 'Login' ? 'Signup' : 'Login'); setError(null); }}
            disabled={loading}
          >
            {mode === 'Login' ? 'Register now' : 'Login'}
          </button>
        </p>
      </form>
    </div>
  );
}
