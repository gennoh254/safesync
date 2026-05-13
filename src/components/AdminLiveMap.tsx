import { Map as MapIcon } from 'lucide-react';

export function AdminLiveMap() {
    return (
        <div className="bg-white p-6 rounded-lg shadow h-[500px] flex items-center justify-center">
            <div className="text-gray-500">
                <MapIcon className="w-16 h-16 mx-auto mb-4" />
                <p>Central Live Map View</p>
            </div>
        </div>
    );
}
