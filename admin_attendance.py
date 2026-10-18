import streamlit as st
from io import BytesIO, StringIO
import tempfile
from pathlib import Path
from datetime import datetime, timedelta, date
import os
import csv
import base64
from PIL import Image, UnidentifiedImageError

from database import run_query  # your DB helper

# Where to save temp images (Option B - temp directory)
IMAGE_DIR = Path(tempfile.gettempdir()) / "attendance_images"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# How long to keep temp files (hours)
CLEANUP_HOURS = 24


def _cleanup_old_images():
    cutoff = datetime.now() - timedelta(hours=CLEANUP_HOURS)
    for p in IMAGE_DIR.glob("*"):
        try:
            if datetime.fromtimestamp(p.stat().st_mtime) < cutoff:
                p.unlink(missing_ok=True)
        except Exception:
            pass


def _ensure_bytes(blob):
    """Accepts bytes, memoryview, or str and returns bytes or None."""
    if blob is None:
        return None
    if isinstance(blob, bytes):
        return blob
    if isinstance(blob, memoryview):
        return blob.tobytes()
    if isinstance(blob, str):
        return blob.encode("utf-8", errors="ignore")
    try:
        return bytes(blob)
    except Exception:
        return None


def _blob_to_png_bytes(blob):
    """Try to convert any image blob to PNG bytes via PIL. If that fails, return raw bytes."""
    b = _ensure_bytes(blob)
    if not b:
        return None
    try:
        img = Image.open(BytesIO(b))
        # Normalize to a safe mode
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        out = BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()
    except UnidentifiedImageError:
        # Not a recognized image — return raw bytes (still may display depending on browser)
        return b
    except Exception:
        return b


def _save_blob_to_file(blob: bytes, prefix: str):
    """Save blob to disk (PNG if convertible) and return Path or None."""
    pngbytes = _blob_to_png_bytes(blob)
    if not pngbytes:
        return None
    ts = int(datetime.now().timestamp() * 1000)
    dest = IMAGE_DIR / f"{prefix}_{ts}.png"
    try:
        with open(dest, "wb") as f:
            f.write(pngbytes)
        return dest
    except Exception:
        return None


def _blob_to_data_url(blob: bytes):
    """Return a data:image/png;base64,... string suitable for use as an href/src."""
    pngbytes = _blob_to_png_bytes(blob)
    if not pngbytes:
        return None
    b64 = base64.b64encode(pngbytes).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _build_search_query(emp_code: str = None, start_date: date = None, end_date: date = None):
    base = "SELECT * FROM preamji_attendance"
    conditions = []
    params = {}
    if emp_code:
        conditions.append("emp_code_of_thetechnician = :emp")
        params["emp"] = emp_code
    if start_date:
        conditions.append("attendance_date >= :start")
        params["start"] = start_date.isoformat()
    if end_date:
        conditions.append("attendance_date <= :end")
        params["end"] = end_date.isoformat()
    if conditions:
        base += " WHERE " + " AND ".join(conditions)
    base += " ORDER BY id DESC"
    return base, params


def _rows_to_csv_bytes(rows):
    """Convert list-of-mappings rows to CSV bytes."""
    if not rows:
        return b""
    columns = list(rows[0].keys())
    str_buf = StringIO()
    writer = csv.writer(str_buf)
    writer.writerow(columns)
    for r in rows:
        writer.writerow([r.get(c) if r.get(c) is not None else "" for c in columns])
    return str_buf.getvalue().encode("utf-8")


def _rows_to_dataframe(rows):
    import pandas as pd
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def _escape_html(s):
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _make_image_cell(blob, row_id, col_key):
    """Return HTML for a single image cell (thumbnail + click to download)."""
    if not blob:
        return '<div style="color:#94a3b8; font-size:12px;">—</div>'

    from image_storage import get_image_thumbnail_b64, get_image_full_b64
    thumb = get_image_thumbnail_b64(blob, max_size=(80, 60))
    full = get_image_full_b64(blob)
    if not thumb:
        return '<div style="color:#94a3b8; font-size:12px;">—</div>'

    return (
        f'<a href="{full}" download="attendance_{col_key}_{row_id}.jpg" title="Click to download photo">'
        f'<img src="{thumb}" style="max-width:80px;max-height:60px;border-radius:6px;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,0.1);display:block;cursor:pointer;"/>'
        f'</a>'
    )


