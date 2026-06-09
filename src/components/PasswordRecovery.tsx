import { ShieldCheck, ArrowLeft, Loader, CircleCheck } from 'lucide-react';
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export function PasswordRecovery({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send recovery email');
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Recover Password</h1>
        <p className="text-gray-600">Enter your email to receive recovery instructions</p>
      </div>

      <div className="border-t border-gray-200 w-full mb-8"></div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {sent ? (
        <div className="text-center space-y-4">
          <CircleCheck className="w-12 h-12 text-green-600 mx-auto" />
          <p className="font-bold text-green-700">Recovery email sent!</p>
          <p className="text-sm text-gray-500">Check your inbox at {email} for the recovery link.</p>
          <button
            type="button"
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-red-600 font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm text-gray-900 font-medium">Email Address</label>
            <input
              className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none"
              placeholder="Enter your email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            className="w-full bg-red-600 text-white py-3 h-12 rounded-none font-bold hover:bg-red-700 transition-all uppercase flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Instructions'
            )}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-red-600 font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </button>
        </form>
      )}
    </div>
  );
}
