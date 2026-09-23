#!/usr/bin/env python3
"""
Script d'envoi automatique du Flyer Macaway vers un groupe WhatsApp B2B.

RÈGLES MÉTIER :
1. Fréquence : Publie exactement 1 jour sur 3 (délai minimal ~70h entre 2 envois).
2. Horaires variés : Alterne entre créneau du MATIN (10h-11h Alger) et créneau d'APRÈS-MIDI (16h-17h Alger).
3. Anti-ban WhatsApp : Ajoute un décalage aléatoire de 5 à 25 minutes (jitter humain) pour ne jamais poster à la même minute.
4. Historique & logs : Enregistre chaque publication dans history.json et publisher.log.
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
CAPTION_FILE = os.path.join(DIR, "caption.txt")
FLYER_FILE = os.path.join(DIR, "flyer.jpg")
HISTORY_FILE = os.path.join(DIR, "history.json")
LOG_FILE = os.path.join(DIR, "publisher.log")

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

def load_caption():
    if not os.path.exists(CAPTION_FILE):
        raise FileNotFoundError(f"Fichier caption manquant: {CAPTION_FILE}")
    with open(CAPTION_FILE, "r", encoding="utf-8") as f:
        return f.read().strip()

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return {"sent_count": 0, "last_slot": None, "history": []}
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"sent_count": 0, "last_slot": None, "history": []}

def save_history(history_data):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history_data, f, indent=2, ensure_ascii=False)

def get_current_algeria_hour():
    """L'Algérie est en UTC+1 toute l'année."""
    utc_now = datetime.now(timezone.utc)
    algeria_now = utc_now + timedelta(hours=1)
    return algeria_now.hour, algeria_now.minute

def determine_target_slot(history):
    """Alterne entre 'morning' et 'afternoon' pour varier les horaires."""
    last_slot = history.get("last_slot")
    if last_slot == "morning":
        return "afternoon"
    return "morning"

def check_can_send(config, history, current_slot):
    """Vérifie l'intervalle 1 jour sur 3 et la cohérence du créneau."""
    prod_entries = [e for e in history.get("history", []) if not e.get("is_test")]
    days_interval = config.get("days_interval", 3)
    
    if not prod_entries:
        return True, "Premier envoi : prêt."

    last_send = prod_entries[-1]
    last_timestamp = last_send.get("timestamp")
    if not last_timestamp:
        return True, "Date précédente invalide."

    last_dt = datetime.fromisoformat(last_timestamp)
    now = datetime.now(timezone.utc)
    delta = now - last_dt

    # Exiger au moins (interval * 24 - 5) heures de repos
    min_hours = (days_interval * 24) - 5
    if delta.total_seconds() < min_hours * 3600:
        days_left = round((min_hours * 3600 - delta.total_seconds()) / 86400, 1)
        next_dt = last_dt + timedelta(days=days_interval)
        return False, f"Règle 1 jour sur 3 : dernier envoi le {last_dt.strftime('%d/%m à %H:%M')}. Prochain envoi vers le {next_dt.strftime('%d/%m')} (dans ~{days_left} jour(s))."

    # Vérification de l'alternance de créneau
    expected_slot = determine_target_slot(history)
    if current_slot != expected_slot:
        return False, f"Alternance d'horaire : le créneau attendu pour cet envoi est '{expected_slot}', passage actuel = '{current_slot}'. En attente du créneau prévu."

    return True, f"Délai respecté (dernier envoi il y a {delta.days} jours). Créneau '{current_slot}' validé."

