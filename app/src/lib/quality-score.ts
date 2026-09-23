import type { TourDetail } from "./types";

export type DimensionKey =
  | "destination"
  | "agency"
  | "dates_duration"
  | "departure_city"
  | "program"
  | "pricing"
  | "hotels"
  | "services_catering"
  | "flight"
  | "stock"
  | "commission";

export type QualityTier = "excellent" | "good" | "medium" | "critical";

export interface MissingItem {
  id: string;
  dimension: DimensionKey;
  label: string;
  pointsToGain: number;
  hint: string;
  fieldFocusId?: string;
}

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  weight: number;
  earned: number;
  percentage: number;
  status: "complete" | "partial" | "missing";
  details: string;
  missingHints: string[];
}

export interface TourQualityScoreResult {
  score: number;
  tier: QualityTier;
  badgeLabel: string;
  badgeVariant: "success" | "info" | "warning" | "destructive";
  colorClass: string;
  summary: {
    completedDimensions: number;
    totalDimensions: number;
    earnedWeight: number;
    totalWeight: number;
  };
  dimensions: Record<DimensionKey, DimensionScore>;
  missingItems: MissingItem[];
}

// Regex to detect meal / catering mentions in services.included
export const CATERING_REGEX =
  /(petit[- ]d[eé]jeuner|demi[- ]pension|pension compl[eè]te|all[- ]inclusive|tout compris|repas|d[iî]ner|d[eé]jeuner|buffet|iftar|shour|sahour|restauration)/i;

/**
 * Computes the quality completeness score (0 to 100%) for a tour offer.
 * Follows the 11-dimension weighting scheme established for TrackTreck.
 */
