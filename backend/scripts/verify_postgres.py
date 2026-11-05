from sqlalchemy import text

from app.db.session import engine

with engine.connect() as conn:
    rows = conn.execute(
        text("select tablename from pg_tables where schemaname='public' order by 1")
    ).fetchall()
    print("tables:", [r[0] for r in rows])
