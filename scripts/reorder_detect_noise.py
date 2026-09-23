#!/usr/bin/env python3
import json
import sqlite3
import subprocess
import time

WF_PATH = "/home/deploy/apps/TrackTreck/workflows/n8n/whatsapp_pipeline_v7.json"
SQLITE_DB = "/var/lib/docker/volumes/tracktreck_n8n_data/_data/database.sqlite"

with open(WF_PATH, "r", encoding="utf-8") as f:
    wf = json.load(f)

for n in wf["nodes"]:
    if n["name"] == "Detect Noise":
        code = n["parameters"]["jsCode"]
        
        # New clean header with Anti-Doublon evaluated FIRST, then Direct Upload Fast Path
        old_head_marker = "// FAST PATH : Uploads manuels depuis le front admin"
        
        # Let's extract everything from "// 1. EXTRACTION DU MESSAGE" down
        extraction_marker = "// 1. EXTRACTION DU MESSAGE"
        idx_ext = code.find(extraction_marker)
        if idx_ext != -1:
            rest_of_code = code[idx_ext:]
            
            new_top = """// ============================================================================
// NŒUD : Detect Noise v4 (Spécialisé : Séjours Organisés & Omra / Hadj)
// PLACE : Après "Detect Content & Generate JobId", AVANT "IF Valid Offer"
// ============================================================================

const root = $json;
const payload = root.originalPayload || root;
const _binaryIn = $input.first().binary || {};

// ============================================================================
// 1. VÉRIFICATION ANTI-DOUBLON PERSISTANTE (Supabase / PostgreSQL)
// ============================================================================
const _contentHash = root._content_hash;
const forceUpload = !!(root.body?.force_upload || root.originalBody?.force_upload || root.force_upload);

if (_contentHash && !forceUpload) {
  try {
    const sKey = (typeof $env !== 'undefined' ? $env.SUPABASE_SERVICE_ROLE_KEY : null) || (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : '') || '';
    const _res = await fetch(`http://supabase-kong:8000/rest/v1/ingestion_hashes?content_hash=eq.${_contentHash}&select=id,tour_id`, {
      headers: {
        'apikey': sKey,
        'Authorization': `Bearer ${sKey}`
      }
    });
    if (_res.ok) {
      const _existing = await _res.json();
      if (Array.isArray(_existing) && _existing.length > 0) {
        return [{
          json: {
            ...root,
            classification: 'duplicate_already_ingested',
            is_valid_offer: false,
            _debug_reason: `duplicate_hash_found_tour_${_existing[0].tour_id}`,
            _existing_tour_id: _existing[0].tour_id
          }
        }];
      }
    }
  } catch (err) {
    // Si échec réseau interne, on continue l'ingestion sans bloquer
  }
}

// ============================================================================
// 2. FAST PATH : Uploads manuels depuis le front admin (si non-doublon)
// ============================================================================
if (root.directUpload === true) {
  let _cls = 'valid_image_offer';
  if (root.hasPdf) _cls = 'valid_pdf_offer';
  else if (!root.hasImage && root.hasText) _cls = 'valid_travel_offer';
  return [{
    json: {
      ...root,
      classification: _cls,
      is_valid_offer: true,
      _debug_reason: 'direct_upload_bypass'
    },
    binary: _binaryIn
  }];
}

"""
            n["parameters"]["jsCode"] = new_top + rest_of_code
            print("Detect Noise successfully updated with dedup check first!")

# Save to JSON
with open(WF_PATH, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

# Sync into SQLite
print("Stopping n8n...")
subprocess.run(["docker", "stop", "n8n"], check=True)

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

cursor.execute("""
    UPDATE workflow_history
    SET nodes = ?, connections = ?, updatedAt = datetime('now')
    WHERE workflowId = 'ZC8ThO4FCw48gpjS'
""", (nodes_json, connections_json))

conn.commit()
conn.close()
print("Updated SQLite workflow_entity and workflow_history!")

print("Starting n8n...")
subprocess.run(["docker", "start", "n8n"], check=True)
time.sleep(3)
print("Restart completed!")
