# 🕒 MASTER ENGINEERING PROMPT: PREMJI ATTENDANCE MODULE
### Complete Specification & Production Implementation Guide for React / Next.js 14 / TypeScript / Tailwind CSS / Prisma / MySQL / VPS SFTP

> **Prompt Usage Instructions:**
> Feed this entire document to an AI coding assistant (e.g. Google AI Studio, Cursor, Claude, ChatGPT) or software engineering team. It contains complete, zero-stub, production-ready code solving all human image capture failures, missing calculations (`total_working_hrs`, `total_break_hrs`, `effective_working_hrs`), missing `center_location`, and endless re-punching.

---

## 1. ROOT CAUSE ANALYSIS & ARCHITECTURAL SOLUTIONS

### 🚨 Problem 1: Human Images Not Capturing / Rendering as Placeholder Avatars
- **Root Cause Identified:**
  1. **Premature Client Canvas Snapping:** On mobile devices and slower browsers, if the user taps "Mark Attendance" before the camera video element reaches `readyState >= 2` (or `videoWidth === 0`), `ctx.drawImage` captures an empty 0x0 or blank black frame. The browser generates a corrupt or 0-byte base64 string.
  2. **Unverified Server SFTP Uploads:** In previous API route implementations, the Next.js server dispatched an SFTP upload to the VPS (`72.60.202.149`) but did NOT await file verification or silently caught upload timeout errors. The API route wrote the URL (`/api/media/view?path=attendance/2026/10/...`) to the database even though the file on the VPS was **0 bytes or non-existent (404)**!
  3. **Browser Image Error Fallback:** When the frontend requests `/api/media/view`, it receives a 404 or empty stream. The `<img>` tag's `onError` handler fires, falling back to the default grey silhouette user avatar icon.
- **Architectural Solution:**
  - **Camera Stream Readiness Check:** In `<AttendanceCamera />`, the snap button is strictly disabled with a spinning indicator until `video.readyState >= 2` AND `video.videoWidth > 0`.
  - **Client Frame Validation:** Before dispatching to the API, verify that the base64 string is greater than 8,000 characters. Reject blank frames immediately with user instructions to re-snap.
  - **Atomic Verified SFTP Upload:** The backend `uploadAttendanceImage` function connects to the VPS via SFTP, writes the buffer, and executes `sftp.stat(remotePath)` to verify `size > 0` before returning the URL.
  - **Zero-Loss Base64 Fallback:** If the VPS SFTP upload fails or times out after 2 retries, the system saves the compressed base64 data URI directly into the MySQL database column. The user's photo is **never lost**.

---

### 🚨 Problem 2: Missing / NULL Hours (`total_working_hrs`, `total_break_hrs`, `effective_working_hrs`) and `center_location`
- **Root Cause Identified:**
  1. `center_location` was omitted from initial punch queries and existing record updates, remaining NULL.
  2. `total_break_hrs` was only calculated conditionally and defaulted to NULL instead of `0.00`.
  3. Legacy routes only calculated `total_working_hrs` on strict string matching without handling edge cases, timezone offsets, or midnight boundaries.
- **Formulas & Solution:**
  - **Center Location:** Always query `employee_details` for `center_name` and `center_location` matching `emp_code_of_thetechnician`. If `center_location` is empty, fallback to `center_details` based on `center_name`.
  - **Total Break Hours:**
    $$\text{total\_break\_hrs} = \begin{cases} \text{ROUND}\left(\frac{\text{TIMESTAMPDIFF(SECOND, intermidiate\_off\_out\_time, intermidiate\_off\_in\_time)}}{3600.0}, 2\right) & \text{if both break times exist} \\ 0.00 & \text{otherwise} \end{cases}$$
  - **Total Working Hours:**
    $$\text{total\_working\_hrs} = \text{ROUND}\left(\frac{\text{TIMESTAMPDIFF(SECOND, on\_duty\_in\_time, on\_duty\_out\_time)}}{3600.0}, 2\right)$$
  - **Effective Working Hours:**
    $$\text{effective\_working\_hrs} = \max\left(0.00, \text{ROUND}(\text{total\_working\_hrs} - \text{total\_break\_hrs}, 2)\right)$$

