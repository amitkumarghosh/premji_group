import React, { useState, useEffect } from 'react';
import {
  Clock,
  Briefcase,
  FileText,
  Settings,
  Users,
  Calendar,
  RefreshCw,
  User,
  LogOut,
  X,
  RotateCw,
  Download,
  AlertTriangle,
  Building2,
  Shield,
  Eye,
  EyeOff,
  Car
} from 'lucide-react';

import { AttendanceCapture } from './components/AttendanceCapture';
import { MarkAttendanceOther } from './components/MarkAttendanceOther';
import { WorkOrdersView } from './components/WorkOrdersView';
import { CreateUpdateWO } from './components/CreateUpdateWO';
import { AdministrationView } from './components/AdministrationView';
import { AttendanceRecordsView } from './components/AttendanceRecordsView';
import { UpdateWOStatusView } from './components/UpdateWOStatusView';
import { ProfileView } from './components/ProfileView';
import { VehicleModelsView } from './components/VehicleModelsView';
import { authFetch } from './utils/api';

export type ActiveTab =
  | 'attendance'
  | 'mark-other'
  | 'workorders'
  | 'create-update-wo'
  | 'administration'
  | 'admin-report'
  | 'update-wo-status'
  | 'vehicle-models'
  | 'profile';

interface CurrentUser {
  employee_code: string;
  employee_name: string;
  user_role: 'Technician' | 'Accounts' | 'Engineer' | 'TeamLeader' | 'Admin' | 'Super Admin';
  center_code: string | null;
  center_name: string | null;
  user_details?: string | null;
  employee_doj?: string | null;
  employee_status?: string | null;
}

// Robust role normalizer to guarantee seamless navigation across all role variants
function normalizeUser(rawUser: any): CurrentUser | null {
  if (!rawUser) return null;
  const rawRole = String(rawUser.user_role || '').toLowerCase().replace(/[\s_-]+/g, '');
  let normalizedRole: CurrentUser['user_role'] = 'Technician';
  if (rawRole.includes('super')) {
    normalizedRole = 'Super Admin';
  } else if (rawRole.includes('admin')) {
    normalizedRole = 'Admin';
  } else if (rawRole.includes('lead') || rawRole === 'tl') {
    normalizedRole = 'TeamLeader';
  } else if (rawRole.includes('account')) {
    normalizedRole = 'Accounts';
  } else if (rawRole.includes('engineer')) {
    normalizedRole = 'Engineer';
  } else {
    normalizedRole = 'Technician';
  }

  return {
    employee_code: String(rawUser.employee_code || '').trim(),
    employee_name: String(rawUser.employee_name || 'Staff Member').trim(),
    user_role: normalizedRole,
    center_code: rawUser.center_code || null,
    center_name: rawUser.center_name || null,
    user_details: rawUser.user_details || null,
    employee_doj: rawUser.employee_doj || null,
    employee_status: rawUser.employee_status || 'Active'
  };
}

