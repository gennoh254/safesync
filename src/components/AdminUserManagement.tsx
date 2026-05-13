import { UserCheck, UserX, UserPlus } from 'lucide-react';

export function AdminUserManagement() {
  const users = [
    { id: 'u1', name: 'Naivas Store #442', type: 'Sender', status: 'Pending' },
    { id: 'u2', name: 'Unit 42', type: 'Receiver', status: 'Verified' },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><UserPlus /> User Management</h2>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="p-2">Name</th>
            <th className="p-2">Type</th>
            <th className="p-2">Status</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="border-b">
              <td className="p-2">{user.name}</td>
              <td className="p-2">{user.type}</td>
              <td className="p-2"><span className={`px-2 py-1 rounded text-xs font-bold ${user.status === 'Verified' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{user.status}</span></td>
              <td className="p-2 flex gap-2">
                <button className="text-green-600"><UserCheck /></button>
                <button className="text-red-600"><UserX /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