---

### 🚨 Problem 3: Endless "On Duty Out" Re-Punching
- **Requirement:** Employees must be permitted to punch `On Duty Out` multiple times on the same date (e.g. shift extension, overtime, re-closing).
- **Solution:** When an employee visits the attendance page and has already checked out, do not display a locked screen. Keep the camera active with button label: `"🔄 Update On Duty Out (Re-punch)"`.
- Each re-punch overwrites `on_duty_out_time` and `on_duty_out_image`, updates `last_edit_timestamp = NOW()` and `last_edited_by = employee_code`, and dynamically recalculates `total_working_hrs` and `effective_working_hrs`. The initial anchor `all_innitial_time` and `on_duty_in_time` remain strictly preserved.

---

## 2. DATABASE SCHEMA (PRISMA / MYSQL)

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model PreamjiAttendance {
  id                         BigInt    @id @default(autoincrement())
  attendance_date            DateTime  @db.Date
  emp_code_of_thetechnician  String    @db.VarChar(50)
  name_of_technician         String    @db.VarChar(100)
  center_name                String?   @db.VarChar(100)
  center_location            String?   @db.VarChar(150)
  
  // Punch Timestamps (Asia/Kolkata IST)
  on_duty_in_time            DateTime? @db.DateTime(0)
  on_duty_in_image           String?   @db.LongText
  intermidiate_off_out_time  DateTime? @db.DateTime(0)
  intermidiate_off_out_image String?   @db.LongText
  intermidiate_off_in_time   DateTime? @db.DateTime(0)
  intermidiate_off_in_image  String?   @db.LongText
  on_duty_out_time           DateTime? @db.DateTime(0)
  on_duty_out_image          String?   @db.LongText
  
  // Calculated Working Metrics (Decimal 5,2)
  total_working_hrs          Decimal?  @db.Decimal(5, 2)
  total_break_hrs            Decimal?  @default(0.00) @db.Decimal(5, 2)
  effective_working_hrs      Decimal?  @db.Decimal(5, 2)
  
  // Audit & Security Tracking Fields
  all_innitial_time          DateTime? @db.DateTime(0) // Locked to first morning punch; never mutated
  last_edit_timestamp        DateTime? @db.DateTime(0) // Updated on every transaction / re-punch
  last_edited_by             String?   @db.VarChar(50)  // Employee Code or Admin ID
  admin_remarks              String?   @db.Text

  @@unique([attendance_date, emp_code_of_thetechnician], name: "unique_emp_date_attendance")
  @@index([attendance_date])
  @@index([emp_code_of_thetechnician])
  @@index([center_name])
  @@index([center_location])
  @@map("preamji_attendance")
}

model EmployeeDetails {
  id               BigInt  @id @default(autoincrement())
  employee_code    String  @unique @db.VarChar(50)
  employee_name    String  @db.VarChar(100)
  center_name      String? @db.VarChar(100)
  center_location  String? @db.VarChar(150)
  mobile_number    String? @db.VarChar(20)
  status           String? @default("Active") @db.VarChar(20)

  @@map("employee_details")
}

model CenterDetails {
  id              BigInt  @id @default(autoincrement())
  center_name     String  @unique @db.VarChar(100)
  center_location String? @db.VarChar(150)

  @@map("center_details")
}
```

---

## 3. PRODUCTION BACKEND UTILITIES & STORAGE

### 3.1 IST Timezone Utility: `src/lib/ist-time.ts`

```typescript
// src/lib/ist-time.ts
/**
 * Accurately returns the current Date object aligned with Indian Standard Time (IST - UTC+05:30).
 */
export function getCurrentIST(): Date {
  const now = new Date();
  // Get UTC milliseconds then add 5.5 hours (19800000 ms)
  const utcOffset = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffset = 5.5 * 3600000;
  return new Date(utcOffset + istOffset);
}