def _build_html_table(rows, max_rows=100):
    """Render an HTML table (compact) with 4 separate image columns and enlarge modal on click."""
    columns = [
        ("attendance_date", "Date"),
        ("emp_code_of_thetechnician", "Employee Code"),
        ("name_of_technician", "Name"),
        ("center_name", "Center"),
        ("center_location", "Location"),
        ("on_duty_in_time", "In Time"),
        ("intermidiate_off_out_time", "Break Out"),
        ("intermidiate_off_in_time", "Break In"),
        ("on_duty_out_time", "Out Time"),
        ("total_working_hrs", "Gross (H)"),
        ("total_break_hrs", "Break (H)"),
        ("effective_working_hrs", "Effective (H)"),
    ]

    labels_map = {
        "on_duty_in_image": "In Photo",
        "on_duty_out_image": "Out Photo",
        "intermidiate_off_out_image": "Break Start Photo",
        "intermidiate_off_in_image": "Break End Photo"
    }

    def _image_cell(row, col_key):
        """Return HTML for a single image cell with pure CSS click-to-enlarge modal."""
        blob = row.get(col_key)
        if not blob:
            return '<div style="color:#94a3b8; font-size:12px;">—</div>'

        from image_storage import get_image_thumbnail_b64, get_image_full_b64
        row_id = str(row.get("id") or uuid.uuid4().hex[:6])
        emp = str(row.get("emp_code_of_thetechnician") or "emp").strip()
        name = str(row.get("name_of_technician") or "").strip()
        dt = str(row.get("attendance_date") or "date").strip()
        col_lbl = labels_map.get(col_key, col_key)

        thumb = get_image_thumbnail_b64(blob, max_size=(80, 60))
        full = get_image_full_b64(blob)
        if not thumb or not full:
            return '<div style="color:#94a3b8; font-size:12px;">—</div>'

        title = f"📸 {col_lbl} — {name} ({emp}) - {dt}" if name else f"📸 {col_lbl} — {emp} - {dt}"
        clean_title = title.replace('"', '&quot;')
        filename = f"att_{emp}_{col_key}_{dt}.jpg"
        modal_id = f"att_zoom_{row_id}_{col_key}"

        return (
            f'<div class="jc-thumb-wrap">'
            f'<input type="checkbox" id="{modal_id}" class="jc-toggle" />'
            f'<label for="{modal_id}" class="jc-thumb-btn" title="🔍 Click to enlarge photo">'
            f'<img src="{thumb}" class="jc-thumb-img" />'
            f'</label>'
            f'<div class="jc-modal-backdrop">'
            f'<label for="{modal_id}" class="jc-modal-overlay-close"></label>'
            f'<div class="jc-modal-dialog">'
            f'<div class="jc-modal-header">'
            f'<span class="jc-modal-title">{clean_title}</span>'
            f'<label for="{modal_id}" class="jc-modal-close-btn">&times;</label>'
            f'</div>'
            f'<div class="jc-modal-body">'
            f'<img src="{full}" class="jc-modal-large-img" />'
            f'</div>'
            f'<div class="jc-modal-footer">'
            f'<a href="{full}" download="{filename}" class="jc-modal-dl-btn">'
            f'📥 Download Photo'
            f'</a>'
            f'</div>'
            f'</div>'
            f'</div>'
            f'</div>'
        )

    html = []
    html.append("""
<style>
.jc-thumb-wrap {
    display: inline-block;
    position: static;
}
.jc-toggle {
    display: none !important;
}
.jc-modal-backdrop {
    display: none;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(15, 23, 42, 0.7) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    z-index: 99999999 !important;
    justify-content: center !important;
    align-items: center !important;
    margin: 0 !important;
    padding: 0 !important;
}
.jc-toggle:checked ~ .jc-modal-backdrop {
    display: flex !important;
}
.jc-modal-overlay-close {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    cursor: pointer !important;
    z-index: 1 !important;
}
.jc-modal-dialog {
    position: relative !important;
    z-index: 2 !important;
    background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%) !important;
    padding: 22px 26px !important;
    border-radius: 22px !important;
    max-width: 90vw !important;
    max-height: 90vh !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35) !important;
    border: 1.5px solid rgba(186, 230, 253, 0.9) !important;
    text-align: center !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    cursor: default !important;
    animation: jcPop 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
@keyframes jcPop {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
}
.jc-modal-header {
    display: flex !important;
    justify-content: space-between !important;
    width: 100% !important;
    align-items: center !important;
    margin-bottom: 14px !important;
    gap: 16px !important;
}
.jc-modal-title {
    font-size: 15.5px !important;
    font-weight: 700 !important;
    color: #0f172a !important;
    text-align: left !important;
}
.jc-modal-close-btn {
    background: rgba(241, 245, 249, 0.95) !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 50% !important;
    width: 32px !important;
    height: 32px !important;
    font-size: 18px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: #475569 !important;
    font-weight: bold !important;
    user-select: none !important;
    line-height: 1 !important;
}
.jc-modal-close-btn:hover {
    background: #e2e8f0 !important;
    color: #0f172a !important;
}
.jc-modal-body {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    margin-bottom: 18px !important;
    max-height: 300px !important;
    width: 100% !important;
}
.jc-modal-large-img {
    max-height: 280px !important;
    max-width: 100% !important;
    object-fit: contain !important;
    border-radius: 14px !important;
    border: 1.5px solid rgba(186, 230, 253, 0.9) !important;
    box-shadow: 0 8px 24px -4px rgba(2, 132, 199, 0.12) !important;
}
.jc-modal-dl-btn {
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 14px !important;
    padding: 10px 26px !important;
    border-radius: 12px !important;
    text-decoration: none !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    box-shadow: 0 6px 18px rgba(2, 132, 199, 0.35) !important;
    cursor: pointer !important;
}
.jc-modal-dl-btn:hover {
    box-shadow: 0 8px 24px rgba(2, 132, 199, 0.5) !important;
}
.jc-thumb-img {
    max-width: 80px !important;
    max-height: 60px !important;
    border-radius: 8px !important;
    object-fit: cover !important;
    border: 1.5px solid #bae6fd !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08) !important;
    display: block !important;
    cursor: pointer !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
}
.jc-thumb-img:hover {
    transform: scale(1.08) !important;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25) !important;
}
.att-table-scroll-wrapper {
    width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    border-radius: 16px !important;
    border: 1.5px solid rgba(186, 230, 253, 0.8) !important;
    box-shadow: 0 8px 24px -4px rgba(2, 132, 199, 0.08) !important;
    margin-bottom: 24px !important;
    background: rgba(255, 255, 255, 0.85) !important;
}
.att-table-scroll-wrapper::-webkit-scrollbar {
    height: 10px !important;
}
.att-table-scroll-wrapper::-webkit-scrollbar-track {
    background: rgba(240, 249, 255, 0.9) !important;
    border-radius: 8px !important;
}
.att-table-scroll-wrapper::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #38bdf8, #0284c7) !important;
    border-radius: 8px !important;
}
.att-table-scroll-wrapper::-webkit-scrollbar-thumb:hover {
    background: #0369a1 !important;
}

table.att-table {
    width: max-content !important;
    min-width: 100% !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    font-family: inherit !important;
    table-layout: auto !important;
}
table.att-table th, table.att-table td {
    padding: 12px 18px !important;
    border-bottom: 1px solid rgba(186, 230, 253, 0.5) !important;
    text-align: left !important;
    vertical-align: middle !important;
    white-space: nowrap !important;
}
table.att-table th {
    background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%) !important;
    color: #0369a1 !important;
    font-weight: 700 !important;
    font-size: 13.5px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.4px !important;
    border-bottom: 2px solid #7dd3fc !important;
}
table.att-table tr:nth-child(even) {
    background: rgba(240, 249, 255, 0.5) !important;
}
table.att-table tr:hover {
    background: rgba(224, 242, 254, 0.8) !important;
}
</style>
""")


    html.append('<table class="att-table">')

    # ---------- table header ----------
    html.append("<thead><tr>")
    html.append("<th>In Photo</th>")
    html.append("<th>Out Photo</th>")
    html.append("<th>Break start photo</th>")
    html.append("<th>Break end photo</th>")
    for _, label in columns:
        html.append(f"<th>{_escape_html(label)}</th>")
    html.append("</tr></thead><tbody>")

    # ---------- table body ----------
    for r in rows[:max_rows]:
        html.append("<tr>")

        # 4 separate image cells
        html.append(f'<td class="thumb-cell">{_image_cell(r, "on_duty_in_image")}</td>')
        html.append(f'<td class="thumb-cell">{_image_cell(r, "on_duty_out_image")}</td>')
        html.append(f'<td class="thumb-cell">{_image_cell(r, "intermidiate_off_out_image")}</td>')
        html.append(f'<td class="thumb-cell">{_image_cell(r, "intermidiate_off_in_image")}</td>')

        # normal text columns
        for col_key, _label in columns:
            val = r.get(col_key)
            if isinstance(val, (float, int)) and ("hrs" in col_key or "(H)" in _label):
                disp_val = f"{val:.2f}"
            elif isinstance(val, (datetime,)):
                disp_val = val.strftime("%I:%M %p")
            elif val is None or str(val).strip() == "":
                disp_val = "—"
            else:
                disp_val = _escape_html(val)
            html.append(f"<td>{disp_val}</td>")

        html.append("</tr>")

    html.append("</tbody></table>")
    return "\n".join(html)



