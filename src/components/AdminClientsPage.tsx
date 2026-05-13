import React from 'react';

interface Client {
    id: string;
    name: string;
    type: 'Sender' | 'Receiver';
}

export function AdminClientsPage() {
    const clients: Client[] = [
        { id: '1', name: 'John Doe', type: 'Sender' },
        { id: '2', name: 'Jane Smith', type: 'Receiver' },
    ];
    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Clients Management</h2>
            <table className="w-full">
                <thead>
                    <tr className="text-left">
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Type</th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map(client => (
                        <tr key={client.id} className="border-t">
                            <td className="py-2">{client.name}</td>
                            <td className="py-2">{client.type}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
