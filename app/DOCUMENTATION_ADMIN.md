# Documentation Technique - Interface Admin TrackTreck

## Vue d'ensemble

L'interface admin de TrackTreck est un système de validation et d'édition des offres de voyage extraites par le pipeline n8n. Elle permet aux administrateurs de vérifier les données structurées, les corriger si nécessaire, et les valider avant publication.

### Objectif principal
- **Validation des offres** : Examiner et corriger les brouillons (`draft`) extraits automatiquement
- **Correction collaborative** : Éditer les données structurées en comparant avec la source originale
- **Publication** : Valider les offres corrigées ou les supprimer

---

## Architecture générale

```
AdminLayout (Layout racine)
    └── AdminValidationPage (Page principale)
        ├── OffersReviewList (Tableau de brouillons)
        ├── ManualOfferUpload (Upload manuel)
        └── OfferValidationDetail (Détail d'une offre)
            ├── OriginalSourcePanel (Source originale)
            ├── ExtractedJsonPanel (Données extraites)
            ├── EditableOfferForm (Édition des données)
            └── [Actions: Sauvegarde, Validation, Suppression]
```

### Stack technologique
- **Frontend** : React + TypeScript
- **Routing** : React Router
- **State Management** : TanStack React Query (données asynchrones)
- **UI Components** : shadcn/ui (Tailwind CSS)
- **Database** : Supabase (PostgreSQL)
- **Notifications** : Sonner

---

## Flux de données

### 1. Flux de lecture (Fetch)

```
useOffersToValidate()
    ↓
Supabase: SELECT * FROM tours WHERE needs_review=true AND status='draft'
    ↓
[TourSummary] → OffersReviewList (affichage tableau)
```

### 2. Flux de détail

```
User clique sur une offre
    ↓
useOfferDetail(id)
    ↓
Supabase: SELECT * FROM tours, tour_steps, hotel_options, departures WHERE tour_id=id
    ↓
TourDetail (objet complet avec étapes, hôtels, départs)
    ↓
EditableOfferForm (affichage pour édition)
```

### 3. Flux de sauvegarde

```
User modifie le formulaire + clique "Enregistrer"
    ↓
useSaveOffer() (mutation)
    ↓
persistOffer(offer)
    - UPDATE tours SET ...
    - DELETE tour_steps WHERE tour_id=id
    - INSERT tour_steps + hotel_options
    - DELETE departures WHERE tour_id=id
    - INSERT departures
    ↓
Query Cache invalidation → OffersReviewList se rafraîchit
```

### 4. Flux de validation

```
User clique "Valider"
    ↓
useValidateOffer() (mutation)
    ↓
UPDATE tours SET status='published', needs_review=false
    ↓
Query Cache invalidation + Redirection vers liste
```

### 5. Flux de suppression

```
User clique "Supprimer" + confirme
    ↓
useDeleteOffer() (mutation)
    ↓
DELETE FROM tours WHERE id=id (CASCADE sur children)
    ↓
Query Cache invalidation + Redirection vers liste
```

---

## Types de données

### TourSummary (Liste)
Utilisé pour le tableau de validation. Vue condensée d'une offre.

```typescript
interface TourSummary {
  id: number;
  title: string | null;
  countries: string[] | null;
  agency_id: number | null;
  agency: { id: number; name: string } | null;
  sourceLabel: string | null;              // Source déduite des URLs photos
  duration_nights: number | null;
  airline: string | null;
  lead_price: number | null;
  photo_urls: string[] | null;
  status: OfferStatus;                     // 'draft' | 'pending_review' | 'published' | 'rejected'
  needs_review: boolean;
  created_at: string | null;
}
```

### TourDetail (Détail)
Objet complet avec toutes les relations imbriquées pour l'édition.

```typescript
interface TourDetail {
  id: number;
  title: string | null;
  agency_id: number | null;
  agency: Agency | null;
  sourceLabel: string | null;
  countries: string[] | null;
  duration_nights: number | null;
  airline: string | null;
  description: string | null;
  itinerary: Record<string, string> | null;
  status: OfferStatus | null;
  photo_urls: string[] | null;
  is_global_pricing: boolean | null;      // Si un prix s'applique globalement
  global_pricing: number | null;          // Prix global (si applicable)
  lead_price: number | null;              // Prix au meilleur marché
  services: {
    included: string[];
    excluded: string[];
  } | null;
  needs_review: boolean;
  created_at: string | null;
  steps: TourStep[];                      // Itinéraire (villes + hôtels)
  departures: Departure[];                // Points de départ disponibles
}
```

