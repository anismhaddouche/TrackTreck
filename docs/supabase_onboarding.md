# Documentation Technique - Supabase Local (Onboarding)

## 1. Introduction
Bienvenue sur le projet ! Cette documentation a pour but de vous aider à prendre en main la base de données locale. 

Dans ce projet, nous utilisons **Supabase** comme backend Database-as-a-Service, exécuté localement via Docker pour les besoins du développement.
L'objectif principal de cette base de données locale est d'accueillir et de structurer les nouvelles annonces de voyages extraites automatiquement par notre pipeline de données (n8n).
Utiliser Supabase en local permet de disposer d'un environnement de travail isolé, rapide, gratuit, et qui reflète très fidèlement la structure de production sans risquer d'altérer les données réelles de l'application en ligne.

## 2. Prérequis
Avant de démarrer, assurez-vous d'avoir installé les éléments suivants sur votre machine :
- **Docker Desktop** (doit être lancé et fonctionnel en arrière-plan)
- **Supabase CLI** (pour manager les instances et bases locales)
- **Git** (pour cloner et versionner le projet)
- **Un accès au repository** (clés SSH / permissions associées)
- **VS Code** ou tout autre IDE de votre choix

## 3. Setup local de Supabase
Dans notre projet, toute la configuration relative à la base de données se trouve dans le dossier `supabase/`. 

Pour initialiser l'environnement pour la première fois (si cela n'est pas déjà fait sur le repo), exécutez à la racine du projet :
```bash
npx supabase init
```
*(Note : Cette commande crée le dossier et les fichiers de configuration de base).*

Pour démarrer les conteneurs Supabase localement sur votre machine :
```bash
npx supabase start
```
Cette commande va télécharger les images Docker nécessaires et lancer la base de données locale et tous ses services (Studio, API REST, Auth, etc.).

**Fichiers importants :**
- `supabase/config.toml` : Fichier de configuration de votre instance locale. Vous y trouverez les ports utilisés, ainsi que l'activation/désactivation de certains services. *Note : certains services optionnels gourmands (comme les analyses ou les bases vectorielles) peuvent y être désactivés si non nécessaires pour le développement local.*
- `supabase/migrations/` : Dossier contenant tous les fichiers de migration SQL. C'est ici qu'est codée la structure de notre base.

## 4. Architecture de la base de données
Le schéma relationnel mis en place en local est directement inspiré de la production, tout en étant allégé ou adapté pour tourner facilement sans dépendances complexes.

La logique métier s'articule autour des tables suivantes :
- `tours` : **Il s'agit de l'entité parente principale.** Elle représente l'annonce globale ou l'offre de voyage extraite du pipeline.
- `tour_steps` : Contient les différentes étapes ou villes composant le voyage.
- `hotel_options` : C'est la table de jointure/tarification qui permet de lier des hôtels spécifiques aux étapes du voyage avec leurs prix associés.
- `hotels` : C'est le référentiel des hôtels disponibles.
- `departures` : Contient les dates de départs réels pour une offre donnée, ainsi que l'état de leur stock.
- `agencies` : Représente les agences qui proposent les offres de voyage.
- `profiles` : Contient les profils utilisateurs (admin, agent, client) liés aux agences.
- `tour_revisions` : Historique des commentaires et révisions effectués lors du processus de validation.

*Si d'autres tables comme `airlines` sont présentes dans le schéma, elles le sont généralement pour maintenir la cohérence avec l'environnement de production. Toutefois, pour tout ce qui concerne le cœur métier et le traitement des nouvelles offres depuis le pipeline, les interactions tournent principalement autour des tables mentionnées ci-dessus.*

## 5. Création des tables
La structure de base (tables, types, fonctions) n'est pas mise en place manuellement. Elle est créée à l'aide de **migrations SQL**. 
Celles-ci se situent toutes dans le dossier `supabase/migrations/` sous forme de fichiers horodatés (par exemple `202605180001_init_schema.sql`).

Pour appliquer toutes ces migrations SQL depuis une base vierge, ou pour remettre la base locale complètement à zéro, utilisez la commande suivante :
```bash
npx supabase db reset
```
Cette commande est cruciale : elle recrée la base de données locale vierge et rejoue dans l'ordre tous les fichiers de migration. Idéal pour s'assurer que vous partez sur de bonnes bases et que le schéma correspond exactement au dernier code versionné.

## 6. Champs importants et règles métier (Table `tours`)
La table la plus importante dans laquelle des données sont injectées par le pipeline est `tours`.
Afin de bien comprendre le format et le métier attendu, voici un focus sur ses colonnes principales :

