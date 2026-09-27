import React, { useState } from 'react';
import { Users, AlertCircle } from 'lucide-react';
import { AttendanceCapture } from './AttendanceCapture';

interface MarkAttendanceOtherProps {
  user: any;
  technicians: any[];
  onNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  onInspectImage: (img: { url: string; title: string }) => void;
}

export const MarkAttendanceOther: React.FC<MarkAttendanceOtherProps> = ({
  user,
  technicians,
  onNotification,
  onInspectImage
}) => {
  const [selectedTechCode, setSelectedTechCode] = useState('');

  // Filter technicians to this center
  const centerTechs = technicians.filter(
    (t) => (!user.center_code || t.center_code === user.center_code) && t.employee_code !== user.employee_code
  );

  const selectedTech = centerTechs.find((t) => t.employee_code === selectedTechCode);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Dropdown Selection Card */}
      <div className="p-6 rounded-2xl border border-sky-100/90 shadow-md bg-white/90 backdrop-blur-xl">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-sky-600" />
          Mark Attendance for the Other
        </h2>
        <p className="text-xs text-slate-500 font-medium mb-4">
          Team Leader proxy verification for technicians at <span className="font-semibold text-slate-800">{user.center_name || user.center_code}</span>
        </p>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Select Technician:
          </label>
          <select
            value={selectedTechCode}
            onChange={(e) => setSelectedTechCode(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500 shadow-xs"
          >
            <option value="">Choose a Technician from {user.center_name || user.center_code}...</option>
            {centerTechs.map((t) => (
              <option key={t.employee_code} value={t.employee_code}>
                {t.employee_name} ({t.employee_code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Single-Frame Flow for selected technician */}
      {selectedTech ? (
        <AttendanceCapture
          user={user}
          targetEmployee={selectedTech}
          onNotification={onNotification}
          onInspectImage={onInspectImage}
        />
      ) : (
        <div className="p-12 text-center text-slate-400 italic text-xs bg-white/60 rounded-2xl border border-dashed border-slate-200">
          Please select a technician from the dropdown above to load their attendance capture frame.
        </div>
      )}
    </div>
  );
};
