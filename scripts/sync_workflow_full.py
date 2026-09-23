#!/usr/bin/env python3
import json
import sqlite3
import subprocess
import os

WF_FILE = "/home/deploy/apps/TrackTreck/workflows/n8n/whatsapp_pipeline_v7.json"
SQLITE_DB = "/var/lib/docker/volumes/tracktreck_n8n_data/_data/database.sqlite"

# Descriptions complètes pour chaque nœud
NODE_NOTES = {
    "Webhook": "Point d'entrée manuel / API externe : Permet de tester ou d'injecter manuellement des offres de voyage (JSON / multipart).",
    "Edit Fields": "Préparation des paramètres : Initialise les variables de requête et normalise les entrées directes.",
    "HTTP Request": "Téléchargement Image WhatsApp : Récupère le binaire de l'image via l'API Evolution / WhatsApp CDN.",
    "Convert to File": "Conversion Binaire Image : Convertit le buffer base64 reçu en fichier binaire prêt pour LlamaParse et Supabase Storage.",
    "Message a model": "Analyse Gemini Texte : Analyse sémantique directe pour les offres publiées uniquement sous forme de texte brut.",
    "HTTP Request1": "Téléchargement PDF WhatsApp : Récupère le binaire du document PDF via l'API Evolution.",
    "Convert to File1": "Conversion Binaire PDF : Convertit le buffer base64 du PDF en fichier binaire pour LlamaParse.",
    "Wait": "Délai d'attente LlamaParse Image : Pause de quelques secondes avant d'interroger le résultat du parsing LlamaParse.",
    "Wait1": "Délai d'attente LlamaParse PDF : Pause de quelques secondes avant d'interroger le résultat du parsing LlamaParse.",
    "Detect Content & Generate JobId": "Détection de Média & Empreinte SHA-256 : Identifie le type de contenu (image, pdf, texte), génère le job_id et calcule le hash combiné (média + légende) pour l'anti-doublon.",
    "if texte": "Routage Branche Texte : Oriente le flux vers l'analyse IA textuelle si l'offre ne contient ni image ni PDF.",
    "if pdf": "Routage Branche PDF : Oriente le flux vers le pipeline LlamaParse PDF si un document est détecté.",
    "Get Parse Result": "Récupération OCR Image : Interroge l'API LlamaParse pour récupérer le Markdown textuel extrait du flyer.",
    "Get Parse Result 2": "Récupération OCR PDF : Interroge l'API LlamaParse pour récupérer le Markdown textuel extrait de la brochure PDF.",
    "LLama Extraction": "OCR Image LlamaParse : Envoie l'image du flyer à LlamaParse en mode standard (1 crédit/page) pour extraire tableaux et textes.",
    "LLama Extraction1": "OCR PDF LlamaParse : Envoie la brochure PDF à LlamaParse en mode standard (1 crédit/page) pour extraction complète.",
    "Collect & Dynamic Merge": "Fusion & Normalisation Métier : Réconcilie les données extraites (texte + flyer), applique les règles de traduction (pays, services) et sécurise les formats.",
    "Respond with Merged Result": "Réponse Synchrone Webhook : Renvoie le résultat final au client si l'appelant attend une réponse synchrone.",
    "Merge": "Synchronisation Flux Image : Combine le résultat JSON de l'extraction avec le binaire de l'image pour le stockage.",
    "Merge 2": "Synchronisation Flux PDF : Combine le résultat JSON de l'extraction avec le binaire du PDF pour le stockage.",
    "if image": "Routage Branche Image : Oriente le flux vers le pipeline LlamaParse Image si une photo/flyer est présente.",
    "Format Text Result": "Normalisation Schéma Texte : Convertit la réponse IA du texte brut dans le format standardisé de l'application TrackTreck.",
    "Format PDF Result": "Normalisation Schéma PDF : Convertit la réponse IA de la brochure PDF dans le format standardisé de l'application TrackTreck.",
    "Format Image Result": "Normalisation Schéma Image : Convertit la réponse IA du flyer dans le format standardisé de l'application TrackTreck.",
    "Detect Noise": "Filtre Anti-Bruit & Anti-Doublon : Élimine les messages hors-sujet (visas, demandes, vols secs) et bloque les doublons persistants via la table Supabase ingestion_hashes.",
    "IF Valid Offer": "Garde-Fou Offre Valide : Bloque net le traitement si le message est classifié comme bruit ou doublon (0 crédit gaspillé).",
    "Execute a SQL query": "Persistance PostgreSQL Atomique : Insère le voyage, les étapes, les hôtels, les dates de départ et sauvegarde l'empreinte SHA-256 dans ingestion_hashes.",
    "Upload image": "Stockage Supabase Image : Téléverse l'image du flyer dans le bucket S3/Supabase Storage sous son chemin hiérarchique.",
    "Upload PDF": "Stockage Supabase PDF : Téléverse la brochure PDF dans le bucket S3/Supabase Storage.",
    "Merge Image JSON + Binary": "Jointure Données Image : Associe le fichier binaire de l'image aux métadonnées de voyage calculées.",
    "Merge PDF JSON + Binary": "Jointure Données PDF : Associe le fichier binaire du PDF aux métadonnées de voyage calculées.",
    "Build Storage Path": "Génération Chemins Supabase : Construit l'arborescence {country}/{agency}/{id}/ et génère les URLs publiques pérennes.",
    "Prepare Caption": "Préparation Légende : Génère un fichier texte contenant la légende WhatsApp originale pour archive.",
    "Upload Caption": "Stockage Supabase Légende : Enregistre le texte original du message WhatsApp à côté des médias sur Supabase Storage.",
    "List Storage Folder": "Calcul Séquence Publication : Interroge Supabase Storage pour déterminer le prochain numéro séquentiel de publication.",
    "Compute Slugs": "Génération Slugs & Identifiants : Crée les slugs SEO-friendly pour le voyage, l'agence et la destination.",
    "If Direct Image": "Détection Upload Direct Image : Vérifie si le binaire provient d'un téléversement direct ou du webhook WhatsApp.",
    "If Direct PDF": "Détection Upload Direct PDF : Vérifie si le binaire provient d'un téléversement direct ou du webhook WhatsApp.",
    "Call Gemini PDF": "Analyse Sémantique PDF Gemini : Extrait la structure du voyage (dates, prix, hôtels, étapes) depuis le texte OCR du PDF.",
    "Prepare Gemini Body": "Formatage Requête PDF Gemini : Construit le prompt système et le payload JSON pour l'analyse du PDF par Gemini.",
    "WhatsApp Webhook": "Réception Webhook WhatsApp : Écoute les événements entrants en temps réel envoyés par l'instance Evolution API.",
    "Respond 200 Immediately": "Accusé de Réception HTTP 200 : Répond instantanément à WhatsApp / Evolution API pour éviter les réémissions et timeouts.",
    "WhatsApp Filter & Dedup": "Filtrage Initial & Déduplication Rapide : Ignore les statuts, messages sortants et élimine les doublons récents (empreinte média + légende en mémoire).",
    "Is Manual Upload?": "Aiguillage Mode d'Ingestion : Détermine si le message provient d'un flux WhatsApp en direct ou d'un test/upload manuel.",
    "Prepare Gemini Body image": "Formatage Requête Image Gemini : Construit le prompt système et le payload JSON pour l'analyse du flyer par Gemini.",
    "Call Gemini image": "Analyse Sémantique Image Gemini : Extrait la structure du voyage (dates, prix, hôtels, étapes) depuis le texte OCR de l'image."
}

