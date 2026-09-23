#!/usr/bin/env python3
import json
import sqlite3

WF_PATH = "/home/deploy/apps/TrackTreck/workflows/n8n/whatsapp_pipeline_v7.json"
SQLITE_DB = "/var/lib/docker/volumes/tracktreck_n8n_data/_data/database.sqlite"

with open(WF_PATH, "r", encoding="utf-8") as f:
    wf = json.load(f)

for n in wf["nodes"]:
    # 1. Update Build Storage Path
    if n["name"] == "Build Storage Path":
        code = n["parameters"]["jsCode"]
        target = "return [{\n  json: {\n    ...finalPayload,\n    photo_urls:"
        replacement = """return [{
  json: {
    ...finalPayload,
    _content_hash: detectData._content_hash || null,
    _media_type: detectData._media_type || 'image',
    messageId: detectData.messageId || null,
    senderJid: detectData.senderJid || null,
    text: detectData.text || null,
    imageCaption: detectData.imageCaption || null,
    photo_urls:"""
        if target in code:
            n["parameters"]["jsCode"] = code.replace(target, replacement)
            print("Build Storage Path updated successfully")
        elif "_content_hash: detectData._content_hash" in code:
            print("Build Storage Path already contains _content_hash")
        else:
            print("Target not found in Build Storage Path!")

    # 2. Update Detect Noise
    if n["name"] == "Detect Noise":
        code = n["parameters"]["jsCode"]
        target_check = "if (_contentHash && !root.directUpload) {"
        new_check = """const forceUpload = !!(root.body?.force_upload || envelope.force_upload || root.force_upload);
if (_contentHash && !forceUpload) {"""
        if target_check in code:
            code = code.replace(target_check, new_check)
            print("Detect Noise forceUpload check updated successfully")

        # Ensure env vars use fallback
        old_headers = """      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`
      }"""
        new_headers = """      headers: {
        'apikey': (typeof $env !== 'undefined' ? $env.SUPABASE_SERVICE_ROLE_KEY : null) || (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : '') || '',
        'Authorization': `Bearer ${(typeof $env !== 'undefined' ? $env.SUPABASE_SERVICE_ROLE_KEY : null) || (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : '') || ''}`
      }"""
        if old_headers in code:
            code = code.replace(old_headers, new_headers)
            print("Detect Noise headers updated successfully")

        n["parameters"]["jsCode"] = code

# Save to JSON
with open(WF_PATH, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print("Saved to", WF_PATH)

# Sync to SQLite
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
