import { KeyRound, ShieldCheck, User, Mail, Building } from 'lucide-react';
import React, { useState } from 'react';

export type AccountType = 'Client' | 'Responder' | 'Administrator';

export function AuthForm({ onAuthenticate, onRecoverPassword }: { onAuthenticate: (type: AccountType) => void, onRecoverPassword: () => void }) {
  const [mode, setMode] = useState<'Login' | 'Signup'>('Login');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('Client');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAuthenticate(accountType);
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
        <p className="text-gray-600">Log in to your account</p>
      </div>
      
      <div className="border-t border-gray-200 w-full mb-8"></div>

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
                type="password" />
        </div>
        
        <div className="space-y-2">
            <label className="text-sm text-gray-900 font-medium">Account Type</label>
            <select 
                className="w-full h-12 px-4 bg-white border border-gray-300 text-gray-900 rounded-none focus:border-red-600 outline-none"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
            >
                <option value="Client">Client</option>
                <option value="Responder">Responder</option>
                <option value="Administrator">Administrator</option>
            </select>
        </div>
        
        {mode === 'Login' && (
            <div className="text-sm">
                <span className="text-gray-600">Forgot your password? </span>
                <button type="button" onClick={onRecoverPassword} className="text-red-600 hover:text-red-700 font-medium">Recover</button>
            </div>
        )}
        
        <button className="w-full bg-red-600 text-white py-3 h-12 rounded-none font-bold hover:bg-red-700 transition-all uppercase" type="submit">
          {mode === 'Login' ? 'Log in to account' : 'Sign Up'}
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
            {mode === 'Login' ? "Don't have an account? " : "Already have an account? "}
            <button type="button" className="text-red-600 font-bold" onClick={() => setMode(mode === 'Login' ? 'Signup' : 'Login')}>
                {mode === 'Login' ? 'Register now' : 'Login'}
            </button>
        </p>

        <div className="text-center mt-6">
            <button type="button" onClick={() => onAuthenticate('Administrator')} className="text-xs text-gray-500 hover:text-red-500">Administrative Portal</button>
        </div>
      </form>
    </div>
  );
}
