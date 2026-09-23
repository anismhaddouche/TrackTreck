#!/usr/bin/env python3
"""
Setup and test Metabase connection to TrackTreck Supabase PostgreSQL.
Runs a native SQL query through Metabase and validates data access.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

METABASE_URL = "http://127.0.0.1:3001"
HOST_HEADER = "bii.tracktreck.com"

ADMIN_EMAIL = "admin@tracktreck.com"
ADMIN_PASSWORD = os.environ.get("METABASE_ADMIN_PASSWORD", "TrackTreck_BI_2026!Secure")

def get_env_var(key, env_file="/home/deploy/apps/TrackTreck/.env"):
    if not os.path.exists(env_file):
        return None
    with open(env_file, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None

SUPABASE_DB_PASSWORD = get_env_var("SUPABASE_DB_PASSWORD")
if not SUPABASE_DB_PASSWORD:
    print("[-] SUPABASE_DB_PASSWORD not found in .env")
    sys.exit(1)

def request(endpoint, method="GET", data=None, session_id=None, via_caddy=False):
    url = f"http://127.0.0.1{endpoint}" if via_caddy else f"{METABASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if via_caddy:
        headers["Host"] = HOST_HEADER
    if session_id:
        headers["X-Metabase-Session"] = session_id
    
    req_body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            res_body = res.read().decode("utf-8")
            return res.status, json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {"raw": err_body}
        return e.code, parsed
    except Exception as e:
        return 0, {"error": str(e)}

def run_loop():
    print("==================================================")
    print("   Starting Metabase TrackTreck Validation Loop   ")
    print("==================================================")
    
    for attempt in range(1, 4):
        print(f"\n--- [Iteration {attempt}/3] Testing Metabase setup and connectivity ---")
        
        # 1. Health check
        code, health = request("/api/health")
        print(f"[*] /api/health (direct): status {code}, response: {health}")
        if code != 200 or health.get("status") != "ok":
            print(f"[-] Metabase not healthy yet. Waiting 5s...")
            time.sleep(5)
            continue

        # 1b. Caddy routing check
        code_caddy, health_caddy = request("/api/health", via_caddy=True)
        print(f"[*] /api/health (via Caddy Host: {HOST_HEADER}): status {code_caddy}, response: {health_caddy}")
        if code_caddy != 200:
            print(f"[-] Caddy routing issue for {HOST_HEADER}")
            time.sleep(3)
            continue

        # 2. Check session properties
        code, props = request("/api/session/properties")
        if code != 200:
            print(f"[-] Failed to get properties: {props}")
            time.sleep(3)
            continue
        
        has_user = props.get("has-user-setup", False)
        setup_token = props.get("setup-token")
        print(f"[*] has-user-setup: {has_user}")

        session_id = None
        
        # 3. Setup if not already done
        if not has_user and setup_token:
            print("[*] Performing initial setup with Supabase Postgres...")
            setup_payload = {
                "token": setup_token,
                "user": {
                    "first_name": "Admin",
                    "last_name": "TrackTreck",
                    "email": ADMIN_EMAIL,
                    "password": ADMIN_PASSWORD
                },
                "prefs": {
                    "site_name": "TrackTreck BI",
                    "site_locale": "fr",
                    "allow_tracking": False
                },
                "database": {
                    "engine": "postgres",
                    "name": "TrackTreck Supabase",
                    "details": {
                        "host": "supabase-db",
                        "port": 5432,
                        "dbname": "postgres",
                        "user": "postgres",
                        "password": SUPABASE_DB_PASSWORD,
                        "ssl": False
                    }
                }
            }
            code_setup, res_setup = request("/api/setup", method="POST", data=setup_payload)
            print(f"[*] Setup response code: {code_setup}")
            if code_setup in (200, 204):
                session_id = res_setup.get("id")
                print(f"[+] Setup completed successfully! Session ID obtained.")
            else:
                print(f"[-] Setup failed: {res_setup}")
                time.sleep(3)
                continue
        
        # 4. Login if session_id not obtained
        if not session_id:
            print(f"[*] Authenticating as {ADMIN_EMAIL}...")
            login_payload = {
                "username": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            code_login, res_login = request("/api/session", method="POST", data=login_payload)
            if code_login == 200:
                session_id = res_login.get("id")
                print("[+] Logged in successfully!")
            else:
                print(f"[-] Login failed: {res_login}")
                time.sleep(3)
                continue
        
        # 5. Check databases
        code_dbs, res_dbs = request("/api/database", session_id=session_id)
        if code_dbs != 200:
            print(f"[-] Failed to fetch databases: {res_dbs}")
            time.sleep(3)
            continue
        
        dbs = res_dbs.get("data", res_dbs) if isinstance(res_dbs, dict) else res_dbs
        tracktreck_db = None
        for db in dbs:
            if db.get("name") == "TrackTreck Supabase" or db.get("details", {}).get("dbname") == "postgres":
                tracktreck_db = db
                break
        
        # If DB is not attached, attach it
        if not tracktreck_db:
            print("[*] 'TrackTreck Supabase' not found, adding database...")
            add_db_payload = {
                "name": "TrackTreck Supabase",
                "engine": "postgres",
                "details": {
                    "host": "supabase-db",
                    "port": 5432,
                    "dbname": "postgres",
                    "user": "postgres",
                    "password": SUPABASE_DB_PASSWORD,
                    "ssl": False
                },
                "is_full_sync": True
            }
            code_add, res_add = request("/api/database", method="POST", data=add_db_payload, session_id=session_id)
            if code_add in (200, 201):
                tracktreck_db = res_add
                print("[+] Database successfully connected!")
            else:
                print(f"[-] Failed to add database: {res_add}")
                time.sleep(3)
                continue
        else:
            print(f"[+] Found database: '{tracktreck_db.get('name')}' (ID: {tracktreck_db.get('id')})")
        
        db_id = tracktreck_db.get("id")

        # 6. Execute SQL queries via Metabase
        print("\n[*] Executing test SQL query 1 via Metabase API...")
        sql1_payload = {
            "database": db_id,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS total_tours, count(CASE WHEN status = 'published' THEN 1 END) AS published_tours FROM public.tours;"
            }
        }
        code_q1, res_q1 = request("/api/dataset", method="POST", data=sql1_payload, session_id=session_id)
        print(f"[*] Query 1 status: {code_q1}")
        
        if code_q1 not in (200, 202) or res_q1.get("status") == "failed":
            print(f"[-] Query 1 error: {res_q1.get('error') or res_q1}")
            time.sleep(3)
            continue
        
        rows1 = res_q1.get("data", {}).get("rows", [])
        cols1 = [c.get("name") for c in res_q1.get("data", {}).get("cols", [])]
        print(f"[+] Query 1 SUCCESS! Columns: {cols1}, Rows: {rows1}")

        # Query 2: Agencies query
        print("\n[*] Executing test SQL query 2 via Metabase API (Agencies)...")
        sql2_payload = {
            "database": db_id,
            "type": "native",
            "native": {
                "query": "SELECT id, name, town, status FROM public.agencies ORDER BY id ASC LIMIT 3;"
            }
        }
        code_q2, res_q2 = request("/api/dataset", method="POST", data=sql2_payload, session_id=session_id)
        print(f"[*] Query 2 status: {code_q2}")
        
        if code_q2 not in (200, 202) or res_q2.get("status") == "failed":
            print(f"[-] Query 2 error: {res_q2.get('error') or res_q2}")
            time.sleep(3)
            continue
        
        rows2 = res_q2.get("data", {}).get("rows", [])
        cols2 = [c.get("name") for c in res_q2.get("data", {}).get("cols", [])]
        print(f"[+] Query 2 SUCCESS! Columns: {cols2}")
        for r in rows2:
            print(f"    - Agency: {r}")

        # If we reached here, everything succeeded!
        print("\n[SUCCESS] All checks and SQL queries completed successfully through Metabase!")
        return {
            "status": "success",
            "iterations": attempt,
            "admin_email": ADMIN_EMAIL,
            "admin_password": ADMIN_PASSWORD,
            "database_id": db_id,
            "database_name": tracktreck_db.get("name"),
            "query1_result": {"cols": cols1, "rows": rows1},
            "query2_result": {"cols": cols2, "rows": rows2}
        }

    print("\n[FAILURE] Failed to complete validation within 3 iterations.")
    return {"status": "failed", "iterations": 3}

if __name__ == "__main__":
    result = run_loop()
    with open("/home/deploy/apps/TrackTreck/.runtime/metabase_validation.json", "w") as f:
        json.dump(result, f, indent=2)
    sys.exit(0 if result["status"] == "success" else 1)