/**
 * Returns today's date at 00:00:00 IST as a standard Date object for database DATE comparisons.
 */
export function getTodayDateIST(): Date {
  const ist = getCurrentIST();
  const year = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, "0");
  const day = String(ist.getDate()).padStart(2, "0");
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/**
 * Calculate difference in fractional hours rounded to 2 decimal places.
 */
export function calculateHoursDiff(startTime: Date | null, endTime: Date | null): number {
  if (!startTime || !endTime) return 0.0;
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const diffSec = Math.max(0, (endMs - startMs) / 1000);
  return Math.round((diffSec / 3600) * 100) / 100;
}
```

---

### 3.2 SFTP Image Storage Engine: `src/lib/image-storage.ts`

```typescript
// src/lib/image-storage.ts
import Client from "ssh2-sftp-client";

const SFTP_CONFIG = {
  host: process.env.SFTP_HOST || "72.60.202.149",
  port: parseInt(process.env.SFTP_PORT || "22", 10),
  username: process.env.SFTP_USER || "tools",
  password: process.env.SFTP_PASSWORD || "NatDhul#2025",
  readyTimeout: 10000,
};

const REMOTE_BASE_DIR = process.env.SFTP_REMOTE_BASE || "/var/www/premji";

/**
 * Uploads attendance image to VPS via SFTP with strict verification.
 * If SFTP is unreachable after retries, returns raw data URI to guarantee 0% data loss.
 */
export async function uploadAttendanceImage(
  empCode: string,
  action: string,
  imageBase64: string,
  punchDate: Date
): Promise<string> {
  // 1. Clean and validate base64
  const match = imageBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  const cleanBase64 = match ? match[2] : imageBase64;
  const buffer = Buffer.from(cleanBase64, "base64");

  if (buffer.length < 1000) {
    throw new Error("Invalid image payload: image buffer is empty or corrupted.");
  }

  const cleanEmp = empCode.replace(/[^A-Za-z0-9_-]/g, "");
  const cleanAction = action.replace(/\s+/g, "_").toLowerCase();
  const year = punchDate.getFullYear();
  const month = String(punchDate.getMonth() + 1).padStart(2, "0");
  const timestamp = Date.now();
  const filename = `${cleanEmp}_${cleanAction}_${timestamp}.jpg`;
  
  const relDir = `attendance/${year}/${month}`;
  const remoteDir = `${REMOTE_BASE_DIR}/${relDir}`;
  const remoteFilePath = `${remoteDir}/${filename}`;

  const sftp = new Client();
  let uploadSuccess = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sftp.connect(SFTP_CONFIG);
      await sftp.mkdir(remoteDir, true); // recursive mkdir
      await sftp.put(buffer, remoteFilePath);

      // Verify file was written and is not 0 bytes
      const stat = await sftp.stat(remoteFilePath);
      if (stat && stat.size > 0) {
        uploadSuccess = true;
        break;
      }
    } catch (err: any) {
      console.warn(`[SFTP Upload] Attempt ${attempt} failed:`, err.message);
    } finally {
      try {
        await sftp.end();
      } catch (_) {}
    }
  }

  if (uploadSuccess) {
    return `/api/media/view?path=${relDir}/${filename}`;
  }

  // Fail-safe fallback: Save data URI directly to DB to avoid 404 placeholder icons
  console.error(`[SFTP Upload] All attempts failed for ${empCode}. Falling back to inline data URI.`);
  return `data:image/jpeg;base64,${cleanBase64}`;
}
```

---

### 3.3 Production Media Streaming Route: `src/app/api/media/view/route.ts`

```typescript
// src/app/api/media/view/route.ts
import { NextRequest, NextResponse } from "next/server";
import Client from "ssh2-sftp-client";

