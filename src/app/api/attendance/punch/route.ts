import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../db/db_adapter.ts';
import { sftpStorage } from '../../../../db/sftp_adapter.ts';
import { jwtUtil } from '../../../../db/jwt.ts';
import {
  getIstNow,
  getIstDateString,
  getIstDateTimeString,
  getIstTimeString,
  calculateHours,
  calculateEffectiveHours,
  formatIstTimeDisplay
} from '../../../../lib/ist-time.ts';

// Helper to authenticate request from cookie or Bearer token
function authenticateRequest(req: Request): any | null {
  const authHeader = req.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/premji_session=([^;]+)/);
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) return null;
  return jwtUtil.verify(token);
}

/**
 * GET /api/attendance/punch
 * Retrieves today's attendance record and current shift status for the active employee.
 */
export async function GET(req: Request) {
  try {
    const user = authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const queryEmpCode = searchParams.get('employee_code');

    const empCode = queryEmpCode || user?.employee_code;
    if (!empCode) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid session or employee_code required' },
        { status: 401 }
      );
    }

    const todayIST = getIstDateString();
    const attendance = await db.getTodayAttendance(empCode, todayIST);
    const empDetails = await db.getEmployeeByCode(empCode, false);

    return NextResponse.json({
      success: true,
      today_date: todayIST,
      attendance: attendance || null,
      employee: empDetails
        ? {
            employee_code: empDetails.employee_code,
            employee_name: empDetails.employee_name,
            center_name: empDetails.center_name,
            center_location: empDetails.center_location || 'Main Center',
            user_role: empDetails.user_role
          }
        : null
    });
  } catch (error: any) {
    console.error('API /api/attendance/punch GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch attendance status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/attendance/punch
 * Handles initial check-in (On Duty In), break departure/return, and endless On Duty Out re-punching.
 * Strictly adheres to the 9 core business field specifications and audit trail rules.
 */
export async function POST(req: Request) {
  try {
    const user = authenticateRequest(req);
    const body = await req.json();

    const {
      checkpoint,
      image,
      target_employee_code,
      admin_remarks
    } = body;

    // Checkpoint validation
    const validCheckpoints = [
      'on_duty_in',
      'intermidiate_off_out',
      'intermidiate_off_in',
      'on_duty_out'
    ];

    if (!checkpoint || !validCheckpoints.includes(checkpoint)) {
      return NextResponse.json(
        { error: 'Invalid or missing checkpoint. Allowed: on_duty_in, intermidiate_off_out, intermidiate_off_in, on_duty_out' },
        { status: 400 }
      );
    }

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Face photo capture (JPEG / WebP Base64) is strictly required' },
        { status: 400 }
      );
    }

    // Determine target employee
    let empCode = user?.employee_code || body.employee_code;
    if (target_employee_code) {
      if (user && !['TeamLeader', 'Admin', 'Super Admin'].includes(user.user_role)) {
        return NextResponse.json(
          { error: 'Forbidden: Only Team Leaders or Admins can mark attendance for other employees' },
          { status: 403 }
        );
      }
      empCode = target_employee_code;
    }

    if (!empCode) {
      return NextResponse.json(
        { error: 'Employee code could not be determined. Please log in again.' },
        { status: 401 }
      );
    }

    // Fetch employee details from DB
    const empDetails = await db.getEmployeeByCode(empCode, false);
    if (!empDetails) {
      return NextResponse.json(
        { error: `Employee record not found for code: ${empCode}` },
        { status: 404 }
      );
    }

    if (empDetails.employee_status === 'Inactive' || empDetails.employee_status === '0') {
      return NextResponse.json(
        { error: 'Attendance cannot be marked: Employee account is marked Inactive' },
        { status: 403 }
      );
    }

    // Timezone locking: strictly Asia/Kolkata
    const nowIST = getIstNow();
    const todayDateIST = getIstDateString(nowIST);
    const currentIstDateTime = getIstDateTimeString(nowIST);
    const currentIstTime = getIstTimeString(nowIST, '24h');

    // Save compressed face image to storage
    const year = nowIST.getFullYear();
    const month = String(nowIST.getMonth() + 1).padStart(2, '0');
    const relativeFolder = `attendance/${year}/${month}`;
    const fileName = `${empCode}_${checkpoint}_${Date.now()}.jpg`;

    const savedVirtualPath = await sftpStorage.uploadImage(relativeFolder, fileName, image);
    if (!savedVirtualPath) {
      return NextResponse.json(
        { error: 'Failed to upload verification photo to VPS storage. Please try again.' },
        { status: 500 }
      );
    }
    const imageUrl = `/api/media/view?path=${savedVirtualPath}`;

    // Actor performing this modification
    const actor = user?.employee_code || empCode;

    // Existing today's record lookup
    const existing = await db.getTodayAttendance(empCode, todayDateIST);

    // Build payload according to the 9 core business fields with strict non-null guarantees
    const payload: any = {
      emp_code_of_thetechnician: empCode,
      name_of_technician: empDetails.employee_name,
      center_name: existing?.center_name || empDetails.center_name || empDetails.center_code || 'Unassigned',
      center_location: existing?.center_location || empDetails.center_location || 'Unassigned',
      attendance_date: todayDateIST,
      last_edit_timestamp: currentIstDateTime, // Field 7: Audit trail (Guaranteed non-null)
      last_edited_by: actor                   // Field 8: Actor (Guaranteed non-null)
    };

    if (admin_remarks) {
      payload.admin_remarks = admin_remarks; // Field 9: Admin Remarks
    }

    // Workflow Checkpoint Handling
    if (checkpoint === 'on_duty_in') {
      payload.on_duty_in_time = currentIstDateTime;
      payload.on_duty_in_image = imageUrl;

      // Field 4 & 5: Populate branch/center name & location at morning On Duty In
      payload.center_name = empDetails.center_name || empDetails.center_code || 'Unassigned';
      payload.center_location = empDetails.center_location || 'Unassigned';

      // Field 6: IMMUTABLE GROUND-TRUTH: Set ONLY ONCE when employee first checks in
      if (!existing || !existing.all_innitial_time) {
        payload.all_innitial_time = currentIstDateTime;
      }

      // Initialize KPI hours (Guaranteed non-null)
      payload.total_working_hrs = 0.00;
      payload.total_break_hrs = 0.00;
      payload.effective_working_hrs = 0.00;
    } else if (checkpoint === 'intermidiate_off_out') {
      payload.intermidiate_off_out_time = currentIstDateTime;
      payload.intermidiate_off_out_image = imageUrl;
    } else if (checkpoint === 'intermidiate_off_in') {
      payload.intermidiate_off_in_time = currentIstDateTime;
      payload.intermidiate_off_in_image = imageUrl;

      // Field 2: Calculate total_break_hrs
      const breakOutTime = existing?.intermidiate_off_out_time;
      if (breakOutTime) {
        payload.total_break_hrs = calculateHours(breakOutTime, currentIstDateTime, todayDateIST);
      }

      // If on_duty_out was already punched, recalculate effective working hours
      if (existing?.on_duty_out_time && existing?.on_duty_in_time) {
        const totalWork = calculateHours(existing.on_duty_in_time, existing.on_duty_out_time, todayDateIST);
        payload.total_working_hrs = totalWork;
        payload.effective_working_hrs = calculateEffectiveHours(totalWork, payload.total_break_hrs || 0);
      }
    } else if (checkpoint === 'on_duty_out') {
      // Endless On Duty Out Re-Punching:
      // a) Overwrite on_duty_out_time with new timestamp
      // b) Overwrite on_duty_out_image with new photo URL
      // c) Keep all_innitial_time and on_duty_in_time completely unchanged
      payload.on_duty_out_time = currentIstDateTime;
      payload.on_duty_out_image = imageUrl;

      // Calculate total_working_hrs: elapsed from on_duty_in_time to on_duty_out_time
      const inTime = existing?.on_duty_in_time || currentIstDateTime;
      const totalWork = calculateHours(inTime, currentIstDateTime, todayDateIST);
      payload.total_working_hrs = totalWork;

      // Calculate total_break_hrs
      let breakDuration = 0.00;
      if (existing?.intermidiate_off_out_time && existing?.intermidiate_off_in_time) {
        breakDuration = calculateHours(
          existing.intermidiate_off_out_time,
          existing.intermidiate_off_in_time,
          todayDateIST
        );
      } else if (existing?.total_break_hrs) {
        breakDuration = Number(existing.total_break_hrs);
      }
      payload.total_break_hrs = breakDuration;

      // Field 3: Net productive working hours
      payload.effective_working_hrs = calculateEffectiveHours(totalWork, breakDuration);
    }

    const success = await db.markAttendance(payload);
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to record attendance transaction in database' },
        { status: 500 }
      );
    }

    // Retrieve updated record
    const updatedRecord = await db.getTodayAttendance(empCode, todayDateIST);

    // Format human-friendly time for feedback
    const displayTime = formatIstTimeDisplay(currentIstDateTime);

    let message = `Checkpoint '${checkpoint}' logged at ${displayTime} IST`;
    if (checkpoint === 'on_duty_out' && existing?.on_duty_out_time) {
      message = `🔄 On Duty Out updated at ${displayTime} IST. Effective: ${updatedRecord?.effective_working_hrs || '0.00'} hrs.`;
    }

    return NextResponse.json({
      success: true,
      message,
      checkpoint,
      timestamp: currentIstDateTime,
      display_time: displayTime,
      attendance: updatedRecord,
      metrics: {
        total_working_hrs: updatedRecord?.total_working_hrs ?? 0.00,
        total_break_hrs: updatedRecord?.total_break_hrs ?? 0.00,
        effective_working_hrs: updatedRecord?.effective_working_hrs ?? 0.00
      }
    });
  } catch (error: any) {
    console.error('API /api/attendance/punch POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error while processing attendance punch' },
      { status: 500 }
    );
  }
}