def admin_attendance_page():
    if not st.session_state.get("logged_in"):
        st.warning("Please log in to view attendance records.")
        return

    # --- Maintenance button at top of page ---
    if st.button("🧹 Clear old picture (older than 31 days)"):
        try:
            from image_storage import cleanup_old_images
            res = cleanup_old_images(max_age_days=31)

            clear_sql = """
                UPDATE preamji_attendance
                SET
                    on_duty_in_image = NULL,
                    on_duty_out_image = NULL,
                    intermidiate_off_out_image = NULL,
                    intermidiate_off_in_image = NULL
                WHERE attendance_date < (CURDATE() - INTERVAL 31 DAY)
            """
            run_query(clear_sql, fetch_one=False)

            try:
                run_query(
                    """
                    UPDATE workorder_entry
                    SET jobcard_photo = NULL
                    WHERE jobcard_date < (CURDATE() - INTERVAL 31 DAY)
                    """,
                    fetch_one=False,
                )
            except Exception:
                pass

            st.success(
                f"Old pictures (>31 days) successfully cleared from database and storage! "
                f"(Remote VPS removed: {res.get('remote_deleted', 0)}, Local cache removed: {res.get('local_deleted', 0)})"
            )
        except Exception as e:
            st.error(f"Failed to clear old pictures: {e}")
