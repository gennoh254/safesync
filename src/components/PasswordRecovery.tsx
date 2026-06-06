import { ShieldCheck, ArrowLeft } from 'lucide-react';
import React, { useState } from 'react';

export function PasswordRecovery({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Password recovery link sent to ' + email);
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
            />
        </div>
        
        <button className="w-full bg-red-600 text-white py-3 h-12 rounded-none font-bold hover:bg-red-700 transition-all uppercase" type="submit">
          Send Instructions
        </button>
        
        <button 
           type="button"
           onClick={onBack}
           className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-red-600 font-bold"
        >
            <ArrowLeft className="w-4 h-4" /> Back to Login
        </button>
      </form>
    </div>
  );
}