def send_flyer(force=False, test_group=None):
    config = load_config()
    caption = load_caption()
    history = load_history()

    if not os.path.exists(FLYER_FILE):
        log(f"ERREUR : Fichier flyer introuvable dans {FLYER_FILE}")
        return False

    # Identification du créneau actuel (heure d'Alger)
    alger_hour, alger_min = get_current_algeria_hour()
    current_slot = "morning" if alger_hour < 14 else "afternoon"

    if not force:
        can_send, reason = check_can_send(config, history, current_slot)
        if not can_send:
            log(f"SAUTÉ : {reason}")
            return False
        log(f"CRON DÉCLENCHÉ : {reason}")

        # Anti-ban Jitter : pause aléatoire de 5 à N minutes
        jitter_max = config.get("jitter_max_minutes", 20)
        if jitter_max > 0:
            delay_sec = random.randint(180, jitter_max * 60)
            log(f"ANTI-BAN : Pause aléatoire humaine de {delay_sec // 60}m {delay_sec % 60}s avant l'envoi...")
            time.sleep(delay_sec)
    else:
        log("MODE FORCÉ : Envoi immédiat sans attente de délai ni de jitter.")

    # Encodage de l'image
    with open(FLYER_FILE, "rb") as f:
        b64_image = base64.b64encode(f.read()).decode("utf-8")

    if test_group:
        targets = [{"id": test_group, "name": "TEST"}]
    elif "target_groups" in config and config["target_groups"]:
        targets = config["target_groups"]
    else:
        targets = [{"id": config.get("target_group_id"), "name": config.get("target_group_name", "B2B")}]

    api_url = config.get("evolution_api_url", "http://127.0.0.1/api").rstrip("/")
    instance = config.get("instance_name", "tracktrek")
    api_key = config.get("api_key")
    endpoint = f"{api_url}/message/sendMedia/{instance}"

    overall_success = True
    any_sent = False

    for idx, target in enumerate(targets):
        group_id = target.get("id")
        group_label = "TEST" if test_group else target.get("name", "B2B")

        if idx > 0:
            delay_between = config.get("inter_group_delay_seconds", 15)
            log(f"Pause anti-spam de sécurité ({delay_between}s) avant le groupe suivant...")
            time.sleep(delay_between)

        payload = {
            "number": group_id,
            "mediatype": "image",
            "mimetype": "image/jpeg",
            "caption": caption,
            "media": b64_image,
            "fileName": "flyer_macaway.jpg"
        }

        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "apikey": api_key,
                "Content-Type": "application/json"
            },
            method="POST"
        )

        log(f"Publication du Flyer dans '{group_label}' ({group_id})...")

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp_body = resp.read().decode("utf-8")
                res_json = json.loads(resp_body)
                msg_id = res_json.get("key", {}).get("id") or "envoyé"

                log(f"SUCCÈS : Flyer publié avec succès dans '{group_label}' ! (Message ID: {msg_id})")
                any_sent = True

                # Sauvegarde dans l'historique
                now_iso = datetime.now(timezone.utc).isoformat()
                is_test = bool(test_group)
                history["history"].append({
                    "timestamp": now_iso,
                    "slot": current_slot,
                    "group_id": group_id,
                    "group_name": group_label,
                    "message_id": msg_id,
                    "forced": force,
                    "is_test": is_test
                })

        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="ignore")
            log(f"ERREUR HTTP {e.code} Evolution API pour '{group_label}' : {err}")
            overall_success = False
        except Exception as e:
            log(f"ERREUR d'envoi pour '{group_label}' : {e}")
            overall_success = False

    if any_sent and not bool(test_group):
        history["sent_count"] = history.get("sent_count", 0) + 1
        history["last_slot"] = current_slot

    history["history"] = history["history"][-100:]
    save_history(history)
    return overall_success

def print_status():
    config = load_config()
    history = load_history()
    alger_h, alger_m = get_current_algeria_hour()
    current_slot = "morning" if alger_h < 14 else "afternoon"
    expected_slot = determine_target_slot(history)

    print("=" * 65)
    print("  MACAWAY PROSPECT PUBLISHER — ÉTAT DU CRON")
    print("=" * 65)
    print(f"Heure actuelle (Alger) : {alger_h:02d}:{alger_m:02d} (créneau actuel: {current_slot})")
    targets = config.get("target_groups") or [{"id": config.get("target_group_id"), "name": config.get("target_group_name")}]
    print(f"Groupes cibles ({len(targets)}) :")
    for t in targets:
        print(f"  - {t.get('name')}: {t.get('id')}")
    print(f"Fréquence              : 1 jour sur {config.get('days_interval', 3)} (alternance matin / après-midi)")
    print(f"Prochain créneau visé  : {expected_slot}")
    print(f"Total envoyés (sessions): {history.get('sent_count', 0)}")
    
    can_send, reason = check_can_send(config, history, current_slot)
    print("-" * 65)
    print(f"Statut si exécuté automatiquement : {'>> PRÊT À ENVOYER <<' if can_send else 'EN PAUSE / EN ATTENTE'}")
    print(f"Raison : {reason}")
    print("=" * 65)

if __name__ == "__main__":
    if "--status" in sys.argv:
        print_status()
        sys.exit(0)
    
    force_run = "--force" in sys.argv
    test_target = None

    if "--test" in sys.argv:
        # Envoi de test vers le groupe interne Tracktrek pour vérifier sans polluer le groupe B2B
        test_target = "120363410913560615@g.us"
        force_run = True
        log("Test demandé : envoi vers le groupe interne Tracktrek...")

    send_flyer(force=force_run, test_group=test_target)