#===================================================================
    # --- Summary report for a date range (per employee) ---
    st.subheader("Attendance summary report")

    c1, c2, c3 = st.columns([2, 2, 1])
    with c1:
        summary_start = st.date_input(
            "Report start date", 
            value=date.today() - timedelta(days=30),
            key="summary_start_date"
        )
    with c2:
        summary_end = st.date_input(
            "Report end date", 
            value=date.today(),
            key="summary_end_date"
        )
    with c3:
        generate_report = st.button("Generate report", key="btn_generate_report")

    if generate_report:
        if summary_start > summary_end:
            st.error("Start date cannot be after end date.")
        else:
            summary_sql = """
                SELECT
                    emp_code_of_thetechnician AS Employee_Code,
                    name_of_technician       AS Employee_Name,
                    MAX(center_name)         AS Center_Name,
                    MAX(center_location)     AS Center_Location,
                    COUNT(*)                 AS Count_Days,
                    ROUND(COALESCE(SUM(total_working_hrs), 0), 2)    AS Total_Working_Hours,
                    ROUND(COALESCE(SUM(total_break_hrs), 0), 2)      AS Total_Break_Hours,
                    ROUND(COALESCE(SUM(effective_working_hrs), 0), 2) AS Total_Effective_Hours
                FROM preamji_attendance
                WHERE attendance_date BETWEEN :start AND :end
                GROUP BY emp_code_of_thetechnician, name_of_technician
                ORDER BY employee_name, employee_code
            """
            params = {
                "start": summary_start.isoformat(),
                "end": summary_end.isoformat(),
            }
            summary_rows = run_query(summary_sql, params, fetch_one=False) or []
            st.write(f"Found {len(summary_rows)} employee(s) in this date range.")

            if summary_rows:
                # Convert to dataframe for nice table view
                df_summary = _rows_to_dataframe(summary_rows)
                st.dataframe(df_summary, width='stretch')

                # CSV download
                csv_bytes = _rows_to_csv_bytes(summary_rows)
                st.download_button(
                    "Download summary report as CSV",
                    data=csv_bytes,
                    file_name=f"attendance_summary_{summary_start}_to_{summary_end}.csv",
                    mime="text/csv",
                )
            else:
                st.info("No attendance data found for the selected date range.")



