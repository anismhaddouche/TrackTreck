#!/usr/bin/env python3
"""
Script d'envoi automatique multi-campagnes Macaway vers les groupes WhatsApp B2B.

Campagnes supportées :
1. platform_b2b : Recrutement Agences (1 jour sur 3, image flyer.jpg, alternance matin / après-midi)
2. timimoun     : Offre Séjour Timimoun (Tous les jours, document programme.pdf, rotation sur 4 créneaux)

Options CLI :
  --status              : Affiche l'état et les prévisions de toutes les campagnes
  --campaign <id>       : Exécute une campagne spécifique (ex: --campaign timimoun)
  --test                : Envoie vers le groupe interne Tracktrek pour valider sans polluer les groupes B2B
  --force               : Force l'envoi immédiat sans respecter le délai ni le jitter
"""

import os
import sys
import json
import base64
import random
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(DIR, "config.json")
LOG_FILE = os.path.join(DIR, "publisher.log")
TEST_GROUP_ID = "120363410913560615@g.us"

SLOT_HOURS = {
    "morning": (9, 12),      # 09h00 - 11h59 Alger
    "midday": (12, 15),       # 12h00 - 14h59 Alger
    "afternoon": (15, 18),    # 15h00 - 17h59 Alger
    "evening": (18, 22),      # 18h00 - 21h59 Alger
}

def log(msg):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{now}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def load_config():
    if not os.path.exists(CONFIG_FILE):
        raise FileNotFoundError(f"Configuration manquante: {CONFIG_FILE}")
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def get_current_algeria_time():
    """L'Algérie est en UTC+1 toute l'année."""
    utc_now = datetime.now(timezone.utc)
    return utc_now + timedelta(hours=1)

def get_current_slot(alger_dt):
    hour = alger_dt.hour
    if 9 <= hour < 12:
        return "morning"
    elif 12 <= hour < 15:
        return "midday"
    elif 15 <= hour < 18:
        return "afternoon"
    elif 18 <= hour < 22:
        return "evening"
    return "night"

def get_campaign_paths(campaign_id, campaign_cfg):
    folder_rel = campaign_cfg.get("folder", f"campaigns/{campaign_id}")
    folder = os.path.join(DIR, folder_rel)
    
    media_file = campaign_cfg.get("media_file")
    if not media_file:
        if os.path.exists(os.path.join(folder, "programme.pdf")):
            media_file = "programme.pdf"
        elif os.path.exists(os.path.join(folder, "flyer.jpg")):
            media_file = "flyer.jpg"
        else:
            media_file = "flyer.jpg"

    return {
        "folder": folder,
        "media": os.path.join(folder, media_file),
        "caption": os.path.join(folder, "caption.txt"),
        "history": os.path.join(folder, "history.json")
    }

def load_history(history_path):
    if not os.path.exists(history_path):
        return {"sent_count": 0, "last_slot": None, "history": []}
    try:
        with open(history_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"sent_count": 0, "last_slot": None, "history": []}

def save_history(history_path, history_data):
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history_data, f, indent=2, ensure_ascii=False)

def determine_target_slot(campaign_cfg, history):
    allowed_slots = campaign_cfg.get("slots", ["morning", "afternoon"])
    last_slot = history.get("last_slot")
    if not last_slot or last_slot not in allowed_slots:
        return allowed_slots[0]
    idx = allowed_slots.index(last_slot)
    return allowed_slots[(idx + 1) % len(allowed_slots)]