export default function App() {
  // If there is no existing token, isVerifyingSession is immediately FALSE so Login renders on frame 1
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(() => {
    return !!(localStorage.getItem('premji_token') && localStorage.getItem('premji_user'));
  });

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loginCode, setLoginCode] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('attendance');

  // Lookups
  const [centers, setCenters] = useState<any[]>([]);
  const [allTechnicians, setAllTechnicians] = useState<any[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  // Notifications
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Lightbox Image Inspector
  const [inspectImage, setInspectImage] = useState<{ url: string; title: string } | null>(null);
  const [inspectRotation, setInspectRotation] = useState(0);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const hasToken = localStorage.getItem('premji_token');
    const hasUser = localStorage.getItem('premji_user');

    if (!hasToken || !hasUser) {
      setUser(null);
      setIsVerifyingSession(false);
      setAuthLoading(false);
      return;
    }

    try {
      const res = await authFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          const validatedUser = normalizeUser(data.user);
          setUser(validatedUser);
          localStorage.setItem('premji_user', JSON.stringify(validatedUser));
        } else {
          localStorage.removeItem('premji_token');
          localStorage.removeItem('premji_user');
          setUser(null);
        }
      } else {
        localStorage.removeItem('premji_token');
        localStorage.removeItem('premji_user');
        setUser(null);
      }
    } catch (e) {
      console.warn('Session check failed', e);
      localStorage.removeItem('premji_token');
      localStorage.removeItem('premji_user');
      setUser(null);
    } finally {
      setIsVerifyingSession(false);
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginCode || !loginPassword) {
      setLoginError('Please enter both employee code and password.');
      return;
    }

    try {
      setLoginError('');
      setAuthLoading(true);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ employee_code: loginCode.trim(), password: loginPassword })
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (res.ok && data.success) {
        const validatedUser = normalizeUser(data.user);
        if (data.token) {
          localStorage.setItem('premji_token', data.token);
        }
        localStorage.setItem('premji_user', JSON.stringify(validatedUser));
        setUser(validatedUser);
        setActiveTab('attendance');
        showNotification(`Welcome back, ${validatedUser?.employee_name}!`, 'success');
      } else {
        const errorMsg = data.error || data.details || (
          !res.ok
            ? `Server Error (${res.status}): ${res.statusText || 'Unable to process login. Please check server logs and database connection.'}`
            : 'Authentication failed. Please verify employee code and password.'
        );
        setLoginError(errorMsg);
      }
    } catch (e: any) {
      setLoginError(e?.message || 'Server connection error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      localStorage.removeItem('premji_token');
      localStorage.removeItem('premji_user');
      setUser(null);
      setLoginCode('');
      setLoginPassword('');
      showNotification('Logged out successfully', 'info');
    }
  };

  // Load common lookups when user signs in
  useEffect(() => {
    if (user) {
      loadCenters();
      loadTechnicians();
      loadManufacturers();
    }
  }, [user]);

  const loadCenters = async () => {
    try {
      const res = await authFetch('/api/centers');
      if (res.ok) {
        const data = await res.json();
        setCenters(data.centers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTechnicians = async () => {
    try {
      const res = await authFetch('/api/employees');
      if (res.ok) {
        const data = await res.json();
        const techs = (data.employees || []).filter((emp: any) =>
          ['Technician', 'Accounts', 'Engineer'].includes(emp.user_role)
        );
        setAllTechnicians(techs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadManufacturers = async () => {
    try {
      const res = await authFetch('/api/workorders/lookup');
      if (res.ok) {
        const data = await res.json();
        setManufacturers(data.manufacturers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadModelsForManufacturer = async (mfr: string) => {
    try {
      const res = await authFetch(`/api/workorders/lookup-models?manufacturer=${encodeURIComponent(mfr)}`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // EXACT ROLE-BASED NAVIGATION ITEMS PER SPECIFICATION
  const getNavItems = () => {
    if (!user) return [];

    // Technician, Accounts, Engineer all share the exact same permissions and tabs
    if (['Technician', 'Accounts', 'Engineer'].includes(user.user_role)) {
      return [
        { id: 'attendance', label: 'Attendance', icon: Clock },
        { id: 'profile', label: 'Profile', icon: User }
      ];
    }

    if (user.user_role === 'TeamLeader') {
      return [
        { id: 'attendance', label: 'Attendance', icon: Clock },
        { id: 'mark-other', label: 'Mark attendance for other', icon: Users },
        { id: 'workorders', label: 'View Work Orders', icon: Briefcase },
        { id: 'create-update-wo', label: 'Manage Work Orders', icon: FileText },
        { id: 'profile', label: 'Profile', icon: User }
      ];
    }

    // Admin & Super Admin: Direct navigation to Vehicle Model & Variant above Profile
    return [
      { id: 'attendance', label: 'Attendance', icon: Clock },
      { id: 'administration', label: 'Administration', icon: Settings },
      { id: 'admin-report', label: 'Attendance Records', icon: Calendar },
      { id: 'workorders', label: 'View Work Orders', icon: Briefcase },
      { id: 'update-wo-status', label: 'Update workorder status', icon: RefreshCw },
      { id: 'vehicle-models', label: 'Vehicle Model & Variant', icon: Car },
      { id: 'profile', label: 'Profile', icon: User }
    ];
  };

  // Enforce tab access security
  useEffect(() => {
    if (user) {
      if (['Technician', 'Accounts', 'Engineer'].includes(user.user_role)) {
        if (!['attendance', 'profile'].includes(activeTab)) {
          setActiveTab('attendance');
        }
      } else if (user.user_role === 'TeamLeader') {
        if (['administration', 'admin-report', 'update-wo-status', 'vehicle-models'].includes(activeTab)) {
          setActiveTab('workorders');
        }
      } else if (['Admin', 'Super Admin'].includes(user.user_role)) {
        if (['mark-other', 'create-update-wo'].includes(activeTab)) {
          setActiveTab('workorders');
        }
      }
    }
  }, [user, activeTab]);

  const navItems = getNavItems();

  // HIGH-TECH BRANDED PROGRESS ANIMATION (While restoring existing session)
  if (isVerifyingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden text-white">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center max-w-sm text-center relative z-10">
          <div className="w-16 h-16 mb-4 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-sky-500/25 animate-pulse">
            <span className="text-3xl">🚗</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">PREMJI GROUPS</h1>
          <p className="text-xs text-sky-300 font-semibold tracking-wider uppercase mt-1">Enterprise Operations Portal</p>

          <div className="w-56 h-1.5 bg-slate-800 rounded-full mt-6 overflow-hidden relative">
            <div className="h-full bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-500 rounded-full animate-indeterminate" />
          </div>
          <span className="text-[11px] text-slate-400 mt-3 font-medium">Connecting to secure workspace...</span>
        </div>
      </div>
    );
  }

  // AUTHENTICATION LOGIN SCREEN - Instant Landing Page when unauthenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient Aurora Gradient Orbs */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-white/10 backdrop-blur-2xl border border-white/20 p-8 rounded-3xl shadow-2xl text-white relative z-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/25">
              <span className="text-2xl">🚗</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">PREMJI GROUPS</h1>
            <p className="text-xs text-sky-200/80 font-medium tracking-wide uppercase mt-1">Enterprise Operations Portal</p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 uppercase tracking-wider">Employee Code</label>
              <input
                type="text"
                required
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                placeholder="e.g. PS027 or PS001"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-4 pr-11 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition focus:outline-none cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5 text-sky-300" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl font-bold tracking-wide transition shadow-lg shadow-sky-500/25 cursor-pointer mt-2 text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {authLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Verifying & Loading Workspace...</span>
                </>
              ) : (
                <span>Sign In to Workshop Portal</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // MAIN PORTAL VIEW
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row relative">
      {/* Dynamic Notification Toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold text-white flex items-center gap-2 transition-all transform animate-bounce ${
            notification.type === 'success'
              ? 'bg-emerald-600'
              : notification.type === 'error'
              ? 'bg-rose-600'
              : 'bg-sky-600'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 shadow-xl">
        <div>
          {/* Brand */}
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm">
                P
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tight text-white leading-tight">PREMJI GROUPS</h1>
                <p className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Enterprise Portal</p>
              </div>
            </div>
          </div>

          {/* User Quick Info */}
          {user && (
            <div className="p-4 mx-3 my-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-600/30 text-sky-400 flex items-center justify-center font-bold text-xs">
                {user.employee_name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">{user.employee_name}</div>
                <div className="text-[10px] text-slate-400 font-mono truncate">{user.employee_code} · {user.user_role}</div>
              </div>
            </div>
          )}

          {/* Nav Items */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as ActiveTab)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content Area with Top Header Bar including Most Top-Right Sign Out Button */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top Header Bar */}
        <header className="bg-white border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between shadow-2xs shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <span className="text-slate-400 font-normal">Section:</span>
              <span className="capitalize text-sky-700">{activeTab.replace(/-/g, ' ')}</span>
            </div>
            {user?.center_name && (
              <span className="hidden sm:inline-block px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-full text-[11px] font-medium">
                📍 {user.center_name}
              </span>
            )}
          </div>

          {/* Most Top Right Sign Out Button (per explicit user request) */}
          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-800">{user.employee_name}</span>
                <span className="text-[10px] text-slate-400 font-mono">{user.employee_code} ({user.user_role})</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3.5 py-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Dynamic Main Body */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {user && activeTab === 'attendance' && (
            <AttendanceCapture
              user={user}
              onNotification={showNotification}
              onInspectImage={setInspectImage}
            />
          )}

          {user && activeTab === 'mark-other' && (
            <MarkAttendanceOther
              user={user}
              technicians={allTechnicians}
              onNotification={showNotification}
              onInspectImage={setInspectImage}
            />
          )}

          {user && activeTab === 'workorders' && (
            <WorkOrdersView
              user={user}
              centers={centers}
              onNotification={showNotification}
              onInspectImage={setInspectImage}
            />
          )}

          {user && activeTab === 'create-update-wo' && (
            <CreateUpdateWO
              user={user}
              technicians={allTechnicians}
              manufacturers={manufacturers}
              models={models}
              onSelectManufacturer={loadModelsForManufacturer}
              onNotification={showNotification}
            />
          )}

          {user && activeTab === 'administration' && (
            <AdministrationView
              user={user}
              centers={centers}
              onNotification={showNotification}
              onRefreshCenters={loadCenters}
            />
          )}

          {user && activeTab === 'admin-report' && (
            <AttendanceRecordsView
              user={user}
              centers={centers}
              onNotification={showNotification}
              onInspectImage={setInspectImage}
            />
          )}

          {user && activeTab === 'update-wo-status' && (
            <UpdateWOStatusView
              user={user}
              technicians={allTechnicians}
              onNotification={showNotification}
            />
          )}

          {user && activeTab === 'vehicle-models' && (
            <VehicleModelsView
              onNotification={showNotification}
              onRefreshLookups={loadManufacturers}
            />
          )}

          {user && activeTab === 'profile' && (
            <ProfileView user={user} />
          )}

          {/* Safe Fallback: Guarantees main content view is never blank */}
          {user && !['attendance', 'mark-other', 'workorders', 'create-update-wo', 'administration', 'admin-report', 'update-wo-status', 'vehicle-models', 'profile'].includes(activeTab) && (
            <AttendanceCapture
              user={user}
              onNotification={showNotification}
              onInspectImage={setInspectImage}
            />
          )}
        </main>
      </div>

      {/* High-Resolution Photo Lightbox / Zoom Modal */}
      {inspectImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
              <span className="text-xs font-bold">{inspectImage.title}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInspectRotation((r) => (r + 90) % 360)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300"
                  title="Rotate 90deg"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <a
                  href={inspectImage.url}
                  download="premji_capture.webp"
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300"
                  title="Download Image"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => { setInspectImage(null); setInspectRotation(0); }}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 flex items-center justify-center bg-black min-h-[360px]">
              <img
                src={inspectImage.url}
                alt="Enlarged Inspection"
                style={{ transform: `rotate(${inspectRotation}deg)` }}
                className="max-h-[70vh] max-w-full object-contain transition-transform duration-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