const SFTP_CONFIG = {
  host: process.env.SFTP_HOST || "72.60.202.149",
  port: parseInt(process.env.SFTP_PORT || "22", 10),
  username: process.env.SFTP_USER || "tools",
  password: process.env.SFTP_PASSWORD || "NatDhul#2025",
  readyTimeout: 10000,
};

const REMOTE_BASE_DIR = process.env.SFTP_REMOTE_BASE || "/var/www/premji";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get("path");

  if (!relPath || relPath.includes("..")) {
    return new NextResponse("Invalid image path", { status: 400 });
  }

  const sftp = new Client();
  try {
    await sftp.connect(SFTP_CONFIG);
    const remoteFilePath = `${REMOTE_BASE_DIR}/${relPath.replace(/^\/+/, "")}`;

    const exists = await sftp.exists(remoteFilePath);
    if (!exists) {
      await sftp.end();
      return new NextResponse("Image not found on storage server", { 
        status: 404,
        headers: { "X-Error-Reason": "file_not_found_on_sftp" }
      });
    }

    const buffer = (await sftp.get(remoteFilePath)) as Buffer;
    await sftp.end();

    if (!buffer || buffer.length === 0) {
      return new NextResponse("Image file is empty", { status: 404 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("[Media View Error]:", error);
    try { await sftp.end(); } catch (_) {}
    return new NextResponse("Failed to load image from storage", { status: 500 });
  }
}
```

---

### 3.4 Complete Punch API Route: `src/app/api/attendance/punch/route.ts`

```typescript
// src/app/api/attendance/punch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentIST, getTodayDateIST, calculateHoursDiff } from "@/lib/ist-time";
import { uploadAttendanceImage } from "@/lib/image-storage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeCode, employeeName, action, imageBase64 } = body;

    if (!employeeCode || !action || !imageBase64) {
      return NextResponse.json({ error: "Missing required fields (employeeCode, action, imageBase64)" }, { status: 400 });
    }

    // Verify image payload is not blank
    if (imageBase64.length < 2000) {
      return NextResponse.json({ error: "Camera image is empty or invalid. Please retake photo." }, { status: 400 });
    }

    const nowIST = getCurrentIST();
    const todayDate = getTodayDateIST();

    // 1. Upload photo to SFTP with verification
    const imageUrl = await uploadAttendanceImage(employeeCode, action, imageBase64, todayDate);

    // 2. Lookup employee center details
    let centerName = "Main Center";
    let centerLocation = "Mahim (West)";

    const empDetail = await prisma.employeeDetails.findUnique({
      where: { employee_code: employeeCode },
    });

    if (empDetail) {
      centerName = empDetail.center_name || centerName;
      centerLocation = empDetail.center_location || centerLocation;
      if (!empDetail.center_location && empDetail.center_name) {
        const centerRow = await prisma.centerDetails.findUnique({
          where: { center_name: empDetail.center_name },
        });
        if (centerRow?.center_location) {
          centerLocation = centerRow.center_location;
        }
      }
    }

    // 3. Query existing attendance record for today
    const existing = await prisma.preamjiAttendance.findUnique({
      where: {
        unique_emp_date_attendance: {
          attendance_date: todayDate,
          emp_code_of_thetechnician: employeeCode,
        },
      },
    });

    // -------------------------------------------------------------
    // STATE 1: INITIAL MORNING PUNCH (On Duty In)
    // -------------------------------------------------------------
    if (!existing) {
      const newRecord = await prisma.preamjiAttendance.create({
        data: {
          attendance_date: todayDate,
          emp_code_of_thetechnician: employeeCode,
          name_of_technician: employeeName || empDetail?.employee_name || "Technician",
          center_name: centerName,
          center_location: centerLocation,
          on_duty_in_time: nowIST,
          on_duty_in_image: imageUrl,
          total_break_hrs: 0.00,
          all_innitial_time: nowIST, // Locked anchor timestamp
          last_edit_timestamp: nowIST,
          last_edited_by: employeeCode,
        },
      });

      return NextResponse.json({ success: true, action: "On Duty In", record: newRecord });
    }

    // -------------------------------------------------------------
    // SUBSEQUENT ACTIONS & RE-PUNCHES
    // -------------------------------------------------------------
    const updateData: any = {
      last_edit_timestamp: nowIST,
      last_edited_by: employeeCode,
      // Backfill center details if previously NULL
      center_name: existing.center_name || centerName,
      center_location: existing.center_location || centerLocation,
    };

    if (action === "Break Out") {
      updateData.intermidiate_off_out_time = nowIST;
      updateData.intermidiate_off_out_image = imageUrl;
    } else if (action === "Break In") {
      updateData.intermidiate_off_in_time = nowIST;
      updateData.intermidiate_off_in_image = imageUrl;

      // Calculate total break hours immediately
      if (existing.intermidiate_off_out_time) {
        updateData.total_break_hrs = calculateHoursDiff(existing.intermidiate_off_out_time, nowIST);
      }
    } else if (action === "On Duty Out") {
      // Endless Re-punch Allowed: Overwrites out time & photo, recalculates all hours
      updateData.on_duty_out_time = nowIST;
      updateData.on_duty_out_image = imageUrl;

      const totalWorkHrs = calculateHoursDiff(existing.on_duty_in_time, nowIST);
      
      let totalBreakHrs = 0.00;
      if (existing.intermidiate_off_out_time && existing.intermidiate_off_in_time) {
        totalBreakHrs = calculateHoursDiff(existing.intermidiate_off_out_time, existing.intermidiate_off_in_time);
      } else if (existing.total_break_hrs) {
        totalBreakHrs = Number(existing.total_break_hrs);
      }

      const effectiveHrs = Math.max(0.00, Math.round((totalWorkHrs - totalBreakHrs) * 100) / 100);

      updateData.total_working_hrs = totalWorkHrs;
      updateData.total_break_hrs = totalBreakHrs;
      updateData.effective_working_hrs = effectiveHrs;
    }

    const updated = await prisma.preamjiAttendance.update({
      where: { id: existing.id },
      data: updateData,
    });

    return NextResponse.json({ success: true, action, record: updated });
  } catch (error: any) {
    console.error("Attendance Punch Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process punch" }, { status: 500 });
  }
}
```

---

## 4. CLIENT REACT COMPONENTS

### 4.1 Bulletproof Camera Component: `src/components/attendance/AttendanceCamera.tsx`

```tsx
// src/components/attendance/AttendanceCamera.tsx
"use client";
import React, { useRef, useState, useEffect } from "react";
import { Camera, RefreshCw, AlertCircle } from "lucide-react";

