import { KeyRound, ShieldAlert, User, Mail, Building, CircleAlert as AlertCircle, Loader as Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { supabase, UserType } from '../lib/supabase';

export type AccountType = UserType;

export function AuthForm({ onAuthenticate }: { onAuthenticate: (type: AccountType) => void }) {
  const [mode, setMode] = useState<'Login' | 'Signup'>('Login');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('Client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'Signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: pin,
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          await new Promise(resolve => setTimeout(resolve, 500));

          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            name,
            company,
            email,
            user_type: accountType,
          });

          if (profileError) throw profileError;

          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: pin,
          });

          if (signInError) throw signInError;

          onAuthenticate(accountType);
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: pin,
        });

        if (signInError) throw signInError;

        if (data.user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', data.user.id)
            .maybeSingle();

          if (profileError) throw profileError;

          const type = (profile?.user_type as AccountType) ?? accountType;
          onAuthenticate(type);
        }
      }
    } catch (err: any) {
      setError(err.message ?? 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'Login' ? 'Signup' : 'Login');
    setError(null);
    setPin('');
  };

  return (
    <div className="w-full max-w-sm bg-white border border-gray-300 rounded-lg p-8 shadow-[0_0_30px_rgba(0,0,0,0.05)]">
      <div className="flex justify-center mb-6">
        <ShieldAlert className="text-red-600 w-12 h-12" />
      </div>

      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 uppercase tracking-tighter">SafeSync</h1>
        <p className="text-gray-600 text-xs">{mode === 'Login' ? 'Access Control Unit' : 'Create New Account'}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded p-3 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'Signup' && (
          <>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                className="w-full h-12 pl-10 pr-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none"
                placeholder="Full Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                className="w-full h-12 pl-10 pr-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none"
                placeholder="Company Name"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            className="w-full h-12 pl-10 pr-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none"
            placeholder="Email Address"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode === 'Signup' && (
          <select
            className="w-full h-12 px-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
          >
            <option value="Client">Client</option>
            <option value="Responder">Responder</option>
          </select>
        )}

        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            className="w-full h-12 pl-10 pr-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all"
            placeholder="Password (minimum 6 characters)"
            required
            minLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
          />
        </div>

        <button
          className="w-full bg-red-600 text-white py-3 h-12 rounded font-bold hover:bg-red-700 transition-all uppercase flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          type="submit"
          disabled={loading}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'Login' ? 'Authenticate' : 'Create Account'}
        </button>

        <p className="text-center text-xs text-gray-600 mt-4">
          {mode === 'Login' ? "Don't have an account?" : 'Already have an account?'}
          <button type="button" className="text-red-600 ml-1 font-bold" onClick={switchMode}>
            {mode === 'Login' ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </form>
    </div>
  );
}
