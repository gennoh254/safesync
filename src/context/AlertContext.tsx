import { createContext, useContext, useState, ReactNode } from 'react';

export interface Alert {
  id: number;
  message: string;
  timestamp: Date;
}

interface AlertContextType {
  alerts: Alert[];
  addAlert: (message: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const addAlert = (message: string) => {
    const newAlert = { id: Date.now(), message, timestamp: new Date() };
    setAlerts(prev => [newAlert, ...prev]);
  };

  return (
    <AlertContext.Provider value={{ alerts, addAlert }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (!context) throw new Error('useAlert must be used within AlertProvider');
    return context;
};
