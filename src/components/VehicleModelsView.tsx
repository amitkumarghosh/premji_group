import React, { useState, useEffect, useMemo } from 'react';
import { Car, Plus, Search, Edit, Trash2, Download, AlertTriangle, CheckCircle, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { authFetch } from '../utils/api';

interface VehicleModelItem {
  id?: number;
  ID?: number;
  Vehicle_Manufacturer: string;
  Vehicle_Model: string;
  Vehicle_Variant?: string | null;
}

interface VehicleModelsViewProps {
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  onRefreshLookups?: () => void;
}

export const VehicleModelsView: React.FC<VehicleModelsViewProps> = ({
  onNotification,
  onRefreshLookups
}) => {
  const [models, setModels] = useState<VehicleModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMfrFilter, setSelectedMfrFilter] = useState('');

  // Add Form State
  const [newManufacturer, setNewManufacturer] = useState('');
  const [newModel, setNewModel] = useState('');

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<VehicleModelItem | null>(null);
  const [editManufacturer, setEditManufacturer] = useState('');
  const [editModel, setEditModel] = useState('');

  // Delete Confirm State
  const [deleteCandidate, setDeleteCandidate] = useState<VehicleModelItem | null>(null);

  const loadVehicleModels = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/vehicle-models');
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      } else {
        onNotification('Failed to load vehicle models', 'error');
      }
    } catch (e) {
      console.error(e);
      onNotification('Connection error while fetching vehicle models', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicleModels();
  }, []);

  // Distinct manufacturers list for quick suggestions and filters
  const distinctManufacturers = useMemo(() => {
    const set = new Set<string>();
    models.forEach((m) => {
      if (m.Vehicle_Manufacturer) {
        set.add(m.Vehicle_Manufacturer.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [models]);

  // Check if current add form inputs already exist
  const isAddDuplicate = useMemo(() => {
    const cleanMfr = newManufacturer.trim().toLowerCase();
    const cleanMod = newModel.trim().toLowerCase();
    if (!cleanMfr || !cleanMod) return false;

    return models.some(
      (m) =>
        m.Vehicle_Manufacturer.trim().toLowerCase() === cleanMfr &&
        m.Vehicle_Model.trim().toLowerCase() === cleanMod
    );
  }, [newManufacturer, newModel, models]);

  // Check if edit modal inputs already exist on another record
  const isEditDuplicate = useMemo(() => {
    if (!editingItem) return false;
    const cleanMfr = editManufacturer.trim().toLowerCase();
    const cleanMod = editModel.trim().toLowerCase();
    if (!cleanMfr || !cleanMod) return false;

    const currentId = editingItem.id || editingItem.ID;
    return models.some(
      (m) =>
        (m.id || m.ID) !== currentId &&
        m.Vehicle_Manufacturer.trim().toLowerCase() === cleanMfr &&
        m.Vehicle_Model.trim().toLowerCase() === cleanMod
    );
  }, [editManufacturer, editModel, editingItem, models]);

  // Filtered list
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchesSearch =
        !searchQuery ||
        m.Vehicle_Manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.Vehicle_Model.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMfr =
        !selectedMfrFilter ||
        m.Vehicle_Manufacturer.toLowerCase() === selectedMfrFilter.toLowerCase();

      return matchesSearch && matchesMfr;
    });
  }, [models, searchQuery, selectedMfrFilter]);

  // Handle Add New Vehicle Model
  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMfr = newManufacturer.trim();
    const cleanMod = newModel.trim();

    if (!cleanMfr || !cleanMod) {
      onNotification('Please enter both Vehicle Manufacturer and Vehicle Model', 'error');
      return;
    }

    if (isAddDuplicate) {
      onNotification(`"${cleanMfr} - ${cleanMod}" already exists in the database. Duplicate entries are blocked.`, 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await authFetch('/api/vehicle-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Vehicle_Manufacturer: cleanMfr,
          Vehicle_Model: cleanMod
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`Vehicle Model "${cleanMfr} ${cleanMod}" added successfully!`, 'success');
        setNewModel('');
        loadVehicleModels();
        onRefreshLookups?.();
      } else {
        onNotification(data.error || 'Failed to add vehicle model', 'error');
      }
    } catch (e: any) {
      onNotification(e?.message || 'Error creating vehicle model', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (item: VehicleModelItem) => {
    setEditingItem(item);
    setEditManufacturer(item.Vehicle_Manufacturer);
    setEditModel(item.Vehicle_Model);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const cleanMfr = editManufacturer.trim();
    const cleanMod = editModel.trim();

    if (!cleanMfr || !cleanMod) {
      onNotification('Both Manufacturer and Model are required', 'error');
      return;
    }

    if (isEditDuplicate) {
      onNotification(`"${cleanMfr} - ${cleanMod}" already exists in the database.`, 'error');
      return;
    }

    const id = editingItem.id || editingItem.ID;

    try {
      setSubmitting(true);
      const res = await authFetch(`/api/vehicle-models/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Vehicle_Manufacturer: cleanMfr,
          Vehicle_Model: cleanMod
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('Vehicle model updated successfully!', 'success');
        setEditingItem(null);
        loadVehicleModels();
        onRefreshLookups?.();
      } else {
        onNotification(data.error || 'Failed to update vehicle model', 'error');
      }
    } catch (e: any) {
      onNotification(e?.message || 'Error updating vehicle model', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Model
  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    const id = deleteCandidate.id || deleteCandidate.ID;

    try {
      setSubmitting(true);
      const res = await authFetch(`/api/vehicle-models/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('Vehicle model removed successfully!', 'success');
        setDeleteCandidate(null);
        loadVehicleModels();
        onRefreshLookups?.();
      } else {
        onNotification(data.error || 'Failed to delete vehicle model', 'error');
      }
    } catch (e: any) {
      onNotification(e?.message || 'Error deleting vehicle model', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (models.length === 0) return;
    const headers = ['ID', 'Vehicle_Manufacturer', 'Vehicle_Model'];
    const rows = models.map((m) => [
      m.id || m.ID || '',
      `"${(m.Vehicle_Manufacturer || '').replace(/"/g, '""')}"`,
      `"${(m.Vehicle_Model || '').replace(/"/g, '""')}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vehicle_model_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotification('vehicle_model catalog CSV exported successfully!', 'success');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-sky-100/90 shadow-md bg-white/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-2xl text-white shadow-md shadow-sky-500/25">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Update Vehicle Model & Variant
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Manage vehicle manufacturers and models in the database. Duplicate combinations are strictly prevented.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadVehicleModels}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl text-xs font-bold transition border border-sky-200 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Grid: Add Form + Catalog Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ADD NEW VEHICLE MODEL FORM */}
        <div className="lg:col-span-1">
          <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 sticky top-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-600" />
                Add Vehicle Model
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                New records immediately appear in work order vehicle drop-downs.
              </p>
            </div>

            <form onSubmit={handleAddModel} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                  Vehicle Manufacturer *
                </label>
                <input
                  type="text"
                  required
                  list="mfr-suggestions"
                  placeholder="e.g. Toyota, Hyundai, Maruti Suzuki"
                  value={newManufacturer}
                  onChange={(e) => setNewManufacturer(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
                <datalist id="mfr-suggestions">
                  {distinctManufacturers.map((mfr) => (
                    <option key={mfr} value={mfr} />
                  ))}
                </datalist>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Select existing or type a new manufacturer name
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                  Vehicle Model *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Innova Crysta, Fortuner, Creta"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>

              {/* Duplicate Warning Warning Box */}
              {isAddDuplicate && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Duplicate Entry Detected:</span>
                    <p className="mt-0.5 text-amber-700">
                      Manufacturer "{newManufacturer}" and Model "{newModel}" already exists in the database. Duplicate entries are blocked.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || isAddDuplicate || !newManufacturer || !newModel}
                className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-md shadow-sky-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Vehicle Model</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* CATALOG LIST / TABLE */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search manufacturer or model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-slate-500 font-semibold text-[11px] whitespace-nowrap">Filter Manufacturer:</label>
              <select
                value={selectedMfrFilter}
                onChange={(e) => setSelectedMfrFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
              >
                <option value="">All Manufacturers ({distinctManufacturers.length})</option>
                {distinctManufacturers.map((mfr) => (
                  <option key={mfr} value={mfr}>
                    {mfr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs">
                <span className="font-bold text-slate-900">Vehicle Models Catalog</span>
                <span className="text-slate-400 ml-2 font-mono">({filteredModels.length} shown of {models.length})</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                Active in Production
              </span>
            </div>

            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3 w-16">ID</th>
                    <th className="p-3">Vehicle Manufacturer</th>
                    <th className="p-3">Vehicle Model</th>
                    <th className="p-3 text-center w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {loading && models.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-sky-500 mb-2" />
                        Loading vehicle models...
                      </td>
                    </tr>
                  ) : filteredModels.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                        No vehicle models found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredModels.map((item) => {
                      const itemId = item.id || item.ID || 0;
                      return (
                        <tr key={itemId} className="hover:bg-sky-50/50 transition">
                          <td className="p-3 font-mono font-bold text-slate-400 text-[11px]">
                            #{itemId}
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                              {item.Vehicle_Manufacturer}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-slate-800 text-xs">
                              {item.Vehicle_Model}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="p-1.5 text-sky-600 hover:bg-sky-100 rounded-lg transition cursor-pointer"
                                title="Edit Manufacturer or Model"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteCandidate(item)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                                title="Delete from vehicle_model"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* EDIT VEHICLE MODEL MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit className="w-4 h-4 text-sky-600" />
                Edit Vehicle Model #{editingItem.id || editingItem.ID}
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                  Vehicle Manufacturer *
                </label>
                <input
                  type="text"
                  required
                  list="mfr-edit-suggestions"
                  value={editManufacturer}
                  onChange={(e) => setEditManufacturer(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
                <datalist id="mfr-edit-suggestions">
                  {distinctManufacturers.map((mfr) => (
                    <option key={mfr} value={mfr} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                  Vehicle Model *
                </label>
                <input
                  type="text"
                  required
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>

              {isEditDuplicate && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Duplicate Error:</span>
                    <p className="mt-0.5 text-amber-700">
                      Another record with Manufacturer "{editManufacturer}" and Model "{editModel}" already exists.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || isEditDuplicate || !editManufacturer || !editModel}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Vehicle Model</h3>
                <p className="text-xs text-slate-500">
                  Record #{deleteCandidate.id || deleteCandidate.ID}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-bold text-slate-900">
                {deleteCandidate.Vehicle_Manufacturer} {deleteCandidate.Vehicle_Model}
              </span> ?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Deleting...' : 'Yes, Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
