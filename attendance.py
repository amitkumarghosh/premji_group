import streamlit as st
from datetime import datetime
import pytz
import requests
# import ntplib
from sqlalchemy import text
from database import get_db_engine
from io import BytesIO
from PIL import Image
import base64
import time
from zoneinfo import ZoneInfo
# NEW imports for face detection
try:
    import cv2
    CV2_AVAILABLE = hasattr(cv2, "CascadeClassifier") and hasattr(cv2, "imdecode")
except ImportError:
    cv2 = None
    CV2_AVAILABLE = False

import numpy as np
import os
from image_storage import (
    upload_attendance_image,
    is_image_url,
    get_image_url_string,
    get_image_thumbnail_b64,
    show_image_modal,
)


# -------------------------------------------------------------
#  TRUE INTERNET TIME (NTP -> API -> fallback)
# -------------------------------------------------------------
def get_current_ist(timeout=3, debug=False):
    """
    Returns current Asia/Kolkata datetime.
    No network dependency, no warnings.
    """
    return datetime.now(ZoneInfo("Asia/Kolkata"))

    # ---------- 2. Try worldtimeapi ----------
    try:
        api = "https://worldtimeapi.org/api/timezone/Asia/Kolkata"
        r = requests.get(api, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        aware = datetime.fromisoformat(data["datetime"])
        ist_dt = aware.astimezone(pytz.timezone("Asia/Kolkata")).replace(tzinfo=None)

        if debug:
            return ist_dt, "worldtimeapi.org", system_ist
        return ist_dt

    except Exception:
        pass

    # ---------- 3. Try timeapi.io ----------
    try:
        api2 = "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Kolkata"
        r2 = requests.get(api2, timeout=timeout)
        r2.raise_for_status()
        d = r2.json()

        aware = datetime(
            d["year"],
            d["month"],
            d["day"],
            d["hour"],
            d["minute"],
            int(d["seconds"]),
            int(d["milliseconds"]) * 1000,
            tzinfo=pytz.timezone("Asia/Kolkata"),
        )
        ist_dt = aware.replace(tzinfo=None)

        if debug:
            return ist_dt, "timeapi.io", system_ist
        return ist_dt

    except Exception:
        pass

    # ---------- 4. Last fallback (system clock) ----------
    st.warning("⚠️ Network time unavailable — using machine's local clock which may be incorrect.")
    if debug:
        return system_ist, "SYSTEM CLOCK (fallback)", system_ist
    return system_ist


# -------------------------------------------------------------
# IMAGE COMPRESSION
# -------------------------------------------------------------
def compress_image(image_data, max_size=(640, 480), quality=60):
    try:
        img = Image.open(BytesIO(image_data))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail(max_size)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()
    except Exception as e:
        st.error(f"Image compression failed: {e}")
        return image_data


# -------------------------------------------------------------
# FACE DETECTION HELPER
# -------------------------------------------------------------
def verify_face(image_bytes, min_face_fraction=0.12):
    """
    Returns (ok: bool, reason: str).

    ok == True  -> face looks fine, proceed.
    ok == False -> block & show error based on reason.

    min_face_fraction: minimum acceptable face area as fraction of full image.
    """

    if not CV2_AVAILABLE or not hasattr(cv2, "CascadeClassifier"):
        return True, "opencv_missing"

    # Load as grayscale using OpenCV
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return False, "decode_failed"

    h, w = img.shape[:2]
    total_area = float(h * w)

    cascade_filename = "haarcascade_frontalface_default.xml"
    if not os.path.exists(cascade_filename):
        # If cascade missing, do not block (but we can log/info if needed).
        return True, "cascade_missing"

    try:
        face_cascade = cv2.CascadeClassifier(cascade_filename)
        if face_cascade.empty():
            return True, "cascade_missing"
    except Exception:
        return True, "cascade_missing"

    faces = face_cascade.detectMultiScale(
        img,
        scaleFactor=1.2,
        minNeighbors=5,
        minSize=(40, 40),
    )

    if len(faces) == 0:
        return False, "no_face"

    max_area = max((fw * fh) for (x, y, fw, fh) in faces)
    if max_area < min_face_fraction * total_area:
        return False, "face_too_small"

    return True, "ok"


# -------------------------------------------------------------
# MAIN ATTENDANCE PAGE
# -------------------------------------------------------------
def attendance_page(user):

    # Get TRUE INTERNET-BASED IST
    now_ist = get_current_ist()
    today_ist = now_ist.date()

    emp_code = user.get("employee_code")
    emp_name = user.get("employee_name")

    # Header & Senior-Friendly Employee Status Banner
    banner_html = (
        f'<div style="margin-bottom: 20px;">'
        f'<h2 style="color: #0f172a; font-size: clamp(1.4rem, 2.2vw, 1.8rem); font-weight: 800; letter-spacing: -0.5px; margin: 0 0 14px 0;">🕒 Attendance Capture</h2>'
        f'<div style="display: flex; flex-wrap: wrap; gap: 12px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1.5px solid rgba(186, 230, 253, 0.9); border-radius: 18px; padding: 14px 20px; box-shadow: 0 6px 20px -3px rgba(2, 132, 199, 0.08); justify-content: space-between; align-items: center;">'
        f'<div style="font-size: 15.5px; color: #0f172a; font-weight: 600;">👤 User: <span style="color: #0284c7; font-weight: 800;">{emp_name} ({emp_code})</span></div>'
        f'<div style="font-size: 15.5px; color: #0f172a; font-weight: 600;">📅 Date: <span style="color: #0f172a; font-weight: 800;">{today_ist}</span></div>'
        f'<div style="font-size: 15.5px; color: #0f172a; font-weight: 600;">🕓 Time (IST): <span style="color: #0284c7; font-weight: 800;">{now_ist.strftime("%I:%M:%S %p")}</span></div>'
        f'</div>'
        f'</div>'
    )
    st.markdown(banner_html, unsafe_allow_html=True)

    # Action map
    action_map = {
        "On Duty In": ("on_duty_in_time", "on_duty_in_image", "🟢", "#00b894", "#009e6f"),
        "Break Out": ("intermidiate_off_out_time", "intermidiate_off_out_image", "🟠", "#fd7e14", "#e46b00"),
        "Break In": ("intermidiate_off_in_time", "intermidiate_off_in_image", "🔵", "#1e90ff", "#0066cc"),
        "On Duty Out": ("on_duty_out_time", "on_duty_out_image", "🔴", "#ff4d4d", "#cc0000"),
    }

    # Fetch today's record
    engine = get_db_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT *
                FROM preamji_attendance
                WHERE emp_code_of_thetechnician=:emp AND attendance_date=:dt
            """
            ),
            {"emp": emp_code, "dt": today_ist},
        ).fetchone()

    record = (
        dict(row._mapping)
        if row
        else {
            "id": None,
            "on_duty_in_time": None,
            "intermidiate_off_out_time": None,
            "intermidiate_off_in_time": None,
            "on_duty_out_time": None,
        }
    )

    is_repunch = False
    # Determine next action
    if not record["on_duty_in_time"]:
        next_action = "On Duty In"
    elif not record["intermidiate_off_out_time"]:
        next_action = "Break Out"
    elif not record["intermidiate_off_in_time"]:
        next_action = "Break In"
    else:
        next_action = "On Duty Out"
        if record["on_duty_out_time"]:
            is_repunch = True

    # Dynamic UI style
    _, _, icon, start_col, end_col = action_map[next_action]
    if is_repunch:
        button_text = f"🔄 Update On Duty Out (Re-punch)"
    else:
        button_text = f"{icon} Please mark your attendance – {next_action}"

    # Centered responsive camera container styles (iOS Frosted Glass card)
    st.markdown(
        f"""
        <style>
        /* Camera container constrained and centered */
        div[data-testid="stCameraInput"] {{
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            max-width: 540px !important;
            width: 100% !important;
            margin: 0 auto !important;
            background: rgba(255, 255, 255, 0.85) !important;
            border: 1.5px solid rgba(186, 230, 253, 0.9) !important;
            border-radius: 24px !important;
            padding: 1.5rem !important;
            box-shadow: 0 16px 36px -8px rgba(2, 132, 199, 0.14), 0 4px 12px rgba(0, 0, 0, 0.03) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
            transition: all 0.25s ease !important;
        }}

        /* Camera action button */
        div[data-testid="stCameraInput"] button {{
            font-size: 19px !important;
            font-weight: 700 !important;
            padding: 0.85em 1.6em !important;
            background: linear-gradient(90deg, {start_col}, {end_col}) !important;
            color: white !important;
            border-radius: 16px !important;
            width: 100% !important;
            border: none !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
            cursor: pointer !important;
        }}
        div[data-testid="stCameraInput"] button:hover {{
            filter: brightness(1.06) !important;
            transform: translateY(-1.5px) !important;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22) !important;
        }}
        div[data-testid="stCameraInput"] button:active {{
            transform: scale(0.98) !important;
        }}

        /* Oval camera preview – center visible */
        div[data-testid="stCameraInput"] video,
        div[data-testid="stCameraInput"] img {{
            width: min(55vw, 220px) !important;
            height: min(55vw, 220px) !important;
            object-fit: cover !important;
            background: black;
            clip-path: ellipse(36% 50% at 50% 46%);
            -webkit-clip-path: ellipse(36% 50% at 50% 46%);
            border-radius: 50%;
            border: 3px solid #ff4d4d;
        }}

        @media (max-width: 480px) {{
            div[data-testid="stCameraInput"] {{
                padding: 1rem !important;
            }}
            div[data-testid="stCameraInput"] button {{
                font-size: 16px !important;
                padding: 0.75em 1.2em !important;
            }}
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )

    # Use centered responsive layout columns for the camera card
    col_cam_left, col_cam, col_cam_right = st.columns([1, 2.6, 1])
    with col_cam:
        st.markdown(
            """
            <div style="text-align: center; margin-bottom: 12px;">
                <span style="
                    display: inline-block;
                    font-size: 14px;
                    font-weight: 600;
                    color: #0369a1;
                    background: rgba(224, 242, 254, 0.85);
                    padding: 6px 16px;
                    border-radius: 20px;
                    border: 1px solid rgba(186, 230, 253, 0.95);
                ">📸 Please keep your full face inside the red oval</span>
            </div>
            """,
            unsafe_allow_html=True,
        )

        if is_repunch:
            st.info("ℹ️ Attendance is already marked. You can take another photo to update your On Duty Out time and recalculate working hours.")

        cam_key = f"{emp_code}_{today_ist}_{next_action.replace(' ', '_')}"
        if is_repunch and record.get("on_duty_out_time"):
            cam_key += f"_{record.get('on_duty_out_time')}"

        img = st.camera_input(
            button_text,
            key=cam_key,
        )

    if "last_capture" not in st.session_state:
        st.session_state.last_capture = None

    if img:
        raw_bytes = img.getvalue()

        # ---------- FACE CHECK FIRST (BEFORE DB) ----------
        ok, reason = verify_face(raw_bytes)

        if not ok:
            # Use ERROR (red) & DO NOT save anything
            if reason == "no_face":
                st.error(
                    "❌ Face not detected.\n\n"
                    "Please keep your **full face** inside the red oval with enough light, "
                    "and take the photo again."
                )
            elif reason == "face_too_small":
                st.error(
                    "❌ Your face is too far from the camera.\n\n"
                    "Please move closer so that your face fills most of the oval, "
                    "then retake the photo."
                )
            elif reason == "decode_failed":
                st.error("❌ Could not read the image properly. Please try again.")
            else:
                st.error(
                    "❌ Unable to verify your face in this photo. "
                    "Please try again with your face clearly visible."
                )

            # IMPORTANT: do not capture/save, do not update last_capture
            return

        # Cascade missing -> allow but you may inform once
        if reason == "cascade_missing":
            st.info(
                "ℹ️ Face verification model not found on server. "
                "Attendance will be recorded without automatic face check."
            )

        # ---------- ONLY HERE WE GO AHEAD WITH DB ----------
        h = hash(raw_bytes)
        if h != st.session_state.last_capture:

            compressed = compress_image(raw_bytes)
            tcol, icol, *_ = action_map[next_action]

            # Upload to VPS image storage (fallback to compressed bytes if upload fails)
            try:
                img_val = upload_attendance_image(emp_code, icol, compressed)
            except Exception as upload_err:
                st.warning(f"⚠️ VPS photo upload failed: {upload_err}. Saved directly to DB as fallback.")
                img_val = compressed

            with engine.begin() as conn:

                # UPDATE
                if record["id"]:
                    # Fetch employee center details for fallback
                    center = conn.execute(
                        text(
                            "SELECT center_name, center_location "
                            "FROM employee_details WHERE employee_code=:e"
                        ),
                        {"e": emp_code},
                    ).fetchone()
                    cname = center.center_name if center else None
                    cloc = center.center_location if center else None
                    if not cloc and cname:
                        cen_row = conn.execute(
                            text("SELECT center_location FROM center_details WHERE center_name=:cn"),
                            {"cn": cname}
                        ).fetchone()
                        if cen_row and cen_row.center_location:
                            cloc = cen_row.center_location

                    conn.execute(
                        text(
                            f"UPDATE preamji_attendance "
                            f"SET {tcol}=:t, {icol}=:img, last_edit_timestamp=:ts, last_edited_by=:eb, "
                            f"center_location=COALESCE(center_location, :cloc), "
                            f"center_name=COALESCE(center_name, :cname) "
                            f"WHERE id=:id"
                        ),
                        {
                            "t": now_ist,
                            "img": img_val,
                            "ts": now_ist,
                            "eb": emp_code,
                            "cloc": cloc,
                            "cname": cname,
                            "id": record["id"],
                        },
                    )

                    # If Break In, immediately compute total_break_hrs
                    if next_action == "Break In":
                        rec = conn.execute(
                            text(
                                """
                                SELECT intermidiate_off_out_time, intermidiate_off_in_time
                                FROM preamji_attendance
                                WHERE id=:id
                                """
                            ),
                            {"id": record["id"]},
                        ).fetchone()
                        if rec and rec.intermidiate_off_out_time and rec.intermidiate_off_in_time:
                            tb = round(abs((rec.intermidiate_off_in_time - rec.intermidiate_off_out_time).total_seconds()) / 3600.0, 2)
                            conn.execute(
                                text("UPDATE preamji_attendance SET total_break_hrs=:tb WHERE id=:id"),
                                {"tb": tb, "id": record["id"]},
                            )

                    # If On Duty Out (or re-punch), recalculate total_working_hrs, total_break_hrs, effective_working_hrs
                    elif next_action == "On Duty Out":
                        rec = conn.execute(
                            text(
                                """
                                SELECT on_duty_in_time,
                                       intermidiate_off_out_time,
                                       intermidiate_off_in_time,
                                       on_duty_out_time
                                FROM preamji_attendance
                                WHERE id=:id
                                """
                            ),
                            {"id": record["id"]},
                        ).fetchone()

                        if rec and rec.on_duty_in_time and rec.on_duty_out_time:
                            ti = rec.on_duty_in_time
                            to = rec.on_duty_out_time
                            total_work = max(0.0, (to - ti).total_seconds() / 3600.0)

                            if rec.intermidiate_off_out_time and rec.intermidiate_off_in_time:
                                bo = rec.intermidiate_off_out_time
                                bi = rec.intermidiate_off_in_time
                                total_break = abs((bi - bo).total_seconds()) / 3600.0
                            else:
                                total_break = 0.0

                            eff = max(0.0, total_work - total_break)

                            conn.execute(
                                text(
                                    """
                                    UPDATE preamji_attendance
                                    SET total_working_hrs=:tw,
                                        total_break_hrs=:tb,
                                        effective_working_hrs=:ew
                                    WHERE id=:id
                                    """
                                ),
                                {
                                    "tw": round(total_work, 2),
                                    "tb": round(total_break, 2),
                                    "ew": round(eff, 2),
                                    "id": record["id"],
                                },
                            )

                # INSERT
                else:
                    center = conn.execute(
                        text(
                            "SELECT center_name, center_location "
                            "FROM employee_details WHERE employee_code=:e"
                        ),
                        {"e": emp_code},
                    ).fetchone()

                    cname = center.center_name if center else None
                    cloc = center.center_location if center else None
                    if not cloc and cname:
                        cen_row = conn.execute(
                            text("SELECT center_location FROM center_details WHERE center_name=:cn"),
                            {"cn": cname}
                        ).fetchone()
                        if cen_row and cen_row.center_location:
                            cloc = cen_row.center_location

                    conn.execute(
                        text(
                            f"""
                            INSERT INTO preamji_attendance(
                                attendance_date,
                                emp_code_of_thetechnician,
                                name_of_technician,
                                center_name,
                                center_location,
                                {tcol},
                                {icol},
                                all_innitial_time,
                                last_edit_timestamp,
                                last_edited_by,
                                total_break_hrs
                            )
                            VALUES (
                                :dt,
                                :emp,
                                :name,
                                :cname,
                                :cloc,
                                :t,
                                :img,
                                :first,
                                :ts,
                                :eb,
                                0.00
                            )
                            """
                        ),
                        {
                            "dt": today_ist,
                            "emp": emp_code,
                            "name": emp_name,
                            "cname": cname,
                            "cloc": cloc,
                            "t": now_ist,
                            "img": img_val,
                            "first": now_ist,
                            "ts": now_ist,
                            "eb": emp_code,
                        },
                    )

            st.session_state.last_capture = h
            st.success(f"✅ {next_action} recorded!")
            time.sleep(1)
            st.rerun()

    show_today_summary(emp_code)


# -------------------------------------------------------------
# SUMMARY VIEW
# -------------------------------------------------------------
def show_today_summary(emp_code):
    """Displays today's attendance summary with thumbnails and working View Full link/button."""

    st.markdown(
        """
        <div style="margin-top: 30px; margin-bottom: 16px;">
            <h3 style="
                color: #0f172a;
                font-size: 20px;
                font-weight: 700;
                letter-spacing: -0.3px;
                margin: 0;
            ">📋 Today's Attendance Summary</h3>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        """
        <style>
        .attendance-card {
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1.5px solid rgba(186, 230, 253, 0.85);
            border-radius: 18px;
            padding: 16px 20px;
            margin-bottom: 12px;
            box-shadow: 0 4px 16px -2px rgba(2, 132, 199, 0.06);
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.2s ease;
        }
        .attendance-card:hover {
            border-color: #38bdf8;
            box-shadow: 0 8px 24px -4px rgba(2, 132, 199, 0.12);
        }
        .attendance-thumb img {
            pointer-events: none !important;
            user-select: none !important;
            border-radius: 12px;
            border: 1.5px solid rgba(186, 230, 253, 0.9);
            width: 80px;
            height: 80px;
            object-fit: cover;
            display: block;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    now_ist = get_current_ist()
    today_ist = now_ist.date()

    engine = get_db_engine()
    with engine.connect() as conn:
        r = conn.execute(
            text(
                """
                SELECT
                    name_of_technician,
                    on_duty_in_time,
                    on_duty_in_image,
                    intermidiate_off_out_time,
                    intermidiate_off_out_image,
                    intermidiate_off_in_time,
                    intermidiate_off_in_image,
                    on_duty_out_time,
                    on_duty_out_image,
                    total_working_hrs,
                    total_break_hrs,
                    effective_working_hrs
                FROM preamji_attendance
                WHERE emp_code_of_thetechnician = :emp AND attendance_date = :dt
                """
            ),
            {"emp": emp_code, "dt": today_ist},
        ).fetchone()

    if not r:
        st.info("ℹ️ No attendance data captured yet for today.")
        return

    record = dict(r._mapping)
    emp_name = record.get("name_of_technician") or emp_code

    actions = [
        ("On Duty In", "on_duty_in_time", "on_duty_in_image", "🟢"),
        ("Break Out", "intermidiate_off_out_time", "intermidiate_off_out_image", "🟠"),
        ("Break In", "intermidiate_off_in_time", "intermidiate_off_in_image", "🔵"),
        ("On Duty Out", "on_duty_out_time", "on_duty_out_image", "🔴"),
    ]

    if "preview_image" not in st.session_state:
        st.session_state.preview_image = None
        st.session_state.preview_label = None

    for action_label, time_col, image_col, badge_icon in actions:
        col1, col2, col3 = st.columns([2.5, 3.5, 3])
        with col1:
            st.markdown(
                f"""
                <div style="font-size: 16px; font-weight: 700; color: #0f172a; padding-top: 10px;">
                    {badge_icon} {action_label}
                </div>
                """,
                unsafe_allow_html=True,
            )
        with col2:
            ts = record.get(time_col)
            if ts:
                formatted_ts = ts.strftime("%I:%M:%S %p")
                st.markdown(
                    f"""
                    <div style="padding-top: 8px;">
                        <span style="
                            font-size: 15.5px;
                            font-weight: 700;
                            color: #0284c7;
                            background: rgba(224, 242, 254, 0.7);
                            padding: 4px 12px;
                            border-radius: 10px;
                            border: 1px solid rgba(186, 230, 253, 0.8);
                        ">{formatted_ts}</span>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    '<div style="font-size: 15px; color: #94a3b8; padding-top: 10px;">Not recorded yet</div>',
                    unsafe_allow_html=True,
                )
        with col3:
            image_data = record.get(image_col)
            if image_data:
                thumb_b64 = get_image_thumbnail_b64(image_data, max_size=(100, 100))
                if thumb_b64:
                    st.markdown(
                        f"""
                        <div class="attendance-thumb" style="display:inline-block; margin-bottom: 6px;">
                            <img src="{thumb_b64}" alt="{action_label}" />
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

                btn_key = f"view_{action_label.replace(' ', '_')}"
                if st.button(f"🔎 View & Download", key=btn_key):
                    show_image_modal(
                        title=f"{badge_icon} {action_label} — {emp_name} ({emp_code})",
                        image_val=image_data,
                        filename=f"attendance_{emp_code}_{action_label.replace(' ', '_')}_{today_ist}.jpg",
                    )
            else:
                st.markdown('<div style="color: #94a3b8; padding-top: 10px;">—</div>', unsafe_allow_html=True)

    if record.get("on_duty_out_time"):
        st.markdown("---")
        tw = record.get("total_working_hrs") or 0.0
        tb = record.get("total_break_hrs") or 0.0
        ew = record.get("effective_working_hrs") or 0.0

        st.markdown(
            f"""
            <div style="
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(224, 242, 254, 0.85));
                border: 1.5px solid rgba(186, 230, 253, 0.95);
                border-radius: 20px;
                padding: 20px 24px;
                box-shadow: 0 10px 25px -4px rgba(2, 132, 199, 0.1);
                margin-top: 16px;
            ">
                <h4 style="color: #0f172a; font-size: 17px; font-weight: 800; margin: 0 0 14px 0;">
                    ⏱️ Daily Work Hours Summary
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
                    <div style="background: rgba(255, 255, 255, 0.9); padding: 14px; border-radius: 14px; border: 1px solid rgba(186, 230, 253, 0.8);">
                        <div style="font-size: 13.5px; color: #475569; font-weight: 600;">Total Working Hours</div>
                        <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">{tw} hrs</div>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.9); padding: 14px; border-radius: 14px; border: 1px solid rgba(186, 230, 253, 0.8);">
                        <div style="font-size: 13.5px; color: #475569; font-weight: 600;">Total Break Hours</div>
                        <div style="font-size: 22px; font-weight: 800; color: #d97706; margin-top: 4px;">{tb} hrs</div>
                    </div>
                    <div style="background: linear-gradient(135deg, rgba(2, 132, 199, 0.1), rgba(56, 189, 248, 0.15)); padding: 14px; border-radius: 14px; border: 1.5px solid #0284c7;">
                        <div style="font-size: 13.5px; color: #0369a1; font-weight: 700;">Effective Working Hours</div>
                        <div style="font-size: 22px; font-weight: 900; color: #0284c7; margin-top: 4px;">{ew} hrs</div>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        

  