### TourStep (Étape du voyage)
```typescript
interface TourStep {
  id?: number;
  city: string | null;
  step_order: number;                     // Ordre dans l'itinéraire (1, 2, 3...)
  duration_nights: number | null;
  hotels: HotelOption[];                  // Hôtels disponibles pour cette étape
}
```

### HotelOption (Hôtel disponible)
```typescript
interface HotelOption {
  id?: number;
  hotel_id: number | null;                // Référence hôtel existant
  custom_hotel_name: string | null;       // Ou nom custom si nouveau
  is_default: boolean;
  pricing: HotelPricing;                  // Prix par type de chambre
}

interface HotelPricing {
  dbl: number | null;                     // Double
  tpl: number | null;                     // Triple
  sgl: number | null;                     // Single
  inf: number | null;                     // Infant (0-2 ans)
  chd_2_6: number | null;                 // Enfant 2-6 ans
  chd_5_11: number | null;                // Enfant 5-11 ans
}
```

### Departure (Point de départ)
```typescript
interface Departure {
  id?: number;
  departure_city: string;
  stock: number | null;                   // Nombre de places disponibles
  flight_departure_time: string | null;   // HH:mm
  flight_arrival_time: string | null;
  return_flight_departure_time: string | null;
  return_flight_arrival_time: string | null;
}
```

---

## Composants principaux

### AdminLayout
**Rôle** : Layout racine de la section admin
**Responsabilités** :
- Afficher le header avec navigation
- Inclure la barre de sécurité (anon key uniquement)
- Router vers les sous-pages

**Props** : Aucun (utilise `<Outlet />` pour les enfants)

**Localisation** : [src/components/layout/AdminLayout.tsx](src/components/layout/AdminLayout.tsx)

---

### AdminValidationPage
**Rôle** : Page principale du tableau de bord de validation
**Responsabilités** :
- Charger la liste des offres à valider
- Afficher le titre et la description
- Intégrer le tableau de brouillons et l'upload manuel

**Props** : Aucun

**État** : Géré entièrement via `useOffersToValidate()` (React Query)

**Localisation** : [src/features/admin-validation/pages/AdminValidationPage.tsx](src/features/admin-validation/pages/AdminValidationPage.tsx)

```typescript
export function AdminValidationPage() {
  const { data, isLoading, isError, error } = useOffersToValidate();
  // render tableau + upload
}
```

---

### OffersReviewList
**Rôle** : Tableau des offres en attente de validation
**Responsabilités** :
- Afficher la liste paginée des brouillons
- Filtrer par titre, pays, agence
- Afficher les statistiques (total, affichées)
- Navigation vers le détail

**Props** :
```typescript
interface OffersReviewListProps {
  offers: TourSummary[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}
```

**Interactions** :
- Recherche textuelle sur le titre (case-insensitive)
- Filtre par pays (multi-select sur les pays présents)
- Filtre par agence
- Clic sur une ligne → Navigation vers `/admin/validation/:id`

**Localisation** : [src/features/admin-validation/components/OffersReviewList.tsx](src/features/admin-validation/components/OffersReviewList.tsx)

---

### OfferValidationDetail
**Rôle** : Page de détail et d'édition d'une offre
**Responsabilités** :
- Charger les données complètes d'une offre
- Afficher un système d'onglets : Source / JSON Extrait / Éditable
- Gérer les états de sauvegarde/validation/suppression
- Détecter les modifications non sauvegardées

