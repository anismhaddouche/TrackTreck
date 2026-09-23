-- Backfill quality_score for all tours in TrackTreck based on 11-dimension scoring criteria (Total: 100%)

WITH step_metrics AS (
  SELECT 
    tour_id,
    bool_or(city IS NOT NULL AND length(trim(city)) >= 2) AS has_step_city,
    bool_or(ho.hotel_id IS NOT NULL OR length(trim(coalesce(ho.custom_hotel_name, ''))) > 0) AS has_hotel,
    bool_or(coalesce(ho.is_default, false)) AS has_default_hotel,
    bool_or(coalesce((ho.pricing->>'dbl')::numeric, 0) > 0) AS has_hotel_dbl,
    bool_or(
      (CASE WHEN coalesce((ho.pricing->>'tpl')::numeric, 0) > 0 THEN 1 ELSE 0 END +
       CASE WHEN coalesce((ho.pricing->>'sgl')::numeric, 0) > 0 THEN 1 ELSE 0 END +
       CASE WHEN coalesce((ho.pricing->>'chd_2_6')::numeric, 0) > 0 THEN 1 ELSE 0 END +
       CASE WHEN coalesce((ho.pricing->>'chd_5_11')::numeric, 0) > 0 THEN 1 ELSE 0 END +
       CASE WHEN coalesce((ho.pricing->>'inf')::numeric, 0) > 0 THEN 1 ELSE 0 END) >= 2
    ) AS has_hotel_family_pricing
  FROM tour_steps ts
  LEFT JOIN hotel_options ho ON ho.tour_step_id = ts.id
  GROUP BY tour_id
),
dep_metrics AS (
  SELECT 
    tour_id,
    bool_or(flight_departure_time IS NOT NULL) AS has_flight_dep,
    bool_or(return_flight_departure_time IS NOT NULL) AS has_return_flight_dep,
    bool_or(departure_city IS NOT NULL AND length(trim(departure_city)) >= 2) AS has_dep_city,
    bool_or(flight_arrival_time IS NOT NULL AND return_flight_arrival_time IS NOT NULL) AS has_flight_arrivals,
    bool_or(coalesce(stock, 0) > 0) AS has_stock
  FROM departures
  GROUP BY tour_id
),
computed_scores AS (
  SELECT 
    t.id,
    (
      -- 1. Destination (12%)
      (CASE WHEN array_length(t.countries, 1) > 0 THEN 6 ELSE 0 END) +
      (CASE WHEN coalesce(sm.has_step_city, false) THEN 6 ELSE 0 END) +
      -- 2. Agence (5%)
      (CASE WHEN t.agency_id IS NOT NULL THEN 5 ELSE 0 END) +
      -- 3. Dates & Durée (12%)
      (CASE WHEN coalesce(t.duration_nights, 0) > 0 THEN 4 ELSE 0 END) +
      (CASE WHEN coalesce(dm.has_flight_dep, false) THEN 4 ELSE 0 END) +
      (CASE WHEN coalesce(dm.has_return_flight_dep, false) THEN 4 ELSE 0 END) +
      -- 4. Ville de départ (8%)
      (CASE WHEN coalesce(dm.has_dep_city, false) THEN 8 ELSE 0 END) +
      -- 5. Programme (8%)
      (CASE WHEN t.description IS NOT NULL AND length(trim(t.description)) >= 30 THEN 4 ELSE 0 END) +
      (CASE WHEN t.itinerary IS NOT NULL AND jsonb_typeof(t.itinerary) = 'array' AND jsonb_array_length(t.itinerary) > 0 THEN 4 ELSE 0 END) +
      -- 6. Tarification (15%)
      (CASE WHEN coalesce(t.lead_price, 0) > 0 THEN 6 ELSE 0 END) +
      (CASE WHEN coalesce(sm.has_hotel_dbl, false) OR coalesce((t.global_pricing->>'dbl')::numeric, 0) > 0 OR coalesce(t.lead_price, 0) > 0 THEN 5 ELSE 0 END) +
      (CASE WHEN coalesce(sm.has_hotel_family_pricing, false) OR 
        (
          (CASE WHEN coalesce((t.global_pricing->>'tpl')::numeric, 0) > 0 THEN 1 ELSE 0 END +
           CASE WHEN coalesce((t.global_pricing->>'sgl')::numeric, 0) > 0 THEN 1 ELSE 0 END +
           CASE WHEN coalesce((t.global_pricing->>'chd_2_6')::numeric, 0) > 0 THEN 1 ELSE 0 END +
           CASE WHEN coalesce((t.global_pricing->>'chd_5_11')::numeric, 0) > 0 THEN 1 ELSE 0 END +
           CASE WHEN coalesce((t.global_pricing->>'inf')::numeric, 0) > 0 THEN 1 ELSE 0 END) >= 2
        ) THEN 4 ELSE 0 END) +
      -- 7. Hôtels (10%)
      (CASE WHEN coalesce(sm.has_hotel, false) THEN 6 ELSE 0 END) +
      (CASE WHEN coalesce(sm.has_default_hotel, false) THEN 4 ELSE 0 END) +
      -- 8. Prestations & Restauration (15%)
      (CASE WHEN jsonb_typeof(t.services->'included') = 'array' AND jsonb_array_length(t.services->'included') >= 2 THEN 5 ELSE 0 END) +
      (CASE WHEN jsonb_typeof(t.services->'excluded') = 'array' AND jsonb_array_length(t.services->'excluded') >= 1 THEN 3 ELSE 0 END) +
      (CASE WHEN (t.services->>'included') ~* '(petit[- ]d[eé]jeuner|demi[- ]pension|pension compl[eè]te|all[- ]inclusive|tout compris|repas|d[iî]ner|d[eé]jeuner|buffet|iftar|shour|sahour|restauration)' THEN 7 ELSE 0 END) +
      -- 9. Plan de vol & Compagnie (8%)
      (CASE WHEN t.airline IS NOT NULL AND length(trim(t.airline)) >= 2 THEN 4 ELSE 0 END) +
      (CASE WHEN coalesce(dm.has_flight_arrivals, false) THEN 4 ELSE 0 END) +
      -- 10. Disponibilité / Stock (7%)
      (CASE WHEN coalesce(dm.has_stock, false) THEN 7 ELSE 0 END) +
      -- 11. Commission agence (4%)
      (CASE WHEN coalesce(t.commission_amount, 0) > 0 OR (jsonb_typeof(t.commissions) = 'array' AND jsonb_array_length(t.commissions) > 0) THEN 4 ELSE 0 END)
    ) AS score
  FROM tours t
  LEFT JOIN step_metrics sm ON sm.tour_id = t.id
  LEFT JOIN dep_metrics dm ON dm.tour_id = t.id
)
UPDATE tours
SET quality_score = LEAST(100, GREATEST(0, cs.score))
FROM computed_scores cs
WHERE tours.id = cs.id;