export function computeTourQualityScore(
  tour: TourDetail | Partial<TourDetail> | null | undefined,
): TourQualityScoreResult {
  if (!tour) {
    return createEmptyScore();
  }

  const missingItems: MissingItem[] = [];
  const dimensions = {} as Record<DimensionKey, DimensionScore>;

  // --------------------------------------------------------------------------
  // 1. Destination (12%)
  // - 6% : au moins un pays dans `countries`
  // - 6% : au moins une étape avec une ville `city`
  // --------------------------------------------------------------------------
  {
    const hasCountries = Array.isArray(tour.countries) && tour.countries.some((c) => !!c && c.trim().length > 0);
    const steps = tour.steps ?? [];
    const hasCity = steps.some((s) => !!s.city && s.city.trim().length > 0);

    let earned = 0;
    const hints: string[] = [];
    if (hasCountries) earned += 6;
    else {
      hints.push("Renseigner au moins un pays de destination");
      missingItems.push({
        id: "missing-countries",
        dimension: "destination",
        label: "Pays de destination manquant",
        pointsToGain: 6,
        hint: "Ajoutez au moins un pays (ex: Turquie, Tunisie, Arabie Saoudite).",
        fieldFocusId: "countries",
      });
    }

    if (hasCity) earned += 6;
    else {
      hints.push("Ajouter au moins une ville étape (ex: Istanbul, Sousse, Médine)");
      missingItems.push({
        id: "missing-city",
        dimension: "destination",
        label: "Ville étape manquante",
        pointsToGain: 6,
        hint: "Renseignez le nom d'au moins une ville visitée dans les étapes du séjour.",
        fieldFocusId: "step-city-0",
      });
    }

    dimensions.destination = makeDimensionScore("destination", "Destination", 12, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 2. Nom de l'agence (5%)
  // - Binaire (5%) : agency_id non nul ET nom valide (non générique)
  // --------------------------------------------------------------------------
  {
    const agencyIdValid = typeof tour.agency_id === "number" && tour.agency_id > 0;
    const agencyName = (tour.agency?.name ?? tour.sourceLabel ?? "").trim().toLowerCase();
    const isUnknown =
      !agencyName ||
      agencyName.includes("inconnue") ||
      agencyName.includes("unknown") ||
      agencyName.includes("par défaut");

    const hasAgency = agencyIdValid && !isUnknown;
    const earned = hasAgency ? 5 : 0;
    const hints: string[] = [];

    if (!hasAgency) {
      hints.push("Associer l'offre à une agence de voyages répertoriée");
      missingItems.push({
        id: "missing-agency",
        dimension: "agency",
        label: "Agence émettrice non identifiée",
        pointsToGain: 5,
        hint: "Sélectionnez l'agence partenaire émettrice dans le sélecteur.",
        fieldFocusId: "agency_id",
      });
    }

    dimensions.agency = makeDimensionScore("agency", "Nom de l'agence", 5, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 3. Dates et durée (12%)
  // - 4% : duration_nights > 0
  // - 4% : flight_departure_time valide
  // - 4% : return_flight_departure_time valide
  // --------------------------------------------------------------------------
  {
    const hasNights = typeof tour.duration_nights === "number" && tour.duration_nights > 0;
    const departures = tour.departures ?? [];
    const hasDepTime = departures.some((d) => !!d.flight_departure_time);
    const hasRetTime = departures.some((d) => !!d.return_flight_departure_time);

    let earned = 0;
    const hints: string[] = [];

    if (hasNights) earned += 4;
    else {
      hints.push("Préciser le nombre de nuitées");
      missingItems.push({
        id: "missing-nights",
        dimension: "dates_duration",
        label: "Nombre de nuitées absent",
        pointsToGain: 4,
        hint: "Indiquez la durée du séjour (ex: 7 nuits, 10 nuits).",
        fieldFocusId: "duration_nights",
      });
    }

    if (hasDepTime) earned += 4;
    else {
      hints.push("Indiquer au moins une date de départ");
      missingItems.push({
        id: "missing-flight-departure",
        dimension: "dates_duration",
        label: "Date de départ manquante",
        pointsToGain: 4,
        hint: "Ajoutez la date de départ du vol dans la section Départs.",
        fieldFocusId: "departure-date-0",
      });
    }

    if (hasRetTime) earned += 4;
    else {
      hints.push("Indiquer la date de retour");
      missingItems.push({
        id: "missing-flight-return",
        dimension: "dates_duration",
        label: "Date de retour manquante",
        pointsToGain: 4,
        hint: "Ajoutez la date de fin / vol retour dans la section Départs.",
        fieldFocusId: "return-date-0",
      });
    }

    dimensions.dates_duration = makeDimensionScore("dates_duration", "Dates & Durée", 12, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 4. Ville de départ (8%)
  // - Binaire (8%) : departure_city non vide (> 2 caractères)
  // --------------------------------------------------------------------------
  {
    const departures = tour.departures ?? [];
    const hasDepartureCity = departures.some(
      (d) => !!d.departure_city && d.departure_city.trim().length > 2 && d.departure_city.trim() !== "—",
    );

    const earned = hasDepartureCity ? 8 : 0;
    const hints: string[] = [];

    if (!hasDepartureCity) {
      hints.push("Indiquer la ville d'origine / aéroport de départ (ex: Alger, Oran, Constantine)");
      missingItems.push({
        id: "missing-departure-city",
        dimension: "departure_city",
        label: "Ville de départ manquante",
        pointsToGain: 8,
        hint: "Indiquez la ville d'où part le vol (ex: Alger, Oran).",
        fieldFocusId: "departure-city-0",
      });
    }

    dimensions.departure_city = makeDimensionScore("departure_city", "Ville de départ", 8, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 5. Programme (8%)
  // - 4% : description détaillée (>= 30 caractères)
  // - 4% : itinéraire avec au moins 1 jour structuré
  // --------------------------------------------------------------------------
  {
    const hasDesc = typeof tour.description === "string" && tour.description.trim().length >= 30;
    const itinerary = Array.isArray(tour.itinerary) ? tour.itinerary : [];
    const hasItinerary = itinerary.some((day) => {
      if (!day) return false;
      const itemsCount = Array.isArray(day.items) ? day.items.length : 0;
      return itemsCount > 0 || (typeof day.title === "string" && day.title.trim().length > 3);
    });

    let earned = 0;
    const hints: string[] = [];

    if (hasDesc) earned += 4;
    else {
      hints.push("Rédiger une description commerciale de l'offre (au moins 30 caractères)");
      missingItems.push({
        id: "missing-description",
        dimension: "program",
        label: "Description du programme manquante",
        pointsToGain: 4,
        hint: "Ajoutez un texte de présentation globale du voyage.",
        fieldFocusId: "description",
      });
    }

    if (hasItinerary) earned += 4;
    else {
      hints.push("Ajouter le détail de l'itinéraire journalier (jour 1, jour 2...)");
      missingItems.push({
        id: "missing-itinerary",
        dimension: "program",
        label: "Itinéraire jour par jour absent",
        pointsToGain: 4,
        hint: "Ajoutez au moins une journée d'excursion ou d'activités dans l'itinéraire.",
        fieldFocusId: "itinerary",
      });
    }

    dimensions.program = makeDimensionScore("program", "Programme & Itinéraire", 8, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 6. Tarifs (15%)
  // - 6% : lead_price > 0
  // - 5% : tarif double (dbl) présent
  // - 4% : au moins 2 déclinaisons tarifaires (tpl, sgl, chd, inf)
  // --------------------------------------------------------------------------
  {
    const hasLeadPrice = typeof tour.lead_price === "number" && tour.lead_price > 0;

    // Check dbl & extra pricings in hotel options or global pricing
    let hasDbl = false;
    let extraTiersCount = 0;

    // Inspect hotel_options
    const steps = tour.steps ?? [];
    for (const s of steps) {
      for (const h of s.hotels ?? []) {
        const p = h.pricing;
        if (p) {
          if (typeof p.dbl === "number" && p.dbl > 0) hasDbl = true;
          if (typeof p.tpl === "number" && p.tpl > 0) extraTiersCount++;
          if (typeof p.sgl === "number" && p.sgl > 0) extraTiersCount++;
          if (typeof p.chd_2_6 === "number" && p.chd_2_6 > 0) extraTiersCount++;
          if (typeof p.chd_5_11 === "number" && p.chd_5_11 > 0) extraTiersCount++;
          if (typeof p.inf === "number" && p.inf > 0) extraTiersCount++;
        }
      }
    }

    // Inspect global_pricing if object
    if (tour.global_pricing && typeof tour.global_pricing === "object") {
      const gp = tour.global_pricing as Record<string, unknown>;
      if (typeof gp.dbl === "number" && gp.dbl > 0) hasDbl = true;
      for (const k of ["tpl", "sgl", "chd_2_6", "chd_5_11", "chd_2_5", "chd_6_11", "inf"]) {
        if (typeof gp[k] === "number" && (gp[k] as number) > 0) extraTiersCount++;
      }
    } else if (typeof tour.global_pricing === "number" && tour.global_pricing > 0) {
      hasDbl = true;
    }

    let earned = 0;
    const hints: string[] = [];

    if (hasLeadPrice) earned += 6;
    else {
      hints.push("Indiquer le prix d'appel (lead price)");
      missingItems.push({
        id: "missing-lead-price",
        dimension: "pricing",
        label: "Prix d'appel manquant",
        pointsToGain: 6,
        hint: "Renseignez le tarif adulte minimum pour afficher l'offre.",
        fieldFocusId: "lead_price",
      });
    }

    if (hasDbl) earned += 5;
    else {
      hints.push("Renseigner le prix par personne en chambre double (dbl)");
      missingItems.push({
        id: "missing-dbl-price",
        dimension: "pricing",
        label: "Tarif chambre double manquant",
        pointsToGain: 5,
        hint: "Renseignez le prix de référence par personne en base double.",
        fieldFocusId: "pricing-dbl",
      });
    }

    if (extraTiersCount >= 2) earned += 4;
    else {
      hints.push("Ajouter au moins 2 déclinaisons tarifaires (enfant, single, triple)");
      missingItems.push({
        id: "missing-price-tiers",
        dimension: "pricing",
        label: "Déclinaisons tarifaires incomplètes",
        pointsToGain: 4,
        hint: "Renseignez les tarifs pour enfant, bébé, chambre individuelle ou triple.",
        fieldFocusId: "pricing-extra",
      });
    }

    dimensions.pricing = makeDimensionScore("pricing", "Tarifs & Déclinaisons", 15, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 7. Hôtel(s) (10%)
  // - 6% : au moins un hôtel rattaché (catalogue ou custom)
  // - 4% : un hôtel désigné par défaut (is_default = true)
  // --------------------------------------------------------------------------
  {
    const steps = tour.steps ?? [];
    let hasHotel = false;
    let hasDefaultHotel = false;

    for (const s of steps) {
      for (const h of s.hotels ?? []) {
        if ((typeof h.hotel_id === "number" && h.hotel_id > 0) || (typeof h.custom_hotel_name === "string" && h.custom_hotel_name.trim().length > 0)) {
          hasHotel = true;
        }
        if (h.is_default) {
          hasDefaultHotel = true;
        }
      }
    }

    let earned = 0;
    const hints: string[] = [];

    if (hasHotel) earned += 6;
    else {
      hints.push("Associer au moins un hébergement / hôtel à l'étape");
      missingItems.push({
        id: "missing-hotel",
        dimension: "hotels",
        label: "Aucun hôtel renseigné",
        pointsToGain: 6,
        hint: "Choisissez un hôtel dans le catalogue ou saisissez son nom personnalisé.",
        fieldFocusId: "hotel-name-0",
      });
    }

    if (hasDefaultHotel) earned += 4;
    else {
      hints.push("Désigner l'hôtel principal par défaut de l'étape");
      missingItems.push({
        id: "missing-default-hotel",
        dimension: "hotels",
        label: "Hôtel par défaut non coché",
        pointsToGain: 4,
        hint: "Cochez la case 'Hôtel par défaut' sur l'établissement principal.",
        fieldFocusId: "hotel-default-0",
      });
    }

    dimensions.hotels = makeDimensionScore("hotels", "Hébergement & Hôtels", 10, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 8. Services & Restauration (15%)
  // - 5% : services.included >= 2 éléments
  // - 3% : services.excluded >= 1 élément
  // - 7% : Restauration détectée dans included (mots-clés regex)
  // --------------------------------------------------------------------------
  {
    const included = tour.services?.included ?? [];
    const excluded = tour.services?.excluded ?? [];

    const hasIncluded = Array.isArray(included) && included.filter((s) => !!s && s.trim().length > 0).length >= 2;
    const hasExcluded = Array.isArray(excluded) && excluded.filter((s) => !!s && s.trim().length > 0).length >= 1;

    const hasCatering = Array.isArray(included) && included.some((s) => typeof s === "string" && CATERING_REGEX.test(s));

    let earned = 0;
    const hints: string[] = [];

    if (hasIncluded) earned += 5;
    else {
      hints.push("Ajouter au moins 2 prestations incluses (transferts, excursions, guide...)");
      missingItems.push({
        id: "missing-included-services",
        dimension: "services_catering",
        label: "Prestations incluses insuffisantes",
        pointsToGain: 5,
        hint: "Renseignez au moins 2 prestations incluses pour rassurer le client.",
        fieldFocusId: "services-included",
      });
    }

    if (hasExcluded) earned += 3;
    else {
      hints.push("Préciser les prestations non incluses (assurance, pourboires, taxes...)");
      missingItems.push({
        id: "missing-excluded-services",
        dimension: "services_catering",
        label: "Prestations exclues non mentionnées",
        pointsToGain: 3,
        hint: "Listez les exclusions (ex: frais de visa, dépenses personnelles).",
        fieldFocusId: "services-excluded",
      });
    }

    if (hasCatering) earned += 7;
    else {
      hints.push("Indiquer le régime de repas (ex: 'Petit-déjeuner inclus', 'Demi-pension', 'All Inclusive')");
      missingItems.push({
        id: "missing-catering",
        dimension: "services_catering",
        label: "Formule de repas non précisée",
        pointsToGain: 7,
        hint: "Ajoutez la formule repas (ex: 'Petit-déjeuner inclus') dans les prestations incluses.",
        fieldFocusId: "services-included",
      });
    }

    dimensions.services_catering = makeDimensionScore("services_catering", "Services & Restauration", 15, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 9. Plan de vol & Compagnie (8%)
  // - 4% : airline non vide
  // - 4% : horaires aller/retour précisés (flight_arrival_time & return_flight_arrival_time)
  // --------------------------------------------------------------------------
  {
    const hasAirline = typeof tour.airline === "string" && tour.airline.trim().length > 1;
    const departures = tour.departures ?? [];
    const hasArrivalTimes = departures.some((d) => !!d.flight_arrival_time && !!d.return_flight_arrival_time);

    let earned = 0;
    const hints: string[] = [];

    if (hasAirline) earned += 4;
    else {
      hints.push("Renseigner la compagnie aérienne (ex: Air Algérie, Turkish Airlines)");
      missingItems.push({
        id: "missing-airline",
        dimension: "flight",
        label: "Compagnie aérienne absente",
        pointsToGain: 4,
        hint: "Indiquez la compagnie aérienne qui assure les vols.",
        fieldFocusId: "airline",
      });
    }

    if (hasArrivalTimes) earned += 4;
    else {
      hints.push("Préciser les horaires complets d'arrivée du vol aller et retour");
      missingItems.push({
        id: "missing-flight-times",
        dimension: "flight",
        label: "Horaires précis des vols manquants",
        pointsToGain: 4,
        hint: "Renseignez les heures d'atterrissage aller et retour.",
        fieldFocusId: "flight-times",
      });
    }

    dimensions.flight = makeDimensionScore("flight", "Plan de vol & Compagnie", 8, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 10. Disponibilité / Stock (7%)
  // - Binaire (7%) : au moins un départ avec stock > 0
  // --------------------------------------------------------------------------
  {
    const departures = tour.departures ?? [];
    const hasStock = departures.some((d) => typeof d.stock === "number" && d.stock > 0);

    const earned = hasStock ? 7 : 0;
    const hints: string[] = [];

    if (!hasStock) {
      hints.push("Indiquer le nombre de places disponibles (stock) pour au moins une date");
      missingItems.push({
        id: "missing-stock",
        dimension: "stock",
        label: "Disponibilité / Stock non renseigné",
        pointsToGain: 7,
        hint: "Indiquez le quota de places disponibles pour permettre la réservation instantanée.",
        fieldFocusId: "departure-stock-0",
      });
    }

    dimensions.stock = makeDimensionScore("stock", "Disponibilité & Stock", 7, earned, hints);
  }

  // --------------------------------------------------------------------------
  // 11. Commission agence (4%)
  // - Binaire (4%) : commission_amount > 0 ou au moins une commission valide
  // --------------------------------------------------------------------------
  {
    const hasCommissionAmount =
      (typeof tour.commission_amount === "number" && tour.commission_amount > 0) ||
      (typeof tour.commission_amount === "string" && Number(tour.commission_amount) > 0);

    const commissions = tour.commissions ?? [];
    const hasCommissionsArray =
      Array.isArray(commissions) &&
      commissions.some((c) => typeof c?.amount === "number" && c.amount > 0);

    const hasCommission = hasCommissionAmount || hasCommissionsArray;
    const earned = hasCommission ? 4 : 0;
    const hints: string[] = [];

    if (!hasCommission) {
      hints.push("Indiquer la commission agence par passager ou dossier (DA)");
      missingItems.push({
        id: "missing-commission",
        dimension: "commission",
        label: "Commission agence non spécifiée",
        pointsToGain: 4,
        hint: "Renseignez le montant de la commission reversée au réseau de vente.",
        fieldFocusId: "commission_amount",
      });
    }

    dimensions.commission = makeDimensionScore("commission", "Commission agence", 4, earned, hints);
  }

  // --------------------------------------------------------------------------
  // Calcul du score global
  // --------------------------------------------------------------------------
  let totalScore = 0;
  let completedCount = 0;

  for (const key of Object.keys(dimensions) as DimensionKey[]) {
    totalScore += dimensions[key].earned;
    if (dimensions[key].status === "complete") {
      completedCount++;
    }
  }

  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  // Trier les éléments manquants par gain potentiel décroissant
  missingItems.sort((a, b) => b.pointsToGain - a.pointsToGain);

  const tier = getTier(totalScore);

  return {
    score: totalScore,
    tier,
    badgeLabel: getTierLabel(tier),
    badgeVariant: getTierBadgeVariant(tier),
    colorClass: getTierColorClass(tier),
    summary: {
      completedDimensions: completedCount,
      totalDimensions: 11,
      earnedWeight: totalScore,
      totalWeight: 100,
    },
    dimensions,
    missingItems,
  };
}

function makeDimensionScore(
  key: DimensionKey,
  label: string,
  weight: number,
  earned: number,
  missingHints: string[],
): DimensionScore {
  const percentage = Math.round((earned / weight) * 100);
  const status: DimensionScore["status"] =
    earned >= weight ? "complete" : earned > 0 ? "partial" : "missing";

  let details = `${earned} / ${weight} pts`;
  if (status === "complete") details = `Complet (${earned}/${weight} pts)`;
  else if (status === "partial") details = `Partiel (${earned}/${weight} pts)`;
  else details = `Manquant (0/${weight} pts)`;

  return {
    key,
    label,
    weight,
    earned,
    percentage,
    status,
    details,
    missingHints,
  };
}

function getTier(score: number): QualityTier {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "medium";
  return "critical";
}

function getTierLabel(tier: QualityTier): string {
  switch (tier) {
    case "excellent":
      return "Excellente (Prête à publier)";
    case "good":
      return "Bonne complétude";
    case "medium":
      return "Complétude moyenne";
    case "critical":
      return "Données critiques manquantes";
  }
}

function getTierBadgeVariant(
  tier: QualityTier,
): "success" | "info" | "warning" | "destructive" {
  switch (tier) {
    case "excellent":
      return "success";
    case "good":
      return "info";
    case "medium":
      return "warning";
    case "critical":
      return "destructive";
  }
}

function getTierColorClass(tier: QualityTier): string {
  switch (tier) {
    case "excellent":
      return "text-emerald-600 dark:text-emerald-400";
    case "good":
      return "text-sky-600 dark:text-sky-400";
    case "medium":
      return "text-amber-600 dark:text-amber-400";
    case "critical":
      return "text-rose-600 dark:text-rose-400";
  }
}

function createEmptyScore(): TourQualityScoreResult {
  return {
    score: 0,
    tier: "critical",
    badgeLabel: "Données critiques manquantes",
    badgeVariant: "destructive",
    colorClass: "text-rose-600 dark:text-rose-400",
    summary: {
      completedDimensions: 0,
      totalDimensions: 11,
      earnedWeight: 0,
      totalWeight: 100,
    },
    dimensions: {} as Record<DimensionKey, DimensionScore>,
    missingItems: [],
  };
}
