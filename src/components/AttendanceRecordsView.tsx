import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Search,
  Download,
  Eye,
  RefreshCw,
  Clock,
  Coffee,
  Award,
  Users,
  Building,
  Filter,
  CheckCircle,
  FileSpreadsheet,
  PlusCircle,
  Edit3,
  Save,
  AlertCircle,
  UserCheck,
  Check,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { formatPhotoUrl, FALLBACK_IMAGE_SVG } from '../utils/photoUtils.ts';
import { authFetch } from '../utils/api.ts';
import { formatIstTimeDisplay, formatIstFullDisplay, getIstDateString, calculateHours, calculateEffectiveHours } from '../lib/ist-time.ts';

interface AttendanceRecordsViewProps {
  user: any;
  centers: any[];
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  onInspectImage: (img: { url: string; title: string }) => void;
}

type TabType = 'summary' | 'add' | 'edit';

export const AttendanceRecordsView: React.FC<AttendanceRecordsViewProps> = ({
  user,
  centers,
  onNotification,
  onInspectImage
}) => {
  const today = getIstDateString();

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<TabType>('summary');

  // Employee Master List for Dropdowns
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // ==================== TAB 1: SUMMARY STATE ====================
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({
    total_records: 0,
    sum_total_working_hrs: 0,
    sum_total_break_hrs: 0,
    sum_effective_working_hrs: 0,
    avg_effective_working_hrs: 0,
    total_active_employees: 0,
    total_centers: 0
  });

  // Default filter date strictly TODAY
  const [filters, setFilters] = useState({
    start_date: today,
    end_date: today,
    center_code: '',
    employee_code: '',
    search: ''
  });

  // ==================== TAB 2: ADD ATTENDANCE STATE ====================
  const [addForm, setAddForm] = useState({
    attendance_date: today,
    emp_code_of_thetechnician: '',
    name_of_technician: '',
    center_code: '',
    on_duty_in_time: '09:30',
    intermidiate_off_out_time: '13:00',
    intermidiate_off_in_time: '13:45',
    on_duty_out_time: '18:30',
    admin_remarks: ''
  });
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // ==================== TAB 3: EDIT ATTENDANCE STATE ====================
  const [editSearchDate, setEditSearchDate] = useState(today);
  const [editSearchEmpCode, setEditSearchEmpCode] = useState('');
  const [selectedRecordToEdit, setSelectedRecordToEdit] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    id: null as number | null,
    attendance_date: today,
    emp_code_of_thetechnician: '',
    name_of_technician: '',
    center_code: '',
    on_duty_in_time: '',
    intermidiate_off_out_time: '',
    intermidiate_off_in_time: '',
    on_duty_out_time: '',
    admin_remarks: ''
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [loadingEditRecord, setLoadingEditRecord] = useState(false);

  // Load Employees on Mount
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setLoadingEmployees(true);
        const res = await authFetch('/api/employees');
        if (res.ok) {
          const data = await res.json();
          setEmployees(data.employees || []);
        }
      } catch (err) {
        console.error('Failed to load employee list:', err);
      } finally {
        setLoadingEmployees(false);
      }
    };
    loadEmployees();
  }, []);

  // Fetch Attendance Records for Summary Tab
  const loadRecords = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.start_date) params.append('startDate', filters.start_date);
      if (filters.end_date) params.append('endDate', filters.end_date);
      if (filters.center_code) params.append('centerCode', filters.center_code);
      if (filters.employee_code) params.append('employeeCode', filters.employee_code);
      if (filters.search) params.append('search', filters.search);

      const res = await authFetch(`/api/admin/attendance/summary?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        if (data.summary) {
          setSummary(data.summary);
        }
      } else {
        const fallbackRes = await authFetch(`/api/attendance/admin-report?${params.toString()}`);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          setRecords(fallbackData.records || []);
          if (fallbackData.summary) {
            setSummary(fallbackData.summary);
          }
        }
      }
    } catch (e) {
      console.error(e);
      onNotification('Failed to generate attendance report', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'summary') {
      loadRecords();
    }
  }, [filters.start_date, filters.end_date, filters.center_code, activeTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadRecords();
  };

  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'week' | 'month') => {
    const todayStr = getIstDateString();
    if (preset === 'today') {
      setFilters(prev => ({ ...prev, start_date: todayStr, end_date: todayStr }));
    } else if (preset === 'yesterday') {
      const yStr = getIstDateString(new Date(Date.now() - 86400000));
      setFilters(prev => ({ ...prev, start_date: yStr, end_date: yStr }));
    } else if (preset === 'week') {
      const wStr = getIstDateString(new Date(Date.now() - 7 * 86400000));
      setFilters(prev => ({ ...prev, start_date: wStr, end_date: todayStr }));
    } else if (preset === 'month') {
      const mStr = getIstDateString(new Date(Date.now() - 30 * 86400000));
      setFilters(prev => ({ ...prev, start_date: mStr, end_date: todayStr }));
    }
  };

  const handleExportCSV = () => {
    if (records.length === 0) {
      onNotification('No attendance records to export', 'error');
      return;
    }

    const headers = [
      'Attendance Date',
      'Employee Code',
      'Employee Name',
      'Center Name',
      'Center Location',
      'In Time (IST)',
      'Break Out (IST)',
      'Break In (IST)',
      'Out Time (IST)',
      'Gross Working Hrs',
      'Total Break Hrs',
      'Effective Working Hrs',
      'Initial Check-In (Ground Truth)',
      'Last Edit Timestamp',
      'Last Edited By',
      'Admin Remarks'
    ];

    const rows = records.map((r) => [
      `"${r.attendance_date || ''}"`,
      `"${r.emp_code_of_thetechnician || ''}"`,
      `"${r.name_of_technician || ''}"`,
      `"${r.center_name || ''}"`,
      `"${r.center_location || ''}"`,
      `"${r.on_duty_in_time || ''}"`,
      `"${r.intermidiate_off_out_time || ''}"`,
      `"${r.intermidiate_off_in_time || ''}"`,
      `"${r.on_duty_out_time || ''}"`,
      Number(r.total_working_hrs || 0).toFixed(2),
      Number(r.total_break_hrs || 0).toFixed(2),
      Number(r.effective_working_hrs || 0).toFixed(2),
      `"${r.all_innitial_time || ''}"`,
      `"${r.last_edit_timestamp || ''}"`,
      `"${r.last_edited_by || ''}"`,
      `"${(r.admin_remarks || '').replace(/"/g, '""')}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Premji_Attendance_Report_${filters.start_date}_to_${filters.end_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotification('Attendance CSV report downloaded successfully!', 'success');
  };

  // Helper for parsing time field to HH:mm
  const formatTimeToInput = (timeVal: string | null | undefined): string => {
    if (!timeVal) return '';
    const str = String(timeVal).trim();
    if (str.includes(' ')) {
      const timePart = str.split(' ')[1];
      return timePart.slice(0, 5);
    }
    if (str.includes('T')) {
      const timePart = str.split('T')[1];
      return timePart.slice(0, 5);
    }
    return str.slice(0, 5);
  };

  // Helper for live hours calculation
  const calculateLiveFormHours = (
    inTime: string,
    breakOut: string,
    breakIn: string,
    outTime: string,
    dateStr: string
  ) => {
    const fullIn = inTime ? `${dateStr} ${inTime}:00` : null;
    const fullBreakOut = breakOut ? `${dateStr} ${breakOut}:00` : null;
    const fullBreakIn = breakIn ? `${dateStr} ${breakIn}:00` : null;
    const fullOut = outTime ? `${dateStr} ${outTime}:00` : null;

    let breakHours = 0.00;
    if (fullBreakOut && fullBreakIn) {
      breakHours = calculateHours(fullBreakOut, fullBreakIn, dateStr);
    }

    let grossHours = 0.00;
    if (fullIn && fullOut) {
      grossHours = calculateHours(fullIn, fullOut, dateStr);
    }

    const effectiveHours = calculateEffectiveHours(grossHours, breakHours);

    return { grossHours, breakHours, effectiveHours };
  };

  // ==================== TAB 2: ADD ATTENDANCE HANDLER ====================
  const handleAddEmployeeSelect = (empCode: string) => {
    const emp = employees.find(e => e.employee_code === empCode);
    setAddForm(prev => ({
      ...prev,
      emp_code_of_thetechnician: empCode,
      name_of_technician: emp ? emp.employee_name : '',
      center_code: emp ? emp.center_code || '' : ''
    }));
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.emp_code_of_thetechnician) {
      onNotification('Please select an employee.', 'error');
      return;
    }
    if (!addForm.attendance_date) {
      onNotification('Please select attendance date.', 'error');
      return;
    }

    try {
      setSubmittingAdd(true);
      const res = await authFetch('/api/attendance/manual-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance_date: addForm.attendance_date,
          emp_code_of_thetechnician: addForm.emp_code_of_thetechnician,
          name_of_technician: addForm.name_of_technician,
          center_code: addForm.center_code,
          on_duty_in_time: addForm.on_duty_in_time,
          intermidiate_off_out_time: addForm.intermidiate_off_out_time,
          intermidiate_off_in_time: addForm.intermidiate_off_in_time,
          on_duty_out_time: addForm.on_duty_out_time,
          admin_remarks: addForm.admin_remarks || 'Manually entered by Admin'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(data.message || 'Attendance created successfully!', 'success');
        // Reset or switch tab
        setAddForm({
          attendance_date: today,
          emp_code_of_thetechnician: '',
          name_of_technician: '',
          center_code: '',
          on_duty_in_time: '09:30',
          intermidiate_off_out_time: '13:00',
          intermidiate_off_in_time: '13:45',
          on_duty_out_time: '18:30',
          admin_remarks: ''
        });
        loadRecords();
      } else {
        onNotification(data.error || 'Failed to create attendance record', 'error');
      }
    } catch (err: any) {
      console.error(err);
      onNotification('Network error while saving attendance record', 'error');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // ==================== TAB 3: EDIT ATTENDANCE HANDLERS ====================
  const loadRecordForEditing = (record: any) => {
    setSelectedRecordToEdit(record);
    setEditForm({
      id: record.id || null,
      attendance_date: record.attendance_date,
      emp_code_of_thetechnician: record.emp_code_of_thetechnician,
      name_of_technician: record.name_of_technician,
      center_code: record.center_code || '',
      on_duty_in_time: formatTimeToInput(record.on_duty_in_time),
      intermidiate_off_out_time: formatTimeToInput(record.intermidiate_off_out_time),
      intermidiate_off_in_time: formatTimeToInput(record.intermidiate_off_in_time),
      on_duty_out_time: formatTimeToInput(record.on_duty_out_time),
      admin_remarks: record.admin_remarks || ''
    });
    setActiveTab('edit');
  };

  const handleEditSearchLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editSearchEmpCode) {
      onNotification('Please select an employee to look up record', 'error');
      return;
    }

    try {
      setLoadingEditRecord(true);
      const res = await authFetch(`/api/attendance/record-by-date-emp?date=${editSearchDate}&employee_code=${editSearchEmpCode}`);
      const data = await res.json();
      if (res.ok && data.record) {
        loadRecordForEditing(data.record);
        onNotification(`Found attendance record for ${data.record.name_of_technician} on ${editSearchDate}`, 'success');
      } else {
        setSelectedRecordToEdit(null);
        // Pre-fill blank edit form
        const emp = employees.find(e => e.employee_code === editSearchEmpCode);
        setEditForm({
          id: null,
          attendance_date: editSearchDate,
          emp_code_of_thetechnician: editSearchEmpCode,
          name_of_technician: emp?.employee_name || editSearchEmpCode,
          center_code: emp?.center_code || '',
          on_duty_in_time: '',
          intermidiate_off_out_time: '',
          intermidiate_off_in_time: '',
          on_duty_out_time: '',
          admin_remarks: ''
        });
        onNotification('No attendance found for this date. You can fill out the form to add it.', 'info');
      }
    } catch (err) {
      console.error(err);
      onNotification('Failed to look up record', 'error');
    } finally {
      setLoadingEditRecord(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.emp_code_of_thetechnician) {
      onNotification('Please select an employee.', 'error');
      return;
    }

    try {
      setSubmittingEdit(true);
      const res = await authFetch('/api/attendance/manual-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editForm.id,
          attendance_date: editForm.attendance_date,
          emp_code_of_thetechnician: editForm.emp_code_of_thetechnician,
          name_of_technician: editForm.name_of_technician,
          on_duty_in_time: editForm.on_duty_in_time,
          intermidiate_off_out_time: editForm.intermidiate_off_out_time,
          intermidiate_off_in_time: editForm.intermidiate_off_in_time,
          on_duty_out_time: editForm.on_duty_out_time,
          admin_remarks: editForm.admin_remarks || 'Manually updated by Admin'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(data.message || 'Attendance record updated successfully!', 'success');
        loadRecords();
      } else {
        onNotification(data.error || 'Failed to update attendance record', 'error');
      }
    } catch (err: any) {
      console.error(err);
      onNotification('Network error while updating attendance record', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Live calculations for Add & Edit forms
  const addCalculations = calculateLiveFormHours(
    addForm.on_duty_in_time,
    addForm.intermidiate_off_out_time,
    addForm.intermidiate_off_in_time,
    addForm.on_duty_out_time,
    addForm.attendance_date
  );

  const editCalculations = calculateLiveFormHours(
    editForm.on_duty_in_time,
    editForm.intermidiate_off_out_time,
    editForm.intermidiate_off_in_time,
    editForm.on_duty_out_time,
    editForm.attendance_date
  );

  return (
    <div className="space-y-6">
      {/* Top Main Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-200/80 p-1 backdrop-blur-md shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'summary'
              ? 'bg-white text-sky-800 shadow-md shadow-slate-300'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Search className="h-4 w-4 text-sky-600" />
          <span>Attendance Search &amp; Master Summary</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('add')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'add'
              ? 'bg-white text-emerald-800 shadow-md shadow-slate-300'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <PlusCircle className="h-4 w-4 text-emerald-600" />
          <span>Add Attendance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('edit')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'edit'
              ? 'bg-white text-indigo-800 shadow-md shadow-slate-300'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Edit3 className="h-4 w-4 text-indigo-600" />
          <span>Edit Attendance</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ATTENDANCE SEARCH & MASTER SUMMARY                                  */}
      {/* ========================================================================= */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl border border-sky-100 bg-white/90 shadow-md backdrop-blur-xl">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-xl shadow-inner">
                  📊
                </span>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Attendance Search &amp; Master Summary</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Shift metrics, break durations, uncropped audit photos, and granular logs.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={loadRecords}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* 5 High-Level Metric Aggregation Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
                <span>Records</span>
                <Users className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 font-mono text-2xl font-black text-slate-900">
                {summary.total_records}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {summary.total_active_employees || 0} Active Staff
              </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
                <span>Gross Hours</span>
                <Clock className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 font-mono text-2xl font-black text-sky-700">
                {Number(summary.sum_total_working_hrs || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                SUM(total_working_hrs)
              </div>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between text-amber-700 text-xs font-bold uppercase tracking-wider">
                <span>Break Duration</span>
                <Coffee className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-2 font-mono text-2xl font-black text-amber-600">
                {Number(summary.sum_total_break_hrs || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                SUM(total_break_hrs)
              </div>
            </div>

            <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-500 to-teal-700 p-4 text-white shadow-md shadow-emerald-600/20 col-span-2 md:col-span-1">
              <div className="flex items-center justify-between text-emerald-100 text-xs font-bold uppercase tracking-wider">
                <span>Effective Hours</span>
                <Award className="h-4 w-4 text-white" />
              </div>
              <div className="mt-2 font-mono text-2xl font-black text-white">
                {Number(summary.sum_effective_working_hrs || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-emerald-100/90 font-medium mt-0.5">
                Primary Net Working KPI
              </div>
            </div>

            <div className="rounded-2xl border border-purple-100 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between text-purple-700 text-xs font-bold uppercase tracking-wider">
                <span>Avg Shift</span>
                <Clock className="h-4 w-4 text-purple-600" />
              </div>
              <div className="mt-2 font-mono text-2xl font-black text-purple-700">
                {Number(summary.avg_effective_working_hrs || 0).toFixed(2)}{' '}
                <span className="text-xs font-sans text-slate-400 font-bold">HRS</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                AVG(effective_working_hrs)
              </div>
            </div>
          </div>

          {/* Filter & Range Bar */}
          <div className="p-5 rounded-3xl border border-sky-100 bg-white/90 shadow-md backdrop-blur-xl">
            <form onSubmit={handleSearchSubmit} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-sky-600" />
                  Filter Records
                </span>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickPreset('today')}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPreset('yesterday')}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPreset('week')}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPreset('month')}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer font-medium"
                  >
                    Last 30 Days
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.start_date}
                    onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.end_date}
                    onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Workshop Center
                  </label>
                  <select
                    value={filters.center_code}
                    onChange={(e) => setFilters({ ...filters, center_code: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none bg-white"
                  >
                    <option value="">All Centers</option>
                    {centers.map((c) => (
                      <option key={c.center_code} value={c.center_code}>
                        {c.center_name || c.center_code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Search Code / Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. TECH01 or Suresh"
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none"
                    />
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-700 transition cursor-pointer"
                  >
                    Search Records
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Granular Table with Full Photos and Actions */}
          <div className="rounded-3xl border border-sky-100 bg-white/90 overflow-hidden shadow-md backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Center</th>
                    <th className="py-3 px-4 text-center">In Time</th>
                    <th className="py-3 px-4 text-center">Break Out</th>
                    <th className="py-3 px-4 text-center">Break In</th>
                    <th className="py-3 px-4 text-center">Out Time</th>
                    <th className="py-3 px-4 text-right">Gross (h)</th>
                    <th className="py-3 px-4 text-right">Break (h)</th>
                    <th className="py-3 px-4 text-right">Effective (h)</th>
                    <th className="py-3 px-4">Audit Trail</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-slate-400">
                        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-sky-600 mb-2" />
                        <span>Loading attendance report...</span>
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-slate-400">
                        No attendance records found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    records.map((r, i) => {
                      const effective = Number(r.effective_working_hrs || 0);

                      return (
                        <tr key={r.id || i} className="hover:bg-sky-50/40 transition">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {r.attendance_date}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{r.name_of_technician}</div>
                            <div className="font-mono text-[10px] text-sky-700 font-semibold">{r.emp_code_of_thetechnician}</div>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                            <div className="font-medium">{r.center_name || 'Main Center'}</div>
                            {r.center_location && (
                              <div className="text-[10px] text-slate-400">{r.center_location}</div>
                            )}
                          </td>

                          {/* In Time */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono font-bold text-emerald-700">
                                {formatIstTimeDisplay(r.on_duty_in_time)}
                              </span>
                              {r.on_duty_in_image ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectImage({
                                    url: formatPhotoUrl(r.on_duty_in_image),
                                    title: `Shift In (Uncropped) - ${r.name_of_technician} (${r.attendance_date})`
                                  })}
                                  className="group relative h-8 w-11 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-emerald-500 transition cursor-pointer"
                                  title="Click to inspect full uncropped photo"
                                >
                                  <img
                                    src={formatPhotoUrl(r.on_duty_in_image)}
                                    alt="Shift In"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Eye className="h-3 w-3 text-white" />
                                  </div>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">No Photo</span>
                              )}
                            </div>
                          </td>

                          {/* Break Out */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono font-bold text-amber-700">
                                {formatIstTimeDisplay(r.intermidiate_off_out_time)}
                              </span>
                              {r.intermidiate_off_out_image ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectImage({
                                    url: formatPhotoUrl(r.intermidiate_off_out_image),
                                    title: `Break Out (Uncropped) - ${r.name_of_technician} (${r.attendance_date})`
                                  })}
                                  className="group relative h-8 w-11 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-amber-500 transition cursor-pointer"
                                  title="Click to inspect full uncropped photo"
                                >
                                  <img
                                    src={formatPhotoUrl(r.intermidiate_off_out_image)}
                                    alt="Break Out"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Eye className="h-3 w-3 text-white" />
                                  </div>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">—</span>
                              )}
                            </div>
                          </td>

                          {/* Break In */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono font-bold text-blue-700">
                                {formatIstTimeDisplay(r.intermidiate_off_in_time)}
                              </span>
                              {r.intermidiate_off_in_image ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectImage({
                                    url: formatPhotoUrl(r.intermidiate_off_in_image),
                                    title: `Break In (Uncropped) - ${r.name_of_technician} (${r.attendance_date})`
                                  })}
                                  className="group relative h-8 w-11 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-blue-500 transition cursor-pointer"
                                  title="Click to inspect full uncropped photo"
                                >
                                  <img
                                    src={formatPhotoUrl(r.intermidiate_off_in_image)}
                                    alt="Break In"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Eye className="h-3 w-3 text-white" />
                                  </div>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">—</span>
                              )}
                            </div>
                          </td>

                          {/* Out Time */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono font-bold text-purple-700">
                                {formatIstTimeDisplay(r.on_duty_out_time)}
                              </span>
                              {r.on_duty_out_image ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectImage({
                                    url: formatPhotoUrl(r.on_duty_out_image),
                                    title: `Shift Out (Uncropped) - ${r.name_of_technician} (${r.attendance_date})`
                                  })}
                                  className="group relative h-8 w-11 overflow-hidden rounded-md border border-slate-200 bg-slate-900 shadow-2xs hover:scale-110 hover:border-purple-500 transition cursor-pointer"
                                  title="Click to inspect full uncropped photo"
                                >
                                  <img
                                    src={formatPhotoUrl(r.on_duty_out_image)}
                                    alt="Shift Out"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE_SVG; }}
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Eye className="h-3 w-3 text-white" />
                                  </div>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">—</span>
                              )}
                            </div>
                          </td>

                          {/* Gross Hours */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {Number(r.total_working_hrs || 0).toFixed(2)}
                          </td>

                          {/* Break Hours */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                            {Number(r.total_break_hrs || 0).toFixed(2)}
                          </td>

                          {/* Effective Hours */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {effective.toFixed(2)} hrs
                            </span>
                          </td>

                          {/* Audit Trail & Remarks */}
                          <td className="py-3 px-4 text-[10px] text-slate-500 whitespace-nowrap">
                            {r.last_edited_by && (
                              <div className="font-medium text-slate-700">
                                By: <span className="font-mono text-sky-700">{r.last_edited_by}</span>
                              </div>
                            )}
                            {r.admin_remarks && (
                              <div className="text-slate-600 truncate max-w-[140px]" title={r.admin_remarks}>
                                💬 {r.admin_remarks}
                              </div>
                            )}
                          </td>

                          {/* Edit Action */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => loadRecordForEditing(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-[11px] transition cursor-pointer border border-indigo-200 hover:border-indigo-600"
                              title="Manually edit this attendance record"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ADD ATTENDANCE (MANUAL ENTRY)                                       */}
      {/* ========================================================================= */}
      {activeTab === 'add' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="p-6 md:p-8 rounded-3xl border border-emerald-100 bg-white/95 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-5 mb-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 text-2xl shadow-inner">
                <PlusCircle className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-lg font-black text-slate-900">Add Attendance Record</h3>
                <p className="text-xs text-slate-500">
                  Manually record full 4-part attendance for a staff member (No camera capture required).
                </p>
              </div>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Attendance Date */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                    Attendance Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={addForm.attendance_date}
                    onChange={(e) => setAddForm({ ...addForm, attendance_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Employee Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Select Technician / Employee <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={addForm.emp_code_of_thetechnician}
                    onChange={(e) => handleAddEmployeeSelect(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.employee_code} value={emp.employee_code}>
                        {emp.employee_code} - {emp.employee_name} ({emp.center_name || emp.center_code || 'Main Center'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected Employee Badge */}
              {addForm.emp_code_of_thetechnician && (
                <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-emerald-950">
                      {addForm.name_of_technician} ({addForm.emp_code_of_thetechnician})
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-700">
                    Center: {addForm.center_code || 'Main Center'}
                  </span>
                </div>
              )}

              {/* 4 Attendance Checkpoints (Times) */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  Checkpoint Timestamps (IST 24-Hour Format)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* 1. On Duty In Time */}
                  <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-emerald-800 mb-1">
                      1. On Duty In Time
                    </label>
                    <input
                      type="time"
                      value={addForm.on_duty_in_time}
                      onChange={(e) => setAddForm({ ...addForm, on_duty_in_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Morning check-in</div>
                  </div>

                  {/* 2. Break Out Time */}
                  <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-amber-800 mb-1">
                      2. Break Out Time
                    </label>
                    <input
                      type="time"
                      value={addForm.intermidiate_off_out_time}
                      onChange={(e) => setAddForm({ ...addForm, intermidiate_off_out_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Lunch/Break departure</div>
                  </div>

                  {/* 3. Break In Time */}
                  <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-blue-800 mb-1">
                      3. Break In Time
                    </label>
                    <input
                      type="time"
                      value={addForm.intermidiate_off_in_time}
                      onChange={(e) => setAddForm({ ...addForm, intermidiate_off_in_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Lunch/Break return</div>
                  </div>

                  {/* 4. On Duty Out Time */}
                  <div className="p-3 bg-white rounded-xl border border-purple-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-purple-800 mb-1">
                      4. On Duty Out Time
                    </label>
                    <input
                      type="time"
                      value={addForm.on_duty_out_time}
                      onChange={(e) => setAddForm({ ...addForm, on_duty_out_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-purple-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Evening check-out</div>
                  </div>
                </div>
              </div>

              {/* Admin Remarks */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Admin Remarks / Reason
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Added manual attendance record as per manager approval..."
                  value={addForm.admin_remarks}
                  onChange={(e) => setAddForm({ ...addForm, admin_remarks: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Live Arithmetic Computation Box */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Live Working Hours Calculation
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Logged by: <span className="font-mono text-white font-bold">{user?.employee_code || 'ADMIN'}</span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Gross Hours</div>
                    <div className="font-mono text-lg font-black text-white mt-1">
                      {addCalculations.grossHours.toFixed(2)} <span className="text-xs text-slate-400 font-sans">hrs</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-800/80 rounded-xl border border-amber-900/50">
                    <div className="text-[10px] font-bold text-amber-400 uppercase">Total Break</div>
                    <div className="font-mono text-lg font-black text-amber-400 mt-1">
                      {addCalculations.breakHours.toFixed(2)} <span className="text-xs text-amber-400/70 font-sans">hrs</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-950/60 rounded-xl border border-emerald-600">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase">Effective Hours</div>
                    <div className="font-mono text-lg font-black text-emerald-400 mt-1">
                      {addCalculations.effectiveHours.toFixed(2)} <span className="text-xs text-emerald-400/70 font-sans">hrs</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('summary')}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingAdd || !addForm.emp_code_of_thetechnician}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer disabled:opacity-50"
                >
                  {submittingAdd ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Saving Attendance...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save &amp; Record Attendance</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EDIT ATTENDANCE (MANUAL CORRECTION)                                  */}
      {/* ========================================================================= */}
      {activeTab === 'edit' && (
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Search / Lookup Bar for Editing */}
          <div className="p-5 rounded-3xl border border-indigo-100 bg-white/95 shadow-md backdrop-blur-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-indigo-600" />
              Select Date &amp; Employee to Edit
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Attendance Date
                </label>
                <input
                  type="date"
                  value={editSearchDate}
                  onChange={(e) => setEditSearchDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Employee / Technician
                </label>
                <select
                  value={editSearchEmpCode}
                  onChange={(e) => setEditSearchEmpCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none bg-white"
                >
                  <option value="">-- Choose Employee to Edit --</option>
                  {employees.map((emp) => (
                    <option key={emp.employee_code} value={emp.employee_code}>
                      {emp.employee_code} - {emp.employee_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleEditSearchLookup}
                  disabled={loadingEditRecord || !editSearchEmpCode}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {loadingEditRecord ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Loading Record...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-3.5 w-3.5" />
                      <span>Load Attendance</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Edit Form Container */}
          <div className="p-6 md:p-8 rounded-3xl border border-indigo-100 bg-white/95 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-5 mb-6">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 text-2xl shadow-inner">
                  <Edit3 className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {editForm.name_of_technician
                      ? `Edit Attendance: ${editForm.name_of_technician} (${editForm.emp_code_of_thetechnician})`
                      : 'Edit Attendance Record'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Date: <span className="font-bold text-indigo-700">{editForm.attendance_date}</span> · Modify forgotten or incorrect timestamps (No camera capture required).
                  </p>
                </div>
              </div>

              {selectedRecordToEdit?.last_edited_by && (
                <div className="hidden sm:block text-right">
                  <div className="text-[10px] text-slate-400">Previous Edit</div>
                  <div className="text-[11px] font-mono font-bold text-slate-700">
                    {selectedRecordToEdit.last_edited_by}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-6">
              {/* 4 Attendance Checkpoints (Times) */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-600" />
                  Adjust Checkpoint Timestamps (IST 24-Hour Format)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* 1. On Duty In Time */}
                  <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-emerald-800 mb-1">
                      1. On Duty In Time
                    </label>
                    <input
                      type="time"
                      value={editForm.on_duty_in_time}
                      onChange={(e) => setEditForm({ ...editForm, on_duty_in_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Morning check-in</div>
                  </div>

                  {/* 2. Break Out Time */}
                  <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-amber-800 mb-1">
                      2. Break Out Time
                    </label>
                    <input
                      type="time"
                      value={editForm.intermidiate_off_out_time}
                      onChange={(e) => setEditForm({ ...editForm, intermidiate_off_out_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Lunch departure</div>
                  </div>

                  {/* 3. Break In Time */}
                  <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-blue-800 mb-1">
                      3. Break In Time
                    </label>
                    <input
                      type="time"
                      value={editForm.intermidiate_off_in_time}
                      onChange={(e) => setEditForm({ ...editForm, intermidiate_off_in_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Lunch return</div>
                  </div>

                  {/* 4. On Duty Out Time */}
                  <div className="p-3 bg-white rounded-xl border border-purple-200 shadow-2xs">
                    <label className="block text-[11px] font-bold text-purple-800 mb-1">
                      4. On Duty Out Time
                    </label>
                    <input
                      type="time"
                      value={editForm.on_duty_out_time}
                      onChange={(e) => setEditForm({ ...editForm, on_duty_out_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">Evening check-out</div>
                  </div>
                </div>
              </div>

              {/* Admin Remarks */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Admin Remarks / Correction Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Corrected evening out time due to late jobcard completion..."
                  value={editForm.admin_remarks}
                  onChange={(e) => setEditForm({ ...editForm, admin_remarks: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Live Arithmetic Computation Box */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                  <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Updated Shift Calculation Preview
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Last Edited By: <span className="font-mono text-white font-bold">{user?.employee_code || 'ADMIN'}</span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Gross Hours</div>
                    <div className="font-mono text-lg font-black text-white mt-1">
                      {editCalculations.grossHours.toFixed(2)} <span className="text-xs text-slate-400 font-sans">hrs</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-800/80 rounded-xl border border-amber-900/50">
                    <div className="text-[10px] font-bold text-amber-400 uppercase">Total Break</div>
                    <div className="font-mono text-lg font-black text-amber-400 mt-1">
                      {editCalculations.breakHours.toFixed(2)} <span className="text-xs text-amber-400/70 font-sans">hrs</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-indigo-950/60 rounded-xl border border-indigo-500">
                    <div className="text-[10px] font-bold text-indigo-400 uppercase">Effective Hours</div>
                    <div className="font-mono text-lg font-black text-indigo-400 mt-1">
                      {editCalculations.effectiveHours.toFixed(2)} <span className="text-xs text-indigo-400/70 font-sans">hrs</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('summary')}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Back to Summary
                </button>

                <button
                  type="submit"
                  disabled={submittingEdit || !editForm.emp_code_of_thetechnician}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs shadow-md shadow-indigo-600/20 hover:from-indigo-700 hover:to-purple-700 transition cursor-pointer disabled:opacity-50"
                >
                  {submittingEdit ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Updating Attendance...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Update Attendance Record</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
