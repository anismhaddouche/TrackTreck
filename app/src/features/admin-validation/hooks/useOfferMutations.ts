import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";
import type { TourDetail } from "@/lib/types";
import { normalizeDepartureTimes } from "@/lib/normalize-departures";

// Persists corrections by updating the parent `tours` row, then replacing the
// nested rows (tour_steps + hotel_options for each step, departures). This
// mirrors how the n8n pipeline writes nested data and keeps the read model
// consistent without touching the schema.
async function persistOffer(offer: TourDetail): Promise<void> {
  const supabase = getSupabase();

  // Drop empty rows (both label blank AND amount null) before persisting so
  // the JSONB stays clean; this also matches the validation rule.
  const cleanedCommissions = (offer.commissions ?? []).filter(
    (c) => (c.label && c.label.trim() !== "") || c.amount !== null,
  );

  const { error: tourErr } = await supabase
    .from("tours")
    .update({
      title: offer.title,
      agency_id: offer.agency_id,
      status: "pending_review",
      countries: offer.countries,
      duration_nights: offer.duration_nights,
      airline: offer.airline,
      description: offer.description,
      itinerary: offer.itinerary ?? [],
      photo_urls: offer.photo_urls ?? [],
      is_global_pricing: offer.is_global_pricing ?? false,
      global_pricing: offer.global_pricing,
      lead_price: offer.lead_price,
      commissions: cleanedCommissions,
      services: offer.services ?? { included: [], excluded: [] },
    })
    .eq("id", offer.id);
  if (tourErr) throw tourErr;

  // Replace tour_steps + hotel_options for this tour.
  // hotel_options has ON DELETE CASCADE on tour_step_id, so deleting steps
  // cleans them up automatically.
  const { error: delStepsErr } = await supabase
    .from("tour_steps")
    .delete()
    .eq("tour_id", offer.id);
  if (delStepsErr) throw delStepsErr;

  for (const step of offer.steps) {
    const { data: insertedStep, error: stepErr } = await supabase
      .from("tour_steps")
      .insert({
        tour_id: offer.id,
        city: step.city,
        step_order: step.step_order,
        duration_nights: step.duration_nights,
      })
      .select("id")
      .single();
    if (stepErr) throw stepErr;
    const stepId = (insertedStep as { id: number }).id;

    if (step.hotels.length > 0) {
      const { error: hotelsErr } = await supabase.from("hotel_options").insert(
        step.hotels.map((h) => ({
          tour_step_id: stepId,
          hotel_id: h.hotel_id,
          custom_hotel_name: h.custom_hotel_name,
          is_default: h.is_default,
          pricing: h.pricing,
        })),
      );
      if (hotelsErr) throw hotelsErr;
    }
  }

  // Replace departures.
  const { error: delDepErr } = await supabase
    .from("departures")
    .delete()
    .eq("tour_id", offer.id);
  if (delDepErr) throw delDepErr;

  if (offer.departures.length > 0) {
    // Guarantee a non-null arrival for every departure before writing: keep the
    // real flight-plan arrival when present, otherwise derive departure + 1h.
    // This runs as a server-write guard for payloads that bypass the UI
    // (e.g. JSON tab, future API caller).
    const normalizedDepartures = normalizeDepartureTimes(offer.departures);
    const { error: depErr } = await supabase.from("departures").insert(
      normalizedDepartures.map((d) => ({
        tour_id: offer.id,
        departure_city: d.departure_city,
        stock: d.stock ?? 0,
        flight_departure_time: d.flight_departure_time,
        flight_arrival_time: d.flight_arrival_time,
        return_flight_departure_time: d.return_flight_departure_time,
        return_flight_arrival_time: d.return_flight_arrival_time,
      })),
    );
    if (depErr) throw depErr;
  }
}

export function useSaveOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: persistOffer,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["offers", "detail", variables.id] });
      qc.invalidateQueries({ queryKey: ["offers", "to-validate"] });
    },
  });
}

export function useValidateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: number): Promise<void> => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("tours")
        .update({ needs_review: false, status: "published" })
        .eq("id", offerId);
      if (error) throw error;
    },
    onSuccess: (_data, offerId) => {
      qc.invalidateQueries({ queryKey: ["offers", "detail", offerId] });
      qc.invalidateQueries({ queryKey: ["offers", "to-validate"] });
    },
  });
}

// Hard-delete the tour. Schema declares `ON DELETE CASCADE` on tour_steps and
// departures (and hotel_options cascade off tour_steps), so a single delete
// here cleans up the whole subtree. We do NOT touch storage assets — they are
// addressed separately by the pipeline lifecycle.
export function useDeleteOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: number): Promise<void> => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("tours")
        .delete()
        .eq("id", offerId);
      if (error) throw error;
    },
    onSuccess: (_data, offerId) => {
      qc.removeQueries({ queryKey: ["offers", "detail", offerId] });
      qc.invalidateQueries({ queryKey: ["offers", "to-validate"] });
    },
  });
}
