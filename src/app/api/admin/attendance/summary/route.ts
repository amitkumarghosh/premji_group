import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../db/db_adapter.ts';
import { jwtUtil } from '../../../../../db/jwt.ts';
import { getIstDateString } from '../../../../../lib/ist-time.ts';

// Helper to authenticate request and verify Admin/Super Admin/TeamLeader privileges
function authenticateAdminRequest(req: Request): any | null {
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
 * GET /api/admin/attendance/summary
 * Aggregated date-range report API with SQL / in-memory summation.
 * Produces high-level KPI totals alongside granular row data with photo URLs.
 */
export async function GET(req: Request) {
  try {
    const user = authenticateAdminRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    const allowedRoles = ['Admin', 'Super Admin', 'TeamLeader'];
    if (!allowedRoles.includes(user.user_role)) {
      return NextResponse.json(
        { error: 'Access denied: Requires Admin, Super Admin, or Team Leader role' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const today = getIstDateString();

    // Default to last 30 days in IST
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const defaultStartDate = getIstDateString(thirtyDaysAgo);

    const startDate = searchParams.get('startDate') || searchParams.get('start_date') || defaultStartDate;
    const endDate = searchParams.get('endDate') || searchParams.get('end_date') || today;
    let centerCode = searchParams.get('centerCode') || searchParams.get('center_code') || '';
    const centerName = searchParams.get('centerName') || searchParams.get('center_name') || '';
    const employeeCode = searchParams.get('employeeCode') || searchParams.get('employee_code') || '';
    const search = searchParams.get('search') || '';

    // Team Leader is locked to their assigned center
    if (user.user_role === 'TeamLeader' && user.center_code) {
      centerCode = user.center_code;
    }

    const report = await db.getAttendanceSummaryReport({
      startDate,
      endDate,
      centerCode,
      centerName,
      employeeCode,
      search
    });

    return NextResponse.json({
      success: true,
      filters: {
        startDate,
        endDate,
        centerCode: centerCode || null,
        centerName: centerName || null,
        employeeCode: employeeCode || null,
        search: search || null
      },
      summary: report.summary,
      records: report.records
    });
  } catch (error: any) {
    console.error('API /api/admin/attendance/summary GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate attendance summary report' },
      { status: 500 }
    );
  }
}