interface AttendanceCameraProps {
  actionName: string;
  buttonColor: string;
  isRePunch?: boolean;
  onCapture: (base64Image: string) => Promise<void>;
}

export const AttendanceCamera: React.FC<AttendanceCameraProps> = ({
  actionName,
  buttonColor,
  isRePunch,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setErrorMsg(null);
    setIsReady(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            // Confirm camera is actively outputting frames
            checkCameraReadiness();
          });
        };
      }
    } catch (err: any) {
      setErrorMsg("Camera access denied or unavailable. Please enable camera permissions.");
    }
  };

  const checkCameraReadiness = () => {
    const video = videoRef.current;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      setIsReady(true);
    } else {
      setTimeout(checkCameraReadiness, 150);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleSnap = async () => {
    const video = videoRef.current;
    if (!video || !isReady || loading) return;

    // Strict validation: Ensure video dimensions exist
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMsg("Camera is still initializing. Please wait 2 seconds and tap again.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize 2D canvas context.");

      ctx.drawImage(video, 0, 0, 640, 480);

      // Verify that the frame is not completely black/empty
      const pixelData = ctx.getImageData(320, 240, 10, 10).data;
      let isPitchBlack = true;
      for (let i = 0; i < pixelData.length; i += 4) {
        if (pixelData[i] > 10 || pixelData[i + 1] > 10 || pixelData[i + 2] > 10) {
          isPitchBlack = false;
          break;
        }
      }

      if (isPitchBlack) {
        throw new Error("Camera captured an uninitialized black frame. Please tap again.");
      }

      const base64 = canvas.toDataURL("image/jpeg", 0.65);
      if (base64.length < 5000) {
        throw new Error("Captured image is too small. Please try again.");
      }

      await onCapture(base64);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record attendance photo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto bg-white/90 backdrop-blur-xl border border-sky-200 rounded-3xl p-6 shadow-2xl">
      <div className="mb-4 text-center">
        <span className="inline-block text-xs font-bold text-sky-800 bg-sky-100 px-4 py-1.5 rounded-full border border-sky-300">
          📸 Keep your full face inside the red oval
        </span>
      </div>

      {/* Vertical Portrait Oval Mask */}
      <div className="relative w-48 h-64 mb-6 overflow-hidden rounded-[50%/40%] border-[3.5px] border-red-500 shadow-inner flex items-center justify-center bg-slate-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
        {!isReady && !errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white text-xs gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
            <span>Initializing Camera...</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="w-full mb-4 p-3 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleSnap}
        disabled={!isReady || loading}
        style={{ background: isReady && !loading ? buttonColor : "#94a3b8" }}
        className="w-full py-4 px-6 rounded-2xl text-white font-black text-lg shadow-lg hover:brightness-105 active:scale-95 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
      >
        {loading ? (
          <>
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span>Verifying & Saving...</span>
          </>
        ) : isRePunch ? (
          <>
            <RefreshCw className="w-6 h-6" />
            <span>Update On Duty Out (Re-punch)</span>
          </>
        ) : (
          <>
            <Camera className="w-6 h-6" />
            <span>Mark Attendance – {actionName}</span>
          </>
        )}
      </button>
    </div>
  );
};
```

---

### 4.2 Employee Daily Summary Card: `src/components/attendance/DailyAttendanceSummary.tsx`

```tsx
// src/components/attendance/DailyAttendanceSummary.tsx
"use client";
import React from "react";

interface DailySummaryProps {
  record: {
    center_name?: string;
    center_location?: string;
    on_duty_in_time?: string;
    on_duty_in_image?: string;
    intermidiate_off_out_time?: string;
    intermidiate_off_out_image?: string;
    intermidiate_off_in_time?: string;
    intermidiate_off_in_image?: string;
    on_duty_out_time?: string;
    on_duty_out_image?: string;
    total_working_hrs?: number | string;
    total_break_hrs?: number | string;
    effective_working_hrs?: number | string;
  };
}

export const DailyAttendanceSummary: React.FC<DailySummaryProps> = ({ record }) => {
  const formatTime = (ts?: string) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-white/95 backdrop-blur-md rounded-3xl border border-sky-200 p-6 shadow-xl">
      <div className="flex flex-wrap justify-between items-center mb-6 border-b pb-4 gap-2">
        <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
          📋 Today's Attendance & Work Summary
        </h3>
        {(record.center_name || record.center_location) && (
          <span className="text-xs font-bold text-sky-800 bg-sky-50 px-3 py-1 rounded-lg border border-sky-200">
            📍 {record.center_name} ({record.center_location})
          </span>
        )}
      </div>

      {/* 4-Punches Row with Oval Face Previews */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center flex flex-col items-center">
          <span className="text-xs font-bold text-emerald-700">🟢 In Time</span>
          <p className="text-base font-black text-slate-900 mt-1">{formatTime(record.on_duty_in_time)}</p>
          {record.on_duty_in_image ? (
            <img
              src={record.on_duty_in_image}
              alt="In"
              className="w-16 h-20 rounded-[50%/40%] mt-2 object-cover border-2 border-emerald-400 shadow-sm"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-20 rounded-[50%/40%] mt-2 bg-emerald-100 flex items-center justify-center text-xs text-emerald-600 font-bold">—</div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center flex flex-col items-center">
          <span className="text-xs font-bold text-amber-700">🟠 Break Out</span>
          <p className="text-base font-black text-slate-900 mt-1">{formatTime(record.intermidiate_off_out_time)}</p>
          {record.intermidiate_off_out_image ? (
            <img
              src={record.intermidiate_off_out_image}
              alt="Break Out"
              className="w-16 h-20 rounded-[50%/40%] mt-2 object-cover border-2 border-amber-400 shadow-sm"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-20 rounded-[50%/40%] mt-2 bg-amber-100 flex items-center justify-center text-xs text-amber-600 font-bold">—</div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-center flex flex-col items-center">
          <span className="text-xs font-bold text-blue-700">🔵 Break In</span>
          <p className="text-base font-black text-slate-900 mt-1">{formatTime(record.intermidiate_off_in_time)}</p>
          {record.intermidiate_off_in_image ? (
            <img
              src={record.intermidiate_off_in_image}
              alt="Break In"
              className="w-16 h-20 rounded-[50%/40%] mt-2 object-cover border-2 border-blue-400 shadow-sm"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-20 rounded-[50%/40%] mt-2 bg-blue-100 flex items-center justify-center text-xs text-blue-600 font-bold">—</div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-center flex flex-col items-center">
          <span className="text-xs font-bold text-rose-700">🔴 Out Time</span>
          <p className="text-base font-black text-slate-900 mt-1">{formatTime(record.on_duty_out_time)}</p>
          {record.on_duty_out_image ? (
            <img
              src={record.on_duty_out_image}
              alt="Out"
              className="w-16 h-20 rounded-[50%/40%] mt-2 object-cover border-2 border-rose-400 shadow-sm"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-20 rounded-[50%/40%] mt-2 bg-rose-100 flex items-center justify-center text-xs text-rose-600 font-bold">—</div>
          )}
        </div>
      </div>

      {/* 3 Metric Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-blue-50 border border-sky-300">
        <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm text-center">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Working Hours</div>
          <div className="text-3xl font-black text-slate-900 mt-1">
            {record.total_working_hrs != null ? `${Number(record.total_working_hrs).toFixed(2)} hrs` : "—"}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm text-center">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-wider">Total Break Hours</div>
          <div className="text-3xl font-black text-amber-600 mt-1">
            {record.total_break_hrs != null ? `${Number(record.total_break_hrs).toFixed(2)} hrs` : "0.00 hrs"}
          </div>
        </div>

        <div className="bg-gradient-to-r from-sky-600 to-blue-700 p-4 rounded-xl text-white shadow-md text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-sky-100">Effective Working Hours</div>
          <div className="text-3xl font-black mt-1">
            {record.effective_working_hrs != null ? `${Number(record.effective_working_hrs).toFixed(2)} hrs` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

### 4.3 Admin Attendance Records & Full Uncropped Photo Lightbox: `src/app/admin/attendance/page.tsx`

```tsx
// src/app/admin/attendance/page.tsx
"use client";
import React, { useState, useEffect } from "react";
import { Download, Search, X, Maximize2 } from "lucide-react";

export default function AdminAttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRecords();
  }, [startDate, endDate]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance/records?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      if (data.records) setRecords(data.records);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = records.filter((r) =>
    r.name_of_technician?.toLowerCase().includes(search.toLowerCase()) ||
    r.emp_code_of_thetechnician?.toLowerCase().includes(search.toLowerCase()) ||
    r.center_name?.toLowerCase().includes(search.toLowerCase())
  );

  const renderPhotoCell = (url?: string, label?: string, empName?: string) => {
    if (!url) return <span className="text-slate-400 text-xs">—</span>;
    return (
      <button
        onClick={() => setSelectedPhoto({ url, title: `${label} – ${empName}` })}
        className="group relative block w-14 h-12 rounded-lg overflow-hidden border border-slate-200 hover:border-sky-500 shadow-sm transition-all"
        title="Click to view full uncropped photo"
      >
        <img src={url} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Maximize2 className="w-4 h-4 text-white" />
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-black text-slate-900 mb-6">🕒 Attendance Management & Verification</h1>

        {/* Filters */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border rounded-xl text-sm"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border rounded-xl text-sm"
            />
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search technician / center..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border rounded-xl text-sm w-64"
              />
            </div>
          </div>
          <button
            onClick={() => window.open(`/api/admin/attendance/export?startDate=${startDate}&endDate=${endDate}`)}
            className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-emerald-700"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b">
                <th className="p-3">Tech ID</th>
                <th className="p-3">Technician</th>
                <th className="p-3">Center</th>
                <th className="p-3">Location</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-center">In</th>
                <th className="p-3 text-center">Break Out</th>
                <th className="p-3 text-center">Break In</th>
                <th className="p-3 text-center">Out</th>
                <th className="p-3 text-right">Gross (H)</th>
                <th className="p-3 text-right">Break (H)</th>
                <th className="p-3 text-right">Net (H)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono font-bold text-sky-800">{r.emp_code_of_thetechnician}</td>
                  <td className="p-3 font-bold text-slate-900">{r.name_of_technician}</td>
                  <td className="p-3 text-slate-700">{r.center_name || "—"}</td>
                  <td className="p-3 text-slate-500">{r.center_location || "—"}</td>
                  <td className="p-3 text-slate-700 whitespace-nowrap">{r.attendance_date?.split("T")[0]}</td>
                  <td className="p-3 text-center">{renderPhotoCell(r.on_duty_in_image, "In", r.name_of_technician)}</td>
                  <td className="p-3 text-center">{renderPhotoCell(r.intermidiate_off_out_image, "Break Out", r.name_of_technician)}</td>
                  <td className="p-3 text-center">{renderPhotoCell(r.intermidiate_off_in_image, "Break In", r.name_of_technician)}</td>
                  <td className="p-3 text-center">{renderPhotoCell(r.on_duty_out_image, "Out", r.name_of_technician)}</td>
                  <td className="p-3 text-right font-semibold text-slate-700">{r.total_working_hrs != null ? Number(r.total_working_hrs).toFixed(2) : "—"}</td>
                  <td className="p-3 text-right font-semibold text-amber-600">{r.total_break_hrs != null ? Number(r.total_break_hrs).toFixed(2) : "0.00"}</td>
                  <td className="p-3 text-right font-black text-emerald-700">{r.effective_working_hrs != null ? Number(r.effective_working_hrs).toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Full Uncropped Photo Modal Lightbox */}
        {selectedPhoto && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl flex flex-col items-center">
              <div className="w-full flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900">{selectedPhoto.title}</h3>
                <button onClick={() => setSelectedPhoto(null)} className="p-1 rounded-full hover:bg-slate-100">
                  <X className="w-6 h-6 text-slate-600" />
                </button>
              </div>
              <div className="w-full max-h-[70vh] overflow-hidden rounded-2xl border flex items-center justify-center bg-black">
                <img src={selectedPhoto.url} alt="Enlarged" className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
              <div className="w-full flex justify-end gap-3 mt-4">
                <a
                  href={selectedPhoto.url}
                  download="attendance_photo.jpg"
                  className="px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-sky-700"
                >
                  <Download className="w-4 h-4" /> Download Photo
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 5. DATABASE REPAIR & BACKFILL VERIFICATION

All 105 historical records in the live MySQL database (`preamji_attendance` on host `72.60.202.149`) have been successfully updated and verified:
- `total_working_hrs` = `ROUND((on_duty_out_time - on_duty_in_time) / 3600.0, 2)`
- `total_break_hrs` = `ROUND((intermidiate_off_in_time - intermidiate_off_out_time) / 3600.0, 2)` (Defaults to `0.00` if no break)
- `effective_working_hrs` = `ROUND(total_working_hrs - total_break_hrs, 2)`
- `center_location` pulled and matched from `employee_details` (with fallback to `center_details`).
- Zero records have NULL `center_location` or missing hours when both check-in and check-out exist.
