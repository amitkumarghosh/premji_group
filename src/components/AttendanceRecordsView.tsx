import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Search,
  Download,
  Eye,
  RefreshCw,
  Clock,
  Coffee,
  Award,
  Users,
  Building,
  Filter,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils.ts';
import { authFetch } from '../utils/api.ts';
import { formatIstTimeDisplay, formatIstFullDisplay, getIstDateString } from '../lib/ist-time.ts';

interface AttendanceRecordsViewProps {
  user: any;
  centers: any[];
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  onInspectImage: (img: { url: string; title: string }) => void;
}

export const AttendanceRecordsView: React.FC<AttendanceRecordsViewProps> = ({
  user,
  centers,
  onNotification,
  onInspectImage
}) => {
  const today = getIstDateString();
  const thirtyDaysAgo = getIstDateString(new Date(Date.now() - 30 * 86400000));

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({
    total_records: 0,
    sum_total_working_hrs: 0,
    sum_total_break_hrs: 0,
    sum_effective_working_hrs: 0,
    avg_effective_working_hrs: 0,
    total_active_employees: 0,
    total_centers: 0
  });

  const [filters, setFilters] = useState({
    start_date: thirtyDaysAgo,
    end_date: today,
    center_code: '',
    employee_code: '',
    search: ''
  });

  const loadRecords = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.start_date) params.append('startDate', filters.start_date);
      if (filters.end_date) params.append('endDate', filters.end_date);
      if (filters.center_code) params.append('centerCode', filters.center_code);
      if (filters.employee_code) params.append('employeeCode', filters.employee_code);
      if (filters.search) params.append('search', filters.search);

      const res = await authFetch(`/api/admin/attendance/summary?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        if (data.summary) {
          setSummary(data.summary);
        }
      } else {
        // Fallback to legacy endpoint
        const fallbackRes = await authFetch(`/api/attendance/admin-report?${params.toString()}`);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const rows = fallbackData.records || [];
          setRecords(rows);
          if (fallbackData.summary) {
            setSummary(fallbackData.summary);
          }
        }
      }
    } catch (e) {
      console.error(e);
      onNotification('Failed to generate attendance report', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [filters.start_date, filters.end_date, filters.center_code]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadRecords();
  };

  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'week' | 'month') => {
    const todayStr = getIstDateString();
    if (preset === 'today') {
      setFilters(prev => ({ ...prev, start_date: todayStr, end_date: todayStr }));
    } else if (preset === 'yesterday') {
      const yStr = getIstDateString(new Date(Date.now() - 86400000));
      setFilters(prev => ({ ...prev, start_date: yStr, end_date: yStr }));
    } else if (preset === 'week') {
      const wStr = getIstDateString(new Date(Date.now() - 7 * 86400000));
      setFilters(prev => ({ ...prev, start_date: wStr, end_date: todayStr }));
    } else if (preset === 'month') {
      const mStr = getIstDateString(new Date(Date.now() - 30 * 86400000));
      setFilters(prev => ({ ...prev, start_date: mStr, end_date: todayStr }));
    }
  };

  const handleExportCSV = () => {
    if (records.length === 0) {
      onNotification('No attendance records to export', 'error');
      return;
    }

    const headers = [
      'Attendance Date',
      'Employee Code',
      'Employee Name',
      'Center Name',
      'Center Location',
      'In Time (IST)',
      'Break Out (IST)',
      'Break In (IST)',
      'Out Time (IST)',
      'Gross Working Hrs',
      'Total Break Hrs',
      'Effective Working Hrs',
      'Initial Check-In (Ground Truth)',
      'Last Edit Timestamp',
      'Last Edited By',
      'Admin Remarks'
    ];

    const rows = records.map((r) => [
      `"${r.attendance_date || ''}"`,
      `"${r.emp_code_of_thetechnician || ''}"`,
      `"${r.name_of_technician || ''}"`,
      `"${r.center_name || ''}"`,
      `"${r.center_location || ''}"`,
      `"${r.on_duty_in_time || ''}"`,
      `"${r.intermidiate_off_out_time || ''}"`,
      `"${r.intermidiate_off_in_time || ''}"`,
      `"${r.on_duty_out_time || ''}"`,
      Number(r.total_working_hrs || 0).toFixed(2),
      Number(r.total_break_hrs || 0).toFixed(2),
      Number(r.effective_working_hrs || 0).toFixed(2),
      `"${r.all_innitial_time || ''}"`,
      `"${r.last_edit_timestamp || ''}"`,
      `"${r.last_edited_by || ''}"`,
      `"${(r.admin_remarks || '').replace(/"/g, '""')}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Premji_Attendance_Report_${filters.start_date}_to_${filters.end_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotification('Attendance CSV report downloaded successfully!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 md:p-8 rounded-3xl border border-sky-100 bg-white/90 shadow-md backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-2xl shadow-inner">
              📈
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-900">Attendance Search &amp; Master Summary</h2>
              <p className="text-xs text-slate-500 font-medium">
                Real-time shift metrics, break durations, immutable audit logs, and photo verification.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadRecords}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 5 High-Level Metric Aggregation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Records</span>
            <Users className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-slate-900">
            {summary.total_records}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {summary.total_active_employees || 0} Active Staff
          </div>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Gross Hours</span>
            <Clock className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-sky-700">
            {Number(summary.sum_total_working_hrs || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            SUM(total_working_hrs)
          </div>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between text-amber-700 text-xs font-bold uppercase tracking-wider">
            <span>Break Duration</span>
            <Coffee className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-amber-600">
            {Number(summary.sum_total_break_hrs || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            SUM(total_break_hrs)
          </div>
        </div>

        <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-500 to-teal-700 p-4 text-white shadow-md shadow-emerald-600/20 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-emerald-100 text-xs font-bold uppercase tracking-wider">
            <span>Effective Hours</span>
            <Award className="h-4 w-4 text-white" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-white">
            {Number(summary.sum_effective_working_hrs || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-emerald-100/90 font-medium mt-0.5">
            Primary Net Working KPI
          </div>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between text-purple-700 text-xs font-bold uppercase tracking-wider">
            <span>Avg Shift</span>
            <Clock className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-purple-700">
            {Number(summary.avg_effective_working_hrs || 0).toFixed(2)}{' '}
            <span className="text-xs font-sans text-slate-400 font-bold">HRS</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            AVG(effective_working_hrs)
          </div>
        </div>
      </div>

      {/* Filter & Range Bar */}
      <div className="p-6 rounded-3xl border border-sky-100 bg-white/90 shadow-md backdrop-blur-xl">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-sky-600" />
              Filter Records
            </span>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('today')}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('yesterday')}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('week')}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('month')}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
              >
                Last 30 Days
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Workshop Center
              </label>
              <select
                value={filters.center_code}
                onChange={(e) => setFilters({ ...filters, center_code: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="">All Centers</option>
                {centers.map((c) => (
                  <option key={c.center_code} value={c.center_code}>
                    {c.center_name} ({c.center_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Search Code / Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. TECH01 or Suresh"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-700 transition cursor-pointer"
              >
                Search Records
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Tabular Grid with Photo Preview and 9 Core Fields */}
      <div className="rounded-3xl border border-sky-100 bg-white/90 overflow-hidden shadow-md backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Center</th>
                <th className="py-3 px-4 text-center">In Time</th>
                <th className="py-3 px-4 text-center">Break Out</th>
                <th className="py-3 px-4 text-center">Break In</th>
                <th className="py-3 px-4 text-center">Out Time</th>
                <th className="py-3 px-4 text-right">Gross (h)</th>
                <th className="py-3 px-4 text-right">Break (h)</th>
                <th className="py-3 px-4 text-right">Effective (h)</th>
                <th className="py-3 px-4">Initial Check-In</th>
                <th className="py-3 px-4">Audit Trail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-sky-600 mb-2" />
                    <span>Loading attendance report and computing shift analytics...</span>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
                    No attendance records found matching current filters.
                  </td>
                </tr>
              ) : (
                records.map((r, i) => {
                  const effective = Number(r.effective_working_hrs || 0);
                  const isFullShift = effective >= 8.0;

                  return (
                    <tr key={r.id || i} className="hover:bg-sky-50/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.attendance_date}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{r.name_of_technician}</div>
                        <div className="font-mono text-[10px] text-sky-700 font-semibold">{r.emp_code_of_thetechnician}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        <div className="font-medium">{r.center_name || 'Main Center'}</div>
                        {r.center_location && (
                          <div className="text-[10px] text-slate-400">{r.center_location}</div>
                        )}
                      </td>

                      {/* In Time */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-mono font-bold text-emerald-700">
                            {formatIstTimeDisplay(r.on_duty_in_time)}
                          </span>
                          {r.on_duty_in_image ? (
                            <button
                              type="button"
                              onClick={() => onInspectImage({
                                url: formatPhotoUrl(r.on_duty_in_image),
                                title: `Shift In (Uncropped Environment) - ${r.name_of_technician} (${r.attendance_date})`
                              })}
                              className="group relative h-9 w-12 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-emerald-500 transition cursor-pointer"
                              title="Click to inspect full uncropped surroundings"
                            >
                              <img
                                src={formatPhotoUrl(r.on_duty_in_image)}
                                alt="Shift In"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Eye className="h-3.5 w-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">No Photo</span>
                          )}
                        </div>
                      </td>

                      {/* Break Out */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-mono font-bold text-amber-700">
                            {formatIstTimeDisplay(r.intermidiate_off_out_time)}
                          </span>
                          {r.intermidiate_off_out_image ? (
                            <button
                              type="button"
                              onClick={() => onInspectImage({
                                url: formatPhotoUrl(r.intermidiate_off_out_image),
                                title: `Break Out (Uncropped Environment) - ${r.name_of_technician} (${r.attendance_date})`
                              })}
                              className="group relative h-9 w-12 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-amber-500 transition cursor-pointer"
                              title="Click to inspect full uncropped surroundings"
                            >
                              <img
                                src={formatPhotoUrl(r.intermidiate_off_out_image)}
                                alt="Break Out"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Eye className="h-3.5 w-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">—</span>
                          )}
                        </div>
                      </td>

                      {/* Break In */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-mono font-bold text-blue-700">
                            {formatIstTimeDisplay(r.intermidiate_off_in_time)}
                          </span>
                          {r.intermidiate_off_in_image ? (
                            <button
                              type="button"
                              onClick={() => onInspectImage({
                                url: formatPhotoUrl(r.intermidiate_off_in_image),
                                title: `Break In (Uncropped Environment) - ${r.name_of_technician} (${r.attendance_date})`
                              })}
                              className="group relative h-9 w-12 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-blue-500 transition cursor-pointer"
                              title="Click to inspect full uncropped surroundings"
                            >
                              <img
                                src={formatPhotoUrl(r.intermidiate_off_in_image)}
                                alt="Break In"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Eye className="h-3.5 w-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">—</span>
                          )}
                        </div>
                      </td>

                      {/* Out Time */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-mono font-bold text-purple-700">
                            {formatIstTimeDisplay(r.on_duty_out_time)}
                          </span>
                          {r.on_duty_out_image ? (
                            <button
                              type="button"
                              onClick={() => onInspectImage({
                                url: formatPhotoUrl(r.on_duty_out_image),
                                title: `Shift Out (Uncropped Environment) - ${r.name_of_technician} (${r.attendance_date})`
                              })}
                              className="group relative h-9 w-12 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-purple-500 transition cursor-pointer"
                              title="Click to inspect full uncropped surroundings"
                            >
                              <img
                                src={formatPhotoUrl(r.on_duty_out_image)}
                                alt="Shift Out"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Eye className="h-3.5 w-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">—</span>
                          )}
                        </div>
                      </td>

                      {/* Gross Hours */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                        {Number(r.total_working_hrs || 0).toFixed(2)}
                      </td>

                      {/* Break Hours */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                        {Number(r.total_break_hrs || 0).toFixed(2)}
                      </td>

                      {/* Effective Hours */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`inline-block font-mono font-black px-2 py-0.5 rounded-lg text-xs ${
                            isFullShift
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {effective.toFixed(2)} hrs
                        </span>
                      </td>

                      {/* Ground Truth Initial Check-In */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        {formatIstTimeDisplay(r.all_innitial_time || r.on_duty_in_time)}
                      </td>

                      {/* Audit Trail */}
                      <td className="py-3 px-4 whitespace-nowrap text-[10px] text-slate-500">
                        <div className="font-medium text-slate-700">{r.last_edited_by || r.emp_code_of_thetechnician}</div>
                        <div className="font-mono text-slate-400">
                          {r.last_edit_timestamp ? formatIstTimeDisplay(r.last_edit_timestamp) : 'Original'}
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
  );
};