# Descriptions globales pour chaque workflow dans n8n
WORKFLOW_DESCRIPTIONS = {
    "ZC8ThO4FCw48gpjS": "Pipeline Principal (PRODUCTION) : Ingestion temps réel des offres de voyage depuis WhatsApp B2B et uploads manuels. Déduplication cryptographique SHA-256 (Média + Légende), filtrage anti-bruit, OCR LlamaParse standard (1 crédit/page), analyse sémantique Gemini 1.5 Flash et insertion atomique dans PostgreSQL / Supabase.",
    "9KaB1uosbpClVaAo": "Sauvegarde (BACKUP) : Copie de sauvegarde de whatsapp_pipeline_v7 avant la refonte anti-doublon cryptographique et les optimisations LlamaParse.",
    "PKbupYGe6da5dbjy": "Expérimental (DRAFT v8) : Version de travail pour tester les futures fonctionnalités et architectures de pipeline.",
    "O4k3MlkTXzlLEhlk": "Archive Historique (v7 initiale) : Ancienne version du pipeline d'ingestion WhatsApp conservée pour traçabilité."
}

# 1. Mise à jour du JSON
with open(WF_FILE, "r", encoding="utf-8") as f:
    wf = json.load(f)

wf["id"] = "ZC8ThO4FCw48gpjS"
wf["name"] = "whatsapp_pipeline_v7"

