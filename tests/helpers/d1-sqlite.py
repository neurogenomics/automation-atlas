"""Execute the built migration and Worker SQL against a reduced SQLite limit."""
import json
import sqlite3
import sys


database = sqlite3.connect(sys.argv[1])
database.row_factory = sqlite3.Row
database.execute("PRAGMA foreign_keys = ON")
database.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT, 5)
assert database.getlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT) == 5

try:
    mode, statements = json.load(sys.stdin)
    with database:
        if mode != "read":
            database.execute("BEGIN")
        result = []
        for sql, parameters in statements:
            cursor = database.execute(sql, parameters)
            if mode == "read":
                result.extend(dict(row) for row in cursor)
            else:
                changes = database.execute("SELECT changes()").fetchone()[0]
                result.append({"success": True, "meta": {"changes": changes}})
    print(json.dumps(result))
finally:
    database.close()
