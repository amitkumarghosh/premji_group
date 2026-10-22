import os
import io
import base64
from PIL import Image
import paramiko
import toml
from datetime import datetime
import streamlit as st

def get_sftp_config():
    host = os.getenv("SFTP_HOST", "72.60.202.149")
    port = int(os.getenv("SFTP_PORT", "22"))
    username = os.getenv("SFTP_USER", "tools")
    password = os.getenv("SFTP_PASSWORD", "")
    remote_base_dir = os.getenv("SFTP_REMOTE_BASE", "/var/www/premji")
    public_url_base = os.getenv("NEXT_PUBLIC_CDN_BASE", "http://72.60.202.149/premji")

    secrets_path = os.path.join(os.path.dirname(__file__), ".streamlit", "secrets.toml")
    if os.path.exists(secrets_path):
        try:
            sec = toml.load(secrets_path).get("sftp", {})
            host = sec.get("host", host)
            port = int(sec.get("port", port))
            username = sec.get("username", username)
            password = sec.get("password", password)
            remote_base_dir = sec.get("remote_base_dir", remote_base_dir)
            public_url_base = sec.get("public_url_base", public_url_base)
        except Exception:
            pass

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "remote_base_dir": remote_base_dir,
        "public_url_base": public_url_base
    }

def get_sftp_client():
    cfg = get_sftp_config()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        hostname=cfg["host"],
        port=cfg["port"],
        username=cfg["username"],
        password=cfg["password"],
        timeout=10
    )
    sftp = ssh.open_sftp()
    return ssh, sftp

def ensure_remote_dir(sftp, remote_path):
    parts = remote_path.strip("/").split("/")
    cur = ""
    for p in parts:
        cur += "/" + p
        try:
            sftp.stat(cur)
        except Exception:
            try:
                sftp.mkdir(cur)
            except Exception:
                pass

def upload_bytes_to_sftp(remote_file_path: str, data_bytes: bytes) -> bool:
    ssh = None
    sftp = None
    try:
        ssh, sftp = get_sftp_client()
        remote_dir = os.path.dirname(remote_file_path).replace("\\", "/")
        ensure_remote_dir(sftp, remote_dir)
        sftp.putfo(io.BytesIO(data_bytes), remote_file_path.replace("\\", "/"))
        stat = sftp.stat(remote_file_path.replace("\\", "/"))
        return bool(stat and stat.st_size > 0)
    except Exception as e:
        print(f"SFTP upload error: {e}")
        return False
    finally:
        if sftp:
            try: sftp.close()
            except Exception: pass
        if ssh:
            try: ssh.close()
            except Exception: pass

def upload_attendance_image(emp_code: str, action_col: str, image_bytes: bytes) -> str:
    now = datetime.now()
    year = now.strftime("%Y")
    month = now.strftime("%m")
    ts = int(now.timestamp() * 1000)
    col_clean = action_col.replace("_image", "")
    filename = f"{emp_code}_{col_clean}_{ts}.jpg"
    rel_path = f"attendance/{year}/{month}/{filename}"
    cfg = get_sftp_config()
    remote_path = f"{cfg['remote_base_dir']}/{rel_path}"
    
    upload_bytes_to_sftp(remote_path, image_bytes)
    return f"/api/media/view?path={rel_path}"

def upload_jobcard_photo(jobcard_no: str, image_bytes: bytes) -> str:
    now = datetime.now()
    year = now.strftime("%Y")
    month = now.strftime("%m")
    ts = int(now.timestamp() * 1000)
    filename = f"{jobcard_no}_jobcard_{ts}.jpg"
    rel_path = f"jobcards/{year}/{month}/{filename}"
    cfg = get_sftp_config()
    remote_path = f"{cfg['remote_base_dir']}/{rel_path}"
    
    upload_bytes_to_sftp(remote_path, image_bytes)
    return f"/api/media/view?path={rel_path}"

def is_image_url(val) -> bool:
    if not val or not isinstance(val, str):
        return False
    return val.startswith("http") or val.startswith("/api/media") or val.startswith("data:image")

def get_image_url_string(val) -> str:
    return str(val) if val else ""

def resolve_image_bytes(val) -> bytes | None:
    if not val:
        return None
    if isinstance(val, (bytes, memoryview)):
        return bytes(val)
    if isinstance(val, str):
        if val.startswith("data:image"):
            try:
                header, encoded = val.split(",", 1)
                return base64.b64decode(encoded)
            except Exception:
                return None
        # URL or /api/media/view?path=...
        clean_path = val
        if "path=" in clean_path:
            clean_path = clean_path.split("path=", 1)[1]
        clean_path = clean_path.lstrip("/").replace("premji/", "")
        
        cfg = get_sftp_config()
        remote_path = f"{cfg['remote_base_dir']}/{clean_path}"
        try:
            ssh, sftp = get_sftp_client()
            buf = io.BytesIO()
            sftp.getfo(remote_path, buf)
            sftp.close()
            ssh.close()
            return buf.getvalue()
        except Exception:
            return None
    return None

def get_image_thumbnail_b64(val, max_size=(100, 100), quality=75) -> str | None:
    if not val:
        return None
    raw_bytes = resolve_image_bytes(val)
    if not raw_bytes:
        return None
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail(max_size)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"
    except Exception:
        return None

def get_image_full_b64(val) -> str | None:
    raw_bytes = resolve_image_bytes(val)
    if not raw_bytes:
        return None
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"

def show_image_modal(title: str, image_val, filename: str = "photo.jpg"):
    raw_bytes = resolve_image_bytes(image_val)
    if raw_bytes:
        st.image(raw_bytes, caption=title, use_container_width=True)
        st.download_button(
            label="⬇️ Download Photo",
            data=raw_bytes,
            file_name=filename,
            mime="image/jpeg"
        )
    else:
        st.warning("Photo could not be loaded from storage.")
