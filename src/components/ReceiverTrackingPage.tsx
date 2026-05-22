import { ResponderMap } from './ResponderMap';

interface AcceptedAlert {
  id: string;
  emergency_type: string;
  location: string;
  latitude: number;
  longitude: number;
  client_id: string;
}

export function ReceiverTrackingPage({
  darkMode,
  acceptedAlert
}: {
  darkMode: boolean;
  acceptedAlert?: AcceptedAlert | null;
}) {
  return <ResponderMap darkMode={darkMode} acceptedAlert={acceptedAlert} />;
}
