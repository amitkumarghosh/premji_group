import React, { useState, useEffect } from 'react';
import { AttendanceRecordsView } from '../../../components/AttendanceRecordsView.tsx';
import { downloadImageAsFormat } from '../../../utils/imageDownload.ts';
import { RotateCw, Download, X } from 'lucide-react';

export default function AdminAttendancePage() {
  const [user, setUser] = useState<any>(null);
  const [centers, setCenters] = useState<any[]>([]);
  const [inspectImage, setInspectImage] = useState<{ url: string; title: string } | null>(null);
  const [inspectRotation, setInspectRotation] = useState(0);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    // Load current user profile & centers
    const loadInit = async () => {
      try {
        const token = localStorage.getItem('premji_token') || '';
        const userRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (userRes.ok) {
          const uData = await userRes.json();
          setUser(uData.user);
        }

        const centerRes = await fetch('/api/centers', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (centerRes.ok) {
          const cData = await centerRes.json();
          setCenters(cData.centers || []);
        }
      } catch (err) {
        console.error('Init error:', err);
      }
    };
    loadInit();
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-900/5 p-4 sm:p-6 lg:p-8">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-2xl px-4 py-3 text-xs font-bold shadow-xl backdrop-blur-md transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-600/30'
              : notification.type === 'error'
              ? 'bg-rose-600 text-white shadow-rose-600/30'
              : 'bg-sky-600 text-white shadow-sky-600/30'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Main Attendance Records View (3 Tabs: Search/Summary, Add Attendance, Edit Attendance) */}
      <AttendanceRecordsView
        user={user || { user_role: 'Admin', employee_code: 'ADMIN' }}
        centers={centers}
        onNotification={showNotification}
        onInspectImage={setInspectImage}
      />

      {/* High-Resolution Photo Lightbox / Zoom Modal */}
      {inspectImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
              <span className="text-xs font-bold">{inspectImage.title}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectRotation((r) => (r + 90) % 360)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition cursor-pointer"
                  title="Rotate 90deg"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadImageAsFormat(inspectImage.url, inspectImage.title, 'jpeg', inspectRotation)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600 rounded-lg text-[11px] font-bold text-slate-200 hover:text-white flex items-center gap-1 transition cursor-pointer"
                  title="Download in JPEG format"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JPEG</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadImageAsFormat(inspectImage.url, inspectImage.title, 'png', inspectRotation)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-indigo-600 rounded-lg text-[11px] font-bold text-slate-200 hover:text-white flex items-center gap-1 transition cursor-pointer"
                  title="Download in PNG format"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setInspectImage(null); setInspectRotation(0); }}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition cursor-pointer"
                  title="Close"
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
