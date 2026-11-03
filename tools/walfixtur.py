# /// script
# requires-python = ">=3.12"
# ///
# Makes tests/fixtures/wal.db with uncommitted-to-disk rows in wal.db-wal, like Anki while it is open.
import shutil, sqlite3, tempfile
from pathlib import Path

UT = Path(__file__).resolve().parent.parent / "tests/fixtures"
with tempfile.TemporaryDirectory() as tmp:
    p = Path(tmp) / "wal.db"
    db = sqlite3.connect(p)
    db.execute("pragma journal_mode=wal")
    db.execute("pragma wal_autocheckpoint=0")
    db.execute("create table t (id integer primary key, namn text)")
    db.execute("insert into t (namn) values ('i databasen')")
    db.commit()
    db.execute("pragma wal_checkpoint(truncate)")
    for i in range(300):
        db.execute("insert into t (namn) values (?)", (f"bara i wal {i}",))
    db.commit()
    # An uncommitted transaction must not be seen.
    db.execute("insert into t (namn) values ('ej committad')")
    shutil.copy(p, UT / "wal.db")
    shutil.copy(str(p) + "-wal", UT / "wal.db-wal")
    db.rollback()
    db.close()
print("ok")
