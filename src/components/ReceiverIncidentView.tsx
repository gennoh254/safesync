import { Check, Send } from 'lucide-react';

export function ReceiverIncidentView() {
    return (
        <div className="bg-white text-black min-h-screen font-sans p-4 space-y-6">
            <header className="flex justify-between items-center border-b border-gray-200 pb-4">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border border-black rounded-sm"></div>
                    <span className="font-bold tracking-widest text-xs uppercase">SAFESYNC RESPONDER</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-[10px] uppercase font-bold text-gray-600">AVAILABLE</span>
                </div>
            </header>

            <section className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold uppercase">Active Incident: Medical</h2>
                    <div className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold uppercase">Priority 1</div>
                </div>
                {/* Progress bar mock */}
                <div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase mt-6">
                    <span>Dispatched</span>
                    <span>En Route</span>
                    <span>On Scene</span>
                    <span>Resolved</span>
                </div>
                <div className="h-1 bg-gray-200 mt-2 rounded">
                    <div className="h-full bg-red-600 w-1/3"></div>
                </div>
            </section>

            <section className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="text-sm font-bold uppercase text-gray-500 mb-4">Subject Information</h3>
                <div className="flex justify-between mb-4">
                    <span className="text-gray-500">Name:</span> <span className="font-bold">Jordan S. Miller</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">Age:</span> <span className="font-bold">34</span>
                </div>
                <div className="mt-4 bg-white border border-gray-100 p-3 rounded text-sm text-gray-700">
                    <p className="font-bold text-black mb-1">Medical History / Hazards</p>
                    Severe penicillin allergy. Previous respiratory distress. Known to carry Epipen. Property has K-9 presence in rear entrance.
                </div>
            </section>

            <section className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="text-sm font-bold uppercase text-gray-500 mb-4">Communication Log</h3>
                <div className="space-y-4">
                    <div className="bg-gray-200 p-3 rounded text-xs text-gray-800">
                        <p className="font-bold text-gray-500 mb-1">DISPATCH • 14:02</p>
                        Unit 42, responding to Medical Assistance at Store #442.
                    </div>
                    <div className="bg-blue-600 text-white p-3 rounded text-xs ml-auto w-4/5 text-right">
                        <p className="font-bold text-blue-100 mb-1">YOU • 14:04</p>
                        En route. ETA 4 minutes. Requesting traffic clearance.
                    </div>
                    <div className="flex bg-white border border-gray-300 rounded p-2">
                        <input className="bg-transparent flex-grow text-sm outline-none" placeholder="Message Dispatch..." />
                        <Send className="w-5 h-5 text-gray-400" />
                    </div>
                </div>
            </section>

            <button className="w-full bg-red-600 text-white font-bold py-4 rounded-lg uppercase flex items-center justify-center gap-2">
                <div className="border-2 border-white rounded-full p-0.5"><div className="w-2 h-2 bg-white rounded-full"></div></div> 
                Request Backup
            </button>
            <button className="w-full border-2 border-green-600 text-green-600 font-bold py-4 rounded-lg uppercase flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                Complete Mission
            </button>
        </div>
    );
}
