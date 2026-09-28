import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

import { initDatabase, db, isConnectionError } from './db/db_adapter.ts';
import { sftpStorage } from './db/sftp_adapter.ts';
import { jwtUtil, type JwtPayload } from './db/jwt.ts';
import {
  getIstNow,
  getIstDateString,
  getIstDateTimeString,
  getIstTimeString,
  calculateHours,
  calculateEffectiveHours,
  formatIstTimeDisplay
} from './lib/ist-time.ts';

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom Request interface to support JWT user context
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export async function createExpressApp() {
  // Initialize DB Connection safely
  await initDatabase();

  const app = express();

  // High-performance payload limits for WebP Base64 camera uploads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Minimal Cookie Parser Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const rawCookies = req.headers.cookie || '';
    const cookies: Record<string, string> = {};
    rawCookies.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const name = parts[0]?.trim();
      const val = parts.slice(1).join('=')?.trim();
      if (name) {
        cookies[name] = decodeURIComponent(val);
      }
    });
    (req as any).cookies = cookies;
    next();
  });

  // JWT Auth context middleware (supports both Bearer headers and cookies)
  app.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let token = (req as any).cookies?.premji_session;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
    if (token) {
      const decoded = jwtUtil.verify(token);
      if (decoded) {
        req.user = decoded;
      }
    }
    next();
  });

  // Role Gate Middlewares
  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  };

  const requireRole = (allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (!allowedRoles.includes(req.user.user_role)) {
        return res.status(403).json({ error: 'Access denied: insufficient permissions' });
      }
      next();
    };
  };

  // ==================== SYSTEM & DB DIAGNOSTICS ====================

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      platform: process.env.VERCEL ? 'vercel-serverless' : 'node-server'
    });
  });

  app.get('/api/db-status', async (req: Request, res: Response) => {
    try {
      const centers = await db.getAllCenters();
      res.json({
        success: true,
        database: 'connected',
        centers_count: centers.length,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Database connection error'
      });
    }
  });

  // ==================== AUTHENTICATION API ====================

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { employee_code, password } = req.body;
      if (!employee_code || !password) {
        return res.status(400).json({ error: 'Employee code and password are required' });
      }

      const cleanCode = String(employee_code).trim();
      const cleanPass = String(password);

      const emp = await db.getEmployeeByCode(cleanCode, false);
      if (!emp) {
        return res.status(401).json({ error: 'Employee code not found. Please verify your ID.' });
      }

      // Inactive check: Login is not possible if the employee status is inactive
      if (emp.employee_status === 'Inactive' || emp.employee_status === '0') {
        return res.status(403).json({
          error: 'Your employee account is marked Inactive. Login is not permitted. Please contact your administrator.'
        });
      }

      // Password comparison (direct or trimmed)
      if (emp.password !== cleanPass && emp.password?.trim() !== cleanPass.trim()) {
        return res.status(401).json({ error: 'Incorrect password. Please check your credentials or show password to verify.' });
      }

      // Create JWT session
      const token = jwtUtil.sign({
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        user_role: emp.user_role,
        center_code: emp.center_code,
        center_name: emp.center_name,
      });

      // Secure Cookie deployment compatible with preview iframes (sameSite none, secure)
      res.cookie('premji_session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.json({
        success: true,
        token,
        user: {
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          user_role: emp.user_role,
          center_code: emp.center_code,
          center_name: emp.center_name,
        }
      });
    } catch (err: any) {
      console.error('Login error:', err);
      const isTimeout = isConnectionError(err) || String(err?.message || '').includes('ETIMEDOUT');
      const errorMsg = isTimeout
        ? 'Database connection timed out. Please try logging in again in a moment.'
        : (err?.message || 'Internal server error during login');
      return res.status(500).json({ error: errorMsg });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    res.clearCookie('premji_session');
    return res.json({ success: true, message: 'Logged out successfully' });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await db.getEmployeeByCode(req.user!.employee_code, false);
      if (!emp || emp.employee_status === 'Inactive' || emp.employee_status === '0') {
        res.clearCookie('premji_session');
        return res.status(403).json({ error: 'Your employee account is marked Inactive. Login is not permitted.' });
      }
      return res.json({
        user: {
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          user_role: emp.user_role,
          center_code: emp.center_code,
          center_name: emp.center_name,
          user_details: emp.user_details,
          employee_doj: emp.employee_doj,
          employee_status: emp.employee_status
        }
      });
    } catch {
      return res.json({ user: req.user });
    }
  });

  // ==================== ATTENDANCE API ====================

  // ==================== ATTENDANCE API ====================

  // Checkpoint Status & Punch API (Next.js route parity)
  app.get('/api/attendance/punch', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const empCode = (req.query.employee_code as string) || req.user!.employee_code;
      const todayIST = getIstDateString();
      const attendance = await db.getTodayAttendance(empCode, todayIST);
      const emp = await db.getEmployeeByCode(empCode, false);

      return res.json({
        success: true,
        today_date: todayIST,
        attendance: attendance || null,
        employee: emp ? {
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          center_name: emp.center_name,
          center_location: emp.center_location || 'Main Center',
          user_role: emp.user_role
        } : null
      });
    } catch (err: any) {
      console.error('Error fetching punch status:', err);
      return res.status(500).json({ error: 'Failed to retrieve punch status' });
    }
  });

  // Next.js Route parity & standard punch handler
  app.post(['/api/attendance/punch', '/api/attendance/mark'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { checkpoint, image, target_employee_code, admin_remarks } = req.body;
      if (!checkpoint || !image) {
        return res.status(400).json({ error: 'Checkpoint type and image are required' });
      }

      const validCheckpoints = ['on_duty_in', 'intermidiate_off_out', 'intermidiate_off_in', 'on_duty_out'];
      if (!validCheckpoints.includes(checkpoint)) {
        return res.status(400).json({ error: 'Invalid checkpoint key' });
      }

      let empCode = req.user!.employee_code;
      let empName = req.user!.employee_name;
      let centerCode = req.user!.center_code;
      let centerName = req.user!.center_name;
      let centerLocation = 'Main Center';

      if (target_employee_code && target_employee_code !== req.user!.employee_code) {
        if (!['TeamLeader', 'Admin', 'Super Admin'].includes(req.user!.user_role)) {
          return res.status(403).json({ error: 'Access denied: cannot mark attendance for team' });
        }
        const targetEmp = await db.getEmployeeByCode(target_employee_code, false);
        if (!targetEmp) {
          return res.status(404).json({ error: 'Target employee not found' });
        }
        empCode = targetEmp.employee_code;
        empName = targetEmp.employee_name;
        centerCode = targetEmp.center_code;
        centerName = targetEmp.center_name;
        centerLocation = targetEmp.center_location || 'Main Center';
      } else {
        const myDetails = await db.getEmployeeByCode(empCode, false);
        if (myDetails) {
          centerLocation = myDetails.center_location || 'Main Center';
        }
      }

      // Timezone locking: Asia/Kolkata
      const nowIST = getIstNow();
      const currentIstDateTime = getIstDateTimeString(nowIST);
      const istDateStr = getIstDateString(nowIST);
      const istTimeStr = getIstTimeString(nowIST, '24h');

      // Save image to storage
      const year = nowIST.getFullYear();
      const month = String(nowIST.getMonth() + 1).padStart(2, '0');
      const relativeFolder = `attendance/${year}/${month}`;
      const fileName = `${empCode}_${checkpoint}_${Date.now()}.jpg`;

      const savedVirtualPath = await sftpStorage.uploadImage(relativeFolder, fileName, image);
      const imageUrl = `/api/media/view?path=${savedVirtualPath}`;

      // Existing today record lookup
      const existing = await db.getTodayAttendance(empCode, istDateStr);

      const attPayload: any = {
        emp_code_of_thetechnician: empCode,
        name_of_technician: empName,
        center_code: centerCode,
        center_name: centerName,
        center_location: centerLocation,
        attendance_date: istDateStr,
        last_edit_timestamp: currentIstDateTime,
        last_edited_by: req.user!.employee_code
      };

      if (admin_remarks) {
        attPayload.admin_remarks = admin_remarks;
      }

      if (checkpoint === 'on_duty_in') {
        attPayload.on_duty_in_time = currentIstDateTime;
        attPayload.on_duty_in_image = imageUrl;
        if (!existing || !existing.all_innitial_time) {
          attPayload.all_innitial_time = currentIstDateTime;
        }
        attPayload.total_working_hrs = 0.00;
        attPayload.total_break_hrs = 0.00;
        attPayload.effective_working_hrs = 0.00;
      } else if (checkpoint === 'intermidiate_off_out') {
        attPayload.intermidiate_off_out_time = currentIstDateTime;
        attPayload.intermidiate_off_out_image = imageUrl;
      } else if (checkpoint === 'intermidiate_off_in') {
        attPayload.intermidiate_off_in_time = currentIstDateTime;
        attPayload.intermidiate_off_in_image = imageUrl;
        if (existing?.intermidiate_off_out_time) {
          attPayload.total_break_hrs = calculateHours(existing.intermidiate_off_out_time, currentIstDateTime, istDateStr);
        }
        if (existing?.on_duty_out_time && existing?.on_duty_in_time) {
          const totalWork = calculateHours(existing.on_duty_in_time, existing.on_duty_out_time, istDateStr);
          attPayload.total_working_hrs = totalWork;
          attPayload.effective_working_hrs = calculateEffectiveHours(totalWork, attPayload.total_break_hrs || 0);
        }
      } else if (checkpoint === 'on_duty_out') {
        // Endless re-punching: overwrite out time & photo, recalculate hours, keep all_innitial_time
        attPayload.on_duty_out_time = currentIstDateTime;
        attPayload.on_duty_out_image = imageUrl;

        const inTime = existing?.on_duty_in_time || currentIstDateTime;
        const totalWork = calculateHours(inTime, currentIstDateTime, istDateStr);
        attPayload.total_working_hrs = totalWork;

        let breakDuration = 0.00;
        if (existing?.intermidiate_off_out_time && existing?.intermidiate_off_in_time) {
          breakDuration = calculateHours(existing.intermidiate_off_out_time, existing.intermidiate_off_in_time, istDateStr);
        } else if (existing?.total_break_hrs) {
          breakDuration = Number(existing.total_break_hrs);
        }
        attPayload.total_break_hrs = breakDuration;
        attPayload.effective_working_hrs = calculateEffectiveHours(totalWork, breakDuration);
      }

      const success = await db.markAttendance(attPayload);
      if (!success) {
        return res.status(500).json({ error: 'Failed to write attendance log to database' });
      }

      const updatedRecord = await db.getTodayAttendance(empCode, istDateStr);
      const displayTime = formatIstTimeDisplay(currentIstDateTime);

      let msg = `Attendance checkpoint '${checkpoint}' logged at ${displayTime} IST`;
      if (checkpoint === 'on_duty_out' && existing?.on_duty_out_time) {
        msg = `🔄 On Duty Out updated at ${displayTime} IST. Effective: ${updatedRecord?.effective_working_hrs || '0.00'} hrs.`;
      }

      return res.json({
        success: true,
        message: msg,
        checkpoint,
        time: istTimeStr,
        date: istDateStr,
        display_time: displayTime,
        attendance: updatedRecord,
        metrics: {
          total_working_hrs: updatedRecord?.total_working_hrs ?? 0.00,
          total_break_hrs: updatedRecord?.total_break_hrs ?? 0.00,
          effective_working_hrs: updatedRecord?.effective_working_hrs ?? 0.00
        }
      });
    } catch (err: any) {
      console.error('Error marking attendance:', err);
      return res.status(500).json({ error: 'Failed to record attendance' });
    }
  });

  // Get current today status for standard checkpoint flows
  app.get('/api/attendance/today', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const empCode = req.query.employee_code as string || req.user!.employee_code;
      if (empCode !== req.user!.employee_code && !['TeamLeader', 'Admin', 'Super Admin'].includes(req.user!.user_role)) {
        return res.status(403).json({ error: 'Access denied: cannot view other attendance' });
      }

      const istDateStr = getIstDateString();
      const att = await db.getTodayAttendance(empCode, istDateStr);

      return res.json({ attendance: att, todayDate: istDateStr });
    } catch (err) {
      console.error('Error fetching today attendance:', err);
      return res.status(500).json({ error: 'Failed to retrieve today\'s attendance status' });
    }
  });

  // Fetch individual history
  app.get('/api/attendance/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = Number(req.query.limit || 30);
      const history = await db.getAttendanceHistory(req.user!.employee_code, limit);
      return res.json({ history });
    } catch (err) {
      console.error('Error fetching history:', err);
      return res.status(500).json({ error: 'Failed to fetch attendance history' });
    }
  });

  // Next.js Route parity & Aggregated Admin Attendance Summary
  app.get(['/api/admin/attendance/summary', '/api/attendance/admin-report'], requireAuth, requireRole(['Admin', 'Super Admin', 'TeamLeader']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { start_date, end_date, startDate, endDate, center_code, centerCode, employee_code, employeeCode, search } = req.query;
      
      let filterCenterCode = (centerCode || center_code) as string || '';
      if (req.user!.user_role === 'TeamLeader' && req.user!.center_code) {
        filterCenterCode = req.user!.center_code;
      }

      const report = await db.getAttendanceSummaryReport({
        startDate: (startDate || start_date) as string,
        endDate: (endDate || end_date) as string,
        centerCode: filterCenterCode,
        employeeCode: (employeeCode || employee_code) as string,
        search: search as string
      });

      return res.json({
        success: true,
        summary: report.summary,
        records: report.records
      });
    } catch (err) {
      console.error('Admin report error:', err);
      return res.status(500).json({ error: 'Failed to load master attendance report' });
    }
  });

  // ==================== WORK ORDERS API ====================

  // 1. View Work Orders (Role Enforced)
  app.get('/api/workorders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Technician: Block access entirely
      if (req.user!.user_role === 'Technician') {
        return res.status(403).json({ error: 'Access denied: Technicians are not authorized to access work orders.' });
      }

      const { search, jobcard_type, job_status, status, center_code, technician_code, start_date, end_date, limit, offset } = req.query;

      // TeamLeader: strictly locked to their assigned center_code
      let filterCenterCode = center_code as string;
      if (req.user!.user_role === 'TeamLeader') {
        filterCenterCode = req.user!.center_code || '';
      }

      const orders = await db.getWorkOrders({
        search: search as string,
        jobcard_type: jobcard_type as string,
        job_status: (job_status || status) as string,
        centerCode: filterCenterCode,
        technicianCode: technician_code as string,
        startDate: start_date as string,
        endDate: end_date as string,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0
      });

      return res.json(orders);
    } catch (err) {
      console.error('Error retrieving work orders:', err);
      return res.status(500).json({ error: 'Failed to retrieve work orders list' });
    }
  });

  // 2. Lookups for TeamLeader / Admin
  app.get('/api/workorders/open-jobs', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user!.user_role === 'Technician') {
        return res.status(403).json({ error: 'Access denied' });
      }
      const centerCode = req.user!.user_role === 'TeamLeader' ? req.user!.center_code || undefined : (req.query.center_code as string || undefined);
      const openJobs = await db.getOpenJobcards(centerCode);
      return res.json({ openJobs });
    } catch (err) {
      console.error('Error fetching open jobs:', err);
      return res.status(500).json({ error: 'Failed to fetch open jobs' });
    }
  });

  app.get('/api/workorders/closed-jobs', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user!.user_role === 'Technician') {
        return res.status(403).json({ error: 'Access denied' });
      }
      const centerCode = req.user!.user_role === 'TeamLeader' ? req.user!.center_code || undefined : (req.query.center_code as string || undefined);
      const days = Number(req.query.days || 30);
      const closedJobs = await db.getClosedJobcards(centerCode, days);
      return res.json({ closedJobs });
    } catch (err) {
      console.error('Error fetching closed jobs:', err);
      return res.status(500).json({ error: 'Failed to fetch closed jobs' });
    }
  });

  // 3. TeamLeader: Create Work Order (Mode 1 - "New workorder")
  app.post('/api/workorders/manage/create', requireAuth, requireRole(['TeamLeader']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        vehicle_manufacturer,
        vehicle_model,
        vehicle_variant,
        vehicle_registration_no,
        jobcard_no,
        jobcard_date,
        kilometres,
        name_of_service_advisor,
        technician_code,
        tl_remarks,
        jobcard_photo_base64
      } = req.body;

      if (!vehicle_manufacturer || !vehicle_model || !vehicle_registration_no || !jobcard_no) {
        return res.status(400).json({ error: 'Vehicle details, registration no, and jobcard no are required.' });
      }

      if (!jobcard_photo_base64) {
        return res.status(400).json({ error: 'Jobcard photo is mandatory.' });
      }

      // Date validation (<= today, >= today - 10 days)
      const nowIST = new Date();
      const todayISTStr = nowIST.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const tenDaysAgoStr = tenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      const jcDateStr = jobcard_date || todayISTStr;
      if (jcDateStr > todayISTStr || jcDateStr < tenDaysAgoStr) {
        return res.status(400).json({ error: `Jobcard date must be between ${tenDaysAgoStr} and ${todayISTStr}.` });
      }

      // Validation: Block if an in-progress work order with the same jobcard_no exists in that center
      const openExists = await db.checkOpenWorkOrderExists(req.user!.center_code || '', jobcard_no);
      if (openExists) {
        return res.status(400).json({
          error: '❌ Workorder already exists and is still In Progress. Please close or re-assign the existing workorder.'
        });
      }

      // Look up technician name if provided
      let techName: string | null = null;
      if (technician_code) {
        const tech = await db.getEmployeeByCode(technician_code);
        if (tech) techName = tech.employee_name;
      }

      // Upload photo
      const year = nowIST.getFullYear();
      const month = String(nowIST.getMonth() + 1).padStart(2, '0');
      const relativeFolder = `workorders/${year}/${month}`;
      const fileName = `JC_${jobcard_no}_${Date.now()}.webp`;
      const path = await sftpStorage.uploadImage(relativeFolder, fileName, jobcard_photo_base64);
      const photoUrl = `/api/media/view?path=${path}`;

      const insertId = await db.createWorkOrder({
        jobcard_type: 'New workorder',
        job_status: 'In Progress',
        job_assign_date: todayISTStr,
        jobcard_date: jcDateStr,
        jobcard_no,
        vehicle_manufacturer,
        vehicle_model,
        vehicle_variant: vehicle_variant || null,
        vehicle_registration_no,
        kilometres: kilometres ? Number(kilometres) : null,
        name_of_service_advisor: name_of_service_advisor || null,
        technician_code: technician_code || null,
        name_of_technician: techName,
        center_code: req.user!.center_code,
        center_name: req.user!.center_name,
        center_location: null,
        tl_id: req.user!.employee_code,
        tl_remarks: tl_remarks || null,
        jobcard_photo: photoUrl
      });

      return res.json({
        success: true,
        message: 'Work order created successfully',
        id: insertId,
        jobcard_no
      });
    } catch (err: any) {
      console.error('Work order create error:', err);
      return res.status(500).json({ error: err.message || 'Failed to create work order' });
    }
  });

  // 4. TeamLeader: Re-assign Work Order (Mode 2 - "Re-assign workorder")
  app.post('/api/workorders/manage/reassign', requireAuth, requireRole(['TeamLeader']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { old_id, new_assign_date, new_technician_code, tl_remarks } = req.body;

      if (!old_id || !new_technician_code) {
        return res.status(400).json({ error: 'Please select an open work order and the new technician.' });
      }

      const tech = await db.getEmployeeByCode(new_technician_code);
      if (!tech) {
        return res.status(404).json({ error: 'Selected technician not found' });
      }

      const assignDate = new_assign_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const result = await db.reassignWorkOrder(
        Number(old_id),
        assignDate,
        tech.employee_code,
        tech.employee_name,
        req.user!.employee_code,
        tl_remarks || ''
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to re-assign work order' });
      }

      return res.json({
        success: true,
        message: 'Work order re-assigned successfully!',
        newId: result.newId
      });
    } catch (err: any) {
      console.error('Reassign error:', err);
      return res.status(500).json({ error: err.message || 'Failed to re-assign work order' });
    }
  });

  // 5. TeamLeader: Repeat Repair / Re Visit (Modes 3 & 4)
  app.post('/api/workorders/manage/repeat-revisit', requireAuth, requireRole(['TeamLeader']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        jobcard_type, // 'Repeat Repair' or 'Re Visit'
        previous_jobcard_no,
        vehicle_manufacturer,
        vehicle_model,
        vehicle_variant,
        vehicle_registration_no,
        jobcard_no,
        jobcard_date,
        kilometres,
        name_of_service_advisor,
        technician_code,
        tl_remarks,
        jobcard_photo_base64,
        existing_photo_url
      } = req.body;

      if (!['Repeat Repair', 'Re Visit'].includes(jobcard_type)) {
        return res.status(400).json({ error: 'Invalid mode for repeat/revisit.' });
      }

      if (!vehicle_registration_no || !jobcard_no) {
        return res.status(400).json({ error: 'Registration no and new Jobcard no are required.' });
      }

      // Validation: Block if active open work order already exists for that vehicle
      const activeExists = await db.checkOpenWorkOrderExists(req.user!.center_code || '', jobcard_no, vehicle_registration_no);
      if (activeExists) {
        return res.status(400).json({
          error: '❌ Active workorder already exists for this vehicle. Please close the active workorder first.'
        });
      }

      let photoUrl = existing_photo_url || null;
      if (jobcard_photo_base64) {
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const relativeFolder = `workorders/${year}/${month}`;
        const fileName = `JC_${jobcard_no}_${Date.now()}.webp`;
        const path = await sftpStorage.uploadImage(relativeFolder, fileName, jobcard_photo_base64);
        photoUrl = `/api/media/view?path=${path}`;
      }

      let techName: string | null = null;
      if (technician_code) {
        const tech = await db.getEmployeeByCode(technician_code);
        if (tech) techName = tech.employee_name;
      }

      const todayISTStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      const newId = await db.createWorkOrder({
        jobcard_type,
        previous_jobcard_no: previous_jobcard_no || null,
        vehicle_manufacturer: vehicle_manufacturer || '',
        vehicle_model: vehicle_model || '',
        vehicle_variant: vehicle_variant || null,
        vehicle_registration_no,
        jobcard_no,
        jobcard_date: jobcard_date || todayISTStr,
        job_assign_date: todayISTStr,
        kilometres: kilometres ? Number(kilometres) : null,
        name_of_service_advisor: name_of_service_advisor || null,
        technician_code: technician_code || null,
        name_of_technician: techName,
        center_code: req.user!.center_code,
        center_name: req.user!.center_name,
        tl_id: req.user!.employee_code,
        tl_remarks: tl_remarks || null,
        job_status: 'In Progress',
        jobcard_photo: photoUrl
      });

      return res.json({
        success: true,
        message: `${jobcard_type} work order created successfully!`,
        id: newId
      });
    } catch (err: any) {
      console.error('Repeat/Revisit error:', err);
      return res.status(500).json({ error: err.message || 'Failed to create work order' });
    }
  });

  // 6. TeamLeader: Close Work Order with 14 Services (Mode 5 - "Close workorder")
  app.post('/api/workorders/manage/close', requireAuth, requireRole(['TeamLeader']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, services, tl_remarks } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Please select a work order to close' });
      }

      const success = await db.closeWorkOrder(
        Number(id),
        services || {},
        tl_remarks || '',
        req.user!.employee_code
      );

      if (!success) {
        return res.status(404).json({ error: 'Work order not found or could not be closed' });
      }

      return res.json({
        success: true,
        message: 'Work order closed successfully with verified service counts!'
      });
    } catch (err: any) {
      console.error('Close work order error:', err);
      return res.status(500).json({ error: err.message || 'Failed to close work order' });
    }
  });

  // 7. Admin / Super Admin / Management: Edit Work Order
  const handleAdminUpdate = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Valid Work Order ID is required' });
      }

      const existing = await db.getWorkOrderById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Work order not found' });
      }

      const {
        vehicle_manufacturer,
        vehicle_model,
        vehicle_variant,
        vehicle_registration_no,
        jobcard_type,
        technician_code,
        jobcard_no,
        jobcard_date,
        kilometres,
        name_of_service_advisor,
        job_status,
        admin_remarks,
        jobcard_photo_base64
      } = req.body;

      // STRICT BUSINESS VALIDATION RULE:
      // Admin CANNOT change status from "In Progress" to "Re-Assigned" or "Closed"
      if (existing.job_status === 'In Progress') {
        const targetStatus = (job_status || '').toLowerCase();
        if (targetStatus === 'closed' || targetStatus === 're-assigned' || targetStatus === 're-assign') {
          return res.status(400).json({
            error: `❌ Admin cannot change the workorder to '${job_status}'. Please ask the Team Leader to change this status.`
          });
        }
      }

      let techName = existing.name_of_technician;
      if (technician_code && technician_code !== existing.technician_code) {
        const tech = await db.getEmployeeByCode(technician_code);
        if (tech) techName = tech.employee_name;
      }

      let photoUrl = existing.jobcard_photo;
      if (jobcard_photo_base64) {
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const relativeFolder = `workorders/${year}/${month}`;
        const fileName = `JC_${jobcard_no || id}_${Date.now()}.webp`;
        const path = await sftpStorage.uploadImage(relativeFolder, fileName, jobcard_photo_base64);
        photoUrl = `/api/media/view?path=${path}`;
      }

      const adminId = req.user?.employee_code || 'SYSTEM';
      const success = await db.adminUpdateWorkOrder(
        id,
        {
          vehicle_manufacturer,
          vehicle_model,
          vehicle_variant,
          vehicle_registration_no,
          jobcard_type,
          technician_code,
          name_of_technician: techName || undefined,
          jobcard_no,
          jobcard_date,
          kilometres: kilometres ? Number(kilometres) : undefined,
          name_of_service_advisor,
          job_status,
          admin_remarks,
          jobcard_photo: photoUrl || undefined
        },
        adminId
      );

      if (!success) {
        return res.status(500).json({ error: 'Failed to update work order' });
      }

      return res.json({
        success: true,
        message: `Work order #${jobcard_no || id} updated successfully!`
      });
    } catch (err: any) {
      console.error('Admin update work order error:', err);
      return res.status(500).json({ error: err.message || 'Failed to update work order' });
    }
  };

  const allowedEditRoles = [
    'Admin',
    'Super Admin',
    'SuperAdmin',
    'super admin',
    'admin',
    'TeamLeader',
    'Team Leader',
    'Management',
    'HO',
    'Director',
    'Manager'
  ];

  // Universal Action Dispatcher: /api/workorders/action
  app.post('/api/workorders/action', requireAuth, requireRole(allowedEditRoles), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { action, id, data } = req.body;
      const numericId = Number(id || data?.id);

      if (!numericId || isNaN(numericId)) {
        return res.status(400).json({ error: 'Valid Work Order ID is required' });
      }

      const existing = await db.getWorkOrderById(numericId);
      if (!existing) {
        return res.status(404).json({ error: 'Work order not found' });
      }

      const adminId = req.user?.employee_code || 'SYSTEM';

      // Action: Soft-Delete (Update delete_flag = 1)
      if (action === 'soft_delete' || action === 'delete') {
        const success = await db.softDeleteWorkOrder(numericId, adminId);
        if (!success) {
          return res.status(500).json({ error: 'Failed to soft-delete work order' });
        }
        return res.json({
          success: true,
          message: `Work order #${existing.jobcard_no} (ID: ${numericId}) soft-deleted successfully (delete_flag = 1).`
        });
      }

      // Action: Update details
      if (action === 'update') {
        const updateData = data || req.body;
        
        // Strict Business Rule
        if (existing.job_status === 'In Progress') {
          const targetStatus = (updateData.job_status || '').toLowerCase();
          if (targetStatus === 'closed' || targetStatus === 're-assigned' || targetStatus === 're-assign') {
            return res.status(400).json({
              error: `❌ Admin cannot change the workorder to '${updateData.job_status}'. Please ask the Team Leader to change this status.`
            });
          }
        }

        let techName = existing.name_of_technician;
        if (updateData.technician_code && updateData.technician_code !== existing.technician_code) {
          const tech = await db.getEmployeeByCode(updateData.technician_code);
          if (tech) techName = tech.employee_name;
        }

        let photoUrl = existing.jobcard_photo;
        if (updateData.jobcard_photo_base64) {
          const year = new Date().getFullYear();
          const month = String(new Date().getMonth() + 1).padStart(2, '0');
          const relativeFolder = `workorders/${year}/${month}`;
          const fileName = `JC_${updateData.jobcard_no || numericId}_${Date.now()}.webp`;
          const path = await sftpStorage.uploadImage(relativeFolder, fileName, updateData.jobcard_photo_base64);
          photoUrl = `/api/media/view?path=${path}`;
        }

        const success = await db.adminUpdateWorkOrder(
          numericId,
          {
            vehicle_manufacturer: updateData.vehicle_manufacturer,
            vehicle_model: updateData.vehicle_model,
            vehicle_variant: updateData.vehicle_variant,
            vehicle_registration_no: updateData.vehicle_registration_no,
            jobcard_type: updateData.jobcard_type,
            technician_code: updateData.technician_code,
            name_of_technician: techName || undefined,
            jobcard_no: updateData.jobcard_no,
            jobcard_date: updateData.jobcard_date,
            kilometres: updateData.kilometres ? Number(updateData.kilometres) : undefined,
            name_of_service_advisor: updateData.name_of_service_advisor,
            job_status: updateData.job_status,
            admin_remarks: updateData.admin_remarks,
            jobcard_photo: photoUrl || undefined
          },
          adminId
        );

        if (!success) {
          return res.status(500).json({ error: 'Failed to update work order' });
        }

        return res.json({
          success: true,
          message: `Work order #${updateData.jobcard_no || numericId} updated successfully!`
        });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    } catch (err: any) {
      console.error('Workorder action error:', err);
      return res.status(500).json({ error: err.message || 'Action processing failed' });
    }
  });

  app.put('/api/admin/workorders/:id/update', requireAuth, requireRole(allowedEditRoles), handleAdminUpdate);
  app.post('/api/admin/workorders/:id/update', requireAuth, requireRole(allowedEditRoles), handleAdminUpdate);
  app.put('/api/workorders/:id/update', requireAuth, requireRole(allowedEditRoles), handleAdminUpdate);
  app.post('/api/workorders/:id/update', requireAuth, requireRole(allowedEditRoles), handleAdminUpdate);
  app.put('/api/admin/workorders/:id', requireAuth, requireRole(allowedEditRoles), handleAdminUpdate);
  app.post('/api/admin/workorders/:id', requireAuth, requireRole(allowedEditRoles), handleAdminUpdate);

  // 8. Admin / Super Admin / Team Leader: Soft-Delete Work Order
  const handleSoftDelete = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Valid Work Order ID is required' });
      }

      const existing = await db.getWorkOrderById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Work order not found' });
      }

      const adminId = req.user?.employee_code || 'SYSTEM';
      const success = await db.softDeleteWorkOrder(id, adminId);
      if (!success) {
        return res.status(500).json({ error: 'Failed to delete work order' });
      }

      return res.json({
        success: true,
        message: `Work order #${existing.jobcard_no} (ID: ${id}) soft-deleted successfully (delete_flag = 1).`
      });
    } catch (err: any) {
      console.error('Delete work order error:', err);
      return res.status(500).json({ error: err.message || 'Failed to delete work order' });
    }
  };

  app.delete('/api/admin/workorders/:id', requireAuth, requireRole(allowedEditRoles), handleSoftDelete);
  app.post('/api/admin/workorders/:id/delete', requireAuth, requireRole(allowedEditRoles), handleSoftDelete);
  app.delete('/api/workorders/:id', requireAuth, requireRole(allowedEditRoles), handleSoftDelete);
  app.post('/api/workorders/:id/delete', requireAuth, requireRole(allowedEditRoles), handleSoftDelete);

  // 9. Cascading Lookups
  app.get('/api/workorders/lookup', requireAuth, async (req: Request, res: Response) => {
    try {
      const manufacturers = await db.getDistinctManufacturers();
      return res.json({ manufacturers });
    } catch (err) {
      console.error('Lookup error:', err);
      return res.status(500).json({ error: 'Failed to fetch manufacturers' });
    }
  });

  app.get('/api/workorders/lookup-models', requireAuth, async (req: Request, res: Response) => {
    try {
      const mfr = req.query.manufacturer as string;
      if (!mfr) {
        return res.status(400).json({ error: 'Manufacturer is required' });
      }
      const models = await db.getModelsForManufacturer(mfr);
      return res.json({ models });
    } catch (err) {
      console.error('Lookup models error:', err);
      return res.status(500).json({ error: 'Failed to fetch models' });
    }
  });

  // ==================== WORKSHOP CENTERS API ====================

  app.get('/api/centers', requireAuth, async (req: Request, res: Response) => {
    try {
      const centers = await db.getAllCenters();
      return res.json({ centers });
    } catch (err) {
      console.error('Centers error:', err);
      return res.status(500).json({ error: 'Failed to fetch centers list' });
    }
  });

  app.post('/api/centers', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const { center_code, center_name, center_location, center_type } = req.body;
      if (!center_code || !center_name || !center_location) {
        return res.status(400).json({ error: 'Code, Name, and Location are required' });
      }

      const code = await db.createCenter({
        center_code,
        center_name,
        center_location,
        center_type: center_type || 'Workshop',
        status: 'Active'
      });

      return res.json({ success: true, message: 'Center created successfully', center_code: code });
    } catch (err) {
      console.error('Center create error:', err);
      return res.status(500).json({ error: 'Failed to create center' });
    }
  });

  app.patch('/api/centers/:code', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const centerCode = req.params.code;
      const updates = req.body;
      const success = await db.updateCenter(centerCode, updates);
      if (!success) {
        return res.status(404).json({ error: 'Workshop center not found' });
      }
      return res.json({ success: true, message: 'Center modified successfully' });
    } catch (err) {
      console.error('Center update error:', err);
      return res.status(500).json({ error: 'Failed to update center' });
    }
  });

  // Employee creation / master edit for administration
  app.get('/api/employees', requireAuth, requireRole(['TeamLeader', 'Admin', 'Super Admin']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      let employees = await db.getAllEmployees();
      if (req.user!.user_role === 'TeamLeader') {
        employees = employees.filter((e) => e.center_code === req.user!.center_code);
      }
      return res.json({ employees });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch employee list' });
    }
  });

  app.post('/api/employees', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const { employee_code, employee_name, password, user_role, center_code, user_details, employee_doj, employee_status } = req.body;
      if (!employee_code || !employee_name || !password || !user_role) {
        return res.status(400).json({ error: 'Code, Name, Password, and Role are required' });
      }

      // Check duplicate
      const duplicate = await db.getEmployeeByCode(employee_code, false);
      if (duplicate) {
        return res.status(400).json({ error: 'Employee code already exists' });
      }

      // Retrieve center name if code is provided
      let centerName: string | null = null;
      if (center_code) {
        const centers = await db.getAllCenters();
        const ctr = centers.find(c => c.center_code === center_code);
        if (ctr) centerName = ctr.center_name;
      }

      const id = await db.createEmployee({
        employee_code,
        employee_name,
        password,
        user_role,
        center_code,
        center_name: centerName,
        user_details: user_details || null,
        employee_doj: employee_doj || null,
        employee_status: employee_status || 'Active'
      });

      return res.json({ success: true, message: 'Employee added successfully', employee_id: id });
    } catch (err) {
      console.error('Employee creation error:', err);
      return res.status(500).json({ error: 'Failed to add employee' });
    }
  });

  app.patch('/api/employees/:id', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;

      // Security check: Admin cannot edit other Admin / Super Admin records
      if (req.user!.user_role === 'Admin') {
        const all = await db.getAllEmployees();
        const target = all.find((e) => e.id === id);
        if (target && ['Admin', 'Super Admin'].includes(target.user_role) && target.employee_code !== req.user!.employee_code) {
          return res.status(403).json({ error: 'Access denied: Admins cannot modify other Admin accounts' });
        }
      }

      if (updates.center_code) {
        const centers = await db.getAllCenters();
        const ctr = centers.find(c => c.center_code === updates.center_code);
        if (ctr) {
          updates.center_name = ctr.center_name;
        }
      }

      const success = await db.updateEmployee(id, updates);
      if (!success) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      return res.json({ success: true, message: 'Employee modified successfully' });
    } catch (err) {
      console.error('Update employee error:', err);
      return res.status(500).json({ error: 'Failed to update employee' });
    }
  });

  // ==================== VEHICLE MODELS API ====================

  app.get('/api/vehicle-models', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const models = await db.getAllVehicleModels();
      return res.json({ models });
    } catch (err: any) {
      console.error('Fetch vehicle models error:', err);
      return res.status(500).json({ error: 'Failed to retrieve vehicle models catalog' });
    }
  });

  app.post('/api/vehicle-models', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const { Vehicle_Manufacturer, Vehicle_Model, Vehicle_Variant } = req.body;
      if (!Vehicle_Manufacturer || !Vehicle_Model) {
        return res.status(400).json({ error: 'Both Vehicle Manufacturer and Vehicle Model are required.' });
      }

      const result = await db.createVehicleModel({
        Vehicle_Manufacturer,
        Vehicle_Model,
        Vehicle_Variant
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, message: 'Vehicle model created successfully', id: result.id });
    } catch (err: any) {
      console.error('Create vehicle model error:', err);
      return res.status(500).json({ error: 'Failed to create vehicle model' });
    }
  });

  app.patch('/api/vehicle-models/:id', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { Vehicle_Manufacturer, Vehicle_Model, Vehicle_Variant } = req.body;

      if (!Vehicle_Manufacturer || !Vehicle_Model) {
        return res.status(400).json({ error: 'Both Vehicle Manufacturer and Vehicle Model are required.' });
      }

      const result = await db.updateVehicleModel(id, {
        Vehicle_Manufacturer,
        Vehicle_Model,
        Vehicle_Variant
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, message: 'Vehicle model updated successfully' });
    } catch (err: any) {
      console.error('Update vehicle model error:', err);
      return res.status(500).json({ error: 'Failed to update vehicle model' });
    }
  });

  app.delete('/api/vehicle-models/:id', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const result = await db.deleteVehicleModel(id);
      if (!result.success) {
        return res.status(400).json({ error: 'Failed to delete vehicle model or record not found.' });
      }
      return res.json({ success: true, message: 'Vehicle model removed successfully' });
    } catch (err: any) {
      console.error('Delete vehicle model error:', err);
      return res.status(500).json({ error: 'Failed to delete vehicle model' });
    }
  });

  // ==================== MEDIA STREAM PROXY ====================

  app.get('/api/media/view', async (req: Request, res: Response) => {
    try {
      let rawPath = (req.query.path as string) || '';
      if (!rawPath) {
        return res.status(400).send('Media path query required');
      }

      // Decode URL if encoded
      let cleanPath = decodeURIComponent(rawPath);

      // Handle full http/https URLs or legacy /premji/ path prefixes
      if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
        try {
          const u = new URL(cleanPath);
          cleanPath = u.pathname;
        } catch {
          cleanPath = cleanPath.replace(/^https?:\/\/[^\/]+/, '');
        }
      }
      cleanPath = cleanPath.replace(/^\/?(premji\/)?/, '').replace(/\\/g, '/');

      // Block directory traversal security breaches
      if (cleanPath.includes('..')) {
        return res.status(403).send('Forbidden media access path');
      }

      const imageBuffer = await sftpStorage.getImageBuffer(cleanPath);

      // Determine content type dynamically
      let contentType = 'image/webp';
      const headStr = imageBuffer.subarray(0, 20).toString('utf-8');
      if (headStr.includes('<svg') || cleanPath.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      } else if (cleanPath.endsWith('.png')) {
        contentType = 'image/png';
      } else if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      }

      // Deploy edge caching headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day client-side cache
      return res.send(imageBuffer);
    } catch (err) {
      console.warn(`Media view fallback for path: ${req.query.path}`, err);
      const filename = path.basename(String(req.query.path || 'Verification Photo'));
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
        <rect width="100%" height="100%" fill="#f8fafc"/>
        <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" fill="#64748b">📷</text>
        <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#334155">${filename}</text>
        <text x="50%" y="72%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8">Premji Verified Media</text>
      </svg>`;
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(fallbackSvg));
    }
  });

  // ==================== RETENTION RUNTIME PURGE ====================

  app.post('/api/maintenance/cleanup', requireAuth, requireRole(['Admin', 'Super Admin']), async (req: Request, res: Response) => {
    try {
      const days = Number(req.body.days || 31);
      const report = await db.cleanupOldImages(days);

      // Concurrently wipe images from physical server storage
      for (const virtualPath of report.deletedFiles) {
        try {
          await sftpStorage.deleteImage(virtualPath);
        } catch (e) {
          console.error(`Failed to wipe physical image: ${virtualPath}`, e);
        }
      }

      return res.json({
        success: true,
        message: `Wiped attendance database references and logs older than ${days} days.`,
        clearedRecordsCount: report.deletedRecords,
        clearedFilesCount: report.deletedFiles.length
      });
    } catch (err) {
      console.error('Cleanup routine failure:', err);
      return res.status(500).json({ error: 'Failed to complete image retention cleanup routine' });
    }
  });

  return app;
}
