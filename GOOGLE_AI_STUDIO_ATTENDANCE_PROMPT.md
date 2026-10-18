# 🤖 GOOGLE AI STUDIO MASTER PROMPT: PREMJI ATTENDANCE MODULE
### Complete Specification & Code Architecture (React / Next.js 14 / TypeScript / Tailwind / MySQL / VPS SFTP)

---

## 📌 HOW TO USE IN GOOGLE AI STUDIO / CURSOR:
- **System Instructions Box:** Paste `<role_and_context>`, `<root_cause_solutions>`, and `<critical_workflow_rules>`.
- **User Prompt Box:** Paste `<database_specifications>`, `<camera_and_masking_logic>`, and `<deliverables_required>`.
*(Or copy the entire document directly into the chat prompt window).*

---

```markdown
<role_and_context>
You are an expert Principal Full-Stack Engineer and Lead React/Next.js Architect.
You are tasked with generating the complete, production-ready, zero-stub Attendance Module for the "Premji Groups Operations Portal" built with Next.js 14+ (App Router), React 18+, TypeScript, Tailwind CSS, Prisma ORM, and MySQL, with images stored on a remote VPS via SFTP (`72.60.202.149`).
</role_and_context>

<project_objective>
Deliver a flawless attendance capture and auditing system that resolves:
1. Human images failing to capture or rendering as default placeholder avatars (due to 0-byte SFTP uploads or uninitialized canvas snaps).
2. Missing or NULL values for `total_working_hrs`, `total_break_hrs`, `effective_working_hrs`, and `center_location`.
3. Endless "On Duty Out" re-punching without lockout, dynamically recalculating total and net working hours.
4. Seamless dual-layer photo display:
   - Employee View: Clean vertical oval face mask preview (`border-radius: 50% / 40%`).
   - Admin / Super Admin View: Full uncropped original photo with background surroundings in a click-to-enlarge lightbox modal.
</project_objective>

<root_cause_solutions>
### Issue 1: Missing Human Images / Default Placeholder Avatar Displayed
- Cause:
  1. Frontend: Snapping before camera stream is ready (`video.readyState < 2` or `video.videoWidth === 0`), causing an uninitialized black or 0-byte canvas transmission.
  2. Backend: SFTP upload to VPS failed or timed out silently, but the server still saved the URL `/api/media/view?path=...` to MySQL.
  3. Client Browser: When loading the missing or 0-byte file from `/api/media/view`, a 404 occurs and `<img onError />` displays the fallback user avatar.
- Architectural Fix:
  1. In `<AttendanceCamera />`: Disable the capture button until `video.readyState >= 2` AND `video.videoWidth > 0`. Verify canvas pixel data isn't pitch black and ensure base64 length > 5,000 bytes.
  2. In `uploadAttendanceImage` (`src/lib/image-storage.ts`): Strict atomic SFTP upload. Connect to VPS, write file, and immediately verify `sftp.stat(remotePath).size > 0`. If SFTP fails after 2 attempts, fall back to saving base64 data URI directly in MySQL. Never write a 404 URL!
  3. In `src/app/api/media/view/route.ts`: Secure streaming with proper caching headers (`Cache-Control: public, max-age=31536000, immutable`).

### Issue 2: total_working_hrs, total_break_hrs, effective_working_hrs & center_location Missing / NULL
- Cause:
  1. Legacy punch handlers did not fetch `center_location` from `employee_details` table.
  2. `total_break_hrs` was not computed upon `Break In` and defaulted to NULL instead of `0.00`.
  3. Re-punches did not dynamically recompute duration metrics.
- Mathematical Formulas & Database Guarantees:
  1. `center_location`: Always fetch from `employee_details` based on `emp_code_of_thetechnician` (fallback to `center_details` via `center_name`). Always backfill on every punch if NULL.
  2. `total_break_hrs`:
     $$\text{total\_break\_hrs} = \begin{cases} \text{ROUND}\left(\frac{\text{TIMESTAMPDIFF(SECOND, intermidiate\_off\_out\_time, intermidiate\_off\_in\_time)}}{3600.0}, 2\right) & \text{if both break times exist} \\ 0.00 & \text{otherwise} \end{cases}$$
  3. `total_working_hrs`:
     $$\text{total\_working\_hrs} = \text{ROUND}\left(\frac{\text{TIMESTAMPDIFF(SECOND, on\_duty\_in\_time, on\_duty\_out\_time)}}{3600.0}, 2\right)$$
  4. `effective_working_hrs`:
     $$\text{effective\_working\_hrs} = \max\left(0.00, \text{ROUND}(\text{total\_working\_hrs} - \text{total\_break\_hrs}, 2)\right)$$

### Issue 3: Endless "On Duty Out" Re-Punching
- When an employee opens the page after checkout, show active camera with: `"🔄 Update On Duty Out (Re-punch)"`.
- Overwrites `on_duty_out_time` and `on_duty_out_image`, updates `last_edit_timestamp = NOW()` and `last_edited_by = employee_code`, dynamically recalculates `total_working_hrs` and `effective_working_hrs`.
- Never mutates `all_innitial_time` or `on_duty_in_time`.
</root_cause_solutions>

<database_specifications>
Target Table: `preamji_attendance`

```prisma
model PreamjiAttendance {
  id                         BigInt    @id @default(autoincrement())
  attendance_date            DateTime  @db.Date
  emp_code_of_thetechnician  String    @db.VarChar(50)
  name_of_technician         String    @db.VarChar(100)
  center_name                String?   @db.VarChar(100)
  center_location            String?   @db.VarChar(150)
  
  // Timestamps (IST)
  on_duty_in_time            DateTime? @db.DateTime(0)
  on_duty_in_image           String?   @db.LongText
  intermidiate_off_out_time  DateTime? @db.DateTime(0)
  intermidiate_off_out_image String?   @db.LongText
  intermidiate_off_in_time   DateTime? @db.DateTime(0)
  intermidiate_off_in_image  String?   @db.LongText
  on_duty_out_time           DateTime? @db.DateTime(0)
  on_duty_out_image          String?   @db.LongText
  
  // Metrics
  total_working_hrs          Decimal?  @db.Decimal(5, 2)
  total_break_hrs            Decimal?  @default(0.00) @db.Decimal(5, 2)
  effective_working_hrs      Decimal?  @db.Decimal(5, 2)
  
  // Audit Trail
  all_innitial_time          DateTime? @db.DateTime(0)
  last_edit_timestamp        DateTime? @db.DateTime(0)
  last_edited_by             String?   @db.VarChar(50)
  admin_remarks              String?   @db.Text

  @@unique([attendance_date, emp_code_of_thetechnician], name: "unique_emp_date_attendance")
  @@index([attendance_date])
  @@index([emp_code_of_thetechnician])
  @@index([center_name])
  @@map("preamji_attendance")
}
```
</database_specifications>

<camera_and_masking_logic>
### Client Camera Component (`<AttendanceCamera />`)
- **Guide Badge:** `"📸 Keep your full face inside the red oval"`.
- **Oval Face Guide:** Vertical Portrait Oval container (`w-48 h-64 rounded-[50%/40%] border-[3.5px] border-red-500`).
- **Readiness Detection:**
  ```typescript
  const checkCameraReadiness = () => {
    if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
      setIsReady(true);
    } else {
      setTimeout(checkCameraReadiness, 150);
    }
  };
  ```
- **Snap Validation:**
  - Check non-black frame (`ctx.getImageData`).
  - Base64 length validation (`> 5000 chars`).
  - Loading feedback state during upload.
</camera_and_masking_logic>

<critical_workflow_rules>
1. All calculations must use Indian Standard Time (IST - UTC+05:30).
2. `total_break_hrs` defaults to `0.00` if no break is taken.
3. Every punch or re-punch must populate `center_location` if currently NULL.
4. Images must be stored and verified on the VPS SFTP at `/var/www/premji/attendance/${YYYY}/${MM}/`. If SFTP fails, store the base64 data URI directly in MySQL.
5. In Admin view, photo thumbnails must be click-to-enlarge to view the full uncropped scene (for surroundings audit).
</critical_workflow_rules>

<deliverables_required>
Generate complete, production-ready code with zero placeholders or omissions for:
1. `src/lib/ist-time.ts`: IST timezone conversion and duration calculator.
2. `src/lib/image-storage.ts`: SFTP upload pipeline with connection retry, `stat()` size verification, and base64 DB fallback.
3. `src/app/api/media/view/route.ts`: Streaming image endpoint for VPS files.
4. `src/app/api/attendance/punch/route.ts`: Punch handler supporting all 4 states + infinite `On Duty Out` re-punches with zero-NULL guarantees.
5. `src/components/attendance/AttendanceCamera.tsx`: High-speed vertical oval camera with stream readiness validation.
6. `src/components/attendance/DailyAttendanceSummary.tsx`: Today's punches card with 3 KPI metric tiles.
7. `src/app/admin/attendance/page.tsx`: Full management table with uncropped lightbox photo modal and CSV export.
</deliverables_required>
```
