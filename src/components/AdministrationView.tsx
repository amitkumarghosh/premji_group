import React, { useState, useEffect } from 'react';
import { Settings, Users, Building, Plus, Search, Download, CheckCircle, RefreshCw, Edit, ShieldAlert, Eye, EyeOff, Car, Calendar, FileText } from 'lucide-react';
import { authFetch } from '../utils/api';
import { VehicleModelsView } from './VehicleModelsView';

interface AdministrationViewProps {
  user: any;
  centers: any[];
  initialTab?: 'users' | 'centers' | 'vehicles';
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  onRefreshCenters: () => void;
}

export const AdministrationView: React.FC<AdministrationViewProps> = ({
  user,
  centers,
  initialTab = 'users',
  onNotification,
  onRefreshCenters
}) => {
  const isSuperAdmin = user.user_role === 'Super Admin';
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'centers' | 'vehicles'>(initialTab);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // User search/edit state
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [editUserData, setEditUserData] = useState({
    employee_name: '',
    user_role: 'Technician',
    center_code: '',
    user_details: '',
    employee_doj: '',
    employee_status: 'Active',
    password: ''
  });

  // Add new user state
  const [newUser, setNewUser] = useState({
    employee_code: '',
    employee_name: '',
    password: '',
    user_role: 'Technician',
    center_code: '',
    user_details: '',
    employee_doj: '',
    employee_status: 'Active'
  });

  // Center form state
  const [newCenter, setNewCenter] = useState({
    center_code: '',
    center_name: '',
    center_location: '',
    center_type: 'Workshop'
  });

  // Edit center state
  const [selectedCenterCode, setSelectedCenterCode] = useState('');
  const [editCenterData, setEditCenterData] = useState({
    center_name: '',
    center_location: '',
    center_type: 'Workshop',
    status: 'Active'
  });

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/employees');
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  // When selected center changes for edit
  useEffect(() => {
    if (selectedCenterCode) {
      const c = centers.find((ctr) => ctr.center_code === selectedCenterCode);
      if (c) {
        setEditCenterData({
          center_name: c.center_name || '',
          center_location: c.center_location || '',
          center_type: c.center_type || 'Workshop',
          status: c.status || 'Active'
        });
      }
    }
  }, [selectedCenterCode, centers]);

  // When selected user changes for edit
  const handleSelectUserToEdit = (emp: any) => {
    // Security check: Admin cannot edit other Admin / Super Admin records
    if (!isSuperAdmin && ['Admin', 'Super Admin'].includes(emp.user_role) && emp.employee_code !== user.employee_code) {
      onNotification('Admins cannot view or modify other Admin or Super Admin records.', 'error');
      return;
    }
    setSelectedUser(emp);
    setEditUserData({
      employee_name: emp.employee_name || '',
      user_role: emp.user_role || 'Technician',
      center_code: emp.center_code || '',
      user_details: emp.user_details || '',
      employee_doj: emp.employee_doj ? emp.employee_doj.split('T')[0] : '',
      employee_status: emp.employee_status || 'Active',
      password: ''
    });
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const payload: any = { ...editUserData };
      if (!payload.password) delete payload.password; // Do not overwrite if blank

      const res = await authFetch(`/api/employees/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('User record updated successfully!', 'success');
        setSelectedUser(null);
        loadEmployees();
      } else {
        onNotification(data.error || 'Failed to update user', 'error');
      }
    } catch (e) {
      onNotification('Error updating user', 'error');
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.employee_code || !newUser.employee_name || !newUser.password || !newUser.user_role) {
      onNotification('Please fill in Code, Name, Password, and Role', 'error');
      return;
    }

    try {
      const res = await authFetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`Employee ${newUser.employee_name} registered successfully!`, 'success');
        setNewUser({
          employee_code: '',
          employee_name: '',
          password: '',
          user_role: 'Technician',
          center_code: '',
          user_details: '',
          employee_doj: '',
          employee_status: 'Active'
        });
        loadEmployees();
      } else {
        onNotification(data.error || 'Failed to add user', 'error');
      }
    } catch (e) {
      onNotification('Error adding user', 'error');
    }
  };

  const handleAddCenterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCenter.center_code || !newCenter.center_name || !newCenter.center_location) {
      onNotification('Please fill in all center fields', 'error');
      return;
    }

    try {
      const res = await authFetch('/api/centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCenter)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`Workshop center ${newCenter.center_name} created successfully!`, 'success');
        setNewCenter({
          center_code: '',
          center_name: '',
          center_location: '',
          center_type: 'Workshop'
        });
        onRefreshCenters();
      } else {
        onNotification(data.error || 'Failed to create center', 'error');
      }
    } catch (e) {
      onNotification('Error creating center', 'error');
    }
  };

  const handleSaveCenterEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCenterCode) return;

    try {
      const res = await authFetch(`/api/centers/${selectedCenterCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCenterData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('Center details updated successfully!', 'success');
        onRefreshCenters();
      } else {
        onNotification(data.error || 'Failed to update center', 'error');
      }
    } catch (e) {
      onNotification('Error updating center', 'error');
    }
  };

  const handleExportEmployeesCSV = () => {
    if (employees.length === 0) return;
    const headers = ['Employee Code', 'Employee Name', 'Role', 'Center Code', 'Center Name', 'Date of Joining', 'User Details', 'Status'];
    const rows = employees.map((e) => [
      `"${e.employee_code}"`,
      `"${e.employee_name}"`,
      `"${e.user_role}"`,
      `"${e.center_code || ''}"`,
      `"${e.center_name || ''}"`,
      `"${e.employee_doj ? e.employee_doj.split('T')[0] : ''}"`,
      `"${(e.user_details || '').replace(/"/g, '""')}"`,
      `"${e.employee_status || 'Active'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `employee_details_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotification('Employee details CSV downloaded successfully!', 'success');
  };

  const filteredEmployees = employees.filter((e) => {
    if (!userSearch) return true;
    const s = userSearch.toLowerCase();
    return (
      e.employee_code.toLowerCase().includes(s) ||
      e.employee_name.toLowerCase().includes(s) ||
      (e.user_details && e.user_details.toLowerCase().includes(s)) ||
      (e.center_name && e.center_name.toLowerCase().includes(s))
    );
  });

  return (
    <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-lg bg-white/90 backdrop-blur-xl max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-600" />
            Administration
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Access Level: <span className="font-bold text-sky-700">{user.user_role}</span> {isSuperAdmin ? '(Unrestricted)' : '(Standard Admin)'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setActiveAdminTab('users')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeAdminTab === 'users' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            Manage Users
          </button>
          <button
            onClick={() => setActiveAdminTab('centers')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeAdminTab === 'centers' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-4 h-4" />
            Manage Centers
          </button>
          <button
            onClick={() => setActiveAdminTab('vehicles')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeAdminTab === 'vehicles' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Car className="w-4 h-4 text-sky-600" />
            Vehicle Model & Variant
          </button>
        </div>
      </div>

      {/* ================= TAB 1: MANAGE USERS ================= */}
      {activeAdminTab === 'users' && (
        <div className="space-y-6">
          {/* Sub-section: Search / Edit User & Add User */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Edit User Form / Search */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center justify-between">
                <span>🔍 Search & Edit User</span>
                {selectedUser && (
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="text-xs text-rose-600 hover:underline font-semibold"
                  >
                    Clear Selection
                  </button>
                )}
              </h3>

              {!selectedUser ? (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by Employee Code or Name..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-lg border border-slate-200 p-2 bg-white">
                    {filteredEmployees.slice(0, 15).map((emp) => (
                      <div
                        key={emp.id}
                        onClick={() => handleSelectUserToEdit(emp)}
                        className="p-2 hover:bg-sky-50 rounded-lg cursor-pointer flex items-center justify-between text-xs transition"
                      >
                        <div>
                          <span className="font-mono font-bold text-sky-700 mr-2">{emp.employee_code}</span>
                          <span className="font-semibold text-slate-800">{emp.employee_name}</span>
                          <span className="text-[10px] text-slate-400 ml-2">({emp.user_role})</span>
                        </div>
                        <Edit className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveUserEdit} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Employee Code</label>
                    <input
                      disabled
                      value={selectedUser.employee_code}
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-slate-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                    <input
                      required
                      value={editUserData.employee_name}
                      onChange={(e) => setEditUserData({ ...editUserData, employee_name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Role *</label>
                      <select
                        value={editUserData.user_role}
                        onChange={(e) => setEditUserData({ ...editUserData, user_role: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="Technician">Technician</option>
                        <option value="Accounts">Accounts</option>
                        <option value="Engineer">Engineer</option>
                        <option value="TeamLeader">TeamLeader</option>
                        <option value="Admin">Admin</option>
                        {isSuperAdmin && <option value="Super Admin">Super Admin</option>}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Status</label>
                      <select
                        value={editUserData.employee_status}
                        onChange={(e) => setEditUserData({ ...editUserData, employee_status: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Workshop Center</label>
                      <select
                        value={editUserData.center_code}
                        onChange={(e) => setEditUserData({ ...editUserData, center_code: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="">Select Center</option>
                        {centers.map((c) => (
                          <option key={c.center_code} value={c.center_code}>
                            {c.center_name} ({c.center_code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Date of Joining (DOJ)</label>
                      <input
                        type="date"
                        value={editUserData.employee_doj}
                        onChange={(e) => setEditUserData({ ...editUserData, employee_doj: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">User Details / Remarks</label>
                    <textarea
                      rows={2}
                      placeholder="Specialization, employee details, or remarks..."
                      value={editUserData.user_details}
                      onChange={(e) => setEditUserData({ ...editUserData, user_details: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg resize-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Reset Password</label>
                    <div className="relative">
                      <input
                        type={showEditPassword ? 'text' : 'password'}
                        placeholder="Leave blank to keep existing password"
                        value={editUserData.password}
                        onChange={(e) => setEditUserData({ ...editUserData, password: e.target.value })}
                        className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditPassword(!showEditPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        title={showEditPassword ? 'Hide password' : 'Show password'}
                      >
                        {showEditPassword ? <EyeOff className="w-4 h-4 text-sky-600" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold shadow-sm transition"
                  >
                    Save Changes
                  </button>
                </form>
              )}
            </div>

            {/* Add New User */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-600" />
                Add New User
              </h3>

              <form onSubmit={handleAddUserSubmit} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Employee Code *</label>
                    <input
                      required
                      placeholder="TECH03"
                      value={newUser.employee_code}
                      onChange={(e) => setNewUser({ ...newUser, employee_code: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Password *</label>
                    <div className="relative">
                      <input
                        required
                        type={showNewUserPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        title={showNewUserPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewUserPassword ? <EyeOff className="w-4 h-4 text-sky-600" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    required
                    placeholder="Employee Name"
                    value={newUser.employee_name}
                    onChange={(e) => setNewUser({ ...newUser, employee_name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Role *</label>
                    <select
                      value={newUser.user_role}
                      onChange={(e) => setNewUser({ ...newUser, user_role: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="Technician">Technician</option>
                      <option value="Accounts">Accounts</option>
                      <option value="Engineer">Engineer</option>
                      <option value="TeamLeader">TeamLeader</option>
                      <option value="Admin">Admin</option>
                      {isSuperAdmin && <option value="Super Admin">Super Admin</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Status</label>
                    <select
                      value={newUser.employee_status}
                      onChange={(e) => setNewUser({ ...newUser, employee_status: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Center</label>
                    <select
                      value={newUser.center_code}
                      onChange={(e) => setNewUser({ ...newUser, center_code: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="">Select Center</option>
                      {centers.map((c) => (
                        <option key={c.center_code} value={c.center_code}>
                          {c.center_name} ({c.center_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Date of Joining (DOJ)</label>
                    <input
                      type="date"
                      value={newUser.employee_doj}
                      onChange={(e) => setNewUser({ ...newUser, employee_doj: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">User Details / Remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Enter additional employee details, specialization, or notes..."
                    value={newUser.user_details}
                    onChange={(e) => setNewUser({ ...newUser, user_details: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition"
                >
                  Register User
                </button>
              </form>
            </div>
          </div>

          {/* Full Employee Table with CSV Export */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Employee Directory ({filteredEmployees.length})
              </h3>
              <button
                onClick={handleExportEmployeesCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
              >
                <Download className="w-3.5 h-3.5" />
                Download employee_details as CSV
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Role</th>
                    <th className="p-2.5">Center</th>
                    <th className="p-2.5">DOJ</th>
                    <th className="p-2.5">User Details</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition">
                      <td className="p-2.5 font-mono font-bold text-sky-700">{emp.employee_code}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{emp.employee_name}</td>
                      <td className="p-2.5">
                        <span className="font-semibold text-slate-700">{emp.user_role}</span>
                      </td>
                      <td className="p-2.5">{emp.center_name || emp.center_code || '—'}</td>
                      <td className="p-2.5 font-mono text-slate-600">{emp.employee_doj ? emp.employee_doj.split('T')[0] : '—'}</td>
                      <td className="p-2.5 text-slate-600 max-w-[200px] truncate" title={emp.user_details || ''}>
                        {emp.user_details || '—'}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            emp.employee_status === 'Active' || emp.employee_status === '1'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {emp.employee_status || 'Active'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleSelectUserToEdit(emp)}
                          className="px-2 py-1 text-sky-600 hover:bg-sky-50 rounded font-semibold cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: MANAGE CENTERS ================= */}
      {activeAdminTab === 'centers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add New Center */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-600" />
                Add New Center
              </h3>

              <form onSubmit={handleAddCenterSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Center Code *</label>
                  <input
                    required
                    placeholder="C04"
                    value={newCenter.center_code}
                    onChange={(e) => setNewCenter({ ...newCenter, center_code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Center Name *</label>
                  <input
                    required
                    placeholder="Premji Chennai East"
                    value={newCenter.center_name}
                    onChange={(e) => setNewCenter({ ...newCenter, center_name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Location Details *</label>
                  <input
                    required
                    placeholder="Velachery, Chennai, Tamil Nadu"
                    value={newCenter.center_location}
                    onChange={(e) => setNewCenter({ ...newCenter, center_location: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Center Type</label>
                  <select
                    value={newCenter.center_type}
                    onChange={(e) => setNewCenter({ ...newCenter, center_type: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="Workshop">Workshop</option>
                    <option value="Body Shop">Body Shop</option>
                    <option value="HQ">Headquarters</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition"
                >
                  Create Workshop Center
                </button>
              </form>
            </div>

            {/* Edit Existing Center */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-800">
                ✏️ Edit Existing Center
              </h3>

              <div className="text-xs space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Select Center *</label>
                  <select
                    value={selectedCenterCode}
                    onChange={(e) => setSelectedCenterCode(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="">Select Center to Edit</option>
                    {centers.map((c) => (
                      <option key={c.center_code} value={c.center_code}>
                        {c.center_name} ({c.center_code})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCenterCode && (
                  <form onSubmit={handleSaveCenterEdit} className="space-y-3 pt-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Center Name</label>
                      <input
                        required
                        value={editCenterData.center_name}
                        onChange={(e) => setEditCenterData({ ...editCenterData, center_name: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Location</label>
                      <input
                        required
                        value={editCenterData.center_location}
                        onChange={(e) => setEditCenterData({ ...editCenterData, center_location: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Type</label>
                        <select
                          value={editCenterData.center_type}
                          onChange={(e) => setEditCenterData({ ...editCenterData, center_type: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Workshop">Workshop</option>
                          <option value="Body Shop">Body Shop</option>
                          <option value="HQ">Headquarters</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Status</label>
                        <select
                          value={editCenterData.status}
                          onChange={(e) => setEditCenterData({ ...editCenterData, status: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold shadow-sm transition"
                    >
                      Save Center Changes
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Centers List Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                  <th className="p-3">Code</th>
                  <th className="p-3">Center Name</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {centers.map((c) => (
                  <tr key={c.center_code} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-sky-700">{c.center_code}</td>
                    <td className="p-3 font-semibold text-slate-800">{c.center_name}</td>
                    <td className="p-3 text-slate-600">{c.center_location}</td>
                    <td className="p-3 font-semibold text-slate-700">{c.center_type}</td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {c.status || 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 3: VEHICLE MODEL & VARIANT ================= */}
      {activeAdminTab === 'vehicles' && (
        <VehicleModelsView
          onNotification={onNotification}
          onRefreshLookups={onRefreshCenters}
        />
      )}
    </div>
  );
};
