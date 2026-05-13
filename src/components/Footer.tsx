import { ShieldCheck } from 'lucide-react';

export function FooterStatusBar() {
  return (
    <div className="w-full pb-8 pt-4 px-8 text-center flex flex-col items-center gap-4 bg-black">
        <div className="flex items-center gap-2 text-gray-400 text-sm font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>Enterprise Security Secured by <span className="text-white">SafeSync</span></span>
        </div>
        <div className="flex gap-8 text-xs font-bold uppercase tracking-wider text-gray-500">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-600"></div> SYSTEM READY</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> ENCRYPTED</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-600"></div> UPTIME 99.9%</div>
        </div>
    </div>
  );
}
