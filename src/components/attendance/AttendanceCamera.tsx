import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, RotateCw, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { formatIstTimeDisplay, getIstTimeString, getIstDateString } from '../../lib/ist-time.ts';

export type AttendanceCheckpoint =
  | 'on_duty_in'
  | 'intermidiate_off_out'
  | 'intermidiate_off_in'
  | 'on_duty_out';

interface AttendanceCameraProps {
  user: {
    employee_code: string;
    employee_name: string;
    user_role?: string;
    center_name?: string | null;
  };
  todayAttendance: any | null;
  targetEmployee?: any | null;
  onPunchSuccess: (result: any) => void;
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const AttendanceCamera: React.FC<AttendanceCameraProps> = ({
  user,
  todayAttendance,
  targetEmployee,
  onPunchSuccess,
  onNotification
}) => {
  const activeEmp = targetEmployee || user;

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  // Live IST Clock
  const [istClock, setIstClock] = useState('');
  const [istDateStr, setIstDateStr] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstClock(getIstTimeString(now, '12h'));
      setIstDateStr(now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Determine active checkpoint according to business rules
  const getNextCheckpoint = (): AttendanceCheckpoint => {
    if (!todayAttendance || !todayAttendance.on_duty_in_time) {
      return 'on_duty_in';
    }
    if (!todayAttendance.intermidiate_off_out_time) {
      return 'intermidiate_off_out';
    }
    if (!todayAttendance.intermidiate_off_in_time) {
      return 'intermidiate_off_in';
    }
    // Endless re-punching: if on_duty_out was already punched, continue offering on_duty_out
    return 'on_duty_out';
  };

  const currentCheckpoint = getNextCheckpoint();
  const isRePunch = !!(
    todayAttendance?.on_duty_out_time &&
    currentCheckpoint === 'on_duty_out'
  );

  // Get dynamic button label
  const getButtonLabel = (): string => {
    switch (currentCheckpoint) {
      case 'on_duty_in':
        return '☀️ Mark On Duty In (Morning Check-In)';
      case 'intermidiate_off_out':
        return '☕ Mark Break Out (Take Break)';
      case 'intermidiate_off_in':
        return '💼 Mark Break In (Return to Work)';
      case 'on_duty_out':
        if (isRePunch) {
          const lastTime = formatIstTimeDisplay(todayAttendance.on_duty_out_time);
          return `🔄 Update On Duty Out (Last recorded: ${lastTime})`;
        }
        return '🏁 Mark On Duty Out (Shift End)';
    }
  };

  // Start Camera Stream
  const initCamera = async () => {
    setCameraError(null);
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false
        });
      }

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Camera initialization failure:', err);
      let msg = 'Could not access camera. Please allow camera permissions in your browser.';
      if (err.name === 'NotAllowedError') {
        msg = 'Camera permission was denied. Please grant permission in your browser address bar.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No camera found on this device.';
      }
      setCameraError(msg);
    }
  };

  useEffect(() => {
    initCamera();
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode]);

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Client-side image compression to 640x480 JPEG (quality 0.65) prior to upload
  const captureAndCompressImage = (): string | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;

    // Create 640x480 compression canvas
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Mirror user facing camera
    if (facingMode === 'user') {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Render IST verification stamp on the lower area
    const timeNow = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: true,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, canvas.height - 38, 380, 28);
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`● PREMJI IST: ${timeNow}`, 20, canvas.height - 20);

    // Client-side JPEG compression at 0.65 quality
    return canvas.toDataURL('image/jpeg', 0.65);
  };

  // Execute Punch Action
  const handleExecutePunch = async () => {
    if (capturing) return;

    try {
      setCapturing(true);

      // Trigger flash effect
      setFlashActive(true);
      setTimeout(() => setFlashActive(false), 220);

      const base64Image = captureAndCompressImage();
      if (!base64Image) {
        onNotification('Could not capture photo. Please check camera feed.', 'error');
        setCapturing(false);
        return;
      }

      const payload: any = {
        checkpoint: currentCheckpoint,
        image: base64Image
      };

      if (targetEmployee) {
        payload.target_employee_code = targetEmployee.employee_code;
      }

      // Try Next.js route /api/attendance/punch
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('premji_token') || ''}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onNotification(data.message || 'Attendance checkpoint verified & recorded!', 'success');
        onPunchSuccess(data);
      } else {
        // Fallback to legacy endpoint if required
        const fallbackRes = await fetch('/api/attendance/mark', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('premji_token') || ''}`
          },
          body: JSON.stringify(payload)
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackRes.ok && fallbackData.success) {
          onNotification(fallbackData.message || 'Attendance checkpoint recorded!', 'success');
          onPunchSuccess(fallbackData);
        } else {
          onNotification(data.error || fallbackData.error || 'Failed to record attendance', 'error');
        }
      }
    } catch (err: any) {
      console.error('Punch execution error:', err);
      onNotification('Network or server error submitting attendance checkpoint.', 'error');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/80 p-6 md:p-8 shadow-xl backdrop-blur-2xl transition-all">
      {/* Top Header Card */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-lg shadow-inner">
              📸
            </span>
            <div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Attendance Checkpoint Verification
              </h3>
              <p className="text-xs font-medium text-slate-500">
                Employee: <span className="font-bold text-slate-800">{activeEmp.employee_name}</span> ({activeEmp.employee_code})
              </p>
            </div>
          </div>
        </div>

        {/* Live IST Badge */}
        <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-2 text-right shadow-xs">
          <Clock className="h-5 w-5 animate-pulse text-sky-600" />
          <div>
            <div className="font-mono text-base font-black tracking-tight text-sky-700">
              {istClock} <span className="text-[10px] uppercase font-sans font-bold text-sky-500">IST</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500">{istDateStr}</div>
          </div>
        </div>
      </div>

      {/* Face Guidance Instruction Badge */}
      <div className="mb-4 flex items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-xs font-bold text-rose-700 shadow-xs animate-pulse">
          📸 Please keep your full face inside the red oval
        </div>
      </div>

      {/* Camera Video Viewport with Red Oval Face Guide */}
      <div className="relative mx-auto max-w-[480px]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-950 shadow-2xl flex items-center justify-center">
          {/* Flash Effect Overlay */}
          {flashActive && (
            <div className="absolute inset-0 z-40 bg-white transition-opacity duration-200" />
          )}

          {cameraError ? (
            <div className="p-6 text-center text-white space-y-3">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="text-xs text-slate-300 max-w-xs">{cameraError}</p>
              <button
                type="button"
                onClick={initCamera}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Camera
              </button>
            </div>
          ) : (
            <>
              {/* Live Video Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${
                  facingMode === 'user' ? 'scale-x-[-1]' : ''
                }`}
              />

              {/* Exact Red Oval Face Guide Specification:
                  clip-path: ellipse(36% 50% at 50% 46%) with border: 3px solid #ff4d4d */}
              <div
                className="absolute inset-0 pointer-events-none flex items-center justify-center"
                style={{
                  clipPath: 'ellipse(36% 50% at 50% 46%)'
                }}
              >
                {/* Visual border wrapper conforming to ellipse */}
              </div>

              {/* Responsive Visual Oval Overlay with exact 3px solid #ff4d4d border */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <ellipse
                    cx="50"
                    cy="46"
                    rx="36"
                    ry="50"
                    fill="none"
                    stroke="#ff4d4d"
                    strokeWidth="1.2"
                    strokeDasharray="none"
                    className="drop-shadow-[0_0_8px_rgba(255,77,77,0.7)]"
                  />
                  {/* Subtle target crosshairs on oval perimeter for alignment */}
                  <line x1="50" y1="2" x2="50" y2="7" stroke="#ff4d4d" strokeWidth="1" />
                  <line x1="50" y1="85" x2="50" y2="90" stroke="#ff4d4d" strokeWidth="1" />
                  <line x1="16" y1="46" x2="21" y2="46" stroke="#ff4d4d" strokeWidth="1" />
                  <line x1="79" y1="46" x2="84" y2="46" stroke="#ff4d4d" strokeWidth="1" />
                </svg>
              </div>

              {/* Camera Controls Overlay (Flip button) */}
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="absolute top-3 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80 transition cursor-pointer"
                title="Flip Camera (Front/Rear)"
                aria-label="Flip Camera (Front/Rear)"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              {/* Live Status Watermark */}
              <div className="absolute bottom-3 left-3 z-30 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] font-mono font-bold text-white/90 backdrop-blur-md flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Camera Ready · 640x480</span>
              </div>
            </>
          )}
        </div>

        {/* Dynamic Punch Action Button */}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={capturing || !!cameraError}
            onClick={handleExecutePunch}
            className={`w-full py-4 px-6 rounded-2xl font-black text-sm tracking-wide shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isRePunch
                ? 'bg-gradient-to-r from-amber-500 via-orange-600 to-amber-600 text-white shadow-orange-500/25 hover:from-amber-600 hover:to-orange-700 active:scale-[0.99]'
                : currentCheckpoint === 'on_duty_in'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/25 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99]'
                : currentCheckpoint === 'on_duty_out'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-500/25 hover:from-indigo-700 hover:to-purple-700 active:scale-[0.99]'
                : 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-sky-500/25 hover:from-sky-700 hover:to-blue-700 active:scale-[0.99]'
            }`}
          >
            {capturing ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Verifying & Recording Checkpoint...</span>
              </>
            ) : (
              <>
                <Camera className="h-5 w-5" />
                <span>{getButtonLabel()}</span>
              </>
            )}
          </button>

          {isRePunch && (
            <p className="text-center text-[11px] font-medium text-amber-700 bg-amber-50/80 rounded-xl py-1.5 px-3 border border-amber-200/60">
              💡 Re-punching will update your checkout timestamp & photo, recalculating gross and net working hours automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