def check_can_send(campaign_id, campaign_cfg, history, current_slot):
    prod_entries = [e for e in history.get("history", []) if not e.get("is_test")]
    days_interval = campaign_cfg.get("days_interval", 1)

    allowed_slots = campaign_cfg.get("slots", ["morning", "afternoon"])
    if current_slot not in allowed_slots:
        return False, f"Hors créneaux autorisés ({current_slot} n'est pas dans {allowed_slots})."

    expected_slot = determine_target_slot(campaign_cfg, history)

    if not prod_entries:
        if current_slot == expected_slot:
            return True, f"Premier envoi : créneau initial '{current_slot}' prêt."
        return False, f"Premier envoi : en attente du créneau prévu '{expected_slot}' (actuel: '{current_slot}')."

    last_send = prod_entries[-1]
    last_timestamp = last_send.get("timestamp")
    if not last_timestamp:
        return True, "Date précédente invalide."

    last_dt = datetime.fromisoformat(last_timestamp)
    now = datetime.now(timezone.utc)
    delta = now - last_dt

    # Délai minimum avant le prochain envoi
    if days_interval >= 3:
        min_hours = (days_interval * 24) - 5   # ~67h pour 3 jours
    elif days_interval == 1:
        min_hours = 18                         # 18h min pour garantir 1 seul envoi par jour calendrier
    else:
        min_hours = (days_interval * 24) - 4

    if delta.total_seconds() < min_hours * 3600:
        hours_left = round((min_hours * 3600 - delta.total_seconds()) / 3600, 1)
        next_dt = last_dt + timedelta(hours=min_hours)
        return False, f"Délai d'intervalle ({days_interval}j) : dernier envoi le {last_dt.strftime('%d/%m à %H:%M UTC')}. Prochain possible après {next_dt.strftime('%d/%m à %H:%M UTC')} (dans ~{hours_left}h)."

    if current_slot != expected_slot:
        return False, f"Rotation d'horaire : créneau attendu '{expected_slot}', passage actuel = '{current_slot}'. En attente du créneau prévu."

    return True, f"Délai validé ({round(delta.total_seconds()/3600, 1)}h écoulées). Créneau '{current_slot}' prêt."

def send_campaign(campaign_id, campaign_cfg, global_config, force=False, test_group=None):
    paths = get_campaign_paths(campaign_id, campaign_cfg)
    campaign_name = campaign_cfg.get("name", campaign_id)
    history = load_history(paths["history"])

    if not os.path.exists(paths["media"]):
        log(f"[{campaign_id}] ERREUR : Fichier média introuvable ({paths['media']})")
        return False

    if not os.path.exists(paths["caption"]):
        log(f"[{campaign_id}] ERREUR : Caption introuvable ({paths['caption']})")
        return False

    with open(paths["caption"], "r", encoding="utf-8") as f:
        caption = f.read().strip()

    alger_dt = get_current_algeria_time()
    current_slot = get_current_slot(alger_dt)

    if not force:
        can_send, reason = check_can_send(campaign_id, campaign_cfg, history, current_slot)
        if not can_send:
            log(f"[{campaign_id}] SAUTÉ : {reason}")
            return False
        log(f"[{campaign_id}] DÉCLENCHÉ : {reason}")

        jitter_max = global_config.get("jitter_max_minutes", 20)
        if jitter_max > 0:
            delay_sec = random.randint(180, jitter_max * 60)
            log(f"[{campaign_id}] ANTI-BAN : Pause aléatoire de {delay_sec // 60}m {delay_sec % 60}s...")
            time.sleep(delay_sec)
    else:
        log(f"[{campaign_id}] MODE FORCÉ : Envoi immédiat sans délai.")

    # Détection du type de média
    is_pdf = paths["media"].lower().endswith(".pdf")
    media_type = campaign_cfg.get("media_type") or ("document" if is_pdf else "image")
    mimetype = "application/pdf" if is_pdf else "image/jpeg"
    file_name = campaign_cfg.get("file_name") or os.path.basename(paths["media"])

    with open(paths["media"], "rb") as f:
        b64_media = base64.b64encode(f.read()).decode("utf-8")

    if test_group:
        targets = [{"id": test_group, "name": "TEST"}]
    else:
        targets = global_config.get("target_groups", [])

    api_url = global_config.get("evolution_api_url", "http://127.0.0.1/api").rstrip("/")
    instance = global_config.get("instance_name", "tracktrek")
    api_key = global_config.get("api_key")
    endpoint = f"{api_url}/message/sendMedia/{instance}"

    overall_success = True
    any_sent = False

    for idx, target in enumerate(targets):
        group_id = target.get("id")
        group_label = "TEST" if test_group else target.get("name", "B2B")

        if idx > 0:
            inter_delay = global_config.get("inter_group_delay_seconds", 15)
            log(f"[{campaign_id}] Pause de sécurité ({inter_delay}s) avant groupe suivant...")
            time.sleep(inter_delay)

        payload = {
            "number": group_id,
            "mediatype": media_type,
            "mimetype": mimetype,
            "caption": caption,
            "media": b64_media,
            "fileName": file_name
        }

        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"apikey": api_key, "Content-Type": "application/json"},
            method="POST"
        )

        log(f"[{campaign_id}] Publication ({media_type}: {file_name}) dans '{group_label}' ({group_id})...")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                msg_id = res_json.get("key", {}).get("id") or "envoyé"
                log(f"[{campaign_id}] SUCCÈS dans '{group_label}' (ID: {msg_id})")
                any_sent = True

                now_iso = datetime.now(timezone.utc).isoformat()
                history["history"].append({
                    "timestamp": now_iso,
                    "slot": current_slot,
                    "group_id": group_id,
                    "group_name": group_label,
                    "message_id": msg_id,
                    "media_type": media_type,
                    "file_name": file_name,
                    "forced": force,
                    "is_test": bool(test_group)
                })
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="ignore")
            log(f"[{campaign_id}] ERREUR HTTP {e.code} pour '{group_label}' : {err}")
            overall_success = False
        except Exception as e:
            log(f"[{campaign_id}] ERREUR d'envoi pour '{group_label}' : {e}")
            overall_success = False

    if any_sent and not bool(test_group):
        history["sent_count"] = history.get("sent_count", 0) + 1
        history["last_slot"] = current_slot

    history["history"] = history["history"][-100:]
    save_history(paths["history"], history)

    if campaign_id == "platform_b2b" and not bool(test_group):
        root_hist_path = os.path.join(DIR, "history.json")
        save_history(root_hist_path, history)

    return overall_success

