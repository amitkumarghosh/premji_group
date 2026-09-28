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
  RotateCw,
  X,
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  formatIstTimeDisplay,
  formatIstFullDisplay,
  getIstDateString
} from '../../../lib/ist-time.ts';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../../../utils/photoUtils.ts';

export default function AdminAttendancePage() {
  const today = getIstDateString();
  const thirtyDaysAgo = getIstDateString(new Date(Date.now() - 30 * 86400000));

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [centerCode, setCenterCode] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total_records: 0,
    sum_total_working_hrs: 0,
    sum_total_break_hrs: 0,
    sum_effective_working_hrs: 0,
    avg_effective_working_hrs: 0,
    total_active_employees: 0,
    total_centers: 0
  });

  const [centers, setCenters] = useState<any[]>([]);

  // Photo Lightbox Modal State
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);
  const [lightboxRotation, setLightboxRotation] = useState(0);

  // Fetch centers for filter dropdown
  const loadCenters = async () => {
    try {
      const res = await fetch('/api/centers');
      if (res.ok) {
        const data = await res.json();
        setCenters(data.centers || []);
      }
    } catch {
      // Fallback
    }
  };

  // Fetch Attendance Summary and Granular Records
  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (centerCode) params.append('centerCode', centerCode);
      if (employeeCode) params.append('employeeCode', employeeCode);
      if (searchQuery) params.append('search', searchQuery);

      // Attempt Next.js 14 route first
      let res = await fetch(`/api/admin/attendance/summary?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('premji_token') || ''}`
        }
      });

      // Fallback to legacy endpoint if needed
      if (!res.ok) {
        res = await fetch(`/api/attendance/admin-report?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('premji_token') || ''}`
          }
        });
      }

      if (res.ok) {
        const data = await res.json();
        const rows = data.records || [];
        setRecords(rows);

        if (data.summary) {
          setSummary(data.summary);
        } else {
          // Client-side fallback aggregation
          const totalRecords = rows.length;
          let sumWork = 0;
          let sumBreak = 0;
          let sumEff = 0;
          const emps = new Set<string>();
          const cntrs = new Set<string>();

          rows.forEach((r: any) => {
            sumWork += Number(r.total_working_hrs || 0);
            sumBreak += Number(r.total_break_hrs || 0);
            sumEff += Number(r.effective_working_hrs || 0);
            if (r.emp_code_of_thetechnician) emps.add(r.emp_code_of_thetechnician);
            if (r.center_name) cntrs.add(r.center_name);
          });

          setSummary({
            total_records: totalRecords,
            sum_total_working_hrs: Number(sumWork.toFixed(2)),
            sum_total_break_hrs: Number(sumBreak.toFixed(2)),
            sum_effective_working_hrs: Number(sumEff.toFixed(2)),
            avg_effective_working_hrs: totalRecords > 0 ? Number((sumEff / totalRecords).toFixed(2)) : 0,
            total_active_employees: emps.size,
            total_centers: cntrs.size
          });
        }
      }
    } catch (err) {
      console.error('Error fetching admin attendance summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCenters();
    fetchReport();
  }, []);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  // Quick Preset Handlers
  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'week' | 'month') => {
    const now = new Date();
    const todayStr = getIstDateString(now);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(Date.now() - 86400000);
      const yStr = getIstDateString(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'week') {
      const w = new Date(Date.now() - 7 * 86400000);
      setStartDate(getIstDateString(w));
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const m = new Date(Date.now() - 30 * 86400000);
      setStartDate(getIstDateString(m));
      setEndDate(todayStr);
    }
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    if (records.length === 0) {
      alert('No attendance records available for export.');
      return;
    }

    const headers = [
      'Attendance Date',
      'Employee Code',
      'Employee Name',
      'Center Name',
      'Center Location',
      'On Duty In Time (IST)',
      'Break Out Time (IST)',
      'Break In Time (IST)',
      'On Duty Out Time (IST)',
      'Total Working Hrs',
      'Total Break Hrs',
      'Effective Working Hrs',
      'All Initial Time (Ground Truth)',
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
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Premji_Attendance_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openLightbox = (url: string | null | undefined, title: string, subtitle?: string) => {
    if (!url) return;
    setLightboxRotation(0);
    setLightboxImage({
      url: formatPhotoUrl(url),
      title,
      subtitle
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 space-y-8">
      {/* Top Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400 text-xl border border-sky-500/30">
              📊
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Attendance Master Portal &amp; Summary
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregated business intelligence, shift metrics, audit trails, and photographic verification.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Download CSV Report</span>
          </button>
        </div>
      </div>

      {/* High-Level Aggregated KPI Cards Banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* KPI 1: Total Records */}
        <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Records</span>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-white">
            {summary.total_records}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Across {summary.total_active_employees || 0} Technicians
          </div>
        </div>

        {/* KPI 2: Gross Working Hours */}
        <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Gross Hours</span>
            <Clock className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-sky-400">
            {Number(summary.sum_total_working_hrs || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            SUM(total_working_hrs)
          </div>
        </div>

        {/* KPI 3: Total Break Hours */}
        <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-amber-400/80 text-xs font-bold uppercase tracking-wider">
            <span>Break Duration</span>
            <Coffee className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-amber-400">
            {Number(summary.sum_total_break_hrs || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            SUM(total_break_hrs)
          </div>
        </div>

        {/* KPI 4: Net Effective Productive Hours (Primary KPI) */}
        <div className="rounded-2xl border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-950/40 to-slate-900 p-4 backdrop-blur-xl shadow-lg shadow-emerald-900/20 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <span>Effective Hours</span>
            <Award className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 font-mono text-3xl font-black text-emerald-300">
            {Number(summary.sum_effective_working_hrs || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-emerald-400/80 font-medium mt-1">
            Net Productive Time
          </div>
        </div>

        {/* KPI 5: Avg Effective Hours / Record */}
        <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Avg Daily Shift</span>
            <Clock className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-purple-300">
            {Number(summary.avg_effective_working_hrs || 0).toFixed(2)} <span className="text-xs text-slate-400 font-sans">HRS</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            AVG(effective_working_hrs)
          </div>
        </div>
      </div>

      {/* Date Range & Granular Filter Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-5 backdrop-blur-xl">
        <form onSubmit={handleApplyFilters} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-sky-400" />
              Report Range &amp; Filters
            </span>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-500 mr-1">Quick:</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('today')}
                className="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('yesterday')}
                className="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('week')}
                className="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('month')}
                className="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
              >
                Last 30 Days
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Branch / Center
              </label>
              <select
                value={centerCode}
                onChange={(e) => setCenterCode(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
              >
                <option value="">All Operating Centers</option>
                {centers.map((c) => (
                  <option key={c.center_code} value={c.center_code}>
                    {c.center_name} ({c.center_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Search Code / Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. TECH01 or Suresh"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-sky-500 transition cursor-pointer"
              >
                Apply Search
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Granular Records Tabular Grid */}
      <div className="rounded-2xl border border-slate-800 bg-slate-800/40 overflow-hidden backdrop-blur-xl shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Employee</th>
                <th className="px-4 py-3.5">Center</th>
                <th className="px-4 py-3.5 text-center">In Time</th>
                <th className="px-4 py-3.5 text-center">Break Out</th>
                <th className="px-4 py-3.5 text-center">Break In</th>
                <th className="px-4 py-3.5 text-center">Out Time</th>
                <th className="px-4 py-3.5 text-right">Gross (h)</th>
                <th className="px-4 py-3.5 text-right">Break (h)</th>
                <th className="px-4 py-3.5 text-right">Effective (h)</th>
                <th className="px-4 py-3.5">Initial In</th>
                <th className="px-4 py-3.5">Audit Trail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-sky-400 mb-2" />
                    <span>Loading attendance records and computing shift metrics...</span>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
                    <AlertCircle className="mx-auto h-8 w-8 text-slate-500 mb-2" />
                    <p className="font-semibold">No attendance records found</p>
                    <p className="text-[11px] text-slate-500 mt-1">Try widening your date range or adjusting search filters.</p>
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => {
                  const effective = Number(r.effective_working_hrs || 0);
                  const isFullShift = effective >= 8.0;

                  return (
                    <tr key={r.id || `${r.emp_code_of_thetechnician}_${r.attendance_date}_${idx}`} className="hover:bg-slate-800/60 transition">
                      {/* Attendance Date */}
                      <td className="px-4 py-3 font-mono font-bold text-white whitespace-nowrap">
                        {r.attendance_date}
                      </td>

                      {/* Employee */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-white">{r.name_of_technician}</div>
                        <div className="font-mono text-[10px] text-sky-400">{r.emp_code_of_thetechnician}</div>
                      </td>

                      {/* Center & Location */}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                        <div>{r.center_name || 'Main Center'}</div>
                        {r.center_location && (
                          <div className="text-[10px] text-slate-500">{r.center_location}</div>
                        )}
                      </td>

                      {/* Checkpoint 1: In Time */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="font-mono text-emerald-400 font-bold">
                          {formatIstTimeDisplay(r.on_duty_in_time)}
                        </div>
                        {r.on_duty_in_image && (
                          <button
                            type="button"
                            onClick={() => openLightbox(r.on_duty_in_image, 'Morning Shift In', `${r.name_of_technician} (${r.emp_code_of_thetechnician}) - ${r.attendance_date}`)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-sky-400 cursor-pointer"
                          >
                            <Eye className="h-3 w-3" /> Photo
                          </button>
                        )}
                      </td>

                      {/* Checkpoint 2: Break Out */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="font-mono text-amber-400 font-bold">
                          {formatIstTimeDisplay(r.intermidiate_off_out_time)}
                        </div>
                        {r.intermidiate_off_out_image && (
                          <button
                            type="button"
                            onClick={() => openLightbox(r.intermidiate_off_out_image, 'Break Departure', `${r.name_of_technician} - ${r.attendance_date}`)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-amber-400 cursor-pointer"
                          >
                            <Eye className="h-3 w-3" /> Photo
                          </button>
                        )}
                      </td>

                      {/* Checkpoint 3: Break In */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="font-mono text-blue-400 font-bold">
                          {formatIstTimeDisplay(r.intermidiate_off_in_time)}
                        </div>
                        {r.intermidiate_off_in_image && (
                          <button
                            type="button"
                            onClick={() => openLightbox(r.intermidiate_off_in_image, 'Break Return', `${r.name_of_technician} - ${r.attendance_date}`)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-400 cursor-pointer"
                          >
                            <Eye className="h-3 w-3" /> Photo
                          </button>
                        )}
                      </td>

                      {/* Checkpoint 4: Out Time */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="font-mono text-purple-400 font-bold">
                          {formatIstTimeDisplay(r.on_duty_out_time)}
                        </div>
                        {r.on_duty_out_image && (
                          <button
                            type="button"
                            onClick={() => openLightbox(r.on_duty_out_image, 'Shift Check-Out', `${r.name_of_technician} - ${r.attendance_date}`)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-purple-400 cursor-pointer"
                          >
                            <Eye className="h-3 w-3" /> Photo
                          </button>
                        )}
                      </td>

                      {/* Gross Hours */}
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-300 whitespace-nowrap">
                        {Number(r.total_working_hrs || 0).toFixed(2)}
                      </td>

                      {/* Break Hours */}
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-400/90 whitespace-nowrap">
                        {Number(r.total_break_hrs || 0).toFixed(2)}
                      </td>

                      {/* Effective Hours (Primary KPI) */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span
                          className={`inline-block font-mono font-black px-2 py-0.5 rounded-lg text-xs ${
                            isFullShift
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {effective.toFixed(2)} hrs
                        </span>
                      </td>

                      {/* Ground Truth Initial Check-in */}
                      <td className="px-4 py-3 whitespace-nowrap text-[11px] font-mono text-slate-400">
                        {formatIstTimeDisplay(r.all_innitial_time || r.on_duty_in_time)}
                      </td>

                      {/* Audit Trail */}
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-slate-400">
                        <div>{r.last_edited_by || r.emp_code_of_thetechnician}</div>
                        <div className="font-mono text-slate-500">
                          {r.last_edit_timestamp ? formatIstTimeDisplay(r.last_edit_timestamp) : '—'}
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

      {/* Photo Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-4 text-white">
              <div>
                <h4 className="text-sm font-bold">{lightboxImage.title}</h4>
                {lightboxImage.subtitle && (
                  <p className="text-[11px] text-slate-400">{lightboxImage.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLightboxRotation((r) => (r + 90) % 360)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                  title="Rotate 90°"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-[380px] items-center justify-center p-6 bg-black">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                style={{ transform: `rotate(${lightboxRotation}deg)` }}
                className="max-h-[70vh] max-w-full rounded-xl object-contain transition-transform duration-200"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
