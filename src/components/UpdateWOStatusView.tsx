import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Search,
  Trash2,
  Edit,
  AlertTriangle,
  CheckCircle,
  X,
  Camera,
  Upload,
  Calendar,
  Filter,
  Eye,
  ShieldAlert,
  ZoomIn
} from 'lucide-react';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils';
import { authFetch } from '../utils/api';

interface UpdateWOStatusViewProps {
  user: any;
  technicians: any[];
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const UpdateWOStatusView: React.FC<UpdateWOStatusViewProps> = ({
  user,
  technicians,
  onNotification
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters matching View Work Orders
  const [filters, setFilters] = useState({
    search: '',
    jobcard_type: '',
    job_status: '',
    center_code: ''
  });

  // Date Filter based on Jobcard Date (Single date or Date range)
  const [dateMode, setDateMode] = useState<'all' | 'single' | 'range'>('all');
  const [singleDate, setSingleDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [centers, setCenters] = useState<any[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  // Selection & Edit State
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Edit Form State
  const [form, setForm] = useState({
    vehicle_manufacturer: '',
    vehicle_model: '',
    vehicle_variant: '',
    vehicle_registration_no: '',
    jobcard_type: 'New workorder',
    technician_code: '',
    name_of_technician: '',
    jobcard_no: '',
    jobcard_date: '',
    kilometres: '',
    name_of_service_advisor: '',
    job_status: 'In Progress',
    admin_remarks: ''
  });

  const [replacementPhotoBase64, setReplacementPhotoBase64] = useState<string | null>(null);

  // Load all active work orders (strictly where delete_flag = 0)
  const loadOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.jobcard_type) params.append('jobcard_type', filters.jobcard_type);
      if (filters.job_status) params.append('job_status', filters.job_status);
      if (filters.center_code) params.append('center_code', filters.center_code);

      // Date filter strictly based on Jobcard Date
      if (dateMode === 'single' && singleDate) {
        params.append('start_date', singleDate);
        params.append('end_date', singleDate);
      } else if (dateMode === 'range') {
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
      }
      params.append('limit', '500');

      const res = await authFetch(`/api/workorders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        // Strict client guarantee: filter only delete_flag == 0
        const activeOnly = (data.data || []).filter(
          (o: any) => o.delete_flag === 0 || o.delete_flag === '0' || o.delete_flag === null
        );
        setOrders(activeOnly);
      }
    } catch (e) {
      console.error(e);
      onNotification('Failed to load active work orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    try {
      const [ctrRes, mfrRes] = await Promise.all([
        authFetch('/api/centers'),
        authFetch('/api/workorders/lookup')
      ]);
      if (ctrRes.ok) {
        const d = await ctrRes.json();
        setCenters(d.centers || []);
      }
      if (mfrRes.ok) {
        const d = await mfrRes.json();
        setManufacturers(d.manufacturers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadModelsForManufacturer = async (mfr: string) => {
    try {
      const res = await authFetch(`/api/workorders/lookup-models?manufacturer=${encodeURIComponent(mfr)}`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  // Debounced auto-filter
  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
    }, 250);
    return () => clearTimeout(timer);
  }, [filters.search, filters.jobcard_type, filters.job_status, filters.center_code, dateMode, singleDate, startDate, endDate]);

  // Client-side real-time filter (including Jobcard Date filtering)
  const filteredOrders = useMemo(() => {
    let list = [...orders];

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter((o) => {
        const jcNo = String(o.jobcard_no || '').toLowerCase();
        const regNo = String(o.vehicle_registration_no || '').toLowerCase();
        const techName = String(o.name_of_technician || '').toLowerCase();
        const techCode = String(o.technician_code || '').toLowerCase();
        const mfr = String(o.vehicle_manufacturer || '').toLowerCase();
        const mdl = String(o.vehicle_model || '').toLowerCase();
        const adv = String(o.name_of_service_advisor || '').toLowerCase();
        return (
          jcNo.includes(q) ||
          regNo.includes(q) ||
          techName.includes(q) ||
          techCode.includes(q) ||
          mfr.includes(q) ||
          mdl.includes(q) ||
          adv.includes(q)
        );
      });
    }

    if (filters.jobcard_type) {
      list = list.filter((o) => o.jobcard_type === filters.jobcard_type);
    }

    if (filters.center_code) {
      list = list.filter((o) => o.center_code === filters.center_code);
    }

    if (filters.job_status) {
      list = list.filter((o) => o.job_status === filters.job_status);
    }

    // Filter strictly based on jobcard_date
    if (dateMode === 'single' && singleDate) {
      list = list.filter((o) => {
        const d = (o.jobcard_date ? o.jobcard_date.split('T')[0] : '');
        return d === singleDate;
      });
    } else if (dateMode === 'range') {
      if (startDate) {
        list = list.filter((o) => {
          const d = (o.jobcard_date ? o.jobcard_date.split('T')[0] : '');
          return d >= startDate;
        });
      }
      if (endDate) {
        list = list.filter((o) => {
          const d = (o.jobcard_date ? o.jobcard_date.split('T')[0] : '');
          return d <= endDate;
        });
      }
    }

    return list;
  }, [orders, filters.search, filters.jobcard_type, filters.center_code, filters.job_status, dateMode, singleDate, startDate, endDate]);

  const selectedOrder = orders.find((o) => String(o.id) === String(selectedOrderId));

  useEffect(() => {
    if (selectedOrder) {
      setForm({
        vehicle_manufacturer: selectedOrder.vehicle_manufacturer || '',
        vehicle_model: selectedOrder.vehicle_model || '',
        vehicle_variant: selectedOrder.vehicle_variant || '',
        vehicle_registration_no: selectedOrder.vehicle_registration_no || '',
        jobcard_type: selectedOrder.jobcard_type || 'New workorder',
        technician_code: selectedOrder.technician_code || '',
        name_of_technician: selectedOrder.name_of_technician || '',
        jobcard_no: selectedOrder.jobcard_no || '',
        jobcard_date: selectedOrder.jobcard_date || '',
        kilometres: selectedOrder.kilometres ? String(selectedOrder.kilometres) : '',
        name_of_service_advisor: selectedOrder.name_of_service_advisor || '',
        job_status: selectedOrder.job_status || 'In Progress',
        admin_remarks: selectedOrder.admin_remarks || ''
      });
      if (selectedOrder.vehicle_manufacturer) {
        loadModelsForManufacturer(selectedOrder.vehicle_manufacturer);
      }
      setReplacementPhotoBase64(null);
    }
  }, [selectedOrder]);

  const handleMfrChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setForm({ ...form, vehicle_manufacturer: val, vehicle_model: '' });
    if (val) {
      loadModelsForManufacturer(val);
    } else {
      setModels([]);
    }
  };

  const handleTechChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const tech = technicians.find((t) => t.employee_code === code);
    setForm({
      ...form,
      technician_code: code,
      name_of_technician: tech ? tech.employee_name : ''
    });
  };

  // Replacement Photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scaleSize = MAX_WIDTH / img.width;
        if (scaleSize < 1) {
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const webp = canvas.toDataURL('image/webp', 0.85);
          setReplacementPhotoBase64(webp);
          onNotification('Replacement photo ready for upload', 'info');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Submit Edit Form with Strict Business Validation
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) {
      onNotification('Please select a work order to edit', 'error');
      return;
    }

    // STRICT BUSINESS VALIDATION RULE:
    // Admin CANNOT change status from "In Progress" to "Re-Assigned" or "Closed"
    if (selectedOrder.job_status === 'In Progress') {
      const target = form.job_status.toLowerCase();
      if (target === 'closed' || target === 're-assigned' || target === 're-assign') {
        onNotification(
          `❌ Admin cannot change the workorder to '${form.job_status}'. Please ask the Team Leader to change this status.`,
          'error'
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      // Primary: Universal Action Endpoint
      let res = await authFetch('/api/workorders/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: selectedOrder.id,
          data: {
            ...form,
            jobcard_photo_base64: replacementPhotoBase64
          }
        })
      });

      // Fallback: REST endpoint
      if (!res.ok && res.status === 404) {
        res = await authFetch(`/api/admin/workorders/${selectedOrder.id}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            jobcard_photo_base64: replacementPhotoBase64
          })
        });
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || res.status === 200)) {
        onNotification(data.message || `Work order #${form.jobcard_no} updated successfully!`, 'success');
        setIsEditing(false);
        loadOrders();
      } else {
        onNotification(data.error || `Failed to update work order (Status: ${res.status})`, 'error');
      }
    } catch (err: any) {
      console.error('Update action failed:', err);
      onNotification(err?.message || 'Error connecting to server to update work order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Soft Delete Record Handler (strictly updates delete_flag = 1, no SQL delete)
  const handleConfirmDelete = async () => {
    if (!selectedOrder) return;
    try {
      setSubmitting(true);
      // Primary: Universal Action Endpoint (sets delete_flag = 1)
      let res = await authFetch('/api/workorders/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'soft_delete',
          id: selectedOrder.id
        })
      });

      // Fallback: REST POST delete
      if (!res.ok && res.status === 404) {
        res = await authFetch(`/api/admin/workorders/${selectedOrder.id}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Secondary Fallback: REST DELETE
      if (!res.ok && res.status === 404) {
        res = await authFetch(`/api/admin/workorders/${selectedOrder.id}`, {
          method: 'DELETE'
        });
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || res.status === 200)) {
        onNotification(data.message || `Work order #${selectedOrder.jobcard_no} deleted successfully!`, 'success');
        setShowDeleteModal(false);
        setSelectedOrderId('');
        setIsEditing(false);
        loadOrders();
      } else {
        onNotification(data.error || `Server responded with status ${res.status}: Failed to delete work order`, 'error');
      }
    } catch (err: any) {
      console.error('Delete action failed:', err);
      onNotification(err?.message || 'Error connecting to server to delete work order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPhotoUrl = formatPhotoUrl(selectedOrder?.jobcard_photo);

  return (
    <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-lg bg-white/90 backdrop-blur-xl max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-sky-600" />
            Update Workorder Status
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Search, review details, update status, and manage active workshop work orders.
          </p>
        </div>
      </div>

      {/* Filter Matrix Matching View Work Orders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search Jobcard No, Reg, Tech..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 font-medium"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, search: '' })}
              className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Jobcard Type */}
        <div>
          <select
            value={filters.jobcard_type}
            onChange={(e) => setFilters({ ...filters, jobcard_type: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-sky-500"
          >
            <option value="">All Jobcard Types</option>
            <option value="New workorder">New workorder</option>
            <option value="Repeat Repair">Repeat Repair</option>
            <option value="Re Visit">Re Visit</option>
            <option value="Re-assigned job">Re-assigned job</option>
          </select>
        </div>

        {/* Center */}
        <div>
          <select
            value={filters.center_code}
            onChange={(e) => setFilters({ ...filters, center_code: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-sky-500"
          >
            <option value="">All Centers</option>
            {centers.map((c) => (
              <option key={c.center_code} value={c.center_code}>
                {c.center_name} ({c.center_code})
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <select
            value={filters.job_status}
            onChange={(e) => setFilters({ ...filters, job_status: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-sky-500"
          >
            <option value="">All Statuses</option>
            <option value="In Progress">In Progress</option>
            <option value="Closed">Closed</option>
            <option value="Re-assigned">Re-assigned</option>
          </select>
        </div>

        {/* Date Filter Mode Selector */}
        <div>
          <select
            value={dateMode}
            onChange={(e) => {
              const mode = e.target.value as 'all' | 'single' | 'range';
              setDateMode(mode);
              if (mode === 'single' && !singleDate) {
                setSingleDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
              }
            }}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-sky-500"
          >
            <option value="all">📅 Date Filter: Off (All Dates)</option>
            <option value="single">📅 Single Jobcard Date</option>
            <option value="range">📅 Date Range (Jobcard)</option>
          </select>
        </div>
      </div>

      {/* Date Filter Inputs (shown when Single or Range is active) */}
      {dateMode !== 'all' && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-sky-50/60 border border-sky-200 rounded-xl text-xs">
          <span className="font-bold text-sky-900 flex items-center gap-1.5 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-sky-600" />
            Jobcard Date Filter:
          </span>

          {dateMode === 'single' ? (
            <div className="flex items-center gap-2">
              <label className="text-slate-600 font-semibold text-[11px]">Date:</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-slate-600 font-semibold text-[11px]">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-slate-600 font-semibold text-[11px]">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setDateMode('all');
              setSingleDate('');
              setStartDate('');
              setEndDate('');
            }}
            className="ml-auto px-2.5 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md text-[11px] font-semibold transition cursor-pointer"
          >
            Clear Date Filter
          </button>
        </div>
      )}

      {/* Selectable Active Work Orders Table/Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>Active Workorders Available ({filteredOrders.length}):</span>
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 z-10">
              <tr className="border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-2.5 whitespace-nowrap">Jobcard No</th>
                <th className="p-2.5 whitespace-nowrap">Jobcard Date</th>
                <th className="p-2.5 whitespace-nowrap">Type</th>
                <th className="p-2.5 whitespace-nowrap">Reg No</th>
                <th className="p-2.5 whitespace-nowrap">Technician</th>
                <th className="p-2.5 whitespace-nowrap">Center</th>
                <th className="p-2.5 whitespace-nowrap">Status</th>
                <th className="p-2.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                    No active work orders found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const isSelected = String(o.id) === String(selectedOrderId);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrderId(String(o.id))}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-sky-50/90 font-semibold text-sky-950' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-2.5 font-mono font-bold text-sky-700 whitespace-nowrap">
                        #{o.jobcard_no}
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {o.jobcard_date || '—'}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">{o.jobcard_type}</td>
                      <td className="p-2.5 font-mono whitespace-nowrap">{o.vehicle_registration_no || '—'}</td>
                      <td className="p-2.5 whitespace-nowrap">{o.name_of_technician || '—'}</td>
                      <td className="p-2.5 font-mono text-[11px] whitespace-nowrap">{o.center_code || '—'}</td>
                      <td className="p-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            o.job_status === 'Closed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : o.job_status === 'Re-assigned'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {o.job_status || 'In Progress'}
                        </span>
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderId(String(o.id));
                              setIsEditing(true);
                            }}
                            className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-bold transition"
                            title="Edit Work Order"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderId(String(o.id));
                              setShowDeleteModal(true);
                            }}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition"
                            title="Delete Work Order"
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

      {/* Selected Work Order Details & Edit Form */}
      {selectedOrder && (
        <div className="p-6 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base">
                  Selected Work Order #{selectedOrder.jobcard_no}
                </span>
                <span className="px-2.5 py-0.5 bg-sky-100 text-sky-800 rounded-full text-[11px] font-bold">
                  {selectedOrder.jobcard_type}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vehicle: <span className="font-bold text-slate-700">{selectedOrder.vehicle_manufacturer} {selectedOrder.vehicle_model}</span> ({selectedOrder.vehicle_registration_no}) · Center: <span className="font-mono">{selectedOrder.center_code}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Cancel Edit' : 'Edit Details'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Record</span>
              </button>
            </div>
          </div>

          {/* Edit Form */}
          {isEditing && (
            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Vehicle Manufacturer */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Manufacturer</label>
                  <select
                    value={form.vehicle_manufacturer}
                    onChange={handleMfrChange}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-medium"
                  >
                    <option value="">Select Manufacturer</option>
                    {manufacturers.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Vehicle Model */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Vehicle Model</label>
                  <select
                    value={form.vehicle_model}
                    onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-medium"
                  >
                    <option value="">Select Model</option>
                    {models.map((mdl) => (
                      <option key={mdl} value={mdl}>{mdl}</option>
                    ))}
                  </select>
                </div>

                {/* Vehicle Variant */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Variant</label>
                  <input
                    type="text"
                    value={form.vehicle_variant}
                    onChange={(e) => setForm({ ...form, vehicle_variant: e.target.value })}
                    placeholder="e.g. VXI, ZXI"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-medium"
                  />
                </div>

                {/* Registration No */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Registration No</label>
                  <input
                    type="text"
                    value={form.vehicle_registration_no}
                    onChange={(e) => setForm({ ...form, vehicle_registration_no: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Jobcard Type */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Jobcard Type</label>
                  <select
                    value={form.jobcard_type}
                    onChange={(e) => setForm({ ...form, jobcard_type: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-medium"
                  >
                    <option value="New workorder">New workorder</option>
                    <option value="Repeat Repair">Repeat Repair</option>
                    <option value="Re Visit">Re Visit</option>
                    <option value="Re-assigned job">Re-assigned job</option>
                  </select>
                </div>

                {/* Technician */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Assigned Technician</label>
                  <select
                    value={form.technician_code}
                    onChange={handleTechChange}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-medium"
                  >
                    <option value="">Select Technician</option>
                    {technicians.map((t) => (
                      <option key={t.employee_code} value={t.employee_code}>
                        {t.employee_name} ({t.employee_code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Jobcard No */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Jobcard No</label>
                  <input
                    type="text"
                    value={form.jobcard_no}
                    onChange={(e) => setForm({ ...form, jobcard_no: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-sky-500 font-medium"
                  />
                </div>

                {/* Jobcard Date */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Jobcard Date</label>
                  <input
                    type="date"
                    value={form.jobcard_date}
                    onChange={(e) => setForm({ ...form, jobcard_date: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Kilometres */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Kilometres</label>
                  <input
                    type="number"
                    value={form.kilometres}
                    onChange={(e) => setForm({ ...form, kilometres: e.target.value })}
                    placeholder="e.g. 45000"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Service Advisor */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Service Advisor</label>
                  <input
                    type="text"
                    value={form.name_of_service_advisor}
                    onChange={(e) => setForm({ ...form, name_of_service_advisor: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-medium"
                  />
                </div>

                {/* Job Status with Validation Alert */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">
                    Job Status
                    {selectedOrder.job_status === 'In Progress' && (
                      <span className="text-[10px] text-amber-600 font-normal ml-1">(TL Only for Re-assign/Close)</span>
                    )}
                  </label>
                  <select
                    value={form.job_status}
                    onChange={(e) => setForm({ ...form, job_status: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-medium"
                  >
                    <option value="In Progress">In Progress</option>
                    <option value="Closed">Closed</option>
                    <option value="Re-assigned">Re-assigned</option>
                  </select>
                </div>
              </div>

              {/* Photo & Admin Remarks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Jobcard Photo Replacement (Optional)</label>
                  <div className="flex items-center gap-3">
                    {replacementPhotoBase64 ? (
                      <img src={replacementPhotoBase64} alt="New Preview" className="w-16 h-16 object-cover rounded-xl border border-sky-400" />
                    ) : currentPhotoUrl ? (
                      <img src={currentPhotoUrl} alt="Current Jobcard" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
                    ) : (
                      <div className="w-16 h-16 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-xs">No Photo</div>
                    )}
                    <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition shadow-2xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload New Photo</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Admin Remarks</label>
                  <textarea
                    rows={2}
                    value={form.admin_remarks}
                    onChange={(e) => setForm({ ...form, admin_remarks: e.target.value })}
                    placeholder="Enter admin modifications reason..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : '💾 Save Modifications'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Remove Work Order</h3>
                <p className="text-xs text-slate-500">This record will be safely archived from active work orders.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 font-medium">
              <div><span className="text-slate-400">WO ID:</span> <span className="font-mono font-bold text-slate-800">#{selectedOrder.id}</span></div>
              <div><span className="text-slate-400">Jobcard No:</span> <span className="font-mono font-bold text-sky-700">{selectedOrder.jobcard_no}</span></div>
              <div><span className="text-slate-400">Technician:</span> <span className="font-bold text-slate-800">{selectedOrder.name_of_technician || '—'}</span></div>
              <div><span className="text-slate-400">Vehicle Reg:</span> <span className="font-mono text-slate-800">{selectedOrder.vehicle_registration_no}</span></div>
              <div><span className="text-slate-400">Center:</span> <span className="font-mono text-slate-800">{selectedOrder.center_name || selectedOrder.center_code}</span></div>
            </div>

            <p className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200 font-medium">
              ⚠️ Are you sure you want to remove this record from all active views?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Archiving...' : 'Yes, Remove Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
