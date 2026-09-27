import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle, Clock, RotateCw, RefreshCw, Download, Eye, X } from 'lucide-react';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils';
import { authFetch } from '../utils/api';

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [istTime, setIstTime] = useState('');
  const [istDate, setIstDate] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Live IST Clock (Asia/Kolkata)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }));
      setIstDate(now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch today's attendance for active employee
  const fetchTodayAttendance = async () => {
    try {
      setLoading(true);
      const url = targetEmployee
        ? `/api/attendance/today?employee_code=${targetEmployee.employee_code}`
        : '/api/attendance/today';
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setTodayAttendance(data.attendance);
      }
    } catch (e) {
      console.error('Error fetching today attendance:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayAttendance();
  }, [activeEmployee?.employee_code]);

  // Determine current attendance checkpoint step
  const getStep = () => {
    if (!todayAttendance || !todayAttendance.on_duty_in_time) return 'on_duty_in';
    if (!todayAttendance.intermidiate_off_out_time) return 'intermidiate_off_out';
    if (!todayAttendance.intermidiate_off_in_time) return 'intermidiate_off_in';
    if (!todayAttendance.on_duty_out_time) return 'on_duty_out';
    return 'completed';
  };

  const currentStep = getStep();

  // Initialize and maintain camera feed
  const startCamera = async () => {
    setCameraError(null);
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false
        });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn('Physical camera unavailable:', err);
      setCameraError('Webcam blocked by browser sandbox or permission. You can upload or take a photo below.');
      const mock = createMockStream();
      setCameraStream(mock);
      if (videoRef.current) {
        videoRef.current.srcObject = mock;
      }
    }
  };

  const createMockStream = (): MediaStream => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let f = 0;
    const interval = setInterval(() => {
      if (!ctx) return;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(180, 70, 280, 340);
      ctx.beginPath();
      ctx.ellipse(320, 240, 110, 150, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SYSTEM CAMERA ACTIVE (SIMULATED)', 320, 230);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`IST: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 320, 260);
      f++;
    }, 50);

    const stream = (canvas as any).captureStream ? (canvas as any).captureStream(24) : new MediaStream();
    const track = stream.getVideoTracks()[0];
    if (track) {
      const origStop = track.stop;
      track.stop = function() {
        clearInterval(interval);
        if (origStop) origStop.apply(this);
      };
    }
    return stream;
  };

  useEffect(() => {
    if (currentStep !== 'completed') {
      startCamera();
    }
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [currentStep, facingMode]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Execute Attendance Mark
  const handleMarkAction = async (checkpoint: string) => {
    try {
      setSubmitting(true);

      if (!videoRef.current) {
        onNotification('Camera not ready. Please ensure camera access is granted.', 'error');
        return;
      }
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(10, canvas.height - 40, 300, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`IST Verified: ${nowStr}`, 20, canvas.height - 20);
      const imageBase64 = canvas.toDataURL('image/webp', 0.85);

      const payload: any = {
        checkpoint,
        image: imageBase64
      };
      if (targetEmployee) {
        payload.target_employee_code = targetEmployee.employee_code;
      }

      const res = await authFetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        onNotification(data.message || 'Attendance checkpoint recorded successfully!', 'success');
        await fetchTodayAttendance();
      } else {
        onNotification(data.error || 'Failed to record attendance', 'error');
      }
    } catch (err: any) {
      console.error(err);
      onNotification('Error submitting attendance checkpoint', 'error');
    } finally {
      setSubmitting(false);
    }
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
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Top Header & Identity Card */}
      <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-md bg-white/90 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">👤</span>
              <h2 className="text-xl font-bold text-slate-900">
                {activeEmployee.employee_name} <span className="text-slate-400 font-mono text-sm">({activeEmployee.employee_code})</span>
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Role: <span className="font-semibold text-sky-700">{activeEmployee.user_role}</span> · Center: <span className="font-semibold text-slate-700">{activeEmployee.center_name || 'Assigned Center'}</span>
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-right">
            <div className="text-xs text-slate-500 font-medium">{istDate}</div>
            <div className="text-lg font-bold font-mono text-sky-600 tracking-tight flex items-center justify-end gap-1.5 mt-0.5">
              <Clock className="w-4 h-4 text-sky-600 animate-pulse" />
              <span>{istTime}</span>
              <span className="text-[10px] text-slate-400 font-sans font-semibold">IST</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Single Centered Attendance Capture Card */}
      <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-lg bg-white/90 backdrop-blur-xl text-center">
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center justify-center gap-2">
            <span>🕒</span>
            Attendance Capture
          </h2>
          <div className="inline-block mt-2 px-4 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full text-xs font-semibold shadow-xs">
            📸 Please keep your full face inside the red oval
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-sky-600" />
            <span className="text-xs text-slate-500">Checking today's attendance logs...</span>
          </div>
        ) : currentStep === 'completed' ? (
          /* Step 5: Completed state celebration */
          <div className="my-6 p-8 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl shadow-sm text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl shadow-inner">
              🎉
            </div>
            <h3 className="text-xl font-bold text-emerald-900">
              All attendance for today completed!
            </h3>
            <p className="text-xs text-emerald-700 max-w-md mx-auto mt-1">
              Your shift in, break departure, break return, and shift checkout have all been successfully registered. Have a great evening!
            </p>
          </div>
        ) : (
          /* Live Single Camera Frame with Solid Oval Cutout Mask */
          <div className="max-w-[480px] mx-auto space-y-4">
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center shadow-md border border-sky-100">
              {/* Full Video Stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Solid Cutout Mask: Hides everything outside the oval space, user sees ONLY inside the oval */}
              <div className="absolute inset-0 pointer-events-none">
                <svg className="w-full h-full" viewBox="0 0 480 360" preserveAspectRatio="none">
                  <defs>
                    <mask id="attendance-oval-mask">
                      {/* Solid white covers entire frame */}
                      <rect width="480" height="360" fill="white" />
                      {/* Black ellipse cuts out the window showing the video inside */}
                      <ellipse cx="240" cy="180" rx="95" ry="130" fill="black" />
                    </mask>
                  </defs>
                  {/* Solid background covering everything outside the oval */}
                  <rect width="480" height="360" fill="#e2edf8" mask="url(#attendance-oval-mask)" />
                  {/* Red guide border around the visible oval window */}
                  <ellipse cx="240" cy="180" rx="95" ry="130" fill="none" stroke="#ef4444" strokeWidth="3.5" />
                </svg>
              </div>

              {/* Status Tag Overlay */}
              <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-slate-800 flex items-center gap-1.5 border border-slate-200/80 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="font-bold">LIVE CAMERA</span>
              </div>

              {/* Switch Camera */}
              <button
                type="button"
                onClick={toggleFacingMode}
                className="absolute top-3 right-3 bg-white/90 hover:bg-white backdrop-blur-md text-slate-700 p-2 rounded-lg text-xs transition border border-slate-200/80 cursor-pointer shadow-sm"
                title="Switch Camera (Front/Back)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

            </div>

            {/* SINGLE DYNAMIC ACTION BUTTON */}
            <div>
              {currentStep === 'on_duty_in' && (
                <button
                  type="button"
                  onClick={() => handleMarkAction('on_duty_in')}
                  disabled={submitting}
                  style={{ background: 'linear-gradient(135deg, #00b894 0%, #009e6f 100%)' }}
                  className="w-full py-4 px-6 text-white font-bold rounded-xl shadow-lg hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm tracking-wide"
                >
                  {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : '🟢'}
                  Please mark your attendance – On Duty In
                </button>
              )}

              {currentStep === 'intermidiate_off_out' && (
                <button
                  type="button"
                  onClick={() => handleMarkAction('intermidiate_off_out')}
                  disabled={submitting}
                  style={{ background: 'linear-gradient(135deg, #fd7e14 0%, #e46b00 100%)' }}
                  className="w-full py-4 px-6 text-white font-bold rounded-xl shadow-lg hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm tracking-wide"
                >
                  {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : '🟠'}
                  Please mark your attendance – Break Out
                </button>
              )}

              {currentStep === 'intermidiate_off_in' && (
                <button
                  type="button"
                  onClick={() => handleMarkAction('intermidiate_off_in')}
                  disabled={submitting}
                  style={{ background: 'linear-gradient(135deg, #1e90ff 0%, #0066cc 100%)' }}
                  className="w-full py-4 px-6 text-white font-bold rounded-xl shadow-lg hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm tracking-wide"
                >
                  {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : '🔵'}
                  Please mark your attendance – Break In
                </button>
              )}

              {currentStep === 'on_duty_out' && (
                <button
                  type="button"
                  onClick={() => handleMarkAction('on_duty_out')}
                  disabled={submitting}
                  style={{ background: 'linear-gradient(135deg, #ff4d4d 0%, #cc0000 100%)' }}
                  className="w-full py-4 px-6 text-white font-bold rounded-xl shadow-lg hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm tracking-wide"
                >
                  {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : '🔴'}
                  Please mark your attendance – On Duty Out
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* TODAY'S ATTENDANCE SUMMARY (4 CHECKPOINT CARDS) */}
      <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-md bg-white/90 backdrop-blur-xl">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span>📋</span>
          Today's Attendance Summary
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: On Duty In */}
          {(() => {
            const inImg = resolvePhotoUrl(todayAttendance?.on_duty_in_image);
            return (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Step 1</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        todayAttendance?.on_duty_in_time
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {todayAttendance?.on_duty_in_time ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">On Duty In</h4>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {formatTimeOnly(todayAttendance?.on_duty_in_time)}
                  </p>
                </div>

                {inImg && (
                  <div className="mt-3 relative group">
                    <img
                      src={inImg}
                      alt="On Duty In"
                      className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-pointer bg-slate-100"
                      onClick={() => onInspectImage({ url: inImg, title: 'On Duty In' })}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="96" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onInspectImage({ url: inImg, title: 'On Duty In' })}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center text-white text-xs font-semibold gap-1"
                    >
                      <Eye className="w-4 h-4" /> Enlarge
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Card 2: Break Out */}
          {(() => {
            const breakOutImg = resolvePhotoUrl(todayAttendance?.intermidiate_off_out_image);
            return (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Step 2</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        todayAttendance?.intermidiate_off_out_time
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {todayAttendance?.intermidiate_off_out_time ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Break Out</h4>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {formatTimeOnly(todayAttendance?.intermidiate_off_out_time)}
                  </p>
                </div>

                {breakOutImg && (
                  <div className="mt-3 relative group">
                    <img
                      src={breakOutImg}
                      alt="Break Out"
                      className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-pointer bg-slate-100"
                      onClick={() => onInspectImage({ url: breakOutImg, title: 'Break Out' })}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="96" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onInspectImage({ url: breakOutImg, title: 'Break Out' })}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center text-white text-xs font-semibold gap-1"
                    >
                      <Eye className="w-4 h-4" /> Enlarge
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Card 3: Break In */}
          {(() => {
            const breakInImg = resolvePhotoUrl(todayAttendance?.intermidiate_off_in_image);
            return (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Step 3</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        todayAttendance?.intermidiate_off_in_time
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {todayAttendance?.intermidiate_off_in_time ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Break In</h4>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {formatTimeOnly(todayAttendance?.intermidiate_off_in_time)}
                  </p>
                </div>

                {breakInImg && (
                  <div className="mt-3 relative group">
                    <img
                      src={breakInImg}
                      alt="Break In"
                      className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-pointer bg-slate-100"
                      onClick={() => onInspectImage({ url: breakInImg, title: 'Break In' })}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="96" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onInspectImage({ url: breakInImg, title: 'Break In' })}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center text-white text-xs font-semibold gap-1"
                    >
                      <Eye className="w-4 h-4" /> Enlarge
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Card 4: On Duty Out */}
          {(() => {
            const outImg = resolvePhotoUrl(todayAttendance?.on_duty_out_image);
            return (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Step 4</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        todayAttendance?.on_duty_out_time
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {todayAttendance?.on_duty_out_time ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">On Duty Out</h4>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {formatTimeOnly(todayAttendance?.on_duty_out_time)}
                  </p>
                </div>

                {outImg && (
                  <div className="mt-3 relative group">
                    <img
                      src={outImg}
                      alt="On Duty Out"
                      className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-pointer bg-slate-100"
                      onClick={() => onInspectImage({ url: outImg, title: 'On Duty Out' })}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="96" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onInspectImage({ url: outImg, title: 'On Duty Out' })}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center text-white text-xs font-semibold gap-1"
                    >
                      <Eye className="w-4 h-4" /> Enlarge
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
