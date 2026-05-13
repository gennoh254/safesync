import { ShieldCheck } from 'lucide-react';

export function Header() {
  return (
    <header className="fixed top-0 w-full z-50 flex justify-center items-center px-4 h-16 bg-black border-b border-gray-800">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-white w-6 h-6" />
        <span className="text-2xl font-bold tracking-tight text-white">Alertify</span>
      </div>
    </header>
  );
}