def print_status():
    config = load_config()
    alger_dt = get_current_algeria_time()
    current_slot = get_current_slot(alger_dt)
    campaigns = config.get("campaigns", {})

    print("=" * 70)
    print("      MACAWAY PROSPECT PUBLISHER — ÉTAT DES CAMPAGNES B2B")
    print("=" * 70)
    print(f"Heure actuelle (Alger UTC+1) : {alger_dt.strftime('%Y-%m-%d %H:%M')} (Créneau: '{current_slot}')")
    targets = config.get("target_groups", [])
    print(f"Groupes cibles enregistrés ({len(targets)}) :")
    for t in targets:
        print(f"  • {t.get('name')}: {t.get('id')}")
    print("-" * 70)

    for cid, ccfg in campaigns.items():
        enabled = ccfg.get("enabled", True)
        paths = get_campaign_paths(cid, ccfg)
        hist = load_history(paths["history"])
        expected_slot = determine_target_slot(ccfg, hist)
        can_send, reason = check_can_send(cid, ccfg, hist, current_slot)

        media_name = os.path.basename(paths["media"])
        status_tag = "[ ACTIF - PRÊT ]" if can_send else "[ EN PAUSE / EN ATTENTE ]"
        if not enabled:
            status_tag = "[ DÉSACTIVÉ ]"

        print(f"▶ Campagne : {ccfg.get('name', cid)} ({cid}) {status_tag}")
        print(f"  • Fichier média        : {media_name} ({ccfg.get('media_type', 'auto')})")
        print(f"  • Fréquence            : 1 envoi tous les {ccfg.get('days_interval')} jour(s)")
        print(f"  • Créneaux configurés : {ccfg.get('slots')}")
        print(f"  • Dernier créneau envoyé: {hist.get('last_slot')}")
        print(f"  • Prochain créneau visé: '{expected_slot}'")
        print(f"  • Total envoyés        : {hist.get('sent_count', 0)}")
        print(f"  • Diagnostic           : {reason}")
        print("-" * 70)

if __name__ == "__main__":
    if "--status" in sys.argv:
        print_status()
        sys.exit(0)

    cfg = load_config()
    force_run = "--force" in sys.argv
    test_target = TEST_GROUP_ID if "--test" in sys.argv else None

    target_campaign = None
    if "--campaign" in sys.argv:
        idx = sys.argv.index("--campaign")
        if idx + 1 < len(sys.argv):
            target_campaign = sys.argv[idx + 1]

    campaigns = cfg.get("campaigns", {})

    if target_campaign:
        if target_campaign not in campaigns:
            print(f"Erreur: campagne inconnue '{target_campaign}'. Disponibles: {list(campaigns.keys())}")
            sys.exit(1)
        send_campaign(target_campaign, campaigns[target_campaign], cfg, force=force_run, test_group=test_target)
    else:
        for cid, ccfg in campaigns.items():
            if ccfg.get("enabled", True):
                send_campaign(cid, ccfg, cfg, force=force_run, test_group=test_target)
