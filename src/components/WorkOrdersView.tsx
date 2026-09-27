import React, { useState, useEffect, useMemo } from 'react';
import { Briefcase, Search, Download, Eye, Calendar, Filter, RefreshCw, ZoomIn, X } from 'lucide-react';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils';
import { authFetch } from '../utils/api';

interface WorkOrdersViewProps {
  user: any;
  centers: any[];
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  onInspectImage: (img: { url: string; title: string }) => void;
}

export const WorkOrdersView: React.FC<WorkOrdersViewProps> = ({
  user,
  centers,
  onNotification,
  onInspectImage
}) => {
  const isTeamLeader = user.user_role === 'TeamLeader';
  const [orders, setOrders] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Default date range: From (-31 days) to To (today)
  const [filters, setFilters] = useState({
    search: '',
    jobcard_type: '',
    job_status: '',
    center_code: isTeamLeader ? (user.center_code || '') : '',
    start_date: new Date(Date.now() - 31 * 86400000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });

  const loadOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.jobcard_type) params.append('jobcard_type', filters.jobcard_type);
      if (filters.job_status) params.append('job_status', filters.job_status);
      if (filters.center_code) params.append('center_code', filters.center_code);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      params.append('limit', '300');

      const res = await authFetch(`/api/workorders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const activeOnly = (data.data || []).filter(
          (o: any) => o.delete_flag === 0 || o.delete_flag === '0' || o.delete_flag === null
        );
        setOrders(activeOnly);
        setTotalCount(activeOnly.length);
      } else {
        const err = await res.json().catch(() => ({}));
        onNotification(err.error || 'Failed to load work orders', 'error');
      }
    } catch (e) {
      console.error(e);
      onNotification('Failed to load work orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Debounced live search & reactive filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
    }, 250);
    return () => clearTimeout(timer);
  }, [filters.search, filters.jobcard_type, filters.job_status, filters.center_code, filters.start_date, filters.end_date]);

  // Client-side real-time filter for instant 0ms responsiveness
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

    if (filters.center_code && !isTeamLeader) {
      list = list.filter((o) => o.center_code === filters.center_code);
    }

    if (filters.job_status) {
      list = list.filter((o) => o.job_status === filters.job_status);
    }

    return list;
  }, [orders, filters.search, filters.jobcard_type, filters.center_code, filters.job_status, isTeamLeader]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders();
  };

  // Excel (.xlsx / .csv) Export per specification (excluding raw image blobs and delete_flag)
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      onNotification('No work orders available to export', 'error');
      return;
    }

    const headers = [
      'Jobcard No',
      'Jobcard Type',
      'Technician Code',
      'Name of Technician',
      'Previous Jobcard No',
      'Vehicle Manufacturer',
      'Vehicle Model',
      'Vehicle Variant',
      'Registration No',
      'Kilometres',
      'Service Advisor',
      'Job Status',
      'Jobcard Date',
      'Job Assign Date',
      'Job Complete Date',
      'Center Code',
      'Center Name',
      'TL Remarks',
      'Admin Remarks'
    ];

    const rows = filteredOrders.map((o) => [
      `"${o.jobcard_no || ''}"`,
      `"${o.jobcard_type || ''}"`,
      `"${o.technician_code || ''}"`,
      `"${o.name_of_technician || ''}"`,
      `"${o.previous_jobcard_no || ''}"`,
      `"${o.vehicle_manufacturer || ''}"`,
      `"${o.vehicle_model || ''}"`,
      `"${o.vehicle_variant || ''}"`,
      `"${o.vehicle_registration_no || ''}"`,
      `"${o.kilometres || ''}"`,
      `"${o.name_of_service_advisor || ''}"`,
      `"${o.job_status || ''}"`,
      `"${o.jobcard_date || ''}"`,
      `"${o.job_assign_date || ''}"`,
      `"${o.job_compleate_date || ''}"`,
      `"${o.center_code || ''}"`,
      `"${o.center_name || ''}"`,
      `"${(o.tl_remarks || '').replace(/"/g, '""')}"`,
      `"${(o.admin_remarks || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Premji_WorkOrders_${filters.start_date}_to_${filters.end_date}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotification('Work Orders report exported successfully!', 'success');
  };

  return (
    <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-lg bg-white/90 backdrop-blur-xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-sky-600" />
            View Work Orders
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {isTeamLeader ? `Workshop Center: ${user.center_name || user.center_code}` : 'All Workshop Centers Supervised'} · Filtered Records: <span className="font-bold text-sky-600 font-mono">{filteredOrders.length}</span> / Total: <span className="font-mono text-slate-600">{totalCount}</span>
          </p>
        </div>

        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer self-start md:self-auto"
        >
          <Download className="w-4 h-4" />
          📥 Download Excel (.xlsx)
        </button>
      </div>

      {/* Filter Matrix */}
      <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
        {/* Search input with live clear button */}
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

        {/* Jobcard Type Filter */}
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

        {/* Center Filter (Admins only) or Status */}
        {!isTeamLeader ? (
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
        ) : (
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
        )}

        {/* Start Date */}
        <div>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-mono focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* End Date */}
        <div>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-mono focus:outline-none focus:border-sky-500"
          />
        </div>
      </form>

      {/* Responsive Work Orders Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <th className="p-3 whitespace-nowrap">Jobcard No</th>
              <th className="p-3 whitespace-nowrap">Jobcard Type</th>
              <th className="p-3 whitespace-nowrap">Tech Code</th>
              <th className="p-3 whitespace-nowrap">Name of Technician</th>
              <th className="p-3 text-center whitespace-nowrap">Jobcard Photo</th>
              <th className="p-3 whitespace-nowrap">Previous Jobcard No</th>
              <th className="p-3 whitespace-nowrap">Job Status</th>
              <th className="p-3 whitespace-nowrap">Job Assign Date</th>
              <th className="p-3 whitespace-nowrap">Job Complete Date</th>
              <th className="p-3 whitespace-nowrap">Center Code</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-12 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
                  <p className="text-xs text-slate-400 mt-2">Loading work orders...</p>
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-12 text-center text-slate-400 italic">
                  No work orders found for the selected criteria.
                </td>
              </tr>
            ) : (
              filteredOrders.map((o) => {
                const photoUrl = formatPhotoUrl(o.jobcard_photo);
                const isClosed = o.job_status === 'Closed';
                const isReassigned = o.job_status === 'Re-assigned' || o.job_status === 'Re-Assigned';
                const isInProgress = o.job_status === 'In Progress' || !o.job_status;

                return (
                  <tr key={o.id || `${o.jobcard_no}_${o.id}`} className="hover:bg-slate-50/80 transition">
                    {/* 1. Jobcard No */}
                    <td className="p-3 font-mono font-bold text-sky-700 whitespace-nowrap">
                      {o.jobcard_no || '—'}
                    </td>

                    {/* 2. Jobcard Type */}
                    <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                      {o.jobcard_type || 'New workorder'}
                    </td>

                    {/* 3. Technician Code */}
                    <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {o.technician_code || '—'}
                    </td>

                    {/* 4. Name of Technician */}
                    <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                      {o.name_of_technician || o.technician_name || 'Unassigned'}
                    </td>

                    {/* 5. Jobcard Photo */}
                    <td className="p-3 text-center whitespace-nowrap">
                      {photoUrl ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectImage({ url: photoUrl, title: `Job Card #${o.jobcard_no} (${o.vehicle_registration_no || ''})` })}
                            className="relative group rounded-lg overflow-hidden border border-slate-200 hover:border-sky-400 transition shadow-2xs block"
                            title="Click to Enlarge"
                          >
                            <img
                              src={photoUrl}
                              alt="Jobcard"
                              className="w-11 h-9 object-cover bg-slate-100"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE_SVG;
                              }}
                            />
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                              <ZoomIn className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* 6. Previous Jobcard No */}
                    <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                      {o.previous_jobcard_no || '—'}
                    </td>

                    {/* 7. Job Status */}
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isClosed
                            ? 'bg-emerald-100 text-emerald-800'
                            : isReassigned
                            ? 'bg-amber-100 text-amber-800'
                            : isInProgress
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {o.job_status || 'In Progress'}
                      </span>
                    </td>

                    {/* 8. Job Assign Date */}
                    <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                      {o.job_assign_date || o.jobcard_date || '—'}
                    </td>

                    {/* 9. Job Complete Date */}
                    <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                      {o.job_compleate_date ? `${o.job_compleate_date} ${o.job_compleate_time || ''}` : '—'}
                    </td>

                    {/* 10. Center Code */}
                    <td className="p-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                      {o.center_code || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
