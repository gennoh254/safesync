import { AlertTriangle, User, MapPin } from 'lucide-react';
import React, { useState } from 'react';

export function ReceiverAlertOverlay({ senderDetails, onAccept }: { senderDetails: { name: string, location: string }, onAccept: () => void }) {
  const [slide, setSlide] = useState(0);

  const handleDrag = (e: React.TouchEvent | React.MouseEvent) => {
    // Simplified slide logic for demonstration
    if (slide > 200) onAccept();
  };

  return (
    <div className="fixed inset-0 z-50 bg-red-600 flex flex-col items-center justify-center p-6 text-white">
      <AlertTriangle className="w-24 h-24 mb-6 animate-pulse" />
      <h1 className="text-3xl font-bold mb-2">New Alert</h1>
      <div className="bg-white/20 p-4 rounded-lg w-full max-w-sm mb-8">
        <p className="flex items-center gap-2"><User /> {senderDetails.name}</p>
        <p className="flex items-center gap-2"><MapPin /> {senderDetails.location}</p>
      </div>
      <div className="w-full max-w-sm bg-red-800 rounded-full h-16 flex items-center p-2 relative overflow-hidden">
        <div className="bg-white text-red-600 rounded-full w-12 h-12 flex items-center justify-center font-bold"
             onTouchMove={(e) => setSlide(e.touches[0].clientX - 50)}
             onMouseMove={(e) => setSlide(e.clientX - 50)}>
          &gt;&gt;
        </div>
        <span className="absolute inset-0 flex items-center justify-center font-bold">Slide to Accept</span>
      </div>
    </div>
  );
}
