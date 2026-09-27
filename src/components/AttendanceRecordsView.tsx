import React, { useState, useEffect } from 'react';
import { Calendar, Search, Download, Eye, RefreshCw } from 'lucide-react';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils';
import { authFetch } from '../utils/api';

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
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    start_date: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    center_code: '',
    employee_code: ''
  });

  const loadRecords = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.center_code) params.append('center_code', filters.center_code);
      if (filters.employee_code) params.append('employee_code', filters.employee_code);

      const res = await authFetch(`/api/attendance/admin-report?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
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

  const handleExportCSV = () => {
    if (records.length === 0) {
      onNotification('No attendance records to export', 'error');
      return;
    }

    const headers = [
      'Date',
      'Employee Code',
      'Employee Name',
      'Center Code',
      'Center Name',
      'In Time',
      'Break Start Time',
      'Break End Time',
      'Out Time'
    ];

    const rows = records.map((r) => [
      `"${r.attendance_date || ''}"`,
      `"${r.emp_code_of_thetechnician || ''}"`,
      `"${r.name_of_technician || ''}"`,
      `"${r.center_code || ''}"`,
      `"${r.center_name || ''}"`,
      `"${r.on_duty_in_time || ''}"`,
      `"${r.intermidiate_off_out_time || ''}"`,
      `"${r.intermidiate_off_in_time || ''}"`,
      `"${r.on_duty_out_time || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_Records_${filters.start_date}_to_${filters.end_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotification('Attendance CSV report downloaded successfully!', 'success');
  };

  const formatTimeOnly = (val: any): string => {
    if (!val) return '—';
    const str = String(val);
    if (str.includes(' ')) return str.split(' ')[1];
    if (str.includes('T')) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });
      }
    }
    return str;
  };

  const resolvePhotoUrl = (imgVal: any): string => {
    return formatPhotoUrl(imgVal);
  };

  return (
    <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-lg bg-white/90 backdrop-blur-xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-sky-600" />
            Attendance Records
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Master Attendance Log with 4-point Photo Verification · Records: <span className="font-bold text-sky-600 font-mono">{records.length}</span>
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer self-start md:self-auto"
        >
          <Download className="w-4 h-4" />
          📥 Download CSV
        </button>
      </div>

      {/* Filter Matrix */}
      <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Workshop Center</label>
          <select
            value={filters.center_code}
            onChange={(e) => setFilters({ ...filters, center_code: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="">All Workshop Centers</option>
            {centers.map((c) => (
              <option key={c.center_code} value={c.center_code}>
                {c.center_name} ({c.center_code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Employee Code</label>
          <div className="relative">
            <input
              type="text"
              placeholder="e.g. TECH01"
              value={filters.employee_code}
              onChange={(e) => setFilters({ ...filters, employee_code: e.target.value })}
              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-mono"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
          >
            Apply Filters
          </button>
        </div>
      </form>

      {/* Master Table with 4 Separate Photo Columns */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
              <th className="p-3">Date</th>
              <th className="p-3">Technician</th>
              <th className="p-3">Center</th>
              <th className="p-3">In Time</th>
              <th className="p-3 text-center">In Photo</th>
              <th className="p-3">Break Start</th>
              <th className="p-3 text-center">Break Start Photo</th>
              <th className="p-3">Break End</th>
              <th className="p-3 text-center">Break End Photo</th>
              <th className="p-3">Out Time</th>
              <th className="p-3 text-center">Out Photo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={11} className="p-8 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-slate-400 italic">
                  No attendance records found for the selected dates and filters.
                </td>
              </tr>
            ) : (
              records.map((r) => {
                const inImg = resolvePhotoUrl(r.on_duty_in_image);
                const breakOutImg = resolvePhotoUrl(r.intermidiate_off_out_image);
                const breakInImg = resolvePhotoUrl(r.intermidiate_off_in_image);
                const outImg = resolvePhotoUrl(r.on_duty_out_image);

                return (
                  <tr key={r.id || `${r.emp_code_of_thetechnician}_${r.attendance_date}`} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">{r.attendance_date}</td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{r.name_of_technician}</div>
                      <div className="text-[10px] font-mono text-sky-700 font-bold">{r.emp_code_of_thetechnician}</div>
                    </td>
                    <td className="p-3 text-slate-600">{r.center_name || r.center_code || '—'}</td>

                    {/* Checkpoint 1: In */}
                    <td className="p-3 font-mono font-bold text-emerald-700">{formatTimeOnly(r.on_duty_in_time)}</td>
                    <td className="p-3 text-center">
                      {inImg ? (
                        <button
                          type="button"
                          onClick={() => onInspectImage({ url: inImg, title: `In Photo: ${r.name_of_technician} (${r.attendance_date})` })}
                          className="inline-block relative group rounded-md overflow-hidden border border-slate-200 hover:border-sky-400 transition"
                        >
                          <img
                            src={inImg}
                            alt="In"
                            className="w-10 h-10 object-cover bg-slate-100"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                            }}
                          />
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                            <Eye className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Checkpoint 2: Break Out */}
                    <td className="p-3 font-mono text-amber-700">{formatTimeOnly(r.intermidiate_off_out_time)}</td>
                    <td className="p-3 text-center">
                      {breakOutImg ? (
                        <button
                          type="button"
                          onClick={() => onInspectImage({ url: breakOutImg, title: `Break Start: ${r.name_of_technician}` })}
                          className="inline-block relative group rounded-md overflow-hidden border border-slate-200 hover:border-sky-400 transition"
                        >
                          <img
                            src={breakOutImg}
                            alt="Break Start"
                            className="w-10 h-10 object-cover bg-slate-100"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                            }}
                          />
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                            <Eye className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Checkpoint 3: Break In */}
                    <td className="p-3 font-mono text-sky-700">{formatTimeOnly(r.intermidiate_off_in_time)}</td>
                    <td className="p-3 text-center">
                      {breakInImg ? (
                        <button
                          type="button"
                          onClick={() => onInspectImage({ url: breakInImg, title: `Break End: ${r.name_of_technician}` })}
                          className="inline-block relative group rounded-md overflow-hidden border border-slate-200 hover:border-sky-400 transition"
                        >
                          <img
                            src={breakInImg}
                            alt="Break End"
                            className="w-10 h-10 object-cover bg-slate-100"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                            }}
                          />
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                            <Eye className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Checkpoint 4: Out */}
                    <td className="p-3 font-mono font-bold text-rose-700">{formatTimeOnly(r.on_duty_out_time)}</td>
                    <td className="p-3 text-center">
                      {outImg ? (
                        <button
                          type="button"
                          onClick={() => onInspectImage({ url: outImg, title: `Out Photo: ${r.name_of_technician}` })}
                          className="inline-block relative group rounded-md overflow-hidden border border-slate-200 hover:border-sky-400 transition"
                        >
                          <img
                            src={outImg}
                            alt="Out"
                            className="w-10 h-10 object-cover bg-slate-100"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                            }}
                          />
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                            <Eye className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
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
