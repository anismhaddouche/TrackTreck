-- Migration: Auto calculate and update quality_score via PostgreSQL triggers
-- Whenever a tour, tour step, hotel option, or departure is inserted, updated, or deleted,
-- the completeness quality_score (0-100) is automatically computed and updated on the tour.

-- 1. Main function: recalculate score for a specific tour
CREATE OR REPLACE FUNCTION recalculate_tour_quality_score(target_tour_id bigint)
RETURNS integer AS $$
DECLARE
  v_score integer;
BEGIN
  IF target_tour_id IS NULL THEN
    RETURN NULL;
  END IF;

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
    WHERE ts.tour_id = target_tour_id
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
    WHERE tour_id = target_tour_id
    GROUP BY tour_id
  ),
  computed AS (
    SELECT 
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
    WHERE t.id = target_tour_id
  )
  SELECT LEAST(100, GREATEST(0, score)) INTO v_score FROM computed;

  IF v_score IS NOT NULL THEN
    UPDATE tours
    SET quality_score = v_score
    WHERE id = target_tour_id AND (quality_score IS DISTINCT FROM v_score);
  END IF;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper function to recalculate all tours
CREATE OR REPLACE FUNCTION recalculate_all_tour_quality_scores()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
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
      LEAST(100, GREATEST(0, (
        (CASE WHEN array_length(t.countries, 1) > 0 THEN 6 ELSE 0 END) +
        (CASE WHEN coalesce(sm.has_step_city, false) THEN 6 ELSE 0 END) +
        (CASE WHEN t.agency_id IS NOT NULL THEN 5 ELSE 0 END) +
        (CASE WHEN coalesce(t.duration_nights, 0) > 0 THEN 4 ELSE 0 END) +
        (CASE WHEN coalesce(dm.has_flight_dep, false) THEN 4 ELSE 0 END) +
        (CASE WHEN coalesce(dm.has_return_flight_dep, false) THEN 4 ELSE 0 END) +
        (CASE WHEN coalesce(dm.has_dep_city, false) THEN 8 ELSE 0 END) +
        (CASE WHEN t.description IS NOT NULL AND length(trim(t.description)) >= 30 THEN 4 ELSE 0 END) +
        (CASE WHEN t.itinerary IS NOT NULL AND jsonb_typeof(t.itinerary) = 'array' AND jsonb_array_length(t.itinerary) > 0 THEN 4 ELSE 0 END) +
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
        (CASE WHEN coalesce(sm.has_hotel, false) THEN 6 ELSE 0 END) +
        (CASE WHEN coalesce(sm.has_default_hotel, false) THEN 4 ELSE 0 END) +
        (CASE WHEN jsonb_typeof(t.services->'included') = 'array' AND jsonb_array_length(t.services->'included') >= 2 THEN 5 ELSE 0 END) +
        (CASE WHEN jsonb_typeof(t.services->'excluded') = 'array' AND jsonb_array_length(t.services->'excluded') >= 1 THEN 3 ELSE 0 END) +
        (CASE WHEN (t.services->>'included') ~* '(petit[- ]d[eé]jeuner|demi[- ]pension|pension compl[eè]te|all[- ]inclusive|tout compris|repas|d[iî]ner|d[eé]jeuner|buffet|iftar|shour|sahour|restauration)' THEN 7 ELSE 0 END) +
        (CASE WHEN t.airline IS NOT NULL AND length(trim(t.airline)) >= 2 THEN 4 ELSE 0 END) +
        (CASE WHEN coalesce(dm.has_flight_arrivals, false) THEN 4 ELSE 0 END) +
        (CASE WHEN coalesce(dm.has_stock, false) THEN 7 ELSE 0 END) +
        (CASE WHEN coalesce(t.commission_amount, 0) > 0 OR (jsonb_typeof(t.commissions) = 'array' AND jsonb_array_length(t.commissions) > 0) THEN 4 ELSE 0 END)
      ))) AS new_score
    FROM tours t
    LEFT JOIN step_metrics sm ON sm.tour_id = t.id
    LEFT JOIN dep_metrics dm ON dm.tour_id = t.id
  )
  UPDATE tours
  SET quality_score = cs.new_score
  FROM computed_scores cs
  WHERE tours.id = cs.id AND (tours.quality_score IS DISTINCT FROM cs.new_score);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger functions