for node in wf["nodes"]:
    name = node.get("name")
    if name in NODE_NOTES:
        node["notesInFlow"] = True
        node["notes"] = NODE_NOTES[name]

# Ajout de Sticky Notes visuels dans le canvas n8n pour cartographier le workflow
existing_sticky_names = [n["name"] for n in wf["nodes"] if n.get("type") == "n8n-nodes-base.stickyNote"]
if not existing_sticky_names:
    sticky_notes = [
        {
            "parameters": {
                "content": "## 1. Réception & Filtrage Réseau\n- Webhook WhatsApp (Evolution API)\n- Webhook Ingestion Manuelle\n- Accusé 200 immédiat\n- Filtrage fromMe / B2B & Dédup mémoire",
                "height": 320,
                "width": 380,
                "color": 4
            },
            "id": "sticky-zone-1",
            "name": "Note : Réception & Filtrage",
            "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1,
            "position": [-300, 7700]
        },
        {
            "parameters": {
                "content": "## 2. Détection Média & Anti-Doublon SHA-256\n- Calcul hash cryptographique (Image/PDF + Légende)\n- Détection de bruit (visas, vols secs, salutations)\n- Interrogation Supabase ingestion_hashes (0 crédit IA si doublon)",
                "height": 320,
                "width": 420,
                "color": 6
            },
            "id": "sticky-zone-2",
            "name": "Note : Anti-Doublon & Anti-Bruit",
            "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1,
            "position": [360, 7860]
        },
        {
            "parameters": {
                "content": "## 3. Extraction OCR LlamaParse & Analyse Gemini\n- OCR LlamaParse Standard (1 crédit / page au lieu de 45)\n- Gemini 1.5 Flash : Structuration sémantique (prix, dates, hôtels)\n- Normalisation stricte JSON",
                "height": 320,
                "width": 480,
                "color": 2
            },
            "id": "sticky-zone-3",
            "name": "Note : IA & Extraction",
            "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1,
            "position": [1100, 7860]
        },
        {
            "parameters": {
                "content": "## 4. Supabase Storage & Transaction PostgreSQL\n- Stockage médias dans Bucket Supabase (S3)\n- Transaction SQL atomique : Tour + Steps + Options + Departures\n- Enregistrement du hash dans public.ingestion_hashes",
                "height": 320,
                "width": 480,
                "color": 5
            },
            "id": "sticky-zone-4",
            "name": "Note : Persistance & SQL",
            "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1,
            "position": [2100, 7860]
        }
    ]
    wf["nodes"].extend(sticky_notes)

with open(WF_FILE, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"JSON workflow mis à jour : {WF_FILE} ({len(wf['nodes'])} nœuds au total)")

# 2. Synchronisation dans la base SQLite n8n
conn = sqlite3.connect(SQLITE_DB)
cursor = conn.cursor()

# Mettre à jour les descriptions de tous les workflows
for wf_id, desc in WORKFLOW_DESCRIPTIONS.items():
    cursor.execute("UPDATE workflow_entity SET description = ? WHERE id = ?", (desc, wf_id))
    print(f"Description mise à jour pour workflow {wf_id}")

# Mettre à jour nodes, connections et settings pour ZC8ThO4FCw48gpjS
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
print("Base SQLite n8n mise à jour avec succès !")
