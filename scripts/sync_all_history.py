#!/usr/bin/env python3
import json
import sqlite3
import subprocess
import time

WF_PATH = "/home/deploy/apps/TrackTreck/workflows/n8n/whatsapp_pipeline_v7.json"
SQLITE_DB = "/var/lib/docker/volumes/tracktreck_n8n_data/_data/database.sqlite"

with open(WF_PATH, "r", encoding="utf-8") as f:
    wf = json.load(f)

nodes_json = json.dumps(wf["nodes"])
connections_json = json.dumps(wf["connections"])
settings_json = json.dumps(wf.get("settings", {}))

print("Stopping n8n...")
subprocess.run(["docker", "stop", "n8n"], check=True)

print("Updating SQLite workflow_entity and workflow_history...")
conn = sqlite3.connect(SQLITE_DB)
cursor = conn.cursor()

# 1. Update workflow_entity
cursor.execute("""
    UPDATE workflow_entity 
    SET nodes = ?, connections = ?, settings = ?, updatedAt = datetime('now')
    WHERE id = 'ZC8ThO4FCw48gpjS'
""", (nodes_json, connections_json, settings_json))

# 2. Update workflow_history for this workflow
cursor.execute("""
    UPDATE workflow_history
    SET nodes = ?, connections = ?, updatedAt = datetime('now')
    WHERE workflowId = 'ZC8ThO4FCw48gpjS'
""", (nodes_json, connections_json))

conn.commit()

# Check
cursor.execute("SELECT count(*) FROM workflow_history WHERE workflowId = 'ZC8ThO4FCw48gpjS'")
count = cursor.fetchone()[0]
print(f"Updated {count} records in workflow_history")

cursor.execute("SELECT versionId FROM workflow_history WHERE workflowId = 'ZC8ThO4FCw48gpjS' AND nodes LIKE '%_content_hash%'")
rows = cursor.fetchall()
print(f"{len(rows)} versions in workflow_history now have _content_hash!")

conn.close()

print("Starting n8n...")
subprocess.run(["docker", "start", "n8n"], check=True)
time.sleep(3)
print("Done!")
