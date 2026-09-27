import React from 'react';
import { User, Building, Phone, Mail, Shield, CheckCircle, Clock } from 'lucide-react';

interface ProfileViewProps {
  user: any;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user }) => {
  return (
    <div className="p-6 md:p-8 rounded-2xl border border-sky-100/90 shadow-lg bg-white/90 backdrop-blur-xl max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
          {user.employee_name?.charAt(0) || 'U'}
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{user.employee_name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
              {user.employee_code}
            </span>
            <span className="text-xs font-semibold text-slate-500">· {user.user_role}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            Assigned Workshop Center
          </div>
          <div className="font-bold text-slate-800 text-sm mt-1">{user.center_name || 'Premji Headquarters'}</div>
          <div className="text-slate-500 font-mono">Code: {user.center_code || 'HQ01'}</div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-500" />
            Enterprise Role & Permissions
          </div>
          <div className="font-bold text-slate-800 text-sm mt-1">{user.user_role}</div>
          <div className="text-slate-500">Access: Verified Staff</div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-slate-500" />
            Contact Mobile
          </div>
          <div className="font-bold text-slate-800 font-mono mt-1">{user.mobile_no || '+91 (Registered in ERP)'}</div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            Official Email
          </div>
          <div className="font-bold text-slate-800 mt-1">{user.email || `${user.employee_code.toLowerCase()}@premji.com`}</div>
        </div>
      </div>

      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold">Account Status: Active & Operational</span>
        </div>
        <span className="font-mono text-[11px] text-emerald-700">Security: Verified</span>
      </div>
    </div>
  );
};
