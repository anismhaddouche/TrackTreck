import { useQuery } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";
import {
  inferSourceLabelFromPhotoUrls,
  isDefaultAgencyName,
} from "@/lib/source-resolver";
import type {
  Commission,
  Departure,
  HotelOption,
  HotelPricing,
  TourDetail,
  TourStep,
} from "@/lib/types";

interface RawTour {
  id: number;
  title: string | null;
  agency_id: number | null;
  countries: string[] | null;
  duration_nights: number | null;
  airline: string | null;
  description: string | null;
  itinerary: unknown;
  status: TourDetail["status"];
  photo_urls: string[] | null;
  is_global_pricing: boolean | null;
  global_pricing: number | null;
  lead_price: number | null;
  commission_amount: number | string | null;
  commissions: unknown;
  services: unknown;
  needs_review: boolean;
  created_at: string | null;
  agencies:
    | { id: number; name: string; email: string | null; phone: string | null; town: string | null }
    | Array<{ id: number; name: string; email: string | null; phone: string | null; town: string | null }>
    | null;
}

interface RawStep {
  id: number;
  tour_id: number;
  city: string | null;
  step_order: number;
  duration_nights: number | null;
}

interface RawHotelOption {
  id: number;
  tour_step_id: number;
  hotel_id: number | null;
  custom_hotel_name: string | null;
  is_default: boolean | null;
  pricing: unknown;
}

interface RawDeparture {
  id: number;
  tour_id: number;
  departure_city: string;
  stock: number | null;
  flight_departure_time: string | null;
  flight_arrival_time: string | null;
  return_flight_departure_time: string | null;
  return_flight_arrival_time: string | null;
}

function asPricing(value: unknown): HotelPricing {
  const v = (value ?? {}) as Record<string, unknown>;
  const num = (key: string): number | null => {
    const raw = v[key];
    if (raw === null || raw === undefined) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    dbl: num("dbl"),
    tpl: num("tpl"),
    sgl: num("sgl"),
    inf: num("inf"),
    chd_2_6: num("chd_2_6"),
    chd_5_11: num("chd_5_11"),
  };
}

// Parses the `commissions` JSONB into a clean `Commission[]`. Rows missing a
// `label` and an `amount` are dropped — they're noise. Falls back to building
// a single-row array from the legacy scalar `commission_amount` when the new
// column is empty/missing, so the admin keeps working before the migration is
// applied AND for offers ingested before backfill.
function asCommissions(
  value: unknown,
  legacyAmount: number | string | null | undefined,
): Commission[] {
  const fromArray = (raw: unknown): Commission[] => {
    if (!Array.isArray(raw)) return [];
    const out: Commission[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label : "";
      const amountRaw = row.amount;
      const amount =
        amountRaw === null || amountRaw === undefined
          ? null
          : Number.isFinite(Number(amountRaw))
            ? Number(amountRaw)
            : null;
      if (label === "" && amount === null) continue;
      out.push({ label, amount });
    }
    return out;
  };
  const parsed = fromArray(value);
  if (parsed.length > 0) return parsed;

  if (legacyAmount !== null && legacyAmount !== undefined) {
    const n = Number(legacyAmount);
    if (Number.isFinite(n)) {
      return [{ label: "Commission", amount: n }];
    }
  }
  return [];
}

function asServices(value: unknown): { included: string[]; excluded: string[] } {
  const v = (value ?? {}) as { included?: unknown; excluded?: unknown };
  const arr = (raw: unknown): string[] =>
    Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];
  return { included: arr(v.included), excluded: arr(v.excluded) };
}

