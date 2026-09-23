#!/usr/bin/env python3
import json
import sqlite3
import subprocess
import time

WF_PATH = "/home/deploy/apps/TrackTreck/workflows/n8n/whatsapp_pipeline_v7.json"
SQLITE_DB = "/var/lib/docker/volumes/tracktreck_n8n_data/_data/database.sqlite"

# 1. Update JSON with inserted_hash_count
with open(WF_PATH, "r", encoding="utf-8") as f:
    wf = json.load(f)

for n in wf["nodes"]:
    if n["name"] == "Execute a SQL query":
        q = n["parameters"]["query"]
        if "(SELECT count(*) FROM inserted_hash) AS inserted_hash_count" not in q:
            old_s = "(SELECT count(*) FROM inserted_departures) AS inserted_departures_count\nFROM inserted_tour tour;"
            new_s = "(SELECT count(*) FROM inserted_departures) AS inserted_departures_count,\n  (SELECT count(*) FROM inserted_hash) AS inserted_hash_count\nFROM inserted_tour tour;"
            n["parameters"]["query"] = q.replace(old_s, new_s)
            print("Added inserted_hash_count to Execute a SQL query")

with open(WF_PATH, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

# 2. Stop n8n to avoid SQLite write conflicts
print("Stopping n8n container...")
subprocess.run(["docker", "stop", "n8n"], check=True)

# 3. Update SQLite
print("Updating SQLite database...")
conn = sqlite3.connect(SQLITE_DB)
cursor = conn.cursor()

nodes_json = json.dumps(wf["nodes"])
connections_json = json.dumps(wf["connections"])
settings_json = json.dumps(wf.get("settings", {}))

cursor.execute("""
    UPDATE workflow_entity 
    SET nodes = ?, connections = ?, settings = ?, updatedAt = datetime('now')
    WHERE id = 'ZC8ThO4FCw48gpjS'
""", (nodes_json, connections_json, settings_json))

conn.commit()
conn.close()
print("SQLite updated successfully!")

# 4. Start n8n
print("Starting n8n container...")
subprocess.run(["docker", "start", "n8n"], check=True)

# 5. Verify SQLite content
time.sleep(3)
conn = sqlite3.connect(SQLITE_DB)
cursor = conn.cursor()
cursor.execute("SELECT nodes FROM workflow_entity WHERE id = 'ZC8ThO4FCw48gpjS'")
nodes = json.loads(cursor.fetchone()[0])
conn.close()

bsp_ok = False
sql_ok = False
for n in nodes:
    if n["name"] == "Build Storage Path" and "_content_hash: detectData._content_hash" in n["parameters"]["jsCode"]:
        bsp_ok = True
    if n["name"] == "Execute a SQL query" and "inserted_hash_count" in n["parameters"]["query"]:
        sql_ok = True

print(f"Verification: Build Storage Path has _content_hash = {bsp_ok}")
print(f"Verification: Execute a SQL query has inserted_hash_count = {sql_ok}")
