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

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported on this browser. Please use a browser that supports webcams.');
      return;
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
      console.warn('Camera initialization notice:', err?.name || err?.message || err);
      let msg = 'Could not access camera. Please allow camera permissions in your browser address bar.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || String(err?.message || '').includes('Permission')) {
        msg = 'Camera permission was denied. Please click the lock/camera icon in your browser address bar to Allow Camera, then click "Enable Camera".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera hardware detected on this device. Please connect a webcam.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is in use by another tab or app. Please close other camera apps and retry.';
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
  // Captures the FULL uncropped original camera frame (including entire background & surroundings) for Admin inspection
  const captureAndCompressImage = (): string | null => {
    const video = videoRef.current;

    // Off-screen canvas sized to 640x480 for lightweight payload (~35KB)
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let capturedRealVideo = false;

    if (video && (video.videoWidth > 0 || video.readyState >= 1)) {
      try {
        if (facingMode === 'user') {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        capturedRealVideo = true;
      } catch (drawErr) {
        console.warn('Direct video draw error:', drawErr);
      }
    }

    if (!capturedRealVideo) {
      console.warn('Camera video frame was not ready at capture moment');
      return null;
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

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
    ctx.fillRect(8, canvas.height - 34, 400, 26);
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`● PREMJI SECURE IST: ${timeNow}`, 16, canvas.height - 17);

    // Fast JPEG compression at 0.75 quality
    return canvas.toDataURL('image/jpeg', 0.75);
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

      {/* Square Camera Viewport with Pure Mask (No oval border, outside area completely hidden) */}
      <div className="relative mx-auto max-w-[320px]">
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-slate-300 bg-slate-950 shadow-xl flex items-center justify-center">
          {/* Shutter Flash Effect Overlay */}
          {flashActive && (
            <div className="absolute inset-0 z-40 bg-white transition-opacity duration-150" />
          )}

          {cameraError ? (
            <div className="p-6 text-center text-white space-y-3 z-30">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
              <p className="text-xs text-slate-300 max-w-xs leading-relaxed">{cameraError}</p>
              <div className="flex items-center justify-center pt-1">
                <button
                  type="button"
                  onClick={initCamera}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer shadow-md"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Enable Camera</span>
                </button>
              </div>
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

              {/* Clean Oval Face Mask:
                  100% solid opaque dark overlay completely hiding everything outside of the oval.
                  Zero oval border stroke (no red line). */}
              <div className="absolute inset-0 pointer-events-none">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 300 300"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <mask id="clean-oval-window">
                      {/* White reveals the solid dark background mask */}
                      <rect width="300" height="300" fill="white" />
                      {/* Black cuts out the clear face window */}
                      <ellipse cx="150" cy="150" rx="90" ry="122" fill="black" />
                    </mask>
                  </defs>

                  {/* 100% Solid Opaque Mask - Outside images completely hidden */}
                  <rect
                    width="300"
                    height="300"
                    fill="#020617"
                    mask="url(#clean-oval-window)"
                  />
                </svg>
              </div>

              {/* Camera Controls Overlay (Flip button) */}
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="absolute top-3 right-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80 transition cursor-pointer"
                title="Flip Camera (Front/Rear)"
                aria-label="Flip Camera (Front/Rear)"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>

              {/* Status Watermark */}
              <div className="absolute bottom-2.5 left-2.5 z-30 rounded-lg bg-black/60 px-2 py-0.5 text-[9px] font-mono font-bold text-white/90 backdrop-blur-md flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Camera Ready</span>
              </div>
            </>
          )}
        </div>

        {/* Compact Punch Action Button (Bit smaller size per user request) */}
        <div className="mt-3.5 space-y-1.5">
          <button
            type="button"
            disabled={capturing || !!cameraError}
            onClick={handleExecutePunch}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isRePunch
                ? 'bg-gradient-to-r from-amber-500 via-orange-600 to-amber-600 text-white shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.99]'
                : currentCheckpoint === 'on_duty_in'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99]'
                : currentCheckpoint === 'on_duty_out'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-500/20 hover:from-indigo-700 hover:to-purple-700 active:scale-[0.99]'
                : 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-sky-500/20 hover:from-sky-700 hover:to-blue-700 active:scale-[0.99]'
            }`}
          >
            {capturing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Recording Checkpoint...</span>
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" />
                <span>{getButtonLabel()}</span>
              </>
            )}
          </button>

          {isRePunch && (
            <p className="text-center text-[10px] font-medium text-amber-700 bg-amber-50/80 rounded-lg py-1 px-2.5 border border-amber-200/60">
              💡 Re-punching updates checkout photo & time, automatically recalculating shift hours.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