function asItinerary(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function pickAgency(raw: RawTour["agencies"]) {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export function useOfferDetail(idParam: string | undefined) {
  const idNum = idParam ? Number(idParam) : NaN;
  const enabled = Number.isFinite(idNum);

  return useQuery<TourDetail>({
    queryKey: ["offers", "detail", idNum],
    enabled,
    queryFn: async (): Promise<TourDetail> => {
      const supabase = getSupabase();

      const { data: tourRow, error: tourErr } = await supabase
        .from("tours")
        .select(
          `id, title, agency_id, countries, duration_nights, airline,
           description, itinerary, status, photo_urls, is_global_pricing,
           global_pricing, lead_price, commission_amount, commissions, services, needs_review, created_at,
           agencies:agency_id ( id, name, email, phone, town )`,
        )
        .eq("id", idNum)
        .single();
      if (tourErr) throw tourErr;
      const tour = tourRow as RawTour;

      const { data: stepRows, error: stepErr } = await supabase
        .from("tour_steps")
        .select("id, tour_id, city, step_order, duration_nights")
        .eq("tour_id", idNum)
        .order("step_order", { ascending: true });
      if (stepErr) throw stepErr;
      const steps = (stepRows ?? []) as RawStep[];

      const stepIds = steps.map((s) => s.id);
      let hotelRows: RawHotelOption[] = [];
      if (stepIds.length > 0) {
        const { data: hRows, error: hErr } = await supabase
          .from("hotel_options")
          .select(
            "id, tour_step_id, hotel_id, custom_hotel_name, is_default, pricing",
          )
          .in("tour_step_id", stepIds);
        if (hErr) throw hErr;
        hotelRows = (hRows ?? []) as RawHotelOption[];
      }

      const { data: depRows, error: depErr } = await supabase
        .from("departures")
        .select(
          `id, tour_id, departure_city, stock,
           flight_departure_time, flight_arrival_time,
           return_flight_departure_time, return_flight_arrival_time`,
        )
        .eq("tour_id", idNum)
        .order("flight_departure_time", { ascending: true });
      if (depErr) throw depErr;
      const departures = (depRows ?? []) as RawDeparture[];

      const stepsWithHotels: TourStep[] = steps.map((step) => {
        const hotels: HotelOption[] = hotelRows
          .filter((h) => h.tour_step_id === step.id)
          .map((h) => ({
            id: h.id,
            hotel_id: h.hotel_id,
            custom_hotel_name: h.custom_hotel_name,
            is_default: h.is_default === true,
            pricing: asPricing(h.pricing),
          }));
        return {
          id: step.id,
          city: step.city,
          step_order: step.step_order,
          duration_nights: step.duration_nights,
          hotels,
        };
      });

      const departuresMapped: Departure[] = departures.map((d) => ({
        id: d.id,
        departure_city: d.departure_city,
        stock: d.stock,
        flight_departure_time: d.flight_departure_time,
        flight_arrival_time: d.flight_arrival_time,
        return_flight_departure_time: d.return_flight_departure_time,
        return_flight_arrival_time: d.return_flight_arrival_time,
      }));

      const rawAgency = pickAgency(tour.agencies);
      const sourceLabel = inferSourceLabelFromPhotoUrls(tour.photo_urls);
      const agency =
        rawAgency && isDefaultAgencyName(rawAgency.name) && sourceLabel
          ? { ...rawAgency, name: sourceLabel }
          : rawAgency;

      const detail: TourDetail = {
        id: tour.id,
        title: tour.title,
        agency_id: tour.agency_id,
        agency: agency
          ? {
              id: agency.id,
              name: agency.name,
              email: agency.email,
              phone: agency.phone,
              town: agency.town,
            }
          : null,
        sourceLabel,
        countries: tour.countries,
        duration_nights: tour.duration_nights,
        airline: tour.airline,
        description: tour.description,
        itinerary: asItinerary(tour.itinerary),
        status: tour.status,
        photo_urls: tour.photo_urls,
        is_global_pricing: tour.is_global_pricing,
        global_pricing: tour.global_pricing,
        lead_price: tour.lead_price,
        commission_amount:
          tour.commission_amount === null || tour.commission_amount === undefined
            ? null
            : Number.isFinite(Number(tour.commission_amount))
              ? Number(tour.commission_amount)
              : null,
        commissions: asCommissions(tour.commissions, tour.commission_amount),
        services: asServices(tour.services),
        needs_review: tour.needs_review,
        created_at: tour.created_at,
        steps: stepsWithHotels,
        departures: departuresMapped,
      };

      return detail;
    },
  });
}
