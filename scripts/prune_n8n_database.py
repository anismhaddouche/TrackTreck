#!/usr/bin/env python3
import sqlite3
import subprocess
import time
import os

DB_PATH = "/var/lib/docker/volumes/tracktreck_n8n_data/_data/database.sqlite"

print(f"Initial DB size: {os.path.getsize(DB_PATH) / (1024*1024):.2f} MB")

# 1. Stop n8n cleanly
print("Stopping n8n container...")
subprocess.run(["docker", "stop", "n8n"], check=True)

# 2. Connect to SQLite
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Get total executions before
cursor.execute("SELECT count(*) FROM execution_entity")
total_before = cursor.fetchone()[0]
print(f"Total executions before cleanup: {total_before}")

# Find IDs to delete (keep the last 500 executions, or everything from the last 3 days)
# Let's keep the last 500 executions:
cursor.execute("""
    SELECT id FROM execution_entity 
    ORDER BY id DESC 
    LIMIT 500
""")
keep_ids = set(r[0] for r in cursor.fetchall())
print(f"Preserving the {len(keep_ids)} most recent executions.")

# Delete older executions from related tables
cursor.execute("SELECT id FROM execution_entity")
all_ids = set(r[0] for r in cursor.fetchall())
delete_ids = list(all_ids - keep_ids)
print(f"Deleting {len(delete_ids)} old executions and huge blobs...")

# Delete in batches
batch_size = 500
for i in range(0, len(delete_ids), batch_size):
    batch = delete_ids[i:i + batch_size]
    placeholders = ",".join("?" for _ in batch)
    cursor.execute(f"DELETE FROM execution_data WHERE executionId IN ({placeholders})", batch)
    cursor.execute(f"DELETE FROM execution_metadata WHERE executionId IN ({placeholders})", batch)
    cursor.execute(f"DELETE FROM execution_entity WHERE id IN ({placeholders})", batch)
    conn.commit()

# Check total executions after
cursor.execute("SELECT count(*) FROM execution_entity")
total_after = cursor.fetchone()[0]
print(f"Total executions after cleanup: {total_after}")

# 3. VACUUM to reclaim disk space
print("Running VACUUM to compact database file...")
cursor.execute("VACUUM")
conn.commit()
conn.close()

final_size = os.path.getsize(DB_PATH) / (1024*1024)
print(f"Final DB size after VACUUM: {final_size:.2f} MB")
