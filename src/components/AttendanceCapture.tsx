import React, { useState, useEffect } from 'react';
import { RefreshCw, History, Calendar, CheckCircle } from 'lucide-react';
import { AttendanceCamera } from './attendance/AttendanceCamera.tsx';
import { DailyAttendanceSummary } from './attendance/DailyAttendanceSummary.tsx';
import { authFetch } from '../utils/api.ts';
import { formatIstTimeDisplay, getIstDateString } from '../lib/ist-time.ts';

interface AttendanceCaptureProps {
  user: any;
  targetEmployee?: any; // If provided, marks attendance for another technician
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  onInspectImage: (img: { url: string; title: string }) => void;
}

export const AttendanceCapture: React.FC<AttendanceCaptureProps> = ({
  user,
  targetEmployee,
  onNotification,
  onInspectImage
}) => {
  const activeEmployee = targetEmployee || user;
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch today's attendance and history
  const loadData = async () => {
    try {
      setLoading(true);
      const todayUrl = targetEmployee
        ? `/api/attendance/punch?employee_code=${targetEmployee.employee_code}`
        : '/api/attendance/punch';

      const [todayRes, historyRes] = await Promise.all([
        authFetch(todayUrl),
        authFetch(`/api/attendance/history?limit=7`)
      ]);

      if (todayRes.ok) {
        const data = await todayRes.json();
        setTodayAttendance(data.attendance);
      }

      if (historyRes.ok) {
        const histData = await historyRes.json();
        setHistory(histData.history || []);
      }
    } catch (e) {
      console.error('Error fetching attendance data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeEmployee?.employee_code]);

  const handlePunchSuccess = (result: any) => {
    if (result.attendance) {
      setTodayAttendance(result.attendance);
    }
    loadData();
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Header & Identity Card */}
      <div className="p-6 md:p-8 rounded-3xl border border-sky-100 bg-white/90 shadow-md backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-2xl shadow-inner">
                👤
              </span>
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {activeEmployee.employee_name}{' '}
                  <span className="text-slate-400 font-mono text-sm">
                    ({activeEmployee.employee_code})
                  </span>
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Designation:{' '}
                  <span className="font-bold text-sky-700">{activeEmployee.user_role}</span> ·
                  Center:{' '}
                  <span className="font-bold text-slate-700">
                    {activeEmployee.center_name || 'Premji Operations Hub'}
                  </span>
                  {activeEmployee.center_location && (
                    <span className="text-slate-400"> ({activeEmployee.center_location})</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Single Centered Attendance Camera Viewport with Red Oval Face Guide */}
      <AttendanceCamera
        user={user}
        targetEmployee={targetEmployee}
        todayAttendance={todayAttendance}
        onPunchSuccess={handlePunchSuccess}
        onNotification={onNotification}
      />

      {/* Real-Time Daily Attendance Summary & KPI Cards */}
      <DailyAttendanceSummary
        attendance={todayAttendance}
        employee={activeEmployee}
        onInspectImage={onInspectImage}
      />

      {/* Recent Attendance History Table */}
      <div className="p-6 md:p-8 rounded-3xl border border-sky-100 bg-white/90 shadow-md backdrop-blur-xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-sky-600" />
            <h3 className="text-base font-black text-slate-900">Recent Attendance History</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">Last 7 Shifts</span>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            No previous attendance records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-100 bg-slate-50/60 font-bold uppercase text-[11px] text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-center">In Time</th>
                  <th className="py-2.5 px-3 text-center">Break Out</th>
                  <th className="py-2.5 px-3 text-center">Break In</th>
                  <th className="py-2.5 px-3 text-center">Out Time</th>
                  <th className="py-2.5 px-3 text-right">Gross (h)</th>
                  <th className="py-2.5 px-3 text-right">Break (h)</th>
                  <th className="py-2.5 px-3 text-right">Net Effective (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h, i) => (
                  <tr key={h.id || i} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      {h.attendance_date}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-600 font-bold">
                      {formatIstTimeDisplay(h.on_duty_in_time)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-amber-600">
                      {formatIstTimeDisplay(h.intermidiate_off_out_time)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-blue-600">
                      {formatIstTimeDisplay(h.intermidiate_off_in_time)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-purple-600 font-bold">
                      {formatIstTimeDisplay(h.on_duty_out_time)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700">
                      {Number(h.total_working_hrs || 0).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-600">
                      {Number(h.total_break_hrs || 0).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                        {Number(h.effective_working_hrs || 0).toFixed(2)} hrs
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