**Props** : Aucun (utilise `useParams()` pour récupérer l'ID)

**État local** :
- `draft` : Copie modifiable des données
- `confirmDelete` : Boolean pour confirmer la suppression

**Mutations disponibles** :
- `save.mutate(offer)` : Enregistrer les corrections
- `validate.mutate(offer)` : Publier l'offre
- `remove.mutate(id)` : Supprimer le brouillon

**Localisation** : [src/features/admin-validation/pages/OfferValidationDetail.tsx](src/features/admin-validation/pages/OfferValidationDetail.tsx)

**Détail du cycle de vie** :
1. Charge l'offre via `useOfferDetail(id)`
2. Initialise `draft` avec les données
3. Compare `draft` vs `data` pour détecter les modifications
4. Affiche 3 onglets avec contenu approprié
5. Désactive les boutons pendant les mutations

---

### EditableOfferForm
**Rôle** : Formulaire éditable pour corriger une offre
**Responsabilités** :
- Afficher et éditer tous les champs d'une offre
- Gérer dynamiquement les étapes (ajout/suppression)
- Gérer dynamiquement les hôtels par étape
- Gérer dynamiquement les points de départ
- Calculer les prix pour chaque catégorie

**Props** :
```typescript
interface EditableOfferFormProps {
  offer: TourDetail;
  onChange: (next: TourDetail) => void;  // Callback pour chaque modification
}
```

**Structure du formulaire** :
1. **Infos principales** : Titre, pays, agence, durée, prix
2. **Description & Itinéraire** : Texte libre pour chaque jour
3. **Étapes du voyage** :
   - Ajouter/supprimer étapes
   - Pour chaque étape : ville, durée, hôtels
   - Pour chaque hôtel : nom, prix par catégorie
4. **Points de départ** :
   - Ajouter/supprimer départs
   - Pour chaque départ : ville, stock, horaires

**Localisation** : [src/features/admin-validation/components/EditableOfferForm.tsx](src/features/admin-validation/components/EditableOfferForm.tsx)

**Fonctions utilitaires** :
- `emptyPricing()` : Crée une structure vide de prix
- `emptyHotel()` : Crée une option hôtel vide
- `emptyStep()` : Crée une étape vide
- `emptyDeparture()` : Crée un départ vide
- `parseNumberOrNull()` : Parse un nombre ou retourne null

---

### OriginalSourcePanel
**Rôle** : Affiche le HTML/source originale de l'offre
**Responsabilités** :
- Rendu du document source côte-à-côte avec les données extraites
- Permet la comparaison visuelle

**Localisation** : [src/features/admin-validation/components/OriginalSourcePanel.tsx](src/features/admin-validation/components/OriginalSourcePanel.tsx)

---

### ExtractedJsonPanel
**Rôle** : Affiche les données structurées en JSON brut
**Responsabilités** :
- Rendu pretty-print du JSON
- Permet de voir exactement ce qui est en base de données
- Utile pour le débogage

**Localisation** : [src/features/admin-validation/components/ExtractedJsonPanel.tsx](src/features/admin-validation/components/ExtractedJsonPanel.tsx)

---

### OfferStatusBadge
**Rôle** : Badge visuel du statut d'une offre
**Responsabilités** :
- Afficher le statut avec couleur appropriée
- Afficher si l'offre a besoin de review

**Props** : 
```typescript
status: OfferStatus;
needs_review?: boolean;
```

**Localisation** : [src/features/admin-validation/components/OfferStatusBadge.tsx](src/features/admin-validation/components/OfferStatusBadge.tsx)

---

### ManualOfferUpload
**Rôle** : Formulaire pour upload manuel d'offres
**Responsabilités** :
- Permettre l'import de données manuelles
- Créer des brouillons depuis zéro

**Localisation** : [src/features/admin-validation/components/ManualOfferUpload.tsx](src/features/admin-validation/components/ManualOfferUpload.tsx)

---

## Hooks (State Management)

### useOffersToValidate()
**Rôle** : Charger la liste des offres à valider
**Source** : [src/features/admin-validation/hooks/useOffers.ts](src/features/admin-validation/hooks/useOffers.ts)

```typescript
const { data, isLoading, isError, error } = useOffersToValidate();
// data: TourSummary[]
```

**Logique** :
1. Query Supabase : SELECT depuis `tours` WHERE `needs_review=true` ET `status='draft'`
2. Join avec `agencies` pour récupérer le nom
3. Fallback : Si le join échoue (RLS, FK manquante), batch-fetch les agences par ID
4. Déduit la source depuis les URLs photos
5. Remplace le nom d'agence par défaut par la source déduite

**Ordre** : Par `created_at` décroissant (plus récents d'abord)

---

### useOfferDetail(id)
**Rôle** : Charger les données complètes d'une offre avec ses relations
**Source** : [src/features/admin-validation/hooks/useOfferDetail.ts](src/features/admin-validation/hooks/useOfferDetail.ts)

```typescript
const { data, isLoading, isError, error } = useOfferDetail(id);
// data: TourDetail
```

**Logique** :
1. Charge la ligne `tours` par ID
2. Charge toutes les `tour_steps` associées (order by step_order)
3. Charge toutes les `hotel_options` pour chaque step
4. Charge tous les `departures` associés
5. Compose l'objet `TourDetail` complet

**Parsing** :
- Convertit les JSON bruts (pricing, services, itinerary) en structures typées
- Utilise les fonctions utilitaires `asPricing()`, `asServices()`, `asItinerary()`

---

### useSaveOffer()
**Rôle** : Mutation pour enregistrer les corrections d'une offre
**Source** : [src/features/admin-validation/hooks/useOfferMutations.ts](src/features/admin-validation/hooks/useOfferMutations.ts)

```typescript
const save = useSaveOffer();
await save.mutate(offer);
```

**Logique** :
1. UPDATE la ligne `tours` avec les champs principaux
2. DELETE tous les `tour_steps` (cascade supprime les `hotel_options`)
3. INSERT les nouveaux `tour_steps` + `hotel_options`
4. DELETE tous les `departures`
5. INSERT les nouveaux `departures`

**Important** : Cette approche remplace complètement les relations imbriquées pour éviter de gérer manuellement les UPDATE/INSERT/DELETE partiels.

**Cache invalidation** :
- Invalide `["offers", "detail", id]`
- Invalide `["offers", "to-validate"]`

---

### useValidateOffer()
**Rôle** : Mutation pour publier une offre validée
**Logique** :
1. UPDATE `tours` SET `status='published'`, `needs_review=false`
2. Invalide les caches

---

### useDeleteOffer()
**Rôle** : Mutation pour supprimer un brouillon
**Logique** :
1. DELETE FROM `tours` WHERE `id=id`
2. Cascade supprime toutes les relations (steps, hotels, departures)
3. Invalide les caches

---

## Interactions utilisateur

### Workflow 1 : Valider une offre sans modification
```
1. User navigue sur /admin/validation
2. Tableau affiche les offres avec filtrages possibles
3. User clique sur une offre
4. Accès à /admin/validation/:id
5. 3 onglets : Source | JSON | Éditable
6. User vérifie que tout est correct
7. User clique "Valider"
8. Offre passe en status 'published'
9. Redirection vers liste
```

### Workflow 2 : Corriger et valider une offre
```
1. User navigue sur /admin/validation
2. User clique sur une offre
3. Onglet "Éditable" : affiche le formulaire
4. User modifie les champs, ajoute/supprime étapes, hôtels, départs
5. Titre du bouton change de "Enregistrer" à "Enregistrer les modifications"
6. User clique "Enregistrer"
7. Les changements sont persistés en base
8. Caches sont invalidés, tableau se rafraîchit
9. User valide avec "Valider"
10. Status devient 'published'
```

### Workflow 3 : Supprimer un brouillon
```
1. User sur le détail d'une offre
2. User clique "Supprimer"
3. Dialogue de confirmation apparaît
4. User confirme
5. Brouillon est supprimé (avec CASCADE sur steps/hotels/departures)
6. Redirection vers liste
```

### Workflow 4 : Rechercher et filtrer
```
1. User sur /admin/validation
2. Input "Rechercher par titre" : filtre en temps réel
3. Dropdown "Pays" : filtre dynamique par pays présent
4. Dropdown "Agence" : filtre dynamique par agence
5. Chips affichent le nombre total et le nombre affiché
```

---

## Considérations de sécurité

### RLS (Row Level Security)
- Supabase est configuré avec RLS
- Seules les agences autorisées peuvent voir/modifier leurs offres
- Le fallback dans `useOffers.ts` gère les cas où le join retourne null

### Clés Supabase
- Clé **anon** (public) : Utilisée pour les requêtes du client
- Clé **service** : JAMAIS exposée au frontend (backend only)
- Badge dans le header rappelle la sécurité

---

## Patterns et conventions

### Naming
- Composants de page : `*Page.tsx` (ex: `AdminValidationPage.tsx`)
- Composants réutilisables : camelCase (ex: `EditableOfferForm.tsx`)
- Hooks custom : `use*` (ex: `useOffers.ts`)
- Types : PascalCase (ex: `TourDetail`, `HotelOption`)

### Destructuring
Tous les hooks retournent un objet avec `{ data, isLoading, isError, error }`

### State Updates
Utilise la fonction de mise à jour du parent via `onChange` callback (proplifting)

### Parsing JSON
Fonctions utilitaires côté hook pour convertir les JSON bruts en types stricts

---

## Débogage et dépannage

### Offer n'apparaît pas dans la liste
- Vérifier que `needs_review=true` ET `status='draft'` en BDD
- Vérifier les permissions RLS (agence autorisée ?)
- Ouvrir DevTools > Network : vérifier la requête Supabase

### Erreur "Impossible de charger cette offre"
- L'ID n'existe pas ou a été supprimé
- Permissions RLS : l'agence n'a pas accès à cette offre
- Erreur réseau : vérifier la console

### Modifications ne sont pas sauvegardées
- Vérifier que `dirty` boolean est true (compare JSON)
- Vérifier la mutation `save.isPending`
- Regarder la console pour les erreurs Supabase

### Cascade delete ne fonctionne pas
- Vérifier que les contraintes FK ont `ON DELETE CASCADE` en BDD
- Supabase devrait les créer automatiquement

---


## Resources

- **React Query Docs** : https://tanstack.com/query
- **Supabase JS Client** : https://supabase.com/docs/reference/javascript
- **shadcn/ui** : https://ui.shadcn.com/
- **Tailwind CSS** : https://tailwindcss.com/

---

**Dernière mise à jour** : May 7, 2026
**Mainteneur** : Équipe Admin TrackTreck
