import React, { useState, useEffect, useMemo } from 'react';
import { Briefcase, Search, Download, Eye, Calendar, Filter, RefreshCw, ZoomIn, X, CheckSquare, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils';
import { authFetch } from '../utils/api';
import { getIstDateString } from '../lib/ist-time';

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
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());

  // Default date range: strictly present / today date
  const todayIST = getIstDateString();
  const [filters, setFilters] = useState({
    search: '',
    jobcard_type: '',
    job_status: '',
    center_code: isTeamLeader ? (user.center_code || '') : '',
    start_date: todayIST,
    end_date: todayIST
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

  const handleToggleSelect = (id: number | string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<number | string>();
      filteredOrders.forEach((o) => {
        if (o.id) next.add(o.id);
        else if (o.jobcard_no) next.add(o.jobcard_no);
      });
      setSelectedIds(next);
    }
  };

  // Helper to extract full dataset excluding admin_id and delete_flag with meaningful headers
  const getExportDataset = () => {
    const targetOrders = selectedIds.size > 0
      ? filteredOrders.filter((o) => selectedIds.has(o.id) || selectedIds.has(o.jobcard_no))
      : filteredOrders;

    if (targetOrders.length === 0) {
      onNotification('No work orders available to export', 'error');
      return null;
    }

    const headers = [
      'Work Order ID',
      'Jobcard No',
      'Jobcard Type',
      'Jobcard Date',
      'Job Assign Date',
      'Job Status',
      'Vehicle Registration No',
      'Vehicle Manufacturer',
      'Vehicle Model',
      'Vehicle Variant',
      'Kilometres Run',
      'Technician Code',
      'Technician Name',
      'Service Advisor Name',
      'Workshop Center Code',
      'Workshop Center Name',
      'Center Location',
      'Previous Jobcard No',
      'Job Start Time',
      'Job Completion Date',
      'Job Completion Time',
      'Team Leader ID',
      'Team Leader Remarks',
      'TL Last Update Time',
      'Admin Remarks',
      'Admin Last Update Time',
      'Jobcard Photo Reference',
      'Wheel Alignment',
      'Wheel Balancing',
      'Tyre Fitting',
      'Puncture Removed',
      'TPMS Replacement',
      'Disc Skimming',
      'Drum Skimming',
      'Brake Testing',
      'Carbon Cleaning / Decarb',
      'Washing & Cleaning',
      'Interior Cleaning',
      'Exterior Polishing',
      'Paint Protection Film (PPF)',
      'Wheel / Tyre Rotation',
      'Record Created At',
      'Record Updated At'
    ];

    const rows = targetOrders.map((o) => [
      o.id || '',
      o.jobcard_no || '',
      o.jobcard_type || '',
      o.jobcard_date || '',
      o.job_assign_date || '',
      o.job_status || '',
      o.vehicle_registration_no || '',
      o.vehicle_manufacturer || '',
      o.vehicle_model || '',
      o.vehicle_variant || '',
      o.kilometres !== null && o.kilometres !== undefined ? o.kilometres : '',
      o.technician_code || '',
      o.name_of_technician || '',
      o.name_of_service_advisor || '',
      o.center_code || '',
      o.center_name || '',
      o.center_location || '',
      o.previous_jobcard_no || '',
      o.job_start_time || '',
      o.job_compleate_date || '',
      o.job_compleate_time || '',
      o.tl_id || '',
      o.tl_remarks || '',
      o.tl_last_update || '',
      o.admin_remarks || '',
      o.admin_last_update_time || '',
      o.jobcard_photo || '',
      o.wheel_alignment ?? 0,
      o.wheel_balancing ?? 0,
      o.tyre_fitting ?? 0,
      o.puncture_removed ?? 0,
      o.tpms_replacement ?? 0,
      o.disc_cutting ?? 0,
      o.drum_cutting ?? 0,
      o.brake_testing ?? 0,
      o.carbon_cleaning_decarb ?? 0,
      o.washing_and_cleaning ?? 0,
      o.interior_cleaning ?? 0,
      o.exterior_polishing ?? 0,
      o.paint_protection_film ?? 0,
      o.wheel_tyre_rotation ?? 0,
      o.created_at || '',
      o.updated_at || ''
    ]);

    return { headers, rows, count: targetOrders.length };
  };

  // 1. Export as Excel Binary (.xlsb)
  const handleExportXLSB = () => {
    const data = getExportDataset();
    if (!data) return;

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Work Orders');

      const xlsbArray = XLSX.write(wb, { bookType: 'xlsb', type: 'array' });
      const blob = new Blob([xlsbArray], {
        type: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Premji_WorkOrders_${new Date().toISOString().split('T')[0]}.xlsb`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onNotification(`Successfully exported ${data.count} work orders as .xlsb binary!`, 'success');
    } catch (e: any) {
      console.error(e);
      onNotification('Failed to generate .xlsb spreadsheet file', 'error');
    }
  };

  // 2. Export as CSV (.csv)
  const handleExportCSV = () => {
    const data = getExportDataset();
    if (!data) return;

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
      const csvString = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Premji_WorkOrders_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onNotification(`Successfully exported ${data.count} work orders as .csv!`, 'success');
    } catch (e: any) {
      console.error(e);
      onNotification('Failed to generate CSV file', 'error');
    }
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

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition"
            >
              Clear Selected ({selectedIds.size})
            </button>
          )}

          {/* Download as .xlsb */}
          <button
            onClick={handleExportXLSB}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            title="Download in Excel Binary (.xlsb) format"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {selectedIds.size > 0 ? `Export Selected (${selectedIds.size}) .xlsb` : `Export All (${filteredOrders.length}) .xlsb`}
            </span>
          </button>

          {/* Download as .CSV */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            title="Download in Universal CSV (.csv) format"
          >
            <Download className="w-4 h-4" />
            <span>
              {selectedIds.size > 0 ? `Export Selected (${selectedIds.size}) .CSV` : `Export All (${filteredOrders.length}) .CSV`}
            </span>
          </button>
        </div>
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
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                  onChange={handleToggleSelectAll}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  title="Select All / Deselect All Filtered"
                />
              </th>
              <th className="p-3 whitespace-nowrap">Jobcard No</th>
              <th className="p-3 whitespace-nowrap">Jobcard Date</th>
              <th className="p-3 whitespace-nowrap">Jobcard Type</th>
              <th className="p-3 whitespace-nowrap">Reg No</th>
              <th className="p-3 whitespace-nowrap">Tech Code</th>
              <th className="p-3 whitespace-nowrap">Name of Technician</th>
              <th className="p-3 text-center whitespace-nowrap">Jobcard Photo</th>
              <th className="p-3 whitespace-nowrap">Previous Jobcard No</th>
              <th className="p-3 whitespace-nowrap">Job Status</th>
              <th className="p-3 whitespace-nowrap">Job Assign Date</th>
              <th className="p-3 whitespace-nowrap">Center Code</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-12 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
                  <p className="text-xs text-slate-400 mt-2">Loading work orders...</p>
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-12 text-center text-slate-400 italic">
                  No work orders found for the selected criteria.
                </td>
              </tr>
            ) : (
              filteredOrders.map((o) => {
                const photoUrl = formatPhotoUrl(o.jobcard_photo);
                const isClosed = o.job_status === 'Closed';
                const isReassigned = o.job_status === 'Re-assigned' || o.job_status === 'Re-Assigned';
                const isInProgress = o.job_status === 'In Progress' || !o.job_status;
                const orderKey = o.id || o.jobcard_no;
                const isSelected = selectedIds.has(orderKey);

                return (
                  <tr
                    key={o.id || `${o.jobcard_no}_${o.id}`}
                    className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-sky-50/80' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(orderKey)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                    </td>

                    {/* 1. Jobcard No */}
                    <td className="p-3 font-mono font-bold text-sky-700 whitespace-nowrap">
                      #{o.jobcard_no || '—'}
                    </td>

                    {/* Jobcard Date */}
                    <td className="p-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {o.jobcard_date || '—'}
                    </td>

                    {/* 2. Jobcard Type */}
                    <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                      {o.jobcard_type || 'New workorder'}
                    </td>

                    {/* Reg No */}
                    <td className="p-3 font-mono text-slate-700 font-semibold whitespace-nowrap">
                      {o.vehicle_registration_no || '—'}
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
