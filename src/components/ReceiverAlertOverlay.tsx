import { AlertTriangle, User, MapPin } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useEmergencyAlert } from './useEmergencyAlert'; // Update with your actual path

interface ReceiverAlertOverlayProps {
  senderDetails: { name: string; location: string };
  onAccept: () => void;
  soundEnabled?: boolean;
}

export function ReceiverAlertOverlay({ 
  senderDetails, 
  onAccept, 
  soundEnabled = true 
}: ReceiverAlertOverlayProps) {
  const [slide, setSlide] = useState(0);
  
  // Cleanly pull our fixed emergency audio hook inside the overlay
  const { startAlert, stopAlert } = useEmergencyAlert();

  // Lifecycle Control: Start audio on mount, cleanly kill audio on unmount
  useEffect(() => {
    startAlert({ onSound: soundEnabled, onVibrate: true, duration: 120000 });

    return () => {
      stopAlert();
    };
  }, [startAlert, soundEnabled, stopAlert]);

  const handleDrag = (clientX: number) => {
    const currentSlide = clientX - 50;
    setSlide(currentSlide);
    
    // Once slid past the threshold, accept the alert (triggers unmount)
    if (currentSlide > 200) {
      stopAlert(); // Turn off sound immediately
      onAccept();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-red-600 flex flex-col items-center justify-center p-6 text-white">
      <AlertTriangle className="w-24 h-24 mb-6 animate-pulse" />
      <h1 className="text-3xl font-bold mb-2">New Alert</h1>
      
      <div className="bg-white/20 p-4 rounded-lg w-full max-w-sm mb-8">
        <p className="flex items-center gap-2 mb-2"><User className="w-5 h-5" /> {senderDetails.name}</p>
        <p className="flex items-center gap-2"><MapPin className="w-5 h-5" /> {senderDetails.location}</p>
      </div>
      
      <div className="w-full max-w-sm bg-red-800 rounded-full h-16 flex items-center p-2 relative overflow-hidden">
        <div 
          className="bg-white text-red-600 rounded-full w-12 h-12 flex items-center justify-center font-bold cursor-grab active:cursor-grabbing transition-transform"
          style={{ transform: `translateX(${Math.max(0, Math.min(slide, 220))}px)` }}
          onTouchMove={(e) => handleDrag(e.touches[0].clientX)}
          onMouseMove={(e) => {
            if (e.buttons === 1) handleDrag(e.clientX); // track only when dragged/clicked
          }}
        >
          &gt;&gt;
        </div>
        <span className="absolute inset-0 flex items-center justify-center font-bold pointer-events-none select-none">
          Slide to Accept
        </span>
      </div>
    </div>
  );
}
