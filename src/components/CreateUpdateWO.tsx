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
  CheckSquare
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

  // Image capture / upload & compression
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const webp = canvas.toDataURL('image/webp', 0.85);
          setJobcardPhotoBase64(webp);
          onNotification('Jobcard photo captured successfully!', 'success');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

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
    { key: 'disc_cutting', label: 'Disc Cutting' },
    { key: 'drum_cutting', label: 'Drum Cutting' },
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

          {/* Mandatory Jobcard Photo Capture */}
          <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-600" />
                Mandatory Jobcard Photo Capture *
              </span>
              {jobcardPhotoBase64 && (
                <button
                  type="button"
                  onClick={() => setJobcardPhotoBase64(null)}
                  className="text-xs text-rose-600 font-bold hover:underline"
                >
                  Clear Photo
                </button>
              )}
            </div>

            {jobcardPhotoBase64 ? (
              <div className="relative group max-w-xs mx-auto">
                <img
                  src={jobcardPhotoBase64}
                  alt="Jobcard Preview"
                  className="w-full h-44 object-cover rounded-xl border border-slate-200 shadow-xs"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 rounded-xl text-center">
                <Upload className="w-8 h-8 text-sky-500 mb-2" />
                <p className="text-xs font-semibold text-slate-700">Capture or Upload Jobcard Photo</p>
                <p className="text-[11px] text-slate-400 mb-3">Clear photo of the physical job card sheet</p>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
                />
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
