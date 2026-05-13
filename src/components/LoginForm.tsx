import { KeyRound, ShieldAlert, ScanFace, User, Mail, Building } from 'lucide-react';
import React, { useState } from 'react';

export type AccountType = 'Client' | 'Responder';

export function AuthForm({ onAuthenticate }: { onAuthenticate: (type: AccountType) => void }) {
  const [mode, setMode] = useState<'Login' | 'Signup'>('Login');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('Client');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(mode === 'Signup') {
        console.log("Signing up", { name, email, company, accountType, pin });
    }
    onAuthenticate(accountType);
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
            <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                    className="w-full h-12 pl-10 pr-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none"
                    placeholder="Company"
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                />
            </div>
            </>
        )}

        <select 
            className="w-full h-12 px-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
        >
            <option value="Client">Client</option>
            <option value="Responder">Responder</option>
        </select>

        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            className="w-full h-12 pl-10 pr-4 bg-gray-100 border border-gray-300 text-gray-900 rounded focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all tracking-widest text-center" 
            placeholder="4-DIGIT PIN" 
            required 
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
            type="password" />
        </div>
        
        <button className="w-full bg-red-600 text-white py-3 h-12 rounded font-bold hover:bg-red-700 transition-all uppercase" type="submit">
          {mode === 'Login' ? 'Authenticate' : 'Sign Up'}
        </button>

        {mode === 'Login' && (
            <button type="button" className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 h-12 rounded font-bold hover:bg-gray-800 transition-all uppercase">
                <ScanFace className="w-5 h-5" />
                Face Authentication
            </button>
        )}

        <p className="text-center text-xs text-gray-600 mt-4">
            {mode === 'Login' ? "Don't have an account?" : "Already have an account?"}
            <button type="button" className="text-red-600 ml-1 font-bold" onClick={() => setMode(mode === 'Login' ? 'Signup' : 'Login')}>
                {mode === 'Login' ? 'Sign Up' : 'Login'}
            </button>
        </p>
      </form>
    </div>
  );
}
