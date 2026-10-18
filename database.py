import toml
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
import os

_engine = None

def get_engine() -> Engine:
    global _engine
    if _engine is not None:
        return _engine
    
    secrets_path = os.path.join(os.path.dirname(__file__), ".streamlit", "secrets.toml")
    secrets = {}
    if os.path.exists(secrets_path):
        secrets = toml.load(secrets_path)
    
    mysql_cfg = secrets.get("mysql", {})
    host = mysql_cfg.get("host", "srv1044851.hstgr.cloud")
    database = mysql_cfg.get("database", "premji_group")
    user = mysql_cfg.get("user", "premji")
    password = mysql_cfg.get("password", "$Trong_Passw0rd")
    port = mysql_cfg.get("port", 3306)

    import urllib.parse
    conn_url = f"mysql+pymysql://{urllib.parse.quote_plus(user)}:{urllib.parse.quote_plus(password)}@{host}:{port}/{database}"

    _engine = create_engine(
        conn_url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=30,
        pool_size=10,
        max_overflow=5
    )
    return _engine

def get_db_engine():
    return get_engine()

def run_query(query: str, params: dict = None):
    engine = get_engine()
    with engine.connect() as conn:
        res = conn.execute(text(query), params or {})
        try:
            rows = [dict(r._mapping) for r in res.fetchall()]
            return rows
        except Exception:
            return []

def execute_query(query: str, params: dict = None, commit: bool = False):
    engine = get_engine()
    with engine.connect() as conn:
        res = conn.execute(text(query), params or {})
        if commit:
            conn.commit()
            return True
        try:
            return [dict(r._mapping) for r in res.fetchall()]
        except Exception:
            return None
