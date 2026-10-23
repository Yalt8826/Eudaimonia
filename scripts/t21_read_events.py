"""Read device-originated habit_tap rows from the T2.1 scratch spine.

Usage: read_events.py <snapshot_id>
Prints one line with the count, then one JSON object per row — the
contract the device leg asserts on. Rows with id <= snapshot are the
pre-drain (owner-real) events; the leg counts only id > snapshot.
"""

import json
import sqlite3
import sys

conn = sqlite3.connect("/home/yashas/t21-scratch/scratch.db")
conn.row_factory = sqlite3.Row
snapshot = int(sys.argv[1]) if len(sys.argv) > 1 else 0

rows = conn.execute(
    "SELECT e.id, e.ts, e.kind, e.origin, e.source_id, e.external_ref, e.actor,"
    " e.payload, s.name AS src"
    " FROM event e JOIN source s ON s.id = e.source_id"
    " WHERE e.kind = 'habit_tap' AND e.id > ?"
    " ORDER BY e.id",
    (snapshot,),
).fetchall()

print(len(rows))
for r in rows:
    print(json.dumps(dict(r), sort_keys=True))