- `title` : Le titre principal de l'annonce de voyage.
- `agency_id` : L'identifiant (Foreign Key) de l'agence liée à cette annonce.
- `countries` : Pays traversés/visités au sein de cette offre.
- `duration_nights` : Durée du séjour, exprimée en nombre de nuits.
- `airline` : Compagnie(s) aérienne(s) intégrée(s) pour le vol principal.
- `description` : Texte de présentation descriptif global du circuit.
- `itinerary` : Détail jour par jour du parcours (format JSONB).
- `status` : État de l'offre, utilise l'énumération `offer_status` (`draft`, `pending_review`, `published`, `rejected`).
- `is_global_pricing` : Booléen indiquant si l'offre a un tarif unifié plutôt qu'un calcul étape par étape.
- `global_pricing` : Informations tarifaires dans le cas d'un prix global (format JSONB).
- `lead_price` : Prix d'appel ("à partir de").
- `services` : Les prestations incluses ou exclues (format JSONB).

**Règles de validation primordiales :**
Deux champs cruciaux de la table `tours` possèdent des comportements par défaut définis directement à la création de la table en SQL :
- `status` : A pour valeur par défaut `'draft'`.
- `needs_review` : A pour valeur par défaut `true`.

👉 **Pourquoi ce design ?**
Ces deux champs régissent la validation finale de chaque offre. L'objectif absolu est que les offres ajoutées *automatiquement* par le pipeline scripté n'apparaissent jamais publiquement par erreur. Elles atterrissent obligatoirement en état `'draft'`, et dotées du tag `needs_review = true` pour signaler qu'un travail de relecture technique et fonctionnel est attendu par un opérateur humain. 

## 7. Vérification du bon fonctionnement
Une fois la base lancée, il est facile de s'assurer que tout fonctionne :

1. **Accéder à Supabase Studio :**
   Récupérez l'URL locale du studio fournie à la fin de `npx supabase start` (généralement `http://localhost:54323` ou `127.0.0.1:54323`).
2. **Vérification visuelle :**
   Naviguez ensuite via le menu vertical vers le "Table editor". Vous devez absolument y apercevoir les tables `tours`, `tour_steps`, `hotels`, etc.
3. **Tester une insertion :**
   Rendez-vous dans la vue du "SQL Editor", et initiez explicitement une insertion d'essai allégée :
   ```sql
   INSERT INTO tours (title, agency_id, description) 
   VALUES ('Circuit Test Japon', 1, 'Ceci est un test')
   RETURNING id, status, needs_review;
   ```
   Si la base est bien initialisée, vous devriez constater que les colonnes retournées pour `status` et `needs_review` contiennent respectivement `'draft'` et `true` sans avoir eu à les spécifier.

## 8. Notes de sécurité / RLS (Row Level Security)
Il se peut très fréquemment que vous constatiez un avertissement dans Supabase Studio local indiquant :
> ⚠️ **"RLS Disabled in Public"**

Cela signifie que les politiques qui restreignent l'accès aux données ligne par ligne selon les identités des utilisateurs sont désactivées.
- **Est-ce bloquant ?** Absolument pas. Pour le développement local, cette configuration d'accessibilité ouverte et sans restriction est choisie pour l'instant afin de faciliter le débugging sans imposer d'authentification complète de l'accès à la base.
- **Attention pour la prod :** Ce point de configuration restera un axe à surveiller, traiter et configurer plus rigoureusement pour cibler un environnement de production en pleine sécurité.

## 9. Bonnes pratiques pour un développeur qui rejoint le projet
Afin de préserver un environnement collaboratif propre et stable :

- **Comment récupérer le projet :** Poursuivez vos standards Git, assurez-vous de faire des `git pull` réguliers pour ramener toute nouvelle évolution du schéma de base dans votre environnement.
- **Relancer Supabase :** Pensez à toujours avoir votre daemon Docker Desktop fonctionnel avant de taper `npx supabase start`.
- **Faire le ménage :** Quand vous pensez que votre base est instable, pleine de bruits ou modifiée inopinément, ne cherchez pas le coupable -> exécutez `npx supabase db reset`.
- **Ce qu'il ne faut PAS modifier :** Si une évolution de schéma est nécessaire, n'éditez jamais les fichiers de migrations existants (dans `supabase/migrations/`). Il faut générer une *nouvelle* migration via `npx supabase migration new mon_nouveau_champs` et d'y rédiger le script (`ALTER TABLE...`).
- **Ce que l'on versionne :** L'intégralité du contenu du dossier `supabase/` (`config.toml`, `migrations/`, etc.) doit systématiquement faire partie de vos commits Git pour le reste de l'équipe (hors de la BDD locale en elle-même !).

## 10. Conclusion
Pour faire simple, voici l'essentiel pour être très vite autonome :
1. Assurez-vous que Docker tourne !
2. Lancez l'environnement base via `npx supabase start`.
3. Réinitialisez la donnée / le schéma au besoin avec `npx supabase db reset`.
4. N'oubliez pas le fonctionnement par défaut du pipeline : tout ce qui arrive sur `tours` est un brouillon en attente de relecture (`status='draft'`, `needs_review=true`) !