CREATE OR REPLACE FUNCTION trigger_recalculate_quality_score_from_tours()
RETURNS trigger AS $$
BEGIN
  PERFORM recalculate_tour_quality_score(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_recalculate_quality_score_from_tour_steps()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tour_id IS NOT NULL THEN
      PERFORM recalculate_tour_quality_score(OLD.tour_id);
    END IF;
  ELSE
    IF NEW.tour_id IS NOT NULL THEN
      PERFORM recalculate_tour_quality_score(NEW.tour_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.tour_id IS NOT NULL AND OLD.tour_id IS DISTINCT FROM NEW.tour_id THEN
      PERFORM recalculate_tour_quality_score(OLD.tour_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_recalculate_quality_score_from_hotel_options()
RETURNS trigger AS $$
DECLARE
  v_tour_id bigint;
  v_old_tour_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT tour_id INTO v_tour_id FROM tour_steps WHERE id = OLD.tour_step_id;
    IF v_tour_id IS NOT NULL THEN
      PERFORM recalculate_tour_quality_score(v_tour_id);
    END IF;
  ELSE
    SELECT tour_id INTO v_tour_id FROM tour_steps WHERE id = NEW.tour_step_id;
    IF v_tour_id IS NOT NULL THEN
      PERFORM recalculate_tour_quality_score(v_tour_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.tour_step_id IS DISTINCT FROM NEW.tour_step_id THEN
      SELECT tour_id INTO v_old_tour_id FROM tour_steps WHERE id = OLD.tour_step_id;
      IF v_old_tour_id IS NOT NULL AND v_old_tour_id IS DISTINCT FROM v_tour_id THEN
        PERFORM recalculate_tour_quality_score(v_old_tour_id);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_recalculate_quality_score_from_departures()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tour_id IS NOT NULL THEN
      PERFORM recalculate_tour_quality_score(OLD.tour_id);
    END IF;
  ELSE
    IF NEW.tour_id IS NOT NULL THEN
      PERFORM recalculate_tour_quality_score(NEW.tour_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.tour_id IS NOT NULL AND OLD.tour_id IS DISTINCT FROM NEW.tour_id THEN
      PERFORM recalculate_tour_quality_score(OLD.tour_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create or recreate triggers on tables
DROP TRIGGER IF EXISTS trg_tours_quality_score ON tours;
CREATE TRIGGER trg_tours_quality_score
AFTER INSERT OR UPDATE OF
  countries, agency_id, duration_nights, airline, description,
  itinerary, lead_price, global_pricing, services,
  commission_amount, commissions
ON tours
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_quality_score_from_tours();

DROP TRIGGER IF EXISTS trg_tour_steps_quality_score ON tour_steps;
CREATE TRIGGER trg_tour_steps_quality_score
AFTER INSERT OR UPDATE OR DELETE
ON tour_steps
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_quality_score_from_tour_steps();

DROP TRIGGER IF EXISTS trg_hotel_options_quality_score ON hotel_options;
CREATE TRIGGER trg_hotel_options_quality_score
AFTER INSERT OR UPDATE OR DELETE
ON hotel_options
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_quality_score_from_hotel_options();

DROP TRIGGER IF EXISTS trg_departures_quality_score ON departures;
CREATE TRIGGER trg_departures_quality_score
AFTER INSERT OR UPDATE OR DELETE
ON departures
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_quality_score_from_departures();

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION recalculate_tour_quality_score(bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION recalculate_all_tour_quality_scores() TO anon, authenticated, service_role;

-- 6. Immediately backfill and sync all existing tours
SELECT recalculate_all_tour_quality_scores();
