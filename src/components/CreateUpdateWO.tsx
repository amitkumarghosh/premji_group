import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Plus,
  Camera,
  Upload,
  CheckCircle,
  RefreshCw,
  X,
  AlertTriangle,
  RotateCw,
  Wrench,
  Calendar,
  Layers,
  CheckSquare,
  SwitchCamera
} from 'lucide-react';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils';
import { authFetch } from '../utils/api';

interface CreateUpdateWOProps {
  user: any;
  technicians: any[];
  manufacturers: string[];
  models: string[];
  onSelectManufacturer: (mfr: string) => void;
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const CreateUpdateWO: React.FC<CreateUpdateWOProps> = ({
  user,
  technicians,
  manufacturers,
  models,
  onSelectManufacturer,
  onNotification
}) => {
  // 5 Operational Modes per specification
  const [jobcardMode, setJobcardMode] = useState<
    'New workorder' | 'Re-assign workorder' | 'Repeat Repair' | 'Re Visit' | 'Close workorder'
  >('New workorder');

  const [submitting, setSubmitting] = useState(false);
  const [openJobs, setOpenJobs] = useState<any[]>([]);
  const [closedJobs, setClosedJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | string>('');

  // Mode 1 ("New workorder") & Modes 3/4 ("Repeat Repair", "Re Visit") State
  const [form, setForm] = useState({
    vehicle_manufacturer: '',
    vehicle_model: '',
    vehicle_variant: '',
    vehicle_registration_no: '',
    jobcard_no: '',
    jobcard_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    kilometres: '',
    name_of_service_advisor: '',
    technician_code: '',
    tl_remarks: '',
    previous_jobcard_no: ''
  });

  const [jobcardPhotoBase64, setJobcardPhotoBase64] = useState<string | null>(null);
  const [previewExistingPhoto, setPreviewExistingPhoto] = useState<string | null>(null);

  // Device Camera state for Jobcard Photo (Defaults to Rear/Environment camera for documents)
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mode 2 ("Re-assign workorder") State
  const [reassignForm, setReassignForm] = useState({
    new_technician_code: '',
    new_assign_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    tl_remarks: ''
  });

  // Mode 5 ("Close workorder") 14 Services Grid State
  const [services, setServices] = useState({
    brake_testing: 0,
    carbon_cleaning_decarb: 0,
    disc_cutting: 0,
    drum_cutting: 0,
    puncture_removed: 0,
    tpms_replacement: 0,
    tyre_fitting: 0,
    wheel_tyre_rotation: 0,
    wheel_balancing: 0,
    wheel_alignment: 0,
    washing_and_cleaning: 0,
    exterior_polishing: 0,
    interior_cleaning: 0,
    paint_protection_film: 0
  });
  const [closeRemarks, setCloseRemarks] = useState('');

  // Date boundaries for Jobcard Date (<= today, >= today - 10 days)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const minDateStr = tenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Filter technicians assigned to TeamLeader's center
  const centerTechnicians = technicians.filter(
    (t) => !user.center_code || t.center_code === user.center_code || !t.center_code
  );

  // Load Open and Closed Jobs for this center
  const loadJobsData = async () => {
    try {
      const [openRes, closedRes] = await Promise.all([
        authFetch(`/api/workorders/open-jobs`),
        authFetch(`/api/workorders/closed-jobs?days=30`)
      ]);
      if (openRes.ok) {
        const data = await openRes.json();
        setOpenJobs(data.openJobs || []);
      }
      if (closedRes.ok) {
        const data = await closedRes.json();
        setClosedJobs(data.closedJobs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadJobsData();
  }, [user.center_code]);

  // Reset states when changing mode
  const handleModeChange = (mode: any) => {
    setJobcardMode(mode);
    setSelectedJobId('');
    setJobcardPhotoBase64(null);
    setPreviewExistingPhoto(null);
    setCloseRemarks('');
    setServices({
      brake_testing: 0,
      carbon_cleaning_decarb: 0,
      disc_cutting: 0,
      drum_cutting: 0,
      puncture_removed: 0,
      tpms_replacement: 0,
      tyre_fitting: 0,
      wheel_tyre_rotation: 0,
      wheel_balancing: 0,
      wheel_alignment: 0,
      washing_and_cleaning: 0,
      exterior_polishing: 0,
      interior_cleaning: 0,
      paint_protection_film: 0
    });
  };

  // When a job is selected in Re-assign, Repeat/Revisit, or Close modes
  const handleSelectJob = (idStr: string) => {
    setSelectedJobId(idStr);
    const id = Number(idStr);
    if (!id) return;

    if (jobcardMode === 'Re-assign workorder' || jobcardMode === 'Close workorder') {
      const target = openJobs.find((j) => j.id === id);
      if (target) {
        setPreviewExistingPhoto(formatPhotoUrl(target.jobcard_photo));
      }
    } else if (jobcardMode === 'Repeat Repair' || jobcardMode === 'Re Visit') {
      const target = closedJobs.find((j) => j.id === id);
      if (target) {
        setForm((prev) => ({
          ...prev,
          previous_jobcard_no: target.jobcard_no,
          vehicle_manufacturer: target.vehicle_manufacturer || '',
          vehicle_model: target.vehicle_model || '',
          vehicle_variant: target.vehicle_variant || '',
          vehicle_registration_no: target.vehicle_registration_no || '',
          kilometres: target.kilometres ? String(target.kilometres) : '',
          name_of_service_advisor: target.name_of_service_advisor || '',
          technician_code: target.technician_code || '',
          jobcard_no: '' // Must generate or enter new jobcard no
        }));
        setPreviewExistingPhoto(formatPhotoUrl(target.jobcard_photo));
        if (target.vehicle_manufacturer) {
          onSelectManufacturer(target.vehicle_manufacturer);
        }
      }
    }
  };

  // Start Device Camera (Default: Rear/Environment camera for physical jobcards)
  const startCamera = async (targetFacing: 'environment' | 'user' = 'environment') => {
    setCameraError(null);
    setCameraLoading(true);
    setIsCameraActive(true);

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: targetFacing },
          audio: false
        });
      }

      cameraStreamRef.current = stream;
      setCameraFacingMode(targetFacing);

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play().catch(console.error);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Camera access unavailable. Please ensure camera permissions are granted or upload a file.');
    } finally {
      setCameraLoading(false);
    }
  };

  // Stop Device Camera
  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setCameraError(null);
  };

  // Switch between back and front camera
  const toggleCameraFacing = () => {
    const nextFacing = cameraFacingMode === 'environment' ? 'user' : 'environment';
    startCamera(nextFacing);
  };

  // Capture photo snapshot from the active video stream
  const capturePhotoFromCamera = () => {
    const video = cameraVideoRef.current;
    if (!video) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (cameraFacingMode === 'user') {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // High-contrast provenance timestamp stamp
      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(12, canvas.height - 38, 360, 26);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`Jobcard Capture • ${nowStr}`, 20, canvas.height - 20);

      // Optimize image size to ensure fast transmission & storage
      const maxDimension = 1600;
      let finalCanvas = canvas;
      if (canvas.width > maxDimension || canvas.height > maxDimension) {
        const scale = Math.min(maxDimension / canvas.width, maxDimension / canvas.height);
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = canvas.width * scale;
        scaledCanvas.height = canvas.height * scale;
        const scaledCtx = scaledCanvas.getContext('2d');
        if (scaledCtx) {
          scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
          finalCanvas = scaledCanvas;
        }
      }

      const webp = finalCanvas.toDataURL('image/webp', 0.88);
      // Strictly set single photo
      setJobcardPhotoBase64(webp);
      stopCamera();
      onNotification('Jobcard photo captured successfully!', 'success');
    } catch (e: any) {
      console.error('Failed to capture frame:', e);
      onNotification('Failed to capture photo frame. Please try again.', 'error');
    }
  };

  // Image upload handler (strictly ONE image file at a time)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Strictly enforce single image: only take files[0]
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1600;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const webp = canvas.toDataURL('image/webp', 0.88);
          // Strictly replace with this single image
          setJobcardPhotoBase64(webp);
          stopCamera();
          onNotification('Single jobcard photo attached successfully!', 'success');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);

    // Reset input so user can re-upload if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Cleanup camera stream on unmount or tab switch
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [jobcardMode]);

  // Submit Handler for Mode 1 ("New workorder")
  const handleNewWorkorderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_manufacturer || !form.vehicle_model || !form.vehicle_registration_no || !form.jobcard_no) {
      onNotification('Please fill in vehicle details, registration no, and jobcard no', 'error');
      return;
    }
    if (!jobcardPhotoBase64) {
      onNotification('Mandatory jobcard photo is required. Please capture or upload a photo.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await authFetch('/api/workorders/manage/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          jobcard_photo_base64: jobcardPhotoBase64
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`Work Order #${data.jobcard_no} created successfully!`, 'success');
        setForm({
          vehicle_manufacturer: '',
          vehicle_model: '',
          vehicle_variant: '',
          vehicle_registration_no: '',
          jobcard_no: '',
          jobcard_date: todayStr,
          kilometres: '',
          name_of_service_advisor: '',
          technician_code: '',
          tl_remarks: '',
          previous_jobcard_no: ''
        });
        setJobcardPhotoBase64(null);
        loadJobsData();
      } else {
        onNotification(data.error || 'Failed to create work order', 'error');
      }
    } catch (err: any) {
      onNotification('Network connection error while creating work order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Handler for Mode 2 ("Re-assign workorder")
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !reassignForm.new_technician_code) {
      onNotification('Please select the open jobcard and the new technician.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await authFetch('/api/workorders/manage/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_id: selectedJobId,
          new_assign_date: reassignForm.new_assign_date,
          new_technician_code: reassignForm.new_technician_code,
          tl_remarks: reassignForm.tl_remarks
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('Work Order re-assigned successfully!', 'success');
        setSelectedJobId('');
        setReassignForm({
          new_technician_code: '',
          new_assign_date: todayStr,
          tl_remarks: ''
        });
        loadJobsData();
      } else {
        onNotification(data.error || 'Failed to re-assign work order', 'error');
      }
    } catch (err) {
      onNotification('Error connecting to server for re-assignment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Handler for Modes 3 & 4 ("Repeat Repair" / "Re Visit")
  const handleRepeatRevisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.jobcard_no || !form.vehicle_registration_no) {
      onNotification('Please enter the new Jobcard No and verify vehicle registration', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await authFetch('/api/workorders/manage/repeat-revisit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobcard_type: jobcardMode,
          previous_jobcard_no: form.previous_jobcard_no,
          vehicle_manufacturer: form.vehicle_manufacturer,
          vehicle_model: form.vehicle_model,
          vehicle_variant: form.vehicle_variant,
          vehicle_registration_no: form.vehicle_registration_no,
          jobcard_no: form.jobcard_no,
          jobcard_date: form.jobcard_date,
          kilometres: form.kilometres,
          name_of_service_advisor: form.name_of_service_advisor,
          technician_code: form.technician_code,
          tl_remarks: form.tl_remarks,
          jobcard_photo_base64: jobcardPhotoBase64,
          existing_photo_url: previewExistingPhoto
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`${jobcardMode} work order created successfully!`, 'success');
        setSelectedJobId('');
        setForm({
          vehicle_manufacturer: '',
          vehicle_model: '',
          vehicle_variant: '',
          vehicle_registration_no: '',
          jobcard_no: '',
          jobcard_date: todayStr,
          kilometres: '',
          name_of_service_advisor: '',
          technician_code: '',
          tl_remarks: '',
          previous_jobcard_no: ''
        });
        setJobcardPhotoBase64(null);
        setPreviewExistingPhoto(null);
        loadJobsData();
      } else {
        onNotification(data.error || 'Failed to submit repeat/revisit order', 'error');
      }
    } catch (err) {
      onNotification('Error connecting to server', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Handler for Mode 5 ("Close workorder")
  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId) {
      onNotification('Please select an open work order to close', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await authFetch('/api/workorders/manage/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedJobId,
          services,
          tl_remarks: closeRemarks
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('Work order closed successfully with verified service counts!', 'success');
        setSelectedJobId('');
        setCloseRemarks('');
        loadJobsData();
      } else {
        onNotification(data.error || 'Failed to close work order', 'error');
      }
    } catch (err) {
      onNotification('Error closing work order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedOpenJob = openJobs.find((j) => j.id === Number(selectedJobId));
  const selectedClosedJob = closedJobs.find((j) => j.id === Number(selectedJobId));

  const serviceLabels: { key: keyof typeof services; label: string }[] = [
    { key: 'brake_testing', label: 'Brake Testing' },
    { key: 'carbon_cleaning_decarb', label: 'Carbon Cleaning / Decarb' },
    { key: 'disc_cutting', label: 'Disc Skimming' },
    { key: 'drum_cutting', label: 'Drum Skimming' },
    { key: 'puncture_removed', label: 'Puncture Removed' },
    { key: 'tpms_replacement', label: 'TPMS Replacement' },
    { key: 'tyre_fitting', label: 'Tyre Fitting' },
    { key: 'wheel_tyre_rotation', label: 'Wheel / Tyre Rotation' },
    { key: 'wheel_balancing', label: 'Wheel Balancing' },
    { key: 'wheel_alignment', label: 'Wheel Alignment' },
    { key: 'washing_and_cleaning', label: 'Washing & Cleaning' },
    { key: 'exterior_polishing', label: 'Exterior Polishing' },
    { key: 'interior_cleaning', label: 'Interior Cleaning' },
    { key: 'paint_protection_film', label: 'Paint Protection Film (PPF)' }
  ];

  return (
    <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-lg bg-white/90 backdrop-blur-xl max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-sky-600" />
            Manage Work Orders (Team Leader)
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Create, Re-assign, Repeat/Revisit, and Close work orders for your workshop center
          </p>
        </div>
      </div>

      {/* Mode Selector Dropdown */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Select Jobcard Type:
        </label>
        <select
          value={jobcardMode}
          onChange={(e) => handleModeChange(e.target.value)}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500 shadow-xs"
        >
          <option value="New workorder">New workorder</option>
          <option value="Re-assign workorder">Re-assign workorder</option>
          <option value="Repeat Repair">Repeat Repair</option>
          <option value="Re Visit">Re Visit</option>
          <option value="Close workorder">Close workorder</option>
        </select>
      </div>

      {/* Auto-populated Read-Only Center Info Card */}
      <div className="p-4 rounded-xl bg-sky-50/80 border border-sky-200 text-xs">
        <span className="font-bold text-sky-900 uppercase tracking-wider text-[10px] block mb-1">
          Workshop Center Information (Auto-Populated)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <span className="text-slate-500 text-[11px]">Center Code: </span>
            <span className="font-mono font-bold text-slate-900">{user.center_code || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px]">Center Name: </span>
            <span className="font-bold text-slate-900">{user.center_name || 'Premji Center'}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px]">Team Leader: </span>
            <span className="font-semibold text-slate-900">{user.employee_name} ({user.employee_code})</span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODE 1: NEW WORKORDER */}
      {/* ========================================================= */}
      {jobcardMode === 'New workorder' && (
        <form onSubmit={handleNewWorkorderSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Dependent Dropdown: Manufacturer */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Vehicle Manufacturer *</label>
              <select
                required
                value={form.vehicle_manufacturer}
                onChange={(e) => {
                  setForm({ ...form, vehicle_manufacturer: e.target.value, vehicle_model: '' });
                  onSelectManufacturer(e.target.value);
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
              >
                <option value="">Select Manufacturer...</option>
                {manufacturers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Dependent Dropdown: Model */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Vehicle Model *</label>
              <select
                required
                disabled={!form.vehicle_manufacturer}
                value={form.vehicle_model}
                onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">Select Model...</option>
                {models.map((mdl) => (
                  <option key={mdl} value={mdl}>{mdl}</option>
                ))}
              </select>
            </div>

            {/* Vehicle Registration No */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Vehicle Registration No *</label>
              <input
                type="text"
                required
                placeholder="e.g. MH01AB1234"
                value={form.vehicle_registration_no}
                onChange={(e) => setForm({ ...form, vehicle_registration_no: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono uppercase focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Vehicle Variant */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Vehicle Variant</label>
              <input
                type="text"
                placeholder="e.g. VXI, Petrol, Diesel"
                value={form.vehicle_variant}
                onChange={(e) => setForm({ ...form, vehicle_variant: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Jobcard No */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Jobcard No *</label>
              <input
                type="text"
                required
                placeholder="e.g. 12345"
                value={form.jobcard_no}
                onChange={(e) => setForm({ ...form, jobcard_no: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Jobcard Date (<= today, >= today - 10 days) */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Jobcard Date * (Max 10 days back)</label>
              <input
                type="date"
                required
                min={minDateStr}
                max={todayStr}
                value={form.jobcard_date}
                onChange={(e) => setForm({ ...form, jobcard_date: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Kilometres */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Kilometres</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 25000"
                value={form.kilometres}
                onChange={(e) => setForm({ ...form, kilometres: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Service Advisor */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Name of Service Advisor</label>
              <input
                type="text"
                placeholder="e.g. Rajesh Patil"
                value={form.name_of_service_advisor}
                onChange={(e) => setForm({ ...form, name_of_service_advisor: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Assigned Technician */}
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">Assign Technician (Active in Center)</label>
              <select
                value={form.technician_code}
                onChange={(e) => setForm({ ...form, technician_code: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
              >
                <option value="">Select Technician...</option>
                {centerTechnicians.map((t) => (
                  <option key={t.employee_code} value={t.employee_code}>
                    {t.employee_name} ({t.employee_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mandatory Jobcard Photo Capture (Camera or Single Upload) */}
          <div className="p-4 bg-sky-50/50 border border-sky-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-sky-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <Camera className="w-4 h-4 text-sky-600" />
                  Mandatory Jobcard Photo Capture *
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Capture using device camera or upload a single clear photo of the physical job card sheet.
                </p>
              </div>
              {jobcardPhotoBase64 && !isCameraActive && (
                <button
                  type="button"
                  onClick={() => setJobcardPhotoBase64(null)}
                  className="text-xs text-rose-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Photo
                </button>
              )}
            </div>

            {/* Hidden Single-File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={false}
              onChange={handlePhotoUpload}
              className="hidden"
            />

            {/* VIEW 1: LIVE CAMERA STREAM VIEWPORT */}
            {isCameraActive ? (
              <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 text-white space-y-3 shadow-xl">
                <div className="flex items-center justify-between text-xs px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold text-slate-200">
                      Camera Live ({cameraFacingMode === 'environment' ? 'Rear / Document Camera' : 'Front Camera'})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                      title="Switch Camera (Back/Front)"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      <span>Flip Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                      title="Close Camera"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {cameraError ? (
                  <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                ) : (
                  <div className="relative aspect-video max-h-72 w-full bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                    <video
                      ref={(el) => {
                        cameraVideoRef.current = el;
                        if (el && cameraStreamRef.current && el.srcObject !== cameraStreamRef.current) {
                          el.srcObject = cameraStreamRef.current;
                          el.play().catch(console.error);
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${
                        cameraFacingMode === 'user' ? 'scale-x-[-1]' : ''
                      }`}
                    />

                    {/* Document Guide Frame Overlay */}
                    <div className="absolute inset-4 sm:inset-6 border-2 border-dashed border-sky-400/60 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                      <div className="text-[10px] text-sky-200/90 font-mono tracking-wider bg-black/60 px-2 py-0.5 rounded self-start">
                        FRAME JOBCARD SHEET HERE
                      </div>
                      <div className="text-[10px] text-sky-200/90 font-mono tracking-wider bg-black/60 px-2 py-0.5 rounded self-end">
                        1 PHOTO ONLY
                      </div>
                    </div>

                    {cameraLoading && (
                      <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center gap-2 text-xs text-slate-300">
                        <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                        <span>Initializing camera...</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={capturePhotoFromCamera}
                    disabled={cameraLoading || !!cameraError}
                    className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-500/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capture Photo</span>
                  </button>
                </div>
              </div>
            ) : jobcardPhotoBase64 ? (
              /* VIEW 2: SINGLE PHOTO ATTACHED PREVIEW */
              <div className="bg-white rounded-2xl p-4 border border-sky-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>1 Jobcard Photo Attached (Ready to submit)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono uppercase bg-slate-100 px-2 py-0.5 rounded">
                    Single Image Limit
                  </span>
                </div>

                <div className="relative group max-w-sm mx-auto overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-inner">
                  <img
                    src={jobcardPhotoBase64}
                    alt="Jobcard Preview"
                    className="w-full h-52 object-contain bg-slate-900 rounded-xl"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => startCamera('environment')}
                    className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-sky-200 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Retake with Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Different File</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setJobcardPhotoBase64(null)}
                    className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-rose-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            ) : (
              /* VIEW 3: OPTIONS TO CAPTURE OR UPLOAD (STRICTLY ONE IMAGE) */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option A: Device Camera */}
                <button
                  type="button"
                  onClick={() => startCamera('environment')}
                  className="flex flex-col items-center justify-center p-5 bg-white hover:bg-sky-50/70 border-2 border-dashed border-sky-300 hover:border-sky-500 rounded-2xl transition text-center cursor-pointer group shadow-xs hover:shadow-md"
                >
                  <div className="w-12 h-12 mb-2 rounded-2xl bg-sky-100 group-hover:bg-sky-500 text-sky-600 group-hover:text-white flex items-center justify-center transition shadow-xs">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-sky-900">
                    Capture with Device Camera
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Opens back camera for real-time document snap
                  </span>
                  <span className="mt-2 text-[10px] font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                    Instant Live Viewfinder
                  </span>
                </button>

                {/* Option B: Upload File (Single file only) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-5 bg-white hover:bg-indigo-50/70 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl transition text-center cursor-pointer group shadow-xs hover:shadow-md"
                >
                  <div className="w-12 h-12 mb-2 rounded-2xl bg-slate-100 group-hover:bg-indigo-600 text-slate-600 group-hover:text-white flex items-center justify-center transition shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-900">
                    Upload from Device
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Select 1 file from gallery or storage
                  </span>
                  <span className="mt-2 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    Single Image Only
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* TL Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">TL Remarks / Initial Inspection Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. 1st Free Service, Wheel alignment, etc."
              value={form.tl_remarks}
              onChange={(e) => setForm({ ...form, tl_remarks: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-sky-500/20 disabled:opacity-50"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Work Order
          </button>
        </form>
      )}

      {/* ========================================================= */}
      {/* MODE 2: RE-ASSIGN WORKORDER */}
      {/* ========================================================= */}
      {jobcardMode === 'Re-assign workorder' && (
        <form onSubmit={handleReassignSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Select Open In-Progress Jobcard in this Center:
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => handleSelectJob(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
            >
              <option value="">Choose an in-progress work order...</option>
              {openJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  #{j.jobcard_no} — {j.vehicle_registration_no} ({j.vehicle_manufacturer} {j.vehicle_model}) [Tech: {j.name_of_technician || 'Unassigned'}]
                </option>
              ))}
            </select>
          </div>

          {selectedOpenJob && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="text-xs space-y-1.5">
                  <div className="font-bold text-sky-800 text-sm">Job Card #{selectedOpenJob.jobcard_no}</div>
                  <div><span className="text-slate-400">Vehicle:</span> <span className="font-semibold text-slate-800">{selectedOpenJob.vehicle_manufacturer} {selectedOpenJob.vehicle_model} ({selectedOpenJob.vehicle_registration_no})</span></div>
                  <div><span className="text-slate-400">Current Tech:</span> <span className="font-semibold text-slate-800">{selectedOpenJob.name_of_technician || 'Unassigned'}</span></div>
                  <div><span className="text-slate-400">Assigned Date:</span> <span className="font-mono text-slate-800">{selectedOpenJob.job_assign_date || selectedOpenJob.jobcard_date}</span></div>
                </div>

                {previewExistingPhoto && (
                  <div className="text-center">
                    <img
                      src={previewExistingPhoto}
                      alt="Jobcard Photo"
                      className="w-32 h-24 object-cover rounded-lg border border-slate-200 mx-auto bg-slate-100"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">Read-Only Original Photo</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">New Technician *</label>
                  <select
                    required
                    value={reassignForm.new_technician_code}
                    onChange={(e) => setReassignForm({ ...reassignForm, new_technician_code: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Select New Technician...</option>
                    {centerTechnicians.map((t) => (
                      <option key={t.employee_code} value={t.employee_code}>
                        {t.employee_name} ({t.employee_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">New Assign Date</label>
                  <input
                    type="date"
                    value={reassignForm.new_assign_date}
                    onChange={(e) => setReassignForm({ ...reassignForm, new_assign_date: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Re-assignment Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Reason for re-assignment..."
                  value={reassignForm.tl_remarks}
                  onChange={(e) => setReassignForm({ ...reassignForm, tl_remarks: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                Confirm Re-assignment
              </button>
            </div>
          )}
        </form>
      )}

      {/* ========================================================= */}
      {/* MODES 3 & 4: REPEAT REPAIR / RE VISIT */}
      {/* ========================================================= */}
      {(jobcardMode === 'Repeat Repair' || jobcardMode === 'Re Visit') && (
        <form onSubmit={handleRepeatRevisitSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Select Closed Jobcard from Last 30 Days:
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => handleSelectJob(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
            >
              <option value="">Choose a past closed jobcard...</option>
              {closedJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  #{j.jobcard_no} — {j.vehicle_registration_no} ({j.vehicle_manufacturer} {j.vehicle_model}) [Closed: {j.job_compleate_date || 'N/A'}]
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Previous Jobcard No</label>
              <input
                type="text"
                readOnly
                value={form.previous_jobcard_no}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-slate-600 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">New Jobcard No *</label>
              <input
                type="text"
                required
                placeholder="e.g. 54321"
                value={form.jobcard_no}
                onChange={(e) => setForm({ ...form, jobcard_no: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Vehicle Registration No *</label>
              <input
                type="text"
                required
                value={form.vehicle_registration_no}
                onChange={(e) => setForm({ ...form, vehicle_registration_no: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono uppercase focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Vehicle Manufacturer</label>
              <input
                type="text"
                value={form.vehicle_manufacturer}
                onChange={(e) => setForm({ ...form, vehicle_manufacturer: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Vehicle Model</label>
              <input
                type="text"
                value={form.vehicle_model}
                onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Assign Technician</label>
              <select
                value={form.technician_code}
                onChange={(e) => setForm({ ...form, technician_code: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
              >
                <option value="">Select Technician...</option>
                {centerTechnicians.map((t) => (
                  <option key={t.employee_code} value={t.employee_code}>
                    {t.employee_name} ({t.employee_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Remarks for {jobcardMode}</label>
            <textarea
              rows={2}
              placeholder="Reason for repeat/revisit..."
              value={form.tl_remarks}
              onChange={(e) => setForm({ ...form, tl_remarks: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            Create {jobcardMode} Order
          </button>
        </form>
      )}

      {/* ========================================================= */}
      {/* MODE 5: CLOSE WORKORDER WITH 14 SERVICES */}
      {/* ========================================================= */}
      {jobcardMode === 'Close workorder' && (
        <form onSubmit={handleCloseSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Select In-Progress Work Order to Close:
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => handleSelectJob(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
            >
              <option value="">Choose an open work order...</option>
              {openJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  #{j.jobcard_no} — {j.vehicle_registration_no} ({j.vehicle_manufacturer} {j.vehicle_model}) [Tech: {j.name_of_technician || 'Unassigned'}]
                </option>
              ))}
            </select>
          </div>

          {selectedOpenJob && (
            <div className="space-y-6">
              {/* Job Details Banner */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
                <span className="font-bold text-emerald-900 uppercase tracking-wider text-[10px] block mb-1">
                  Closing Work Order Summary
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><span className="text-slate-500">Jobcard No:</span> <span className="font-mono font-bold text-slate-900">#{selectedOpenJob.jobcard_no}</span></div>
                  <div><span className="text-slate-500">Reg No:</span> <span className="font-mono font-bold text-slate-900">{selectedOpenJob.vehicle_registration_no}</span></div>
                  <div><span className="text-slate-500">Technician:</span> <span className="font-semibold text-slate-900">{selectedOpenJob.name_of_technician || 'Unassigned'}</span></div>
                </div>
              </div>

              {/* 14 Numeric Services Grid (3 Columns) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Enter Service Counts (14 Standard Checks):
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  {serviceLabels.map(({ key, label }) => (
                    <div key={key} className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700 leading-tight">
                        {label}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={services[key]}
                        onChange={(e) =>
                          setServices({
                            ...services,
                            [key]: Math.max(0, parseInt(e.target.value) || 0)
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Close Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Final Completion Remarks</label>
                <textarea
                  rows={2}
                  placeholder="e.g. All wheel alignments and services verified successfully..."
                  value={closeRemarks}
                  onChange={(e) => setCloseRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Complete & Close Work Order
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
