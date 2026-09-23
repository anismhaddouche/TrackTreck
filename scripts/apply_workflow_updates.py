#!/usr/bin/env python3
import json
import os

WF_PATH = "/home/deploy/apps/TrackTreck/workflows/n8n/whatsapp_pipeline_v7.json"

with open(WF_PATH, "r", encoding="utf-8") as f:
    wf = json.load(f)

nodes = wf["nodes"]

# 1. Update WhatsApp Filter & Dedup
for n in nodes:
    if n["name"] == "WhatsApp Filter & Dedup":
        n["alwaysOutputData"] = False
        n["notesInFlow"] = True
        n["notes"] = "Étape 1 : Filtrage WhatsApp rapide. Ignore les messages sortants, les statuts, et bloque les doublons réseau récents (Média + Légende) en mémoire."
        
        old_code = n["parameters"]["jsCode"]
        new_dedup_section = """// B. Déduplication par empreinte de média + légende (Flyer Image ou Brochure PDF)
const mediaObj = message.imageMessage 
  || message.documentMessage 
  || message?.viewOnceMessage?.message?.imageMessage
  || message?.ephemeralMessage?.message?.imageMessage;

let fileSha = null;
if (mediaObj?.fileSha256) {
  const raw = mediaObj.fileSha256;
  if (typeof raw === 'string') {
    fileSha = raw;
  } else if (Array.isArray(raw?.data)) {
    fileSha = Buffer.from(raw.data).toString('base64');
  } else if (Buffer.isBuffer(raw) || Array.isArray(raw)) {
    fileSha = Buffer.from(raw).toString('base64');
  } else {
    fileSha = JSON.stringify(raw);
  }
} else if (mediaObj?.mediaKey) {
  fileSha = JSON.stringify(mediaObj.mediaKey);
}

const rawCaption = (message.conversation || message.extendedTextMessage?.text || mediaObj?.caption || '').trim().toLowerCase().replace(/\\s+/g, ' ');
const combinedFingerprint = fileSha ? `media:${fileSha}|cap:${rawCaption}` : (rawCaption.length > 30 ? `txt:${rawCaption}` : null);

if (combinedFingerprint) {
  if (staticData.processedMediaShas.includes(combinedFingerprint)) {
    return []; // Même offre (média + légende) déjà vue récemment : STOP immédiat (0 crédit IA)
  }
  staticData.processedMediaShas.push(combinedFingerprint);
  if (staticData.processedMediaShas.length > 2000) {
    staticData.processedMediaShas.shift();
  }
}"""
        if "// B. Déduplication par empreinte de média" in old_code:
            idx = old_code.find("// B. Déduplication par empreinte de média")
            idx_end = old_code.find("// C. Déduplication des annonces textuelles identiques")
            n["parameters"]["jsCode"] = old_code[:idx] + new_dedup_section + "\n\n" + old_code[idx_end:]
            print("Updated WhatsApp Filter & Dedup code successfully")

    # 2. Update Detect Content & Generate JobId
    if n["name"] == "Detect Content & Generate JobId":
        n["notesInFlow"] = True
        n["notes"] = "Étape 2 : Détecte le type de média (image, PDF, texte), génère le Job ID unique et calcule l'empreinte SHA-256 combinée (média + légende)."
        code = n["parameters"]["jsCode"]
        
        hash_calc = """// ---------- HASH UNIQUE SHA-256 (Média + Légende) ----------
const crypto = require('crypto');
let contentHash = null;
let mediaType = 'text';
const normCaption = (textContent || resolvedImageCaption || '').trim().toLowerCase().replace(/\\s+/g, ' ');

if (hasImage) {
  mediaType = 'image';
  if (directUpload && directBinary?.data) {
    const buf = Buffer.from(directBinary.data, 'base64');
    const fsha = crypto.createHash('sha256').update(buf).digest('hex');
    contentHash = crypto.createHash('sha256').update('img:' + fsha + ':' + normCaption).digest('hex');
  } else if (imageMessage?.fileSha256) {
    const raw = imageMessage.fileSha256;
    const fsha = typeof raw === 'string' ? raw : (Array.isArray(raw?.data) ? Buffer.from(raw.data).toString('base64') : JSON.stringify(raw));
    contentHash = crypto.createHash('sha256').update('img:' + fsha + ':' + normCaption).digest('hex');
  } else if (imageMessage?.mediaKey) {
    contentHash = crypto.createHash('sha256').update('img:' + JSON.stringify(imageMessage.mediaKey) + ':' + normCaption).digest('hex');
  }
} else if (hasPdf) {
  mediaType = 'pdf';
  if (directUpload && directBinary?.data) {
    const buf = Buffer.from(directBinary.data, 'base64');
    const fsha = crypto.createHash('sha256').update(buf).digest('hex');
    contentHash = crypto.createHash('sha256').update('pdf:' + fsha + ':' + normCaption).digest('hex');
  } else if (documentMessage?.fileSha256) {
    const raw = documentMessage.fileSha256;
    const fsha = typeof raw === 'string' ? raw : (Array.isArray(raw?.data) ? Buffer.from(raw.data).toString('base64') : JSON.stringify(raw));
    contentHash = crypto.createHash('sha256').update('pdf:' + fsha + ':' + normCaption).digest('hex');
  }
} else if (hasText && normCaption.length > 20) {
  mediaType = 'text';
  contentHash = crypto.createHash('sha256').update('txt:' + normCaption).digest('hex');
}
"""
        if "const out = {" in code and "_content_hash" not in code:
            code = code.replace("const out = {", hash_calc + "\nconst out = {")
            code = code.replace("pdf: hasPdf ? documentMessage : null\n  }", "pdf: hasPdf ? documentMessage : null,\n    _content_hash: contentHash,\n    _media_type: mediaType\n  }")
            n["parameters"]["jsCode"] = code
            print("Updated Detect Content & Generate JobId code successfully")

    # 3. Update Detect Noise
    if n["name"] == "Detect Noise":
        n["notesInFlow"] = True
        n["notes"] = "Étape 3 : Filtre anti-bruit (rejet des visas, demandes B2B, vols secs, salutations) et vérification anti-doublon persistante via ingestion_hashes."
        code = n["parameters"]["jsCode"]
        
        if "ingestion_hashes" not in code:
            dedup_check = """// ============================================================================
// VÉRIFICATION ANTI-DOUBLON PERSISTANTE (Supabase / PostgreSQL)
// ============================================================================
const _contentHash = root._content_hash;
if (_contentHash && !root.directUpload) {
  try {
    const _res = await fetch(`http://supabase-kong:8000/rest/v1/ingestion_hashes?content_hash=eq.${_contentHash}&select=id,tour_id`, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`
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
"""
            code = code.replace("// 1. EXTRACTION DU MESSAGE", dedup_check + "\n// 1. EXTRACTION DU MESSAGE")
            n["parameters"]["jsCode"] = code
            print("Updated Detect Noise code successfully")

    # 4. Update Execute a SQL query
    if n["name"] == "Execute a SQL query":
        n["notesInFlow"] = True
        n["notes"] = "Étape Finale : Transaction PostgreSQL atomique : insertion du Tour, steps, options d'hôtels, départs et enregistrement de l'empreinte dans ingestion_hashes."
        query = n["parameters"]["query"]
        if "inserted_hash AS" not in query:
            old_str = "SELECT\n  tour.id AS tour_id,"
            new_str = """,

inserted_hash AS (
  INSERT INTO public.ingestion_hashes (
    content_hash,
    media_type,
    whatsapp_message_id,
    sender_jid,
    caption_snippet,
    tour_id
  )
  SELECT
    NULLIF(data->>'_content_hash', ''),
    COALESCE(NULLIF(data->>'_media_type', ''), 'image'),
    NULLIF(data->>'messageId', ''),
    NULLIF(data->>'senderJid', ''),
    LEFT(COALESCE(data->>'text', data->>'imageCaption', ''), 200),
    tour.id
  FROM payload p
  CROSS JOIN inserted_tour tour
  WHERE data ? '_content_hash' AND data->>'_content_hash' IS NOT NULL AND data->>'_content_hash' <> ''
  ON CONFLICT (content_hash) DO UPDATE SET tour_id = EXCLUDED.tour_id
  RETURNING id
)

SELECT
  tour.id AS tour_id,"""
            query = query.replace(old_str, new_str)
            n["parameters"]["query"] = query
            print("Updated Execute a SQL query query successfully")

    # 5. Add notes on other key nodes
    if n["name"] == "IF Valid Offer":
        n["notesInFlow"] = True
        n["notes"] = "Aiguillage : Autorise les offres valides (séjours / omra) vers les branches Texte, Image ou PDF. Élimine le bruit et les doublons."

    if n["name"] == "LLama Extraction":
        n["notesInFlow"] = True
        n["notes"] = "OCR Image LlamaParse : Extrait le texte et les tableaux de prix du flyer en Markdown (mode standard à 1 crédit/page)."

    if n["name"] == "LLama Extraction1":
        n["notesInFlow"] = True
        n["notes"] = "OCR PDF LlamaParse : Extrait le contenu multi-pages des brochures PDF en Markdown structuré."

    if n["name"] == "Collect & Dynamic Merge":
        n["notesInFlow"] = True
        n["notes"] = "Fusion intelligente : Combine les données extraites (texte WhatsApp + flyer OCR), traduit les pays/services en français et applique les gardes-fous métier."

    if n["name"] == "Build Storage Path":
        n["notesInFlow"] = True
        n["notes"] = "Stockage Supabase : Calcule les chemins d'accès structurés (pays/agence/sequence) et génère les URLs publiques des assets."

    if n["name"] == "Respond 200 Immediately":
        n["notesInFlow"] = True
        n["notes"] = "Accusé de réception WhatsApp : Répond HTTP 200 immédiatement à Evolution API pour libérer la connexion réseau."

    if n["name"] == "Prepare Gemini Body image":
        n["notesInFlow"] = True
        n["notes"] = "Formatage Prompt Gemini : Structure le prompt et le texte OCR pour l'analyse par Gemini 1.5 Flash."

    if n["name"] == "Call Gemini image":
        n["notesInFlow"] = True
        n["notes"] = "Appel Gemini : Extraction sémantique intelligente du voyage depuis le flyer OCR (prix, hôtels, itinéraire)."

    if n["name"] == "Format Image Result":
        n["notesInFlow"] = True
        n["notes"] = "Normalisation Image : Valide et structure le JSON retourné par Gemini dans le schéma strict de l'application."

with open(WF_PATH, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print("whatsapp_pipeline_v7.json written successfully!")
