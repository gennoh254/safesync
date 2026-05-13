import { MapPin, Clock, AlertTriangle, Flame, HeartPulse, Info } from 'lucide-react';

export function ReceiverAlerts() {
    const alerts = [
        { id: '1', type: 'Critical', title: 'Cardiac Arrest', loc: '742 Evergreen Terrace', dist: '0.8 miles', time: '02:14' },
        { id: '2', type: 'High', title: 'Building Fire', loc: '1200 Industrial Way', dist: '2.4 miles', time: '05:45' },
        { id: '3', type: 'Medium', title: 'Welfare Check', loc: '45 Oak Street', dist: '1.2 miles', time: '08:20' },
    ];

    const typeColor = (type: string) => {
        if (type === 'Critical') return 'bg-red-500 text-white';
        if (type === 'High') return 'bg-orange-500 text-white';
        return 'bg-yellow-500 text-black';
    };

    const getIcon = (title: string) => {
        if (title.includes('Fire')) return <Flame className="w-5 h-5 text-red-500" />;
        if (title.includes('Cardiac')) return <HeartPulse className="w-5 h-5 text-red-500" />;
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    };

    return (
        <div className="p-4 lg:p-8 bg-slate-50 min-h-screen">
            <h2 className="text-3xl font-bold mb-8 text-slate-900">Active Alerts ({alerts.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {alerts.map(alert => (
                    <div key={alert.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${typeColor(alert.type)}`}>{alert.type}</span>
                            <div className="flex items-center text-slate-400 text-xs font-bold gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{alert.time}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            {getIcon(alert.title)}
                            <h3 className="font-bold text-lg text-slate-900 tracking-tight">{alert.title}</h3>
                        </div>
                        <p className="text-sm text-slate-600 mb-6 flex items-start gap-1">
                            <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                            {alert.loc} <br />
                            <span className="text-slate-400 font-medium ml-5">{alert.dist} away</span>
                        </p>
                        
                        <div className="flex gap-2">
                             <button className="flex-grow bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">ACCEPT</button>
                             <button className="px-4 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500">
                                <Info className="w-5 h-5" />
                             </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
