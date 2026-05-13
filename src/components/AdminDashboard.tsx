import { MapPin, Clock, Search, Filter, Download, Flame, Stethoscope } from 'lucide-react';
import React from 'react';
import { useTheme } from '../context/ThemeContext';

export function AdminDashboard() {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const incidents = [
    { id: 'INC-48293', type: 'Fire Alarm', location: 'Aisle 4, Main Store', time: '14:20', status: 'Active', sender: 'John Doe', senderPhone: '0712345678', receiver: 'Unit 42', receiverPhone: '0799998888' },
    { id: 'INC-48294', type: 'Medical Emergency', location: 'West Wing, Level 2', time: '14:15', status: 'Pending', sender: 'Jane Smith', senderPhone: '0787654321', receiver: 'Unit 08', receiverPhone: '0777776666' },
  ];

  const exportToCSV = () => {
    const headers = ['ID', 'Type', 'Location', 'Time', 'Status', 'Sender', 'Sender Phone', 'Receiver', 'Receiver Phone'];
    const csvRows = [
      headers.join(','),
      ...incidents.map(inc => [inc.id, inc.type, inc.location, inc.time, inc.status, inc.sender, inc.senderPhone, inc.receiver, inc.receiverPhone].join(','))
    ];
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', 'incidents.csv');
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`p-6 rounded-lg shadow flex justify-between items-center ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
        <div>
            <h2 className="text-xl font-bold">Emergency Response Center</h2>
            <p className="text-gray-500">Real-time surveillance and incident monitoring.</p>
        </div>
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded-full font-bold">2 Active Incidents</div>
      </div>

      {/* Toolbar */}
      <div className={`p-4 rounded-lg shadow flex gap-4 ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
         <div className={`flex-grow flex items-center border rounded p-2 ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
            <Search className="w-5 h-5 text-gray-400 mr-2" />
            <input className="w-full bg-transparent outline-none" placeholder="Search by location, incident ID, or personnel..." />
         </div>
         <button className={`flex items-center gap-2 px-4 py-2 rounded font-bold ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}><Filter className="w-4 h-4"/> Filter</button>
         <button onClick={exportToCSV} className={`flex items-center gap-2 px-4 py-2 rounded font-bold ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}><Download className="w-4 h-4"/> Export</button>
      </div>

      {/* Incident List */}
      <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
         <div className="space-y-6">
            {incidents.map(inc => (
                <div key={inc.id} className="border-b border-gray-700 pb-4">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 font-bold">
                          {inc.type === 'Fire Alarm' && <Flame className="text-red-500 w-5 h-5" />}
                          {inc.type === 'Medical Emergency' && <Stethoscope className="text-blue-500 w-5 h-5" />}
                          {inc.type} <span className="text-xs text-gray-500 font-normal">{inc.id}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${inc.status === 'Active' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{inc.status.toUpperCase()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div><strong>Loc:</strong> {inc.location}</div>
                        <div><strong>Time:</strong> {inc.time}</div>
                        <div><strong>Sender:</strong> {inc.sender} ({inc.senderPhone})</div>
                        <div><strong>Receiver:</strong> {inc.receiver} ({inc.receiverPhone})</div>
                    </div>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
}
