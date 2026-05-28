import { useEffect, useState, useRef, useCallback } from 'react';
import { Navigation, Hop as Home, Users, MapPin, TriangleAlert as AlertTriangle, Flame, HeartPulse } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Location {
  lat: number;
  lng: number;
  name?: string;
  type: 'client' | 'responder';
  id?: string;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface SimpleMapViewProps {
  centerLat: number;
  centerLng: number;
  locations: Location[];
  title?: string;
  mode?: 'client' | 'responder';
}

export function SimpleMapView({ centerLat, centerLng, locations, title, mode = 'client' }: SimpleMapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(300, containerRef.current.clientHeight || 300)
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Draw the map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 0.5;
    const gridSize = 30;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Calculate bounds for all locations
    const allPoints = [{ lat: centerLat, lng: centerLng }, ...locations];
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    allPoints.forEach(p => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    });

    // Add padding
    const latPadding = Math.max(0.01, (maxLat - minLat) * 0.2) || 0.01;
    const lngPadding = Math.max(0.01, (maxLng - minLng) * 0.2) || 0.01;
    minLat -= latPadding; maxLat += latPadding;
    minLng -= lngPadding; maxLng += lngPadding;

    // Convert lat/lng to canvas coordinates
    const toCanvas = (lat: number, lng: number) => {
      const x = ((lng - minLng) / (maxLng - minLng)) * (width - 40) + 20;
      const y = ((maxLat - lat) / (maxLat - minLat)) * (height - 40) + 20;
      return { x, y };
    };

    // Draw connecting lines from center to each location
    const center = toCanvas(centerLat, centerLng);
    locations.forEach(loc => {
      const pos = toCanvas(loc.lat, loc.lng);
      ctx.beginPath();
      ctx.strokeStyle = loc.type === 'responder' ? '#3b82f6' : '#ef4444';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw locations
    locations.forEach(loc => {
      const pos = toCanvas(loc.lat, loc.lng);

      // Outer glow
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 30);
      if (loc.type === 'responder') {
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
      ctx.fill();

      // Marker circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = loc.type === 'responder' ? '#3b82f6' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon placeholder (N for navigation)
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(loc.type === 'responder' ? 'R' : 'C', pos.x, pos.y);

      // Label
      if (loc.name) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(loc.name, pos.x, pos.y + 25);
      }
    });

    // Draw center marker (current user)
    ctx.beginPath();
    ctx.arc(center.x, center.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Center icon
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YOU', center.x, center.y);

    // Draw compass
    const compassX = width - 30;
    const compassY = 30;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(compassX, compassY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(compassX, compassY - 12);
    ctx.lineTo(compassX - 5, compassY + 5);
    ctx.lineTo(compassX + 5, compassY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(compassX, compassY + 12);
    ctx.lineTo(compassX - 5, compassY - 5);
    ctx.lineTo(compassX + 5, compassY - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('N', compassX, compassY - 22);

    // Scale bar
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(20, height - 20, 50, 3);
    ctx.font = '9px sans-serif';
    ctx.fillText('1 km', 20, height - 25);

  }, [centerLat, centerLng, locations, dimensions]);

  const nearestResponder = locations.filter(l => l.type === 'responder').map(loc => {
    const dist = haversineDistance(centerLat, centerLng, loc.lat, loc.lng);
    return { ...loc, dist };
  }).sort((a, b) => a.dist - b.dist)[0];

  return (
    <div ref={containerRef} className="flex flex-col w-full h-full bg-slate-900 rounded-lg overflow-hidden">
      {/* Canvas Map */}
      <div className="relative flex-grow" style={{ minHeight: '300px' }}>
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full h-full"
        />

        {/* Overlay badges */}
        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-gray-700 shadow-sm border border-gray-100 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-red-500" />
          LIVE STATUS
        </div>

        {locations.filter(l => l.type === 'responder').length > 0 && (
          <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm flex items-center gap-1">
            <Users className="w-3 h-3" />
            {locations.filter(l => l.type === 'responder').length} ONLINE
          </div>
        )}

        {title && (
          <div className="absolute bottom-2 left-2 right-2 bg-black/50 backdrop-blur-sm p-2 rounded text-white text-xs font-bold text-center">
            {title}
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="p-4 bg-slate-800 border-t border-slate-700">
        {nearestResponder ? (
          <div className="text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Nearest Responder</p>
            <p className="text-white font-bold text-lg">{nearestResponder.name || 'Unit'}</p>
            <p className="text-blue-400 font-bold">{nearestResponder.dist.toFixed(2)} km away</p>
            <p className="text-green-400 text-sm mt-1">
              ETA: ~{Math.max(1, Math.round(nearestResponder.dist / 0.5))} mins
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider">No responders online</p>
            <p className="text-gray-500 text-sm mt-1">When responders go on-duty, they will appear here</p>
          </div>
        )}

        {/* Location coordinates */}
        <div className="mt-3 flex justify-between text-xs text-gray-500">
          <span>Lat: {centerLat.toFixed(4)}</span>
          <span>Lng: {centerLng.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
