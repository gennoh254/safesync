import { UserCheck, UserX, UserPlus, Loader as Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';

interface Profile {
  id: string;
  name: string;
  email: string;
  user_type: 'Client' | 'Responder';
  company: string;
  created_at: string;
}

export function AdminUserManagement() {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', user_type: 'Client' as 'Client' | 'Responder', company: '' });

  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel('admin-users-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, name, email, user_type, company, created_at')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setUsers((data || []) as Profile[]);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      setUsers(users.filter((u) => u.id !== userId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: 'TempPassword123!',
        email_confirm: true,
        user_metadata: { name: newUser.name },
      });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.admin.listUsers();
      const createdUser = user.users.find((u) => u.email === newUser.email);
      if (createdUser) {
        await supabase.from('profiles').insert({
          id: createdUser.id,
          name: newUser.name,
          email: newUser.email,
          user_type: newUser.user_type,
          company: newUser.company,
        });
      }
      setShowAddModal(false);
      setNewUser({ name: '', email: '', user_type: 'Client', company: '' });
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredUsers = users.filter((u) => {
    const query = searchQuery.toLowerCase();
    return (
      u.name?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query) ||
      u.user_type?.toLowerCase().includes(query) ||
      u.company?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900' : 'bg-white'} flex items-center justify-center h-64`}>
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><UserPlus /> User Management</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 transition-colors"
        >
          + Add User
        </button>
      </div>

      <div className={`flex items-center border rounded p-2 mb-4 ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
        <Search className="w-5 h-5 text-gray-400 mr-2" />
        <input
          className="w-full bg-transparent outline-none"
          placeholder="Search by name, email, or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Type</th>
              <th className="p-3">Company</th>
              <th className="p-3">Joined</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className={`border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                <td className="p-3 font-bold">{user.name || 'Unknown'}</td>
                <td className="p-3 text-gray-500">{user.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${user.user_type === 'Client' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {user.user_type}
                  </span>
                </td>
                <td className="p-3 text-gray-500">{user.company || '-'}</td>
                <td className="p-3 text-gray-500 text-sm">{new Date(user.created_at).toLocaleDateString()}</td>
                <td className="p-3 flex gap-2">
                  <button className="text-green-600 hover:text-green-800" title="Verify"><UserCheck className="w-5 h-5" /></button>
                  <button onClick={() => handleDeleteUser(user.id)} className="text-red-600 hover:text-red-800" title="Delete"><UserX className="w-5 h-5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">No users found</div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`p-6 rounded-lg shadow-xl w-full max-w-md ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
            <h3 className="text-lg font-bold mb-4">Add New User</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <input
                className={`w-full p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'}`}
                placeholder="Full Name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                required
              />
              <input
                type="email"
                className={`w-full p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'}`}
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
              <input
                className={`w-full p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'}`}
                placeholder="Company"
                value={newUser.company}
                onChange={(e) => setNewUser({ ...newUser, company: e.target.value })}
              />
              <select
                className={`w-full p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'}`}
                value={newUser.user_type}
                onChange={(e) => setNewUser({ ...newUser, user_type: e.target.value as 'Client' | 'Responder' })}
              >
                <option value="Client">Client</option>
                <option value="Responder">Responder</option>
              </select>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className={`flex-1 py-2 rounded font-bold ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>Cancel</button>
                <button type="submit" className="flex-1 py-2 rounded font-bold bg-blue-600 text-white hover:bg-blue-700">Add User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