#===================================================================
    # ---- Search area ----
    st.subheader("Search attendance (employee code + date range)")
    with st.form("attendance_search_form", clear_on_submit=False):
        col1, col2, col3 = st.columns([3, 2, 2])
        with col1:
            emp_code = st.text_input("Employee Code (exact, e.g. AL0001)")
        with col2:
            start = st.date_input("Start date", value=date.today() - timedelta(days=30))
        with col3:
            end = st.date_input("End date", value=date.today())
        submitted = st.form_submit_button("Search")

    # ---- Search results OUTSIDE the form (full width) ----
    if submitted:
        q, params = _build_search_query(
            emp_code.strip() if emp_code else None, start, end
        )
        rows = run_query(q, params, fetch_one=False) or []
        st.write(f"Found {len(rows)} matching rows")

        if rows:
            csv_bytes = _rows_to_csv_bytes(rows)
            st.download_button(
                "Download results as CSV",
                data=csv_bytes,
                file_name="attendance_results.csv",
                mime="text/csv",
            )

            html = _build_html_table(rows, max_rows=len(rows))
            st.html(f'<div class="att-table-scroll-wrapper">{html}</div>')
        else:
            st.info("No records match your search.")

    st.markdown("---")
    st.caption(
        "Images are rendered as thumbnails with in-app click to enlarge and download."
    )

    _cleanup_old_images()

    # --- Today's records, shown only after button click ---
    st.subheader("Today's attendance entries (table)")

    if st.button("Show today's attendance records"):
        today = date.today().isoformat()
        today_sql = """
            SELECT *
            FROM preamji_attendance
            WHERE attendance_date = :today
            ORDER BY id DESC
        """
        today_rows = run_query(today_sql, {"today": today}, fetch_one=False) or []

        if today_rows:
            html = _build_html_table(today_rows, max_rows=len(today_rows))
            st.html(f'<div class="att-table-scroll-wrapper">{html}</div>')



            # CSV download for today's records
            csv_bytes = _rows_to_csv_bytes(today_rows)
            st.download_button(
                "Download today's attendance as CSV",
                data=csv_bytes,
                file_name=f"attendance_{today}.csv",
                mime="text/csv",
            )
        else:
            st.info("No attendance records found for today.")

    st.markdown("---")
