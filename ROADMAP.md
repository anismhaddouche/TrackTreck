# 🚀 Roadmap TrackTrek

Cette roadmap détaille les jalons (milestones), livrables et critères de succès du projet TrackTrek, organisés par sprints de 2 semaines.

## 🏁 Sprint P0 : Setup & Documentation
**Période :** 05/04/2026 - 16/04/2026

### Objectif : Mise en place de l'environnement & Formation
*   **Documentation (US_S1)** :
    *   *Description* : Veille technologique sur Docker, Evolution API, n8n, Supabase, React (shadcn/ui), TypeScript.
    *   *Livrables* : Document de synthèse et mémo des commandes.
    *   *Succès* : Maîtrise théorique du stack technique.
*   **Setup (US_S2)** :
    *   *Description* : Installation de Git/Docker, connexion au dépôt GitHub, création du backlog sur ClickUp.
    *   *Livrables* : Environnement local prêt et tickets ClickUp initialisés.
    *   *Succès* : Premier "Hello World" technique et organisationnel.

---

## 📡 Sprint P1 : Fondation & Captation WhatsApp
**Période :** 19/04/2026 - 01/05/2026

### Objectif : Automatiser la réception des messages
*   **Evolution API (US_M1)** :
    *   *Description* : Déploiement d'Evolution API via Docker pour la gestion des Webhooks WhatsApp.
    *   *Livrables* : Instance Evolution API active et connectée.
    *   *Succès* : Réception confirmée des messages du groupe WhatsApp cible.
*   **n8n Orchestrateur (US_M2)** :
    *   *Description* : Installation de n8n sur Docker.
    *   *Livrables* : Interface n8n accessible localement.
    *   *Succès* : n8n prêt pour la création de workflows.
*   **Liaison Webhook (US_M3)** :
    *   *Description* : Configuration du transfert de données d'Evolution API vers n8n.
    *   *Livrables* : Flux d'intégration fonctionnel.
    *   *Succès* : Un message WhatsApp déclenche une exécution dans n8n.

---

## 🧠 Sprint P2 : Filtrage & Extraction IA
**Période :** 03/05/2026 - 15/05/2026

### Objectif : Structuration des données & Gestion des médias
*   **Routage Dynamique (US_1)** :
    *   *Description* : Utilisation d'un nœud "Switch" n8n pour séparer texte, images et PDF.
    *   *Livrables* : Workflow n8n multi-branches.
    *   *Succès* : Chaque type de média est dirigé vers le bon micro-service.
*   **Filtrage du Bruit (US_2)** :
    *   *Description* : Élimination des messages non pertinents (discussions, spam) via mots-clés ou IA légère.
    *   *Livrables* : Système de filtrage pré-extraction.
    *   *Succès* : Réduction des coûts API (seules les offres réelles passent).
*   **Llama Extract (US_3)** :
    *   *Description* : Appel API Llama Extract avec Schema JSON (prix, destination, dates).
    *   *Livrables* : Objet JSON structuré en sortie du workflow.
    *   *Succès* : Extraction fiable des données clés, peu importe le format source.
*   **Stockage S3 (US_4)** :
    *   *Description* : Sauvegarde des médias originaux sur un bucket S3.
    *   *Livrables* : Bucket S3 configuré et alimenté.
    *   *Succès* : Médias persistants et accessibles pour validation.

---

## ⚙️ Sprint P3 : Validation & Intégration Supabase
**Période :** 18/05/2026 - 28/05/2026

### Objectif : Base de données & Interface Admin
*   **Setup Supabase (US_5)** :
    *   *Description* : Configuration de Supabase local (Docker) avec schéma de prod.
    *   *Livrables* : Tables `offers` opérationnelles (flag `needs_review: true`).
    *   *Succès* : Schéma synchronisé avec les besoins du JSON extrait.
*   **Pousse des données (US_6)** :
    *   *Description* : Étape n8n finale pour insérer le JSON dans Supabase.
    *   *Livrables* : Pipeline E2E (WhatsApp -> Supabase).
    *   *Succès* : Les offres apparaissent en base "en attente de validation" automatiquement.
*   **Interface Admin React (US_7)** :
    *   *Description* : Vue admin (shadcn/ui) comparant source originale vs données extraites.
    *   *Livrables* : Dashboard de validation interactif.
    *   *Succès* : Un admin peut valider/corriger une offre en moins de 10 secondes.

---

## 🎓 Sprint PX : Finalisation
**Période :** 31/05/2026 - 12/06/2026

### Objectif : Soutenance & Livraison
*   **Polish & Debug** : Tests finaux de robustesse.
*   **Documentation Finale** : Guide utilisateur et technique.
*   **Soutenance** : Présentation du projet et démo live.

---
> [!IMPORTANT]
> Cette roadmap est un document vivant. Les dates et priorités peuvent être ajustées lors des revues de sprint.
