import { Zap, Navigation, ShieldCheck, Bell, MapPin, Smartphone } from 'lucide-react';

const features = [
  { icon: Zap, label: 'Real-time Alerts', color: 'text-red-500', bg: 'bg-red-50' },
  { icon: Navigation, label: 'Nearby Responders', color: 'text-blue-500', bg: 'bg-blue-50' },
  { icon: ShieldCheck, label: 'Community Protection', color: 'text-green-500', bg: 'bg-green-50' },
];

function PhoneIllustration() {
  return (
    <div className="relative mx-auto" style={{ width: '140px', height: '200px' }}>
      {/* Phone frame */}
      <div className="absolute inset-0 bg-[#0F172A] rounded-[22px] shadow-xl border-[3px] border-gray-800 overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-4 bg-black rounded-b-xl z-20" />

        {/* Screen - map background */}
        <div className="absolute inset-0 top-4 overflow-hidden">
          {/* Map grid */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 140 196" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#dbeafe" />
                <stop offset="100%" stopColor="#bfdbfe" />
              </linearGradient>
            </defs>
            <rect width="140" height="196" fill="url(#mapBg)" />
            {/* Roads */}
            <path d="M0 60 L140 80" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.9" />
            <path d="M0 120 L140 100" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
            <path d="M40 0 L60 196" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
            <path d="M100 0 L90 196" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
            {/* Route line */}
            <path d="M30 170 Q60 120 70 60" stroke="#E53935" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="4 3" />
          </svg>

          {/* Responder marker (top) */}
          <div className="absolute" style={{ top: '45px', left: '58px' }}>
            <div className="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
              <Navigation className="w-2.5 h-2.5 text-white" />
            </div>
          </div>

          {/* Client location pin (bottom) */}
          <div className="absolute" style={{ bottom: '20px', left: '20px' }}>
            <div className="relative">
              <div className="absolute -inset-2 bg-red-500/30 rounded-full animate-ping" style={{ animationDuration: '1.5s' }} />
              <div className="relative w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                <MapPin className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>

          {/* Notification badge */}
          <div className="absolute top-2 right-2 z-10">
            <div className="relative">
              <div className="w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center">
                <Bell className="w-3.5 h-3.5 text-red-500" />
              </div>
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border border-white flex items-center justify-center">
                <span className="text-[7px] font-bold text-white leading-none">!</span>
              </div>
            </div>
          </div>

          {/* Status bar at bottom */}
          <div className="absolute bottom-0 inset-x-0 bg-[#0F172A]/90 px-2 py-1.5">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[7px] font-bold text-white tracking-wide">RESPONDER EN ROUTE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Glow effect */}
      <div className="absolute -inset-3 bg-red-500/10 rounded-[28px] -z-10 blur-md" />
    </div>
  );
}

export function PromoCard() {
  return (
    <div className="w-full max-w-md mx-auto mt-10">
      <div className="bg-white border border-gray-200 rounded-[22px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-red-500 via-red-600 to-red-500" />

        <div className="p-6 sm:p-7">
          {/* Branding */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 bg-[#0F172A] rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0F172A] leading-tight tracking-tight">SafeSync</h3>
              <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider leading-tight">Your Safety. Our Priority.</p>
            </div>
          </div>

          {/* Two-column layout: text + phone illustration */}
          <div className="flex flex-col sm:flex-row gap-5 items-center">
            {/* Left: description + features */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-600 leading-relaxed mb-5">
                SafeSync instantly connects you with nearby emergency responders, helping you receive assistance faster during medical emergencies, fires, accidents, security incidents, and other crises.
              </p>

              {/* Feature icons */}
              <div className="space-y-3">
                {features.map((f) => (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className={`w-9 h-9 ${f.bg} rounded-xl flex items-center justify-center shrink-0`}>
                      <f.icon className={`w-4.5 h-4.5 ${f.color}`} strokeWidth={2} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: phone illustration */}
            <div className="shrink-0 hidden sm:block">
              <PhoneIllustration />
            </div>
          </div>

          {/* Mobile-only phone illustration (below text) */}
          <div className="sm:hidden flex justify-center mt-5">
            <PhoneIllustration />
          </div>

          {/* CTA button */}
          <button className="w-full mt-6 bg-[#E53935] hover:bg-[#D32F2F] text-white font-bold py-3.5 rounded-xl transition-all text-sm tracking-wide shadow-sm hover:shadow-md flex items-center justify-center gap-2">
            <Smartphone className="w-4 h-4" />
            Stay Alert. Stay Safe. SafeSync.
          </button>
        </div>
      </div>
    </div>
  );
}
