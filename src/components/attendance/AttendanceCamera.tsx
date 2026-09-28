import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, RotateCw, AlertTriangle, Clock, CheckCircle2, Sparkles } from 'lucide-react';
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
    // Endless re-punching: once shift completed, keep on_duty_out active
    return 'on_duty_out';
  };

  const currentCheckpoint = getNextCheckpoint();
  const isRePunch = !!(
    todayAttendance?.on_duty_out_time &&
    currentCheckpoint === 'on_duty_out'
  );

  // Dynamic button labels
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

  // Ultra-Fast Client-Side Compression Pipeline (<30ms execution)
  // Captures the FULL uncropped original camera frame (including entire background & surroundings)
  const captureAndCompressImage = (): string | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;

    // Off-screen canvas sized to 640x480 for ultra-lightweight payload (~35KB)
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw the FULL rectangular uncropped image
    if (facingMode === 'user') {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Embed IST authentication timestamp watermark
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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(8, canvas.height - 34, 390, 26);
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`● PREMJI SECURE IST: ${timeNow}`, 16, canvas.height - 17);

    // Fast JPEG compression at 0.65 quality (resulting in ~30KB–45KB payload for <300ms total pipeline)
    return canvas.toDataURL('image/jpeg', 0.65);
  };

  // Execute Attendance Punch (<300ms end-to-end turnaround)
  const handleExecutePunch = async () => {
    if (capturing) return;

    try {
      setCapturing(true);

      // Instant visual feedback: shutter flash
      setFlashActive(true);
      setTimeout(() => setFlashActive(false), 160);

      const base64Image = captureAndCompressImage();
      if (!base64Image) {
        onNotification('Could not capture camera frame. Please check camera permission.', 'error');
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

      const startTime = performance.now();

      // Submit lightweight payload via Next.js endpoint
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('premji_token') || ''}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      const duration = Math.round(performance.now() - startTime);

      if (res.ok && data.success) {
        console.log(`⚡ Instant Attendance Punch completed in ${duration}ms`);
        onNotification(data.message || 'Attendance checkpoint verified & recorded!', 'success');
        onPunchSuccess(data);
      } else {
        // Fallback to legacy endpoint if route was intercepted
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
      onNotification('Network error recording attendance checkpoint.', 'error');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/85 p-6 md:p-8 shadow-xl backdrop-blur-2xl transition-all">
      {/* Top Header Card */}
      <div className="mb-5 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-lg shadow-inner">
              📸
            </span>
            <div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">
                Attendance Checkpoint Verification
              </h3>
              <p className="text-xs font-medium text-slate-500">
                Technician:{' '}
                <span className="font-bold text-slate-800">{activeEmp.employee_name}</span> (
                <span className="font-mono text-sky-700">{activeEmp.employee_code}</span>)
              </p>
            </div>
          </div>
        </div>

        {/* Live IST Clock Badge */}
        <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-2 text-right shadow-xs">
          <Clock className="h-4 w-4 animate-pulse text-sky-600" />
          <div>
            <div className="font-mono text-base font-black tracking-tight text-sky-700">
              {istClock}{' '}
              <span className="text-[10px] uppercase font-sans font-bold text-sky-500">IST</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500">{istDateStr}</div>
          </div>
        </div>
      </div>

      {/* Face Guidance Prompt Badge */}
      <div className="mb-4 flex items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-1.5 text-xs font-bold text-rose-700 shadow-xs">
          📸 Please keep your face inside the oval shape
        </div>
      </div>

      {/* Vertical Portrait Camera Viewport with Strict Vertical Oval Mask */}
      <div className="relative mx-auto max-w-[360px]">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border-2 border-slate-200 bg-slate-950 shadow-2xl flex items-center justify-center">
          {/* Shutter Flash Effect Overlay */}
          {flashActive && (
            <div className="absolute inset-0 z-40 bg-white transition-opacity duration-150" />
          )}

          {cameraError ? (
            <div className="p-6 text-center text-white space-y-3 z-30">
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
              {/* Live Video Feed (capturing full environment in background) */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${
                  facingMode === 'user' ? 'scale-x-[-1]' : ''
                }`}
              />

              {/* Strict Portrait Oval Face Mask:
                  Shades the outer area and displays a crisp vertical portrait oval in the center */}
              <div className="absolute inset-0 pointer-events-none">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 300 400"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <mask id="portrait-oval-cutout">
                      {/* White reveals the dark vignette mask */}
                      <rect width="300" height="400" fill="white" />
                      {/* Black cuts out the clear face window */}
                      <ellipse cx="150" cy="195" rx="95" ry="155" fill="black" />
                    </mask>
                  </defs>

                  {/* Darkened semi-transparent vignette outside the oval */}
                  <rect
                    width="300"
                    height="400"
                    fill="rgba(15, 23, 42, 0.52)"
                    mask="url(#portrait-oval-cutout)"
                  />

                  {/* High-visibility Red Oval Guide Border (3px solid #ff4d4d) */}
                  <ellipse
                    cx="150"
                    cy="195"
                    rx="95"
                    ry="155"
                    fill="none"
                    stroke="#ff4d4d"
                    strokeWidth="3.2"
                    className="drop-shadow-[0_0_10px_rgba(255,77,77,0.8)]"
                  />

                  {/* Alignment target notches */}
                  <line x1="150" y1="32" x2="150" y2="48" stroke="#ff4d4d" strokeWidth="2.5" />
                  <line x1="150" y1="342" x2="150" y2="358" stroke="#ff4d4d" strokeWidth="2.5" />
                  <line x1="47" y1="195" x2="63" y2="195" stroke="#ff4d4d" strokeWidth="2.5" />
                  <line x1="237" y1="195" x2="253" y2="195" stroke="#ff4d4d" strokeWidth="2.5" />
                </svg>
              </div>

              {/* Camera Controls Overlay (Flip button) */}
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="absolute top-3.5 right-3.5 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80 transition cursor-pointer"
                title="Flip Camera (Front/Rear)"
                aria-label="Flip Camera (Front/Rear)"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              {/* Live Status Watermark */}
              <div className="absolute bottom-3 left-3 z-30 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] font-mono font-bold text-white/90 backdrop-blur-md flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Live Feed · Full Frame Ready</span>
              </div>
            </>
          )}
        </div>

        {/* Dynamic Punch Action Button */}
        <div className="mt-4 space-y-2">
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
                <span>Transmitting & Verifying Checkpoint...</span>
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
              💡 Re-punching records your updated checkout photo & timestamp, automatically updating gross and net working hours.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
