import React, { useState } from 'react';
import {
  Clock,
  Coffee,
  CheckCircle,
  Eye,
  Maximize2,
  RotateCw,
  X,
  Award,
  Sparkles,
  ShieldCheck,
  Building
} from 'lucide-react';
import {
  formatIstTimeDisplay,
  formatIstFullDisplay
} from '../../lib/ist-time.ts';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../../utils/photoUtils.ts';

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
  employee,
  onInspectImage
}) => {
  const [internalInspect, setInternalInspect] = useState<{ url: string; title: string; time?: string } | null>(null);
  const [inspectRotation, setInspectRotation] = useState(0);

  if (!attendance) {
    return (
      <div className="rounded-3xl border border-sky-100 bg-white/70 p-8 text-center backdrop-blur-xl shadow-md">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-2xl">
          ⏳
        </div>
        <h4 className="text-base font-bold text-slate-800">No Attendance Recorded for Today Yet</h4>
        <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
          Please position your face within the red oval guide above and click &quot;Mark On Duty In&quot; to begin your shift.
        </p>
      </div>
    );
  }

  const handlePhotoClick = (url: string | null | undefined, title: string, time?: string) => {
    if (!url) return;
    const resolvedUrl = formatPhotoUrl(url);
    if (onInspectImage) {
      onInspectImage({ url: resolvedUrl, title: `${title} - ${time || ''}` });
    } else {
      setInspectRotation(0);
      setInternalInspect({ url: resolvedUrl, title, time });
    }
  };

  const workingHrs = Number(attendance.total_working_hrs ?? 0).toFixed(2);
  const breakHrs = Number(attendance.total_break_hrs ?? 0).toFixed(2);
  const effectiveHrs = Number(attendance.effective_working_hrs ?? 0).toFixed(2);

  const checkpoints = [
    {
      key: 'on_duty_in',
      title: 'Morning Shift In',
      subtitle: 'On Duty In',
      time: attendance.on_duty_in_time,
      image: attendance.on_duty_in_image,
      icon: '☀️',
      color: 'border-emerald-200 bg-emerald-50/50 text-emerald-800'
    },
    {
      key: 'intermidiate_off_out',
      title: 'Break Departure',
      subtitle: 'Break Out',
      time: attendance.intermidiate_off_out_time,
      image: attendance.intermidiate_off_out_image,
      icon: '☕',
      color: 'border-amber-200 bg-amber-50/50 text-amber-800'
    },
    {
      key: 'intermidiate_off_in',
      title: 'Break Return',
      subtitle: 'Break In',
      time: attendance.intermidiate_off_in_time,
      image: attendance.intermidiate_off_in_image,
      icon: '💼',
      color: 'border-blue-200 bg-blue-50/50 text-blue-800'
    },
    {
      key: 'on_duty_out',
      title: 'Shift Check-Out',
      subtitle: 'On Duty Out',
      time: attendance.on_duty_out_time,
      image: attendance.on_duty_out_image,
      icon: '🏁',
      color: 'border-purple-200 bg-purple-50/50 text-purple-800'
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

      {/* 4 Photo Checkpoint Thumbnails Grid with Click to Enlarge */}
      <div className="rounded-3xl border border-sky-100/90 bg-white/80 p-6 md:p-8 shadow-xl backdrop-blur-2xl">
        <div className="mb-5 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-900">
              Shift Verification Gallery
            </h3>
            <p className="text-xs text-slate-500">
              High-resolution face capture logs for each daily checkpoint. Click any photo to zoom.
            </p>
          </div>
          {attendance.attendance_date && (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs font-bold text-slate-700">
              📅 {attendance.attendance_date}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {checkpoints.map((cp) => {
            const hasPhoto = !!cp.image;
            const photoUrl = hasPhoto ? formatPhotoUrl(cp.image) : FALLBACK_IMAGE_SVG;
            const timeDisplay = formatIstTimeDisplay(cp.time);

            return (
              <div
                key={cp.key}
                onClick={() => hasPhoto && handlePhotoClick(cp.image, cp.title, timeDisplay)}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all ${
                  hasPhoto
                    ? 'cursor-pointer hover:border-sky-400 hover:shadow-lg hover:-translate-y-0.5'
                    : 'border-slate-200 bg-slate-50/60 opacity-60'
                }`}
              >
                {/* Image Container */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-900">
                  <img
                    src={photoUrl}
                    alt={cp.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG;
                    }}
                  />

                  {/* Zoom Overlay Icon */}
                  {hasPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-xs transition duration-200 group-hover:opacity-100">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
                        <Maximize2 className="h-4 w-4" />
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                    <span>{cp.icon}</span>
                    <span>{cp.subtitle}</span>
                  </div>
                </div>

                {/* Card Info Footer */}
                <div className="p-3 bg-white border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-800 truncate">{cp.title}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-xs font-extrabold text-sky-700">{timeDisplay}</span>
                    {hasPhoto ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Pending</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Audit & Ground Truth Summary Ribbon */}
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs text-slate-600 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-700">Initial Check-In:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">
                {attendance.all_innitial_time ? formatIstFullDisplay(attendance.all_innitial_time) : formatIstTimeDisplay(attendance.on_duty_in_time)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-indigo-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-700">Center:</span>{' '}
              <span className="font-semibold text-slate-900">
                {attendance.center_name || employee?.center_name || 'Premji Operations Hub'}
              </span>
              {(attendance.center_location || employee?.center_location) && (
                <span className="text-slate-400"> ({attendance.center_location || employee?.center_location})</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-700">Last Audit:</span>{' '}
              <span className="font-mono text-slate-800">
                {attendance.last_edit_timestamp ? formatIstFullDisplay(attendance.last_edit_timestamp) : 'Original Punch'}
              </span>
              {attendance.last_edited_by && (
                <span className="text-slate-400 font-mono"> · {attendance.last_edited_by}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Internal High-Resolution Modal if onInspectImage not provided */}
      {internalInspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-4 text-white">
              <div>
                <h4 className="text-sm font-bold">{internalInspect.title}</h4>
                {internalInspect.time && (
                  <p className="text-[11px] text-slate-400 font-mono">IST Timestamp: {internalInspect.time}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectRotation((r) => (r + 90) % 360)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                  title="Rotate Image 90°"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setInternalInspect(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-[360px] items-center justify-center p-6 bg-black">
              <img
                src={internalInspect.url}
                alt={internalInspect.title}
                style={{ transform: `rotate(${inspectRotation}deg)` }}
                className="max-h-[70vh] max-w-full rounded-xl object-contain transition-transform duration-200"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
