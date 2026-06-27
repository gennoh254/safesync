import { ArrowLeft, Clock, MapPin, User, Phone, Navigation, Map as MapIcon, Flame, HeartPulse, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Bell, Loader as Loader2, X, MessageSquare, Star, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface AlertDetailViewProps {
  alertId: string;
  onBack: () => void;
  onViewMap: () => void;
}

interface AlertData {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  created_at: string;
  accepted_at: string | null;
  resolved_at: string | null;
  current_responder_id: string | null;
  client_id: string;
  responder_rating?: number | null;
  description?: string | null;
}

interface ResponderInfo {
  id: string;
  name: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
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

export function AlertDetailView({ alertId, onBack, onViewMap }: AlertDetailViewProps) {
  const [alertData, setAlertData] = useState<AlertData | null>(null);
  const [responder, setResponder] = useState<ResponderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [distance, setDistance] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'resolved' | 'unsolved' | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchAlert = async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('id', alertId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch alert:', error);
        setLoading(false);
        return;
      }

      if (data && mounted) {
        const alert = data as AlertData;
        setAlertData(alert);

        if (alert.current_responder_id) {
          const { data: responderData } = await supabase
            .from('profiles')
            .select('id, name, email, latitude, longitude')
            .eq('id', alert.current_responder_id)
            .maybeSingle();

          if (responderData && mounted) {
            setResponder(responderData as ResponderInfo);

            if (alert.latitude && alert.longitude && responderData.latitude && responderData.longitude) {
              const dist = haversineDistance(alert.latitude, alert.longitude, responderData.latitude, responderData.longitude);
              setDistance(dist);
              setEta(Math.max(1, Math.round(dist / 0.5)));
            }
          }
        }

        setLoading(false);
      } else if (mounted) {
        setLoading(false);
      }
    };

    fetchAlert();

    // Subscribe to alert changes for this specific alert
    const channel = supabase
      .channel(`alert-detail-${alertId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts', filter: `id=eq.${alertId}` },
        (payload) => {
          if (payload.new && mounted) {
            const updated = payload.new as AlertData;
            setAlertData(updated);

            if (updated.status === 'ACCEPTED' && updated.current_responder_id) {
              (async () => {
                const { data: responderData } = await supabase
                  .from('profiles')
                  .select('id, name, email, latitude, longitude')
                  .eq('id', updated.current_responder_id!)
                  .maybeSingle();

                if (responderData && mounted) {
                  setResponder(responderData as ResponderInfo);

                  if (updated.latitude && updated.longitude && responderData.latitude && responderData.longitude) {
                    const dist = haversineDistance(updated.latitude, updated.longitude, responderData.latitude, responderData.longitude);
                    setDistance(dist);
                    setEta(Math.max(1, Math.round(dist / 0.5)));
                  }
                }
              })();
            }
          }
        }
      )
      .subscribe();

    // Poll for responder location updates every 5 seconds
    const pollInterval = setInterval(async () => {
      if (!mounted) return;

      const { data: currentAlert } = await supabase
        .from('alerts')
        .select('status, current_responder_id')
        .eq('id', alertId)
        .maybeSingle();

      if (currentAlert && currentAlert.current_responder_id && mounted) {
        const { data: responderData } = await supabase
          .from('profiles')
          .select('id, name, email, latitude, longitude')
          .eq('id', currentAlert.current_responder_id)
          .maybeSingle();

        if (responderData && mounted) {
          setResponder(responderData as ResponderInfo);

          const alert = alertData;
          if (alert?.latitude && alert?.longitude && responderData.latitude && responderData.longitude) {
            const dist = haversineDistance(alert.latitude, alert.longitude, responderData.latitude, responderData.longitude);
            setDistance(dist);
            setEta(Math.max(1, Math.round(dist / 0.5)));
          }
        }
      }
    }, 5000);

    return () => {
      mounted = false;
      channel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [alertId]);

  const handleSubmitFeedback = async () => {
    if (!alertData || !feedback) return;
    if (feedback === 'resolved' && rating === 0) return;

    try {
      const updateData: Record<string, unknown> = {
        resolved_at: new Date().toISOString(),
      };

      if (feedback === 'resolved') {
        updateData.status = 'RESOLVED';
        updateData.responder_rating = rating;
      } else {
        updateData.status = 'UNRESOLVED';
      }

      const { error } = await supabase
        .from('alerts')
        .update(updateData)
        .eq('id', alertData.id);

      if (error) throw error;
      setFeedbackSubmitted(true);
      setAlertData(prev => prev ? { ...prev, status: feedback === 'resolved' ? 'RESOLVED' : 'UNRESOLVED', resolved_at: new Date().toISOString(), responder_rating: feedback === 'resolved' ? rating : null } : prev);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Pending';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const getElapsed = (start: string, end: string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMs = endTime - startTime;
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-grow w-full items-center justify-center gap-4 p-8">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-gray-500 text-sm">Loading alert details...</p>
      </div>
    );
  }

  if (!alertData) {
    return (
      <div className="flex flex-col flex-grow w-full items-center justify-center gap-4 p-8">
        <AlertCircle className="w-8 h-8 text-gray-400" />
        <p className="text-gray-500 text-sm">Alert not found</p>
        <button onClick={onBack} className="text-blue-500 font-bold text-sm">Go Back</button>
      </div>
    );
  }

  const isActive = alertData.status === 'ACTIVE';
  const isAccepted = alertData.status === 'ACCEPTED';
  const isResolved = alertData.status === 'RESOLVED';
  const isUnresolved = alertData.status === 'UNRESOLVED';

  const typeIcon = alertData.emergency_type === 'FIRE'
    ? <Flame className="w-5 h-5 text-orange-500" />
    : alertData.emergency_type === 'MEDICAL'
    ? <HeartPulse className="w-5 h-5 text-red-500" />
    : <Layers className="w-5 h-5 text-purple-500" />;

  const typeLabel = alertData.emergency_type === 'FIRE'
    ? 'Fire Emergency'
    : alertData.emergency_type === 'MEDICAL'
    ? 'Medical Emergency'
    : 'Other Catastrophies';

  const statusConfig = isActive
    ? { label: 'TRANSMITTED', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', icon: <Bell className="w-5 h-5 text-yellow-600" /> }
    : isAccepted
    ? { label: 'ACCEPTED', color: 'bg-green-50 border-green-200 text-green-700', icon: <CheckCircle className="w-5 h-5 text-green-600" /> }
    : isResolved
    ? { label: 'RESOLVED', color: 'bg-green-50 border-green-200 text-green-700', icon: <CheckCircle className="w-5 h-5 text-green-600" /> }
    : { label: 'UNRESOLVED', color: 'bg-red-50 border-red-200 text-red-700', icon: <X className="w-5 h-5 text-red-600" /> };

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto p-4 lg:p-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
      </div>

      {/* Alert Type Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-3 rounded-xl ${isActive ? 'bg-yellow-50' : isAccepted ? 'bg-green-50' : 'bg-gray-50'}`}>
          {typeIcon}
        </div>
        <div>
          <h1 className="text-xl font-bold">{typeLabel}</h1>
          <p className="text-sm text-gray-500">{alertData.location || 'Location recorded'}</p>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`border rounded-xl p-4 mb-6 flex items-center gap-3 ${statusConfig.color}`}>
        {statusConfig.icon}
        <div>
          <p className="font-bold text-sm uppercase tracking-wide">{statusConfig.label}</p>
          <p className="text-xs opacity-80">
            {isActive ? 'Emergency alert sent to responders' : isAccepted ? `${responder?.name || 'Responder'} has acknowledged and is en route` : isResolved ? 'Incident has been resolved' : 'Incident was not resolved'}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="border border-gray-200 rounded-xl p-4 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Timeline</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm" />
              <div className="w-0.5 h-8 bg-gray-200" />
            </div>
            <div className="flex-grow">
              <p className="font-bold text-sm">Alert Triggered</p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(alertData.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${isAccepted || isResolved || isUnresolved ? 'bg-green-500' : 'bg-gray-300'}`} />
              <div className="w-0.5 h-8 bg-gray-200" />
            </div>
            <div className="flex-grow">
              <p className={`font-bold text-sm ${isAccepted || isResolved || isUnresolved ? '' : 'text-gray-400'}`}>
                Alert Accepted
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(alertData.accepted_at)}
              </p>
              {(isAccepted || isResolved || isUnresolved) && alertData.accepted_at && (
                <p className="text-xs text-blue-500 mt-1">
                  Response time: {getElapsed(alertData.created_at, alertData.accepted_at)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${isResolved || isUnresolved ? 'bg-blue-500' : 'bg-gray-300'}`} />
            </div>
            <div className="flex-grow">
              <p className={`font-bold text-sm ${isResolved || isUnresolved ? '' : 'text-gray-400'}`}>
                {isResolved ? 'Resolved' : isUnresolved ? 'Unresolved' : 'Pending Resolution'}
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(alertData.resolved_at)}
              </p>
              {(isResolved || isUnresolved) && alertData.resolved_at && alertData.accepted_at && (
                <p className="text-xs text-blue-500 mt-1">
                  Resolution time: {getElapsed(alertData.accepted_at, alertData.resolved_at)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Responder Info */}
      {responder && (
        <div className="border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Assigned Responder</h2>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <div className="flex-grow">
              <p className="font-bold">{responder.name}</p>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {responder.email}
              </p>
            </div>
            <a
              href={`tel:${responder.email}`}
              className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors"
            >
              <Phone className="w-5 h-5 text-white" />
            </a>
          </div>
          {distance !== null && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">Distance</span>
              <span className="font-bold text-blue-600">{distance.toFixed(1)} km</span>
            </div>
          )}
          {eta !== null && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-gray-500">ETA</span>
              <span className="font-bold text-blue-600">~{eta} min</span>
            </div>
          )}
        </div>
      )}

      {/* View Map Button - for active and accepted alerts */}
      {(isActive || isAccepted) && (
        <button
          onClick={onViewMap}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 mb-6"
        >
          <MapIcon className="w-5 h-5" />
          VIEW MAP
        </button>
      )}

      {/* Resolved / Unsolved Feedback - only when accepted */}
      {isAccepted && !feedbackSubmitted && (
        <div className="border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Has the responder arrived?
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => { setFeedback('resolved'); setRating(5); }}
              className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                feedback === 'resolved'
                  ? 'bg-green-50 border-green-500 text-green-700'
                  : 'border-gray-200 text-gray-600 hover:border-green-300'
              }`}
            >
              <CheckCircle className="w-5 h-5 mx-auto mb-1" />
              Resolved
            </button>
            <button
              onClick={() => setFeedback('unsolved')}
              className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                feedback === 'unsolved'
                  ? 'bg-red-50 border-red-500 text-red-700'
                  : 'border-gray-200 text-gray-600 hover:border-red-300'
              }`}
            >
              <X className="w-5 h-5 mx-auto mb-1" />
              Not Resolved
            </button>
          </div>

          {feedback && (
            <>
              <textarea
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="Add a note (optional)"
                className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none h-20 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />

              {/* Star Rating - show when resolved is selected */}
              {feedback === 'resolved' && (
                <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm font-bold text-gray-700 mb-3 text-center">Rate the responder's service:</p>
                  <div className="flex justify-center gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-10 h-10 ${
                            star <= (hoveredRating || rating)
                              ? 'text-yellow-400 fill-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-center text-gray-500">
                    {rating === 0 ? 'Click to rate' : `${rating} star${rating > 1 ? 's' : ''}`}
                  </p>
                </div>
              )}

              <button
                onClick={handleSubmitFeedback}
                disabled={feedback === 'resolved' && rating === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-bold transition-all text-sm"
              >
                {feedback === 'resolved' ? 'Submit & Rate' : 'Submit Feedback'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Feedback Submitted Confirmation */}
      {feedbackSubmitted && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4 mb-6 text-center">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="font-bold text-green-700">Feedback Submitted</p>
          <p className="text-sm text-green-600">Thank you for your response</p>
          {alertData?.responder_rating && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-xs text-gray-500 mb-1">Your rating:</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-5 h-5 ${
                      star <= alertData.responder_rating!
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Already Resolved/Unresolved display with rating */}
      {(isResolved || isUnresolved) && !feedbackSubmitted && (
        <div className={`border rounded-xl p-4 mb-6 text-center ${isResolved ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          {isResolved ? (
            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          ) : (
            <X className="w-8 h-8 text-red-600 mx-auto mb-2" />
          )}
          <p className={`font-bold ${isResolved ? 'text-green-700' : 'text-red-700'}`}>
            {isResolved ? 'Incident Resolved' : 'Incident Not Resolved'}
          </p>
          <p className={`text-sm ${isResolved ? 'text-green-600' : 'text-red-600'}`}>
            {formatTime(alertData.resolved_at)}
          </p>
          {isResolved && alertData?.responder_rating && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-xs text-gray-500 mb-1">Client rating:</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-5 h-5 ${
                      star <= alertData.responder_rating!
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Description for OTHER alerts */}
      {alertData.emergency_type === 'OTHER' && alertData.description && (
        <div className="border rounded-xl p-4 mb-6 bg-purple-50 border-purple-200">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Description</h2>
          <p className="text-sm text-gray-700">{alertData.description}</p>
        </div>
      )}

      {/* Location */}
      <div className="border border-gray-200 rounded-xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Location</h2>
        <div className="flex items-start gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <span>{alertData.location || 'Location not recorded'}</span>
        </div>
        {alertData.latitude && alertData.longitude && (
          <p className="text-xs text-gray-400 mt-1 ml-6">
            {alertData.latitude.toFixed(4)}, {alertData.longitude.toFixed(4)}
          </p>
        )}
      </div>
    </div>
  );
}
