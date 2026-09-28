import React from 'react';
import {
  Clock,
  Coffee,
  CheckCircle,
  Award,
  Sparkles,
  Calendar,
  Check,
  Hourglass
} from 'lucide-react';
import {
  formatIstTimeDisplay
} from '../../lib/ist-time.ts';

interface DailyAttendanceSummaryProps {
  attendance: any | null;
  employee?: {
    employee_code: string;
    employee_name: string;
    center_name?: string | null;
    center_location?: string | null;
  } | null;
  onInspectImage?: (img: { url: string; title: string }) => void;
}

export const DailyAttendanceSummary: React.FC<DailyAttendanceSummaryProps> = ({
  attendance,
  employee
}) => {
  if (!attendance) {
    return (
      <div className="rounded-3xl border border-sky-100 bg-white/70 p-8 text-center backdrop-blur-xl shadow-md">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-2xl">
          ⏳
        </div>
        <h4 className="text-base font-bold text-slate-800">No Attendance Recorded for Today Yet</h4>
        <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
          Please position your face within the camera guide above and click &quot;Mark On Duty In&quot; to begin your shift.
        </p>
      </div>
    );
  }

  const workingHrs = Number(attendance.total_working_hrs ?? 0).toFixed(2);
  const breakHrs = Number(attendance.total_break_hrs ?? 0).toFixed(2);
  const effectiveHrs = Number(attendance.effective_working_hrs ?? 0).toFixed(2);

  const checkpoints = [
    {
      key: 'on_duty_in',
      title: 'Morning Shift In',
      subtitle: 'On Duty In',
      time: attendance.on_duty_in_time,
      icon: '☀️',
      borderColor: 'border-emerald-200',
      bgColor: 'bg-emerald-50/70',
      textColor: 'text-emerald-700',
      badgeBg: 'bg-emerald-100 text-emerald-800'
    },
    {
      key: 'intermidiate_off_out',
      title: 'Break Departure',
      subtitle: 'Break Out',
      time: attendance.intermidiate_off_out_time,
      icon: '☕',
      borderColor: 'border-amber-200',
      bgColor: 'bg-amber-50/70',
      textColor: 'text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-800'
    },
    {
      key: 'intermidiate_off_in',
      title: 'Break Return',
      subtitle: 'Break In',
      time: attendance.intermidiate_off_in_time,
      icon: '💼',
      borderColor: 'border-blue-200',
      bgColor: 'bg-blue-50/70',
      textColor: 'text-blue-700',
      badgeBg: 'bg-blue-100 text-blue-800'
    },
    {
      key: 'on_duty_out',
      title: 'Shift Check-Out',
      subtitle: 'On Duty Out',
      time: attendance.on_duty_out_time,
      icon: '🏁',
      borderColor: 'border-purple-200',
      bgColor: 'bg-purple-50/70',
      textColor: 'text-purple-700',
      badgeBg: 'bg-purple-100 text-purple-800'
    }
  ];

  return (
    <div className="space-y-6">
      {/* 3 Metric KPI Cards Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* KPI 1: Gross Working Hours */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-white/90 p-5 shadow-md backdrop-blur-xl transition hover:shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Shift Hours</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black tracking-tight text-slate-900">{workingHrs}</span>
            <span className="text-xs font-semibold text-slate-400">HRS</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            From In-Time to Out-Time
          </p>
        </div>

        {/* KPI 2: Total Break Hours */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-white/90 p-5 shadow-md backdrop-blur-xl transition hover:shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Total Break Time</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Coffee className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black tracking-tight text-amber-700">{breakHrs}</span>
            <span className="text-xs font-semibold text-amber-500">HRS</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Intermediate Break Duration
          </p>
        </div>

        {/* KPI 3: Net Productive Working Hours (Primary KPI) */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-500 to-teal-700 p-5 text-white shadow-xl shadow-emerald-500/20 transition hover:shadow-2xl hover:scale-[1.01]">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Award className="h-28 w-28 text-white" />
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-100 backdrop-blur-md">
              <Sparkles className="h-3 w-3" />
              Primary KPI
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-md">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-black tracking-tight text-white">{effectiveHrs}</span>
            <span className="text-sm font-bold text-emerald-200">HRS</span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-emerald-100/90">
            Net Productive Working Hours (Gross - Break)
          </p>
        </div>
      </div>

      {/* 4 Checkpoint Status & Timestamps Grid (Time-Only Display, No Images) */}
      <div className="rounded-3xl border border-sky-100/90 bg-white/80 p-6 md:p-8 shadow-xl backdrop-blur-2xl">
        <div className="mb-5 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-900">
              Today&apos;s Checkpoint Timestamps
            </h3>
            <p className="text-xs text-slate-500">
              Verified IST timestamps for each shift checkpoint.
            </p>
          </div>
          {attendance.attendance_date && (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs font-bold text-slate-700">
              📅 {attendance.attendance_date}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {checkpoints.map((cp) => {
            const isRecorded = !!cp.time;
            const timeDisplay = formatIstTimeDisplay(cp.time);

            return (
              <div
                key={cp.key}
                className={`relative p-5 rounded-2xl border transition-all ${
                  isRecorded
                    ? `${cp.borderColor} ${cp.bgColor} shadow-sm`
                    : 'border-slate-200 bg-slate-50/60 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{cp.icon}</span>
                  {isRecorded ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <Check className="h-3 w-3" />
                      <span>Recorded</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                      <Hourglass className="h-3 w-3" />
                      <span>Pending</span>
                    </span>
                  )}
                </div>

                <div className="text-xs font-bold text-slate-800">{cp.title}</div>
                <div className="text-[10px] text-slate-500 font-medium">{cp.subtitle}</div>

                <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">IST Time</span>
                  <span className={`font-mono text-sm font-black ${isRecorded ? cp.textColor : 'text-slate-400'}`}>
                    {timeDisplay}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